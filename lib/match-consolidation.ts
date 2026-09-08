import type { AttendanceStatus, Match, Prisma, PrismaClient } from '@prisma/client'
import { prisma } from './db'

/**
 * The league occasionally deletes and republishes a whole fixture, handing the
 * same real-world matches brand-new ids. Because `Match.leagueMatchId` is our
 * only unique key, every republication used to create a fresh row and scatter
 * the match's data across copies: attendance votes on one, the Instagram promo
 * on another, the live score on the newest one.
 *
 * This module holds the natural identity of a match — what does NOT change when
 * the league republishes — plus the merge that folds stray copies back into a
 * single row without losing what hangs off them.
 *
 * Note that `date` is deliberately NOT part of the identity: it is exactly the
 * field the league mutates when a match is rescheduled (see the `dateChanged`
 * branch in `scraper.ts`). Keying on it would reintroduce the duplication
 * through the other door.
 */

/** Tolerates both the Prisma client and a transaction client. */
type Db = PrismaClient | Prisma.TransactionClient

export interface MatchNaturalKey {
  tournamentId: number
  stageId: number
  groupId: number
  homeTeamId: number
  awayTeamId: number
}

export interface ConsolidationReport {
  canonicalId: number
  mergedMatchIds: number[]
  moved: {
    newsArticles: number
    instagramPosts: number
    whatsappMessages: number
    goals: number
    cards: number
    playerMatches: number
  }
  /** Rows folded into an existing counterpart on the canonical match. */
  merged: {
    playerMatches: number
    goals: number
    cards: number
  }
  /** Match-level columns the canonical row took from a copy. */
  inheritedFields: string[]
  /**
   * Divergent values that were dropped, as `field: kept <- discarded`. A
   * human-written `context` is never overwritten, so if two copies carry one
   * the loser is reported here instead of vanishing.
   */
  discarded: string[]
}

/**
 * Answered beats unanswered; between two answers the most recent one wins.
 * A vote is the one thing in here a human actually typed, so it is never
 * silently overwritten by a PENDING placeholder from another copy.
 */
function attendanceWins(
  a: { attendanceStatus: AttendanceStatus; updatedAt: Date },
  b: { attendanceStatus: AttendanceStatus; updatedAt: Date },
): boolean {
  const aAnswered = a.attendanceStatus !== 'PENDING'
  const bAnswered = b.attendanceStatus !== 'PENDING'
  if (aAnswered !== bAnswered) return aAnswered
  return a.updatedAt >= b.updatedAt
}

/**
 * Goals and cards carry no stable id of their own and `minute` is always null
 * (the API does not expose it), so two goals by the same player in the same
 * match are two byte-identical rows. Dedupe therefore cannot collapse a key to
 * a single row: it keeps the highest count any single copy had for that key.
 * Two rows in one copy stay two rows; the same row echoed across four copies
 * collapses to one.
 */
function eventKey(e: {
  leaguePlayerId: number | null
  rosterPlayerId: number | null
  minute: number | null
  teamName: string
  cardType?: string
}): string {
  return [
    e.leaguePlayerId ?? 'null',
    e.rosterPlayerId ?? 'null',
    e.minute ?? 'null',
    e.teamName,
    e.cardType ?? '',
  ].join('|')
}

/** How much hand-added detail a row carries; ties break toward the older row. */
function goalRichness(g: {
  assistLeaguePlayerId: number | null
  assistRosterPlayerId: number | null
  rosterPlayerId: number | null
  minute: number | null
}): number {
  return (
    (g.assistLeaguePlayerId !== null ? 1 : 0) +
    (g.assistRosterPlayerId !== null ? 1 : 0) +
    (g.rosterPlayerId !== null ? 1 : 0) +
    (g.minute !== null ? 1 : 0)
  )
}

function cardRichness(c: { reason: string | null; rosterPlayerId: number | null; minute: number | null }): number {
  return (
    (c.reason !== null ? 1 : 0) + (c.rosterPlayerId !== null ? 1 : 0) + (c.minute !== null ? 1 : 0)
  )
}

/**
 * Per key, the target row count is the maximum multiplicity seen in any single
 * source match. Returns the ids to delete once every row sits on the canonical
 * match, dropping the least detailed rows first.
 */
function planEventDedupe<T extends { id: number; matchId: number }>(
  rows: T[],
  keyOf: (row: T) => string,
  richnessOf: (row: T) => number,
): number[] {
  const perSource = new Map<string, Map<number, number>>()
  for (const row of rows) {
    const key = keyOf(row)
    const bySource = perSource.get(key) ?? new Map<number, number>()
    bySource.set(row.matchId, (bySource.get(row.matchId) ?? 0) + 1)
    perSource.set(key, bySource)
  }

  const toDelete: number[] = []
  const byKey = new Map<string, T[]>()
  for (const row of rows) {
    const key = keyOf(row)
    byKey.set(key, [...(byKey.get(key) ?? []), row])
  }

  for (const [key, group] of byKey) {
    const keep = Math.max(...Array.from(perSource.get(key)!.values()))
    if (group.length <= keep) continue
    const ranked = [...group].sort((a, b) => richnessOf(b) - richnessOf(a) || a.id - b.id)
    toDelete.push(...ranked.slice(keep).map(r => r.id))
  }
  return toDelete
}

/**
 * Folds `duplicateIds` into `canonicalId`: every child row is moved over,
 * per-player attendance is merged instead of colliding on the
 * `(playerId, matchId)` unique, echoed events are trimmed, and the duplicate
 * `Match` rows are deleted.
 *
 * Runs in a single transaction — an interrupted merge must not leave votes
 * pointing at a row that no longer exists.
 */
export async function consolidateMatches(
  canonicalId: number,
  duplicateIds: number[],
  options: { db?: Db } = {},
): Promise<ConsolidationReport> {
  const ids = duplicateIds.filter(id => id !== canonicalId)
  const report: ConsolidationReport = {
    canonicalId,
    mergedMatchIds: ids,
    moved: {
      newsArticles: 0,
      instagramPosts: 0,
      whatsappMessages: 0,
      goals: 0,
      cards: 0,
      playerMatches: 0,
    },
    merged: { playerMatches: 0, goals: 0, cards: 0 },
    inheritedFields: [],
    discarded: [],
  }
  if (ids.length === 0) return report

  const run = async (tx: Db): Promise<ConsolidationReport> => {
    const canonical = await tx.match.findUnique({ where: { id: canonicalId } })
    if (!canonical) throw new Error(`Canonical match ${canonicalId} not found`)

    const duplicates = await tx.match.findMany({ where: { id: { in: ids } } })

    // --- Attendance: merge per player, then move what has no counterpart ---
    const canonicalAttendance = await tx.playerMatch.findMany({ where: { matchId: canonicalId } })
    const duplicateAttendance = await tx.playerMatch.findMany({ where: { matchId: { in: ids } } })
    const byPlayer = new Map(canonicalAttendance.map(pm => [pm.playerId, pm]))

    for (const dup of duplicateAttendance) {
      const current = byPlayer.get(dup.playerId)
      if (!current) {
        await tx.playerMatch.update({ where: { id: dup.id }, data: { matchId: canonicalId } })
        // Keep the map in sync: several copies may hold a row for the same player.
        byPlayer.set(dup.playerId, { ...dup, matchId: canonicalId })
        report.moved.playerMatches++
        continue
      }

      const keepCurrent = attendanceWins(current, dup)
      const winner = keepCurrent ? current : dup
      const loser = keepCurrent ? dup : current
      const merged = {
        attendanceStatus: winner.attendanceStatus,
        rating: winner.rating ?? loser.rating,
        notes: winner.notes ?? loser.notes,
        goals: Math.max(winner.goals, loser.goals),
        assists: Math.max(winner.assists, loser.assists),
        yellowCards: Math.max(winner.yellowCards, loser.yellowCards),
        redCard: winner.redCard || loser.redCard,
      }
      await tx.playerMatch.delete({ where: { id: dup.id } })
      const updated = await tx.playerMatch.update({ where: { id: current.id }, data: merged })
      byPlayer.set(dup.playerId, updated)
      report.merged.playerMatches++
    }

    // --- Plain reassignments: nothing here can collide ---
    report.moved.newsArticles = (
      await tx.newsArticle.updateMany({ where: { matchId: { in: ids } }, data: { matchId: canonicalId } })
    ).count
    report.moved.instagramPosts = (
      await tx.instagramPost.updateMany({ where: { matchId: { in: ids } }, data: { matchId: canonicalId } })
    ).count
    report.moved.whatsappMessages = (
      await tx.whatsappMessage.updateMany({ where: { matchId: { in: ids } }, data: { matchId: canonicalId } })
    ).count

    // --- Events: move everything, then trim the echoes ---
    const goals = await tx.matchGoal.findMany({ where: { matchId: { in: [canonicalId, ...ids] } } })
    const cards = await tx.matchCard.findMany({ where: { matchId: { in: [canonicalId, ...ids] } } })

    const goalsToDelete = planEventDedupe(goals, eventKey, goalRichness)
    const cardsToDelete = planEventDedupe(cards, eventKey, cardRichness)

    if (goalsToDelete.length > 0) {
      await tx.matchGoal.deleteMany({ where: { id: { in: goalsToDelete } } })
      report.merged.goals = goalsToDelete.length
    }
    if (cardsToDelete.length > 0) {
      await tx.matchCard.deleteMany({ where: { id: { in: cardsToDelete } } })
      report.merged.cards = cardsToDelete.length
    }

    report.moved.goals = (
      await tx.matchGoal.updateMany({ where: { matchId: { in: ids } }, data: { matchId: canonicalId } })
    ).count
    report.moved.cards = (
      await tx.matchCard.updateMany({ where: { matchId: { in: ids } }, data: { matchId: canonicalId } })
    ).count

    // --- Match-level columns ---
    const inherited: Prisma.MatchUpdateInput = {}

    /**
     * League-sourced scalars: the newest copy wins, even when the canonical
     * row already has a value. Filling only nulls looked safe until the data
     * proved otherwise — the league moved two matches to another pitch
     * (13→7, 14→8) and the value survived on the newest copy while the
     * canonical one kept the stale pitch. A republication is a fresher read
     * of the same match, so it is the one to trust.
     */
    const takeFromNewest = <K extends 'venue' | 'roundName'>(field: K) => {
      // Highest id = most recent publication.
      const newest = [...duplicates].sort((a, b) => b.id - a.id).find(d => d[field] !== null)
      if (!newest || newest[field] === canonical[field]) return
      inherited[field] = newest[field] as string
      report.inheritedFields.push(field)
      if (canonical[field] !== null) {
        report.discarded.push(`${field}: ${String(newest[field])} <- ${String(canonical[field])}`)
      }
    }
    takeFromNewest('venue')
    takeFromNewest('roundName')

    // `context` is the opposite case: a human typed it, so nothing overwrites
    // it. If the canonical row has none, inherit the newest; if two copies
    // disagree, keep the canonical one and report what was dropped rather
    // than losing it silently.
    const contextDonors = [...duplicates].sort((a, b) => b.id - a.id).filter(d => d.context !== null)
    if (contextDonors.length > 0) {
      if (canonical.context === null) {
        inherited.context = contextDonors[0].context as string
        report.inheritedFields.push('context')
      } else {
        for (const donor of contextDonors) {
          if (donor.context !== canonical.context) {
            report.discarded.push(`context (match ${donor.id}): ${donor.context}`)
          }
        }
      }
    }

    // A pending group summary must still fire: keep the earliest deadline.
    const notifyDeadlines = [canonical.notifyGroupAt, ...duplicates.map(d => d.notifyGroupAt)].filter(
      (d): d is Date => d !== null,
    )
    if (notifyDeadlines.length > 0) {
      const earliest = new Date(Math.min(...notifyDeadlines.map(d => d.getTime())))
      if (canonical.notifyGroupAt?.getTime() !== earliest.getTime()) {
        inherited.notifyGroupAt = earliest
        report.inheritedFields.push('notifyGroupAt')
      }
    }

    // Manual edits win: if any copy was locked, the merged events stay locked
    // so the next scrape does not wipe them.
    if (!canonical.eventsLocked && duplicates.some(d => d.eventsLocked)) {
      inherited.eventsLocked = true
      report.inheritedFields.push('eventsLocked')
    }

    if (Object.keys(inherited).length > 0) {
      await tx.match.update({ where: { id: canonicalId }, data: inherited })
    }

    for (const dropped of report.discarded) {
      console.warn(`  ⚠️  Consolidation dropped a divergent value on match ${canonicalId} — ${dropped}`)
    }

    await tx.match.deleteMany({ where: { id: { in: ids } } })
    return report
  }

  if (options.db) return run(options.db)
  // The default 5s interactive-transaction budget is not enough for a fixture
  // that was republished several times.
  return prisma.$transaction(tx => run(tx), { timeout: 60_000 })
}

/**
 * The match a fixture entry belongs to, adopting the row a previous
 * publication left behind instead of creating a duplicate.
 *
 * `liveLeagueMatchIds` is every id present in the fixture being scraped right
 * now. Rows carrying one of those ids are left alone: they belong to a match
 * the league still publishes separately (a second leg of the same pairing, say)
 * and are not stale copies of this one.
 *
 * Returns the match as it was BEFORE adoption — the caller compares scores and
 * dates against the previous state.
 */
export async function resolveFixtureMatch(
  leagueMatchId: string,
  key: MatchNaturalKey | null,
  liveLeagueMatchIds: Set<string>,
): Promise<{ match: Match | null; adopted: boolean; consolidation: ConsolidationReport | null }> {
  const byLeagueId = await prisma.match.findUnique({ where: { leagueMatchId } })
  if (byLeagueId) return { match: byLeagueId, adopted: false, consolidation: null }

  // TBD fixtures arrive with both teams null; a natural-key lookup on nulls
  // would match any other TBD match in the group.
  if (!key) return { match: null, adopted: false, consolidation: null }

  const stale = (
    await prisma.match.findMany({
      where: {
        tournamentId: key.tournamentId,
        stageId: key.stageId,
        groupId: key.groupId,
        homeTeamId: key.homeTeamId,
        awayTeamId: key.awayTeamId,
      },
      orderBy: { id: 'asc' },
    })
  ).filter(m => m.leagueMatchId === null || !liveLeagueMatchIds.has(m.leagueMatchId))

  if (stale.length === 0) return { match: null, adopted: false, consolidation: null }

  // Keep the oldest row: it is the original publication, so links and ids that
  // already point at this match keep working.
  const [canonical, ...rest] = stale
  let consolidation: ConsolidationReport | null = null

  if (rest.length > 0) {
    console.log(
      `  🧬 Consolidating ${rest.length} stray cop${rest.length === 1 ? 'y' : 'ies'} of match ${canonical.id} (${rest
        .map(m => m.id)
        .join(', ')})`,
    )
    consolidation = await consolidateMatches(
      canonical.id,
      rest.map(m => m.id),
    )
  }

  console.log(
    `  ♻️  Republished fixture: match ${canonical.id} adopts leagueMatchId ${leagueMatchId} (was ${canonical.leagueMatchId})`,
  )
  await prisma.match.update({ where: { id: canonical.id }, data: { leagueMatchId } })

  return { match: canonical, adopted: true, consolidation }
}

/**
 * Every group of `Match` rows that share a natural key — the duplicates a past
 * republication left behind. Used by
 * `scripts/consolidate-duplicate-matches.ts` to clean up history; the scraper
 * heals its own fixture as it goes.
 */
export async function findDuplicateMatchGroups(filter: { tournamentId?: number } = {}): Promise<
  { key: MatchNaturalKey; matches: Match[] }[]
> {
  const matches = await prisma.match.findMany({
    where: {
      tournamentId: filter.tournamentId !== undefined ? filter.tournamentId : { not: null },
      stageId: { not: null },
      groupId: { not: null },
      homeTeamId: { not: null },
      awayTeamId: { not: null },
    },
    orderBy: { id: 'asc' },
  })

  const groups = new Map<string, Match[]>()
  for (const match of matches) {
    const key = [match.tournamentId, match.stageId, match.groupId, match.homeTeamId, match.awayTeamId].join('|')
    groups.set(key, [...(groups.get(key) ?? []), match])
  }

  return Array.from(groups.values())
    .filter(group => group.length > 1)
    .map(group => ({
      key: {
        tournamentId: group[0].tournamentId!,
        stageId: group[0].stageId!,
        groupId: group[0].groupId!,
        homeTeamId: group[0].homeTeamId!,
        awayTeamId: group[0].awayTeamId!,
      },
      matches: group,
    }))
}

export interface MatchAttachments {
  newsArticles: number
  instagramPosts: number
  whatsappMessages: number
  goals: number
  cards: number
  playerMatches: number
  /** Attendance rows a player actually answered — the data worth preserving. */
  answeredAttendance: number
}

/**
 * What hangs off each of `matchIds`. Lets the admin endpoint show where a
 * republication scattered the data before anything is merged.
 */
export async function summarizeAttachments(matchIds: number[]): Promise<Map<number, MatchAttachments>> {
  const empty = (): MatchAttachments => ({
    newsArticles: 0,
    instagramPosts: 0,
    whatsappMessages: 0,
    goals: 0,
    cards: 0,
    playerMatches: 0,
    answeredAttendance: 0,
  })
  const summary = new Map<number, MatchAttachments>(matchIds.map(id => [id, empty()]))
  if (matchIds.length === 0) return summary

  const where = { matchId: { in: matchIds } }
  const [news, posts, messages, goals, cards, attendance, answered] = await Promise.all([
    prisma.newsArticle.groupBy({ by: ['matchId'], where, _count: { _all: true } }),
    prisma.instagramPost.groupBy({ by: ['matchId'], where, _count: { _all: true } }),
    prisma.whatsappMessage.groupBy({ by: ['matchId'], where, _count: { _all: true } }),
    prisma.matchGoal.groupBy({ by: ['matchId'], where, _count: { _all: true } }),
    prisma.matchCard.groupBy({ by: ['matchId'], where, _count: { _all: true } }),
    prisma.playerMatch.groupBy({ by: ['matchId'], where, _count: { _all: true } }),
    prisma.playerMatch.groupBy({
      by: ['matchId'],
      where: { ...where, attendanceStatus: { not: 'PENDING' } },
      _count: { _all: true },
    }),
  ])

  const apply = (
    rows: { matchId: number | null; _count: { _all: number } }[],
    field: keyof MatchAttachments,
  ) => {
    for (const row of rows) {
      if (row.matchId === null) continue
      const entry = summary.get(row.matchId)
      if (entry) entry[field] = row._count._all
    }
  }

  apply(news, 'newsArticles')
  apply(posts, 'instagramPosts')
  apply(messages, 'whatsappMessages')
  apply(goals, 'goals')
  apply(cards, 'cards')
  apply(attendance, 'playerMatches')
  apply(answered, 'answeredAttendance')

  return summary
}

import { prisma } from './db'
import type { Match, Prisma } from '@prisma/client'
import { resolveFixtureMatch, type MatchNaturalKey } from './match-consolidation'
import {
  matchesWithNewResult,
  newOrScoredMatches,
  summarizeChanges,
  type MatchChange,
} from './match-changes'

const ACSED_TEAM_ID = 2836 // AC SED team ID
const ACSED_TEAM_NAME = 'AC Sed'
const LIGAB_API = 'https://api.ligab.cl/v1'
const LEAGUE_ID = 24 // Liga B ID

interface RawStanding {
  team?: string
  nombre?: string
  position?: number
  pos?: number
  played?: number
  pj?: number
  won?: number
  pg?: number
  drawn?: number
  pe?: number
  lost?: number
  pp?: number
  goalsFor?: number
  gf?: number
  goalsAgainst?: number
  gc?: number
  points?: number
  pts?: number
}

interface RawResult {
  home?: string
  local?: string
  away?: string
  visita?: string
  homeScore?: number
  golesLocal?: number
  awayScore?: number
  golesVisita?: number
  date?: string
  fecha?: string
  round?: string
  jornada?: string
  id?: string | number
}

interface RawScorer {
  player?: string
  jugador?: string
  team?: string
  equipo?: string
  goals?: number
  goles?: number
}

function normalizeStanding(raw: RawStanding) {
  return {
    teamName: (raw.team ?? raw.nombre ?? '').trim(),
    position: raw.position ?? raw.pos ?? 0,
    played: raw.played ?? raw.pj ?? 0,
    won: raw.won ?? raw.pg ?? 0,
    drawn: raw.drawn ?? raw.pe ?? 0,
    lost: raw.lost ?? raw.pp ?? 0,
    goalsFor: raw.goalsFor ?? raw.gf ?? 0,
    goalsAgainst: raw.goalsAgainst ?? raw.gc ?? 0,
    points: raw.points ?? raw.pts ?? 0,
  }
}

function normalizeResult(raw: RawResult) {
  return {
    homeTeam: (raw.home ?? raw.local ?? '').trim(),
    awayTeam: (raw.away ?? raw.visita ?? '').trim(),
    homeScore: raw.homeScore ?? raw.golesLocal ?? null,
    awayScore: raw.awayScore ?? raw.golesVisita ?? null,
    date: raw.date ?? raw.fecha ? new Date(raw.date ?? raw.fecha ?? '') : new Date(),
    roundName: raw.round ?? raw.jornada ?? null,
    leagueMatchId: raw.id ? String(raw.id) : null,
  }
}

function normalizeScorer(raw: RawScorer) {
  return {
    playerName: (raw.player ?? raw.jugador ?? '').trim(),
    teamName: (raw.team ?? raw.equipo ?? '').trim(),
    goals: raw.goals ?? raw.goles ?? 0,
  }
}

function detectDataType(url: string, body: unknown): 'standings' | 'results' | 'scorers' | 'upcoming' | null {
  const lowerUrl = url.toLowerCase()
  if (lowerUrl.includes('posici') || lowerUrl.includes('standing') || lowerUrl.includes('tabla')) return 'standings'
  if (lowerUrl.includes('resultado') || lowerUrl.includes('result') || lowerUrl.includes('partido')) return 'results'
  if (lowerUrl.includes('goleador') || lowerUrl.includes('scorer')) return 'scorers'
  if (lowerUrl.includes('proximo') || lowerUrl.includes('upcoming') || lowerUrl.includes('fixture')) return 'upcoming'

  if (Array.isArray(body) && body.length > 0) {
    const first = body[0] as Record<string, unknown>
    if ('pts' in first || 'points' in first || 'pj' in first) return 'standings'
    if ('golesLocal' in first || 'homeScore' in first || 'local' in first) return 'results'
    if ('goles' in first || 'goals' in first) return 'scorers'
  }
  return null
}

// The league's API sits behind Cloudflare and goes down: a 521 on
// 2026-09-08 killed a whole run — standings, matches and events — because a
// single bad response threw straight out of the scrape. Retry the failures
// that are worth retrying before giving up on the corrida.
const FETCH_ATTEMPTS = 3
const FETCH_BACKOFF_MS = 500

/** 429 and 5xx are transient; a 404 or a 400 will still be that on retry. */
function isRetriableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function fetchAPI(endpoint: string) {
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${LIGAB_API}${endpoint}`)
      if (res.ok) return res.json()

      const error = new Error(`API error: ${res.status}`)
      if (!isRetriableStatus(res.status)) throw error
      lastError = error
    } catch (err) {
      // A network-level failure (DNS, reset, timeout) is as transient as a
      // 5xx. Anything thrown above as non-retriable is rethrown untouched.
      const error = err instanceof Error ? err : new Error(String(err))
      if (error.message.startsWith('API error: ') && !isRetriableStatus(Number(error.message.slice(11)))) {
        throw error
      }
      lastError = error
    }

    if (attempt < FETCH_ATTEMPTS) {
      const wait = FETCH_BACKOFF_MS * 2 ** (attempt - 1)
      console.warn(`  ⏳ ${endpoint} failed (${lastError?.message}), retry ${attempt}/${FETCH_ATTEMPTS - 1} in ${wait}ms`)
      await sleep(wait)
    }
  }

  throw lastError ?? new Error(`API error: ${endpoint}`)
}

/**
 * Matches played more than this long ago that already carry a score are not
 * re-fetched. Two reasons: their events are settled, and the sync below
 * deletes rows the API no longer returns — a stale or emptied response for an
 * old match would otherwise wipe events nobody can rebuild. The second
 * condition matters as much as the first: an old match WITHOUT a score is
 * exactly the "they still haven't entered the result" case, so it keeps being
 * polled. No empirical basis for the number, so it is a named constant and
 * every skip is logged.
 */
const EVENT_FETCH_WINDOW_DAYS = 30

async function saveMatchEvents(matchId: number, leagueMatchId: number) {
  try {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: { eventsLocked: true, date: true, homeScore: true, awayScore: true },
    })
    if (!match) return

    // Check if match events are locked (manually edited)
    if (match.eventsLocked) {
      console.log(`  🔒 Skipping events for match ${leagueMatchId} (manually edited)`)
      return
    }

    const ageDays = (Date.now() - match.date.getTime()) / 86_400_000
    const hasScore = match.homeScore !== null && match.awayScore !== null
    if (ageDays > EVENT_FETCH_WINDOW_DAYS && hasScore) {
      console.log(
        `  ⏭️  Skipping events for match ${leagueMatchId} (played ${Math.floor(ageDays)} days ago, score already in)`,
      )
      return
    }

    // Fetch events (goals and cards) from API
    const events = await fetchAPI(`/matches/${leagueMatchId}/events?filter={"include":["player","team"]}`)

    if (!Array.isArray(events)) {
      return
    }

    console.log(`  📝 Processing ${events.length} events for match ${leagueMatchId}`)

    // Map Liga B player ids to linked roster players so newly created
    // goals/cards start out linked to the right roster player. Existing rows
    // keep whatever link they have — see the `update` payloads below.
    const linkedRoster = await prisma.player.findMany({
      where: { leaguePlayerId: { not: null } },
      select: { id: true, leaguePlayerId: true },
    })
    const rosterByLeagueId = new Map<number, number>(
      linkedRoster.map(p => [p.leaguePlayerId!, p.id]),
    )

    // The league gives every event a stable id (`{ id: 216293, type: 'g',
    // playerId: 22848 }`). With it we can upsert and then delete what did not
    // come back; without it there is nothing to UPDATE against, since two
    // goals by the same player are identical rows (`minute` is always null).
    // So the id-less payload keeps the old delete-and-reinsert behaviour.
    type IncomingEvent = { leagueEventId: number | null; leaguePlayerId: number; teamName: string }
    const goals: IncomingEvent[] = []
    const cards: (IncomingEvent & { cardType: string })[] = []

    for (const event of events) {
      const playerId = event.playerId
      const teamName = event.team?.name || 'Unknown'

      if (!playerId) continue

      // Ensure Team exists so ScrapedPlayer.teamId FK resolves
      if (event.teamId && event.team?.name) {
        const knownTeam = await prisma.team.findUnique({
          where: { id: event.teamId },
          select: { id: true },
        })
        if (!knownTeam) {
          await prisma.team.create({ data: { id: event.teamId, name: event.team.name } })
        }
      }

      // Save or update player in ScrapedPlayer table (same dirty check as the
      // other entities: the payload repeats every event on every scrape).
      const playerData = event.player || {}
      const incomingPlayer = {
        firstName: playerData.firstName || '',
        lastName: playerData.lastName || '',
        email: playerData.email ?? null,
        run: playerData.run ?? null,
        teamId: event.teamId ?? null,
      }
      const storedPlayer = await prisma.scrapedPlayer.findUnique({
        where: { id: playerId },
        select: { firstName: true, lastName: true, email: true, run: true, teamId: true },
      })

      if (!storedPlayer) {
        await prisma.scrapedPlayer.create({ data: { id: playerId, ...incomingPlayer } })
      } else if (
        storedPlayer.firstName !== incomingPlayer.firstName ||
        storedPlayer.lastName !== incomingPlayer.lastName ||
        storedPlayer.email !== incomingPlayer.email ||
        storedPlayer.run !== incomingPlayer.run ||
        storedPlayer.teamId !== incomingPlayer.teamId
      ) {
        await prisma.scrapedPlayer.update({
          where: { id: playerId },
          data: { ...incomingPlayer, updatedAt: new Date() },
        })
      }

      const leagueEventId = typeof event.id === 'number' ? event.id : null

      if (event.type === 'g') {
        goals.push({ leagueEventId, leaguePlayerId: playerId, teamName })
      } else if (event.type === 'yc' || event.type === 'rc') {
        cards.push({
          leagueEventId,
          leaguePlayerId: playerId,
          teamName,
          cardType: event.type === 'yc' ? 'yellow' : 'red',
        })
      }
    }

    const everyEventHasId = [...goals, ...cards].every(e => e.leagueEventId !== null)

    // One transaction: the old code deleted every event and then inserted one
    // by one, so a crash mid-loop (or a container recreated under it, which
    // happened) left the match with half its goals.
    await prisma.$transaction(async tx => {
      if (!everyEventHasId) {
        console.warn(`  ⚠️  Events for match ${leagueMatchId} came without ids — falling back to replace-all`)
        await tx.matchGoal.deleteMany({ where: { matchId } })
        await tx.matchCard.deleteMany({ where: { matchId } })
        for (const goal of goals) {
          await tx.matchGoal.create({
            data: {
              matchId,
              leagueEventId: goal.leagueEventId,
              leaguePlayerId: goal.leaguePlayerId,
              rosterPlayerId: rosterByLeagueId.get(goal.leaguePlayerId) ?? null,
              teamName: goal.teamName,
              minute: null, // API doesn't provide minute
            },
          })
        }
        for (const card of cards) {
          await tx.matchCard.create({
            data: {
              matchId,
              leagueEventId: card.leagueEventId,
              leaguePlayerId: card.leaguePlayerId,
              rosterPlayerId: rosterByLeagueId.get(card.leaguePlayerId) ?? null,
              cardType: card.cardType,
              teamName: card.teamName,
              minute: null,
              reason: null,
            },
          })
        }
        return
      }

      for (const goal of goals) {
        await tx.matchGoal.upsert({
          where: { leagueEventId: goal.leagueEventId! },
          create: {
            matchId,
            leagueEventId: goal.leagueEventId,
            leaguePlayerId: goal.leaguePlayerId,
            rosterPlayerId: rosterByLeagueId.get(goal.leaguePlayerId) ?? null,
            teamName: goal.teamName,
            minute: null, // API doesn't provide minute
          },
          // `rosterPlayerId`, `minute` and the assist fields are left alone:
          // those are the hand-added ones, and re-scraping used to wipe them.
          update: {
            matchId,
            leaguePlayerId: goal.leaguePlayerId,
            teamName: goal.teamName,
          },
        })
      }

      for (const card of cards) {
        await tx.matchCard.upsert({
          where: { leagueEventId: card.leagueEventId! },
          create: {
            matchId,
            leagueEventId: card.leagueEventId,
            leaguePlayerId: card.leaguePlayerId,
            rosterPlayerId: rosterByLeagueId.get(card.leaguePlayerId) ?? null,
            cardType: card.cardType,
            teamName: card.teamName,
            minute: null,
            reason: null,
          },
          // `reason` and `rosterPlayerId` are hand-added; leave them.
          update: {
            matchId,
            leaguePlayerId: card.leaguePlayerId,
            cardType: card.cardType,
            teamName: card.teamName,
          },
        })
      }

      // Delete by absence: an event the league removed disappears here too.
      // Rows with no `leagueEventId` are pre-migration copies of these same
      // events, so they go as well — a partial read fixes itself on the next
      // run, and a match a human edited never reaches this code
      // (`eventsLocked` returned early).
      const goalIds = goals.map(g => g.leagueEventId!)
      const cardIds = cards.map(c => c.leagueEventId!)

      const staleGoals: Prisma.MatchGoalWhereInput =
        goalIds.length > 0
          ? { matchId, OR: [{ leagueEventId: null }, { leagueEventId: { notIn: goalIds } }] }
          : { matchId }
      const staleCards: Prisma.MatchCardWhereInput =
        cardIds.length > 0
          ? { matchId, OR: [{ leagueEventId: null }, { leagueEventId: { notIn: cardIds } }] }
          : { matchId }

      await tx.matchGoal.deleteMany({ where: staleGoals })
      await tx.matchCard.deleteMany({ where: staleCards })
    })

    console.log(`  ✓ Saved events for match ${leagueMatchId} (${goals.length} goals, ${cards.length} cards)`)
  } catch (err) {
    console.error(`Error saving events for match ${leagueMatchId}:`, err)
  }
}

// Helper to extract logo URL from full URL
function extractLogoUrl(fullUrl: string | null | undefined): string | null {
  if (!fullUrl) return null

  // URLs come in two formats:
  // 1. Without size: https://liga-b.nyc3.digitaloceanspaces.com/team/{teamId}/{uuid}.jpeg
  // 2. With size: https://liga-b.nyc3.digitaloceanspaces.com/team/{teamId}/{size}_{uuid}.jpeg

  // Try to match format with size prefix first
  let match = fullUrl.match(/\/team\/(\d+)\/\d+x\d+_(.+\.(?:jpeg|jpg|png))$/i)
  if (match) {
    return match[2] // Return UUID part without size prefix
  }

  // Try to match format without size prefix
  match = fullUrl.match(/\/team\/(\d+)\/([a-f0-9-]+\.(?:jpeg|jpg|png))$/i)
  if (match) {
    return match[2] // Return the UUID filename
  }

  return null
}

// Helper to save or update team
/**
 * The entity upserts below keep identity — no churn, no burnt ids — but their
 * `update` branch used to fire unconditionally. `saveTeam` alone runs ~36
 * times per scrape for data that almost never changes, and each write bumps
 * `updatedAt`, which is why **`Team.updatedAt` says nothing about freshness**:
 * it advanced every two hours regardless. Compare first, write only on a real
 * difference.
 */
async function saveTeam(teamId: number, teamName: string, logoUrl: string | null) {
  const logo = extractLogoUrl(logoUrl)
  const existing = await prisma.team.findUnique({
    where: { id: teamId },
    select: { name: true, logoUrl: true },
  })

  if (!existing) {
    await prisma.team.create({ data: { id: teamId, name: teamName, logoUrl: logo } })
    return
  }

  // A missing logo in the payload never clears the stored one.
  const nextLogo = logo || existing.logoUrl
  if (existing.name === teamName && existing.logoUrl === nextLogo) return

  await prisma.team.update({
    where: { id: teamId },
    data: { name: teamName, logoUrl: nextLogo, updatedAt: new Date() },
  })
}

// Helper to save or update tournament
async function saveTournament(tournamentId: number, tournamentName: string, isActive: boolean) {
  const existing = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { name: true, isActive: true },
  })

  if (!existing) {
    await prisma.tournament.create({ data: { id: tournamentId, name: tournamentName, isActive } })
    return
  }
  if (existing.name === tournamentName && existing.isActive === isActive) return

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { name: tournamentName, isActive, updatedAt: new Date() },
  })
}

// Helper to save or update stage
async function saveStage(stageId: number, tournamentId: number, stageName: string | null, orderIndex: number) {
  const existing = await prisma.stage.findUnique({
    where: { id: stageId },
    select: { name: true, orderIndex: true },
  })

  if (!existing) {
    await prisma.stage.create({ data: { id: stageId, tournamentId, name: stageName, orderIndex } })
    return
  }
  if (existing.name === stageName && existing.orderIndex === orderIndex) return

  await prisma.stage.update({
    where: { id: stageId },
    data: { name: stageName, orderIndex, updatedAt: new Date() },
  })
}

// Helper to save or update group
async function saveGroup(groupId: number, stageId: number, groupName: string) {
  const existing = await prisma.group.findUnique({
    where: { id: groupId },
    select: { name: true },
  })

  if (!existing) {
    await prisma.group.create({ data: { id: groupId, stageId, name: groupName } })
    return
  }
  if (existing.name === groupName) return

  await prisma.group.update({
    where: { id: groupId },
    data: { name: groupName, updatedAt: new Date() },
  })
}

interface StageStats {
  groupsFound: number
  teamsProcessed: number
  standingsSaved: number
  /** Fixture entries seen, whatever we ended up doing with them. */
  matchesFound: number
  newMatches: number
  /** Rows we actually wrote to. */
  updatedMatches: number
  /** Rows we looked at and left alone. */
  unchangedMatches: number
}

async function processSingleStage(
  tournamentId: number,
  stageId: number,
): Promise<{ changes: MatchChange[]; stats: StageStats }> {
  const stats: StageStats = {
    groupsFound: 0,
    teamsProcessed: 0,
    standingsSaved: 0,
    matchesFound: 0,
    newMatches: 0,
    updatedMatches: 0,
    unchangedMatches: 0,
  }

  // Get groups for this stage
  console.log(`🔍 Fetching groups for stage ${stageId}...`)
  const groups = await fetchAPI(`/stages/${stageId}/groups`)
  const allGroupIds = Array.isArray(groups) ? groups.map((g: any) => g.id) : []
  stats.groupsFound = allGroupIds.length
  console.log(`✓ Found ${allGroupIds.length} groups`)

  // Find AC SED's group
  console.log('🔍 Searching for AC SED in groups...')
  let acsedGroupId: number | null = null
  let acsedGroupName: string = ''
  for (const groupId of allGroupIds) {
    console.log(`  Checking group ${groupId}...`)
    const groupInfo = groups.find((g: any) => g.id === groupId)
    const standings = await fetchAPI(`/groups/${groupId}/standings`).catch(() => [])
    const hasAcSed = standings.some((s: any) => s.team?.id === ACSED_TEAM_ID)
    if (hasAcSed) {
      acsedGroupId = groupId
      acsedGroupName = groupInfo?.name || `Grupo ${groupId}`
      console.log(`✓ AC SED found in group ${acsedGroupId} (${acsedGroupName})`)
      break
    }
  }

  if (!acsedGroupId) {
    console.log(`⚠️  AC SED not found in any group for stage ${stageId}, skipping...`)
    return { changes: [], stats }
  }

  // Save the group
  await saveGroup(acsedGroupId, stageId, acsedGroupName)

  // Only fetch data for AC SED's group
  console.log('📊 Fetching standings, matches, and scorers...')
  const [standings, matchDays, topScorers] = await Promise.all([
    fetchAPI(`/groups/${acsedGroupId}/standings`).catch(() => []),
    fetchAPI(`/stages/${stageId}/match-days?filter={"include":[{"relation":"matches","scope":{"include":[{"relation":"homeTeam"},{"relation":"awayTeam"},{"relation":"matchSchedule"},{"relation":"group"}],"where":{"groupId":${acsedGroupId}}}}]}`).catch(() => []),
    fetchAPI(`/tournaments/${tournamentId}/top-scorers`).catch(() => []),
  ])
  console.log(`✓ Fetched ${standings.length} standings, ${matchDays.length} match days, ${topScorers.length} scorers`)

  // Process standings from AC SED's group only
  if (Array.isArray(standings) && standings.length > 0) {
    console.log(`💾 Saving ${standings.length} teams and standings...`)

    // First, save all teams
    for (const s of standings) {
      if (s.team?.id && s.team?.name) {
        await saveTeam(s.team.id, s.team.name, s.team.teamLogoUrl)
        stats.teamsProcessed++
      }
    }

    const standingsData = standings.map((s: any) => ({
      tournamentId,
      stageId,
      groupId: acsedGroupId,
      teamId: s.team?.id!,
      position: s.team?.id === ACSED_TEAM_ID ? 1 : 99, // Priorizar AC SED
      played: s.played || 0,
      won: s.won || 0,
      drawn: s.drawn || 0,
      lost: s.lost || 0,
      goalsFor: s.goalsFor || 0,
      goalsAgainst: s.goalsAgainst || 0,
      points: s.points || 0,
    })).filter(s => s.teamId) // Filter out any without teamId
    // Ordenar por puntos
    standingsData.sort((a, b) => b.points - a.points)
    // Asignar posiciones correctas
    standingsData.forEach((s, i) => (s.position = i + 1))

    // `(tournamentId, stageId, groupId, teamId)` is already unique in the
    // schema — a team has exactly one row per phase — so there is no need to
    // delete the group's table and rebuild it, which is what burned ~6.9k ids
    // for 66 rows. Upsert, then drop whoever is no longer in the group.
    await prisma.$transaction(async tx => {
      for (const standing of standingsData) {
        const { tournamentId: t, stageId: st, groupId: g, teamId, ...values } = standing
        await tx.standing.upsert({
          where: {
            tournamentId_stageId_groupId_teamId: {
              tournamentId: t,
              stageId: st,
              groupId: g!,
              teamId,
            },
          },
          create: standing,
          update: values,
        })
      }

      await tx.standing.deleteMany({
        where: {
          tournamentId,
          stageId,
          groupId: acsedGroupId,
          teamId: { notIn: standingsData.map(s => s.teamId) },
        },
      })
    })
    stats.standingsSaved = standingsData.length
    console.log('✓ Teams and standings saved')
  }

  // Process top scorers
  if (Array.isArray(topScorers) && topScorers.length > 0) {
    console.log(`💾 Saving ${topScorers.length} scorers...`)

    // First, save all teams from scorers
    for (const scorer of topScorers) {
      if (scorer.team?.id && scorer.team?.name) {
        await saveTeam(scorer.team.id, scorer.team.name, scorer.team.teamLogoUrl)
      }
    }

    // The API gives `player.id`; the old code dropped it, kept the
    // concatenated name and had no key to update by — so it deleted every
    // scorer of the tournament and reinserted the lot on each run.
    const scorersData = topScorers.map((s: any) => ({
      tournamentId,
      leaguePlayerId: typeof s.player?.id === 'number' ? s.player.id : null,
      playerName: s.player
        ? `${s.player.firstName} ${s.player.lastName}`.trim()
        : s.playerName || 'Unknown',
      teamId: s.team?.id!,
      goals: s.goals || 0,
    })).filter(s => s.teamId) // Filter out any without teamId

    const keyedScorers = scorersData.filter(s => s.leaguePlayerId !== null)
    const namelessScorers = scorersData.filter(s => s.leaguePlayerId === null)

    await prisma.$transaction(async tx => {
      for (const scorer of keyedScorers) {
        await tx.leagueScorer.upsert({
          where: {
            tournamentId_leaguePlayerId: {
              tournamentId,
              leaguePlayerId: scorer.leaguePlayerId!,
            },
          },
          create: scorer,
          // The league does correct a misspelt name, and a player can be
          // transferred mid-tournament.
          update: { playerName: scorer.playerName, teamId: scorer.teamId, goals: scorer.goals },
        })
      }

      // Drop whoever left the leaderboard, plus the rows with no league id:
      // those are either pre-migration copies of the same scorers or entries
      // the API returned without `player.id`, and both are rewritten below.
      const keptIds = keyedScorers.map(s => s.leaguePlayerId!)
      const staleScorers: Prisma.LeagueScorerWhereInput =
        keptIds.length > 0
          ? { tournamentId, OR: [{ leaguePlayerId: null }, { leaguePlayerId: { notIn: keptIds } }] }
          : { tournamentId }
      await tx.leagueScorer.deleteMany({ where: staleScorers })

      // No id means no key to upsert against; these still go in fresh.
      if (namelessScorers.length > 0) {
        console.warn(`  ⚠️  ${namelessScorers.length} scorer(s) came without player.id — inserted unkeyed`)
        await tx.leagueScorer.createMany({ data: namelessScorers })
      }
    })
    console.log(`✓ Scorers saved (${keyedScorers.length} keyed, ${namelessScorers.length} unkeyed)`)
  }

  // Process matches from all match days
  console.log('💾 Processing matches...')
  // Only AC SED matches are reported: nothing downstream acts on another
  // team's fixture.
  const changes: MatchChange[] = []

  if (!Array.isArray(matchDays)) {
    console.log('  No match days found')
    return { changes, stats }
  }

  // Every league id present in this fixture. Rows carrying one of these are
  // live matches, not leftovers of an earlier publication — see
  // `resolveFixtureMatch`.
  const liveLeagueMatchIds = new Set<string>(
    matchDays.flatMap((day: any) => (day.matches || []).map((m: any) => String(m.id))),
  )

  for (const matchDay of matchDays) {
    const matches = matchDay.matches || []
    stats.matchesFound += matches.length

    for (const match of matches) {
      const matchId = String(match.id)
      const homeTeamId = match.homeTeam?.id || null
      const awayTeamId = match.awayTeam?.id || null

      // Save teams if they have valid IDs
      if (homeTeamId && match.homeTeam?.name) {
        await saveTeam(homeTeamId, match.homeTeam.name, match.homeTeam.teamLogoUrl)
      }
      if (awayTeamId && match.awayTeam?.name) {
        await saveTeam(awayTeamId, match.awayTeam.name, match.awayTeam.teamLogoUrl)
      }

      // Combine matchDay.date with matchSchedule.schedule to get full datetime
      let matchDate = new Date()
      if (matchDay.date) {
        const dayDate = new Date(matchDay.date)
        if (match.matchSchedule?.schedule) {
          // schedule is in format "HH:MM" (e.g., "20:00")
          const [hours, minutes] = match.matchSchedule.schedule.split(':').map(Number)
          dayDate.setHours(hours, minutes, 0, 0)
        }
        matchDate = dayDate
      }

      const matchData = {
        tournamentId,
        stageId,
        groupId: match.groupId || acsedGroupId,
        homeTeamId,
        awayTeamId,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        date: matchDate,
        venue: match.grounds || null,
        roundName: match.group?.name || null,
        leagueMatchId: matchId,
      }

      // A missing `leagueMatchId` does not mean a new match: the league
      // republishes fixtures with fresh ids, and the row it left behind still
      // holds the attendance votes, the Instagram promo and the news. Adopt it
      // (folding in any other stray copy) instead of creating a duplicate.
      const naturalKey: MatchNaturalKey | null =
        homeTeamId && awayTeamId && matchData.groupId
          ? {
              tournamentId,
              stageId,
              groupId: matchData.groupId,
              homeTeamId,
              awayTeamId,
            }
          : null

      const { match: existing } = await resolveFixtureMatch(matchId, naturalKey, liveLeagueMatchIds)

      let savedMatch: any
      let wasResultUpdated = false

      const isAcsedMatch = homeTeamId === ACSED_TEAM_ID || awayTeamId === ACSED_TEAM_ID

      if (!existing) {
        savedMatch = await prisma.match.create({ data: matchData })
        stats.newMatches++
        if (isAcsedMatch) {
          changes.push({ kind: 'created', match: savedMatch })
        }
      } else {
        savedMatch = existing

        // Check if this is a result update (match went from no result to having result)
        const hadNoResult = existing.homeScore === null && existing.awayScore === null
        const nowHasResult = match.homeScore !== null && match.awayScore !== null
        wasResultUpdated = hadNoResult && nowHasResult

        // Compare dates by timestamp — `Date !== Date` is always true by
        // reference, so we have to .getTime() both sides. This is what
        // catches the "match was created with no time and the schedule got
        // added later" case.
        const dateChanged = existing.date.getTime() !== matchDate.getTime()

        // `roundName` and `groupId` were built into `matchData` but never
        // compared nor written, so a match moved to another group — or a
        // renamed round — was created once and then never corrected.
        const changedFields: string[] = []
        if (existing.homeScore !== match.homeScore) changedFields.push('homeScore')
        if (existing.awayScore !== match.awayScore) changedFields.push('awayScore')
        if (existing.homeTeamId !== homeTeamId) changedFields.push('homeTeamId')
        if (existing.awayTeamId !== awayTeamId) changedFields.push('awayTeamId')
        if (existing.venue !== (match.grounds || null)) changedFields.push('venue')
        if (existing.roundName !== matchData.roundName) changedFields.push('roundName')
        if (existing.groupId !== matchData.groupId) changedFields.push('groupId')
        if (dateChanged) changedFields.push('date')

        if (changedFields.length > 0) {
          savedMatch = await prisma.match.update({
            // Keyed by `id`, not `leagueMatchId`: after adopting a republished
            // fixture the league id has just changed under us.
            where: { id: existing.id },
            data: {
              homeScore: match.homeScore,
              awayScore: match.awayScore,
              homeTeamId: homeTeamId,
              awayTeamId: awayTeamId,
              venue: match.grounds || null,
              roundName: matchData.roundName,
              groupId: matchData.groupId,
              date: matchDate,
            },
          })

          stats.updatedMatches++

          if (isAcsedMatch) {
            // The result landing is what content hangs off, so it wins over a
            // reschedule that arrived in the same payload.
            if (wasResultUpdated) {
              changes.push({
                kind: 'result-arrived',
                match: savedMatch,
                score: { home: match.homeScore, away: match.awayScore },
              })
            } else if (dateChanged) {
              changes.push({
                kind: 'rescheduled',
                match: savedMatch,
                from: existing.date,
                to: matchDate,
              })
            } else {
              changes.push({ kind: 'updated', match: savedMatch, fields: changedFields })
            }
          }
        } else {
          stats.unchangedMatches++
        }
      }

      // Fetch and save events (goals and cards) for played matches
      if (match.homeScore !== null && match.awayScore !== null) {
        await saveMatchEvents(savedMatch.id, Number(matchId))
      }
    }
  }

  console.log(`  Found ${stats.matchesFound} total matches`)
  console.log(
    `  Stats: ${stats.newMatches} new, ${stats.updatedMatches} updated, ${stats.unchangedMatches} unchanged`,
  )
  console.log(`  AC SED changes: ${summarizeChanges(changes)}`)

  return { changes, stats }
}

export async function runScraper(
  triggeredBy: 'manual' | 'scheduler',
  options?: { tournamentId?: number; stageId?: number }
): Promise<{
  /** Everything the scrape observed about AC SED matches, case by case. */
  changes: MatchChange[]
  /**
   * Matches created or newly scored. Kept because callers still want the
   * union; anything that generates content must go through
   * `matchesWithNewResult` instead.
   */
  newMatches: Match[]
  logId: number
}> {
  const log = await prisma.scrapeLog.create({
    data: { status: 'running', triggeredBy },
  })

  try {
    console.log('🔍 Starting scraper...')
    let tournamentId: number
    let stagesToProcess: number[]

    // Handle different option combinations
    if (options?.tournamentId && options?.stageId) {
      // Case 1: Both tournament and stage provided → process only that stage
      console.log(`📋 Using provided tournament ${options.tournamentId} and stage ${options.stageId}`)
      tournamentId = options.tournamentId
      stagesToProcess = [options.stageId]
    } else if (options?.tournamentId) {
      // Case 2: Only tournament provided → process ALL stages of that tournament
      console.log(`📋 Using provided tournament ${options.tournamentId}, fetching all stages...`)
      const tournamentRes = await fetchAPI(`/tournaments/${options.tournamentId}?filter={"include":[{"relation":"stages"}]}`)

      if (!tournamentRes) throw new Error(`Tournament ${options.tournamentId} not found`)

      // Save tournament
      await saveTournament(tournamentRes.id, tournamentRes.name || `Torneo ${tournamentRes.id}`, tournamentRes.isActive || false)

      const stages = tournamentRes.stages || []
      if (stages.length === 0) throw new Error('No stages found in tournament')

      // Save all stages with order index
      for (let i = 0; i < stages.length; i++) {
        await saveStage(stages[i].id, tournamentRes.id, stages[i].name || null, i)
      }

      stagesToProcess = stages.map((s: any) => s.id)
      console.log(`✓ Will process ${stagesToProcess.length} stages of tournament ${options.tournamentId}: ${stagesToProcess.join(', ')}`)

      tournamentId = options.tournamentId
    } else {
      // Case 3: No options → process ALL stages of active tournament
      console.log('🔍 Fetching tournaments...')
      const tournamentsRes = await fetchAPI(`/leagues/${LEAGUE_ID}/tournaments?filter={"include":[{"relation":"stages"}]}`)
      const tournaments = Array.isArray(tournamentsRes) ? tournamentsRes : []
      console.log(`✓ Found ${tournaments.length} tournaments`)
      const activeTournament = tournaments.find((t: any) => t.isActive) || tournaments[tournaments.length - 1]

      if (!activeTournament) throw new Error('No tournaments found')
      console.log(`✓ Active tournament: ${activeTournament.name || activeTournament.id} (ID: ${activeTournament.id})`)

      // Save tournament
      await saveTournament(activeTournament.id, activeTournament.name || `Torneo ${activeTournament.id}`, activeTournament.isActive || false)

      // Process ALL stages of this tournament
      const stages = activeTournament.stages || []
      if (stages.length === 0) throw new Error('No stages found in tournament')

      // Save all stages with order index
      for (let i = 0; i < stages.length; i++) {
        await saveStage(stages[i].id, activeTournament.id, stages[i].name || null, i)
      }

      stagesToProcess = stages.map((s: any) => s.id)
      console.log(`✓ Will process ${stagesToProcess.length} stages: ${stagesToProcess.join(', ')}`)

      tournamentId = activeTournament.id
    }

    const allChanges: MatchChange[] = []
    let totalMatchesFound = 0
    let totalNewMatches = 0
    let totalUpdatedMatches = 0
    let totalUnchangedMatches = 0
    let totalTeamsProcessed = 0
    let totalStandingsSaved = 0
    let totalGroupsFound = 0

    // Get tournament name for logging
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } })
    const tournamentName = tournament?.name || `Torneo ${tournamentId}`

    // Process each stage
    for (const stageId of stagesToProcess) {
      console.log(`\n🔄 Processing stage ${stageId}...`)
      const result = await processSingleStage(tournamentId, stageId)
      allChanges.push(...result.changes)
      totalMatchesFound += result.stats.matchesFound
      totalNewMatches += result.stats.newMatches
      totalUpdatedMatches += result.stats.updatedMatches
      totalUnchangedMatches += result.stats.unchangedMatches
      totalTeamsProcessed += result.stats.teamsProcessed
      totalStandingsSaved += result.stats.standingsSaved
      totalGroupsFound += result.stats.groupsFound
    }

    const scoredMatches = matchesWithNewResult(allChanges)

    console.log(
      `✅ Scraper completed! ${totalMatchesFound} fixture entries seen, ` +
        `${totalNewMatches} created, ${totalUpdatedMatches} written, ${totalUnchangedMatches} unchanged — ` +
        `AC SED: ${summarizeChanges(allChanges)}`,
    )

    await prisma.scrapeLog.update({
      where: { id: log.id },
      data: {
        status: 'success',
        finishedAt: new Date(),
        tournamentId,
        tournamentName,
        stageIds: JSON.stringify(stagesToProcess),
        // Fixture entries seen, not AC SED matches that changed — those are
        // `newMatches` / `updatedMatches` below.
        matchesFound: totalMatchesFound,
        newMatches: totalNewMatches,
        updatedMatches: totalUpdatedMatches,
        teamsProcessed: totalTeamsProcessed,
        standingsSaved: totalStandingsSaved,
        groupsFound: totalGroupsFound,
      },
    })

    // When at least one AC SED match was just scored, the standings
    // changed — ping the group with a single generic message linking to
    // the public stats page. The auto-generated news stays as a draft and
    // its own publish notification fires separately when the admin
    // publishes it.
    //
    // This used to fire on a plain `created` too, so the group was told the
    // standings had changed when all that happened was a fixture appearing.
    if (scoredMatches.length > 0) {
      try {
        const { notifyStandingsUpdated } = await import('@/lib/whatsapp-notifier')
        await notifyStandingsUpdated()
      } catch (err) {
        console.error('[scraper] whatsapp notify failed', err)
      }
    }

    return { changes: allChanges, newMatches: newOrScoredMatches(allChanges), logId: log.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.scrapeLog.update({
      where: { id: log.id },
      data: { status: 'error', finishedAt: new Date(), errorMessage: message },
    })
    throw err
  }
}

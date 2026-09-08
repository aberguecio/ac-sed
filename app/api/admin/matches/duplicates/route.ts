import { NextResponse } from 'next/server'
import {
  consolidateMatches,
  findDuplicateMatchGroups,
  summarizeAttachments,
  type ConsolidationReport,
} from '@/lib/match-consolidation'

/**
 * Cleanup for the duplicates past fixture republications left behind. The
 * scraper heals the current fixture on its own (see `resolveFixtureMatch`);
 * this endpoint is for the rows already scattered before the fix shipped.
 *
 * GET  /api/admin/matches/duplicates            → what is duplicated and where the data sits
 * POST /api/admin/matches/duplicates            → merge (see below)
 */

// GET — inspection only, never writes.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const tournamentParam = url.searchParams.get('tournamentId')
  const tournamentId = tournamentParam ? parseInt(tournamentParam) : undefined

  if (tournamentParam && !Number.isFinite(tournamentId)) {
    return NextResponse.json({ error: 'Invalid tournamentId' }, { status: 400 })
  }

  try {
    const groups = await findDuplicateMatchGroups(
      tournamentId !== undefined ? { tournamentId } : {},
    )
    const attachments = await summarizeAttachments(groups.flatMap(g => g.matches.map(m => m.id)))

    return NextResponse.json({
      groups: groups.map(({ key, matches }) => ({
        key,
        // The oldest row is what a merge keeps, so ids already pointing at
        // this match keep resolving.
        canonicalId: matches[0].id,
        matches: matches.map(m => ({
          id: m.id,
          leagueMatchId: m.leagueMatchId,
          date: m.date,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          eventsLocked: m.eventsLocked,
          notifyGroupAt: m.notifyGroupAt,
          attachments: attachments.get(m.id),
        })),
      })),
      duplicateRows: groups.reduce((acc, g) => acc + g.matches.length - 1, 0),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST body, one of:
 *   { canonicalId: 152, duplicateIds: [167, 183, 197] }  → merge just these
 *   { all: true, tournamentId?: 205 }                    → merge every group,
 *                                                          keeping the oldest
 *                                                          row of each
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      canonicalId?: number
      duplicateIds?: number[]
      all?: boolean
      tournamentId?: number
    }

    if (body.all === true) {
      const groups = await findDuplicateMatchGroups(
        body.tournamentId !== undefined ? { tournamentId: body.tournamentId } : {},
      )
      const reports: ConsolidationReport[] = []
      // Sequential on purpose: one transaction at a time keeps the merges
      // readable in the logs and off each other's locks.
      for (const { matches } of groups) {
        const [canonical, ...rest] = matches
        reports.push(await consolidateMatches(canonical.id, rest.map(m => m.id)))
      }
      return NextResponse.json({ merged: reports.length, reports })
    }

    const { canonicalId, duplicateIds } = body
    if (!Number.isFinite(canonicalId) || !Array.isArray(duplicateIds) || duplicateIds.length === 0) {
      return NextResponse.json(
        { error: 'canonicalId and a non-empty duplicateIds array are required (or all: true)' },
        { status: 400 },
      )
    }
    if (!duplicateIds.every(id => Number.isFinite(id))) {
      return NextResponse.json({ error: 'duplicateIds must be numbers' }, { status: 400 })
    }

    const report = await consolidateMatches(canonicalId!, duplicateIds)
    return NextResponse.json({ merged: 1, reports: [report] })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

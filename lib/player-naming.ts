import { prisma } from '@/lib/db'
import { playerRefFromMatchEvent } from '@/lib/player-ref'
import type { Player, ScrapedPlayer } from '@prisma/client'

// Legacy lookup map kept for callers that still build their own mapping.
// New code should rely on `rosterPlayer` being included on the goal/card
// query and use `scorerRef` / `cardPlayerRef` from `lib/player-ref`.
export type LeaguePlayerNameMap = Map<
  number,
  { name: string; nicknames: string[] }
>

export async function buildLeaguePlayerNameMap(): Promise<LeaguePlayerNameMap> {
  const players = await prisma.player.findMany({
    where: { leaguePlayerId: { not: null } },
    select: { leaguePlayerId: true, name: true, nicknames: true },
  })
  return new Map(
    players.map(p => [p.leaguePlayerId!, { name: p.name, nicknames: p.nicknames }])
  )
}

type EventLike = {
  leaguePlayerId?: number | null
  rosterPlayerId?: number | null
  rosterPlayer?: Pick<Player, 'id' | 'name' | 'number' | 'photoUrl' | 'nicknames' | 'leaguePlayerId'> | null
  scrapedPlayer?: Pick<ScrapedPlayer, 'id' | 'firstName' | 'lastName' | 'teamId'> | null
}

// Resolves the display name for a goal/card event. Prefers the unified
// PlayerRef path (rosterPlayer joined on the query); falls back to the
// legacy `LeaguePlayerNameMap` for callers that haven't been migrated yet.
export function canonicalScorerName(
  ev: EventLike,
  map?: LeaguePlayerNameMap,
): string {
  const ref = playerRefFromMatchEvent({
    rosterPlayer: ev.rosterPlayer,
    scrapedPlayer: ev.scrapedPlayer,
    rosterPlayerId: ev.rosterPlayerId,
    leaguePlayerId: ev.leaguePlayerId,
  })
  if (ref) return ref.name

  if (map && ev.leaguePlayerId != null) {
    const rp = map.get(ev.leaguePlayerId)
    if (rp?.name) return rp.name
  }
  if (ev.scrapedPlayer) {
    return titleCase(
      `${ev.scrapedPlayer.firstName} ${ev.scrapedPlayer.lastName}`.trim()
    )
  }
  return 'Desconocido'
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

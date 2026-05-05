import { prisma } from '@/lib/db'

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

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export function canonicalScorerName(
  ev: {
    leaguePlayerId: number
    scrapedPlayer: { firstName: string; lastName: string }
  },
  map: LeaguePlayerNameMap,
): string {
  const rp = map.get(ev.leaguePlayerId)
  if (rp?.name) return rp.name
  return titleCase(`${ev.scrapedPlayer.firstName} ${ev.scrapedPlayer.lastName}`.trim())
}

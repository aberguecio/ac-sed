import type { Player, ScrapedPlayer } from '@prisma/client'

// Unified read-model for displaying a player. Abstracts whether the source
// is the local roster (Player), a Liga B record (ScrapedPlayer), or both.
// Use this everywhere we render player info; keep the raw Prisma models for
// write paths and source-specific features (phone, stats, scraping).
export type PlayerRef = {
  rosterPlayerId: number | null
  leaguePlayerId: number | null
  name: string
  shortName: string
  number: number | null
  photoUrl: string | null
  nicknames: string[]
  teamId: number | null
  isRoster: boolean
  isScraped: boolean
}

type RosterFields = Pick<
  Player,
  'id' | 'name' | 'number' | 'photoUrl' | 'nicknames' | 'leaguePlayerId'
>

type ScrapedFields = Pick<
  ScrapedPlayer,
  'id' | 'firstName' | 'lastName' | 'teamId'
>

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function shortenFullName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return name
  if (parts.length === 1) return parts[0]
  const first = parts[0]
  const last = parts[parts.length - 1]
  return `${first.charAt(0).toUpperCase()}. ${last}`
}

function scrapedFullName(s: ScrapedFields): string {
  return titleCase(`${s.firstName} ${s.lastName}`.trim())
}

// Build a PlayerRef from a match event row (goal/card/assist) that may
// include a roster relation, a scraped relation, both, or neither.
// Returns null when neither source has any useful data.
export function playerRefFromMatchEvent(input: {
  rosterPlayer?: RosterFields | null
  scrapedPlayer?: ScrapedFields | null
  rosterPlayerId?: number | null
  leaguePlayerId?: number | null
}): PlayerRef | null {
  const roster = input.rosterPlayer ?? null
  const scraped = input.scrapedPlayer ?? null

  if (!roster && !scraped) return null

  const name = roster?.name
    ?? (scraped ? scrapedFullName(scraped) : null)
  if (!name) return null

  return {
    rosterPlayerId: roster?.id ?? input.rosterPlayerId ?? null,
    leaguePlayerId: scraped?.id ?? roster?.leaguePlayerId ?? input.leaguePlayerId ?? null,
    name,
    shortName: shortenFullName(name),
    number: roster?.number ?? null,
    photoUrl: roster?.photoUrl ?? null,
    nicknames: roster?.nicknames ?? [],
    teamId: scraped?.teamId ?? null,
    isRoster: roster !== null,
    isScraped: scraped !== null,
  }
}

export function playerRefFromRoster(p: RosterFields): PlayerRef {
  return {
    rosterPlayerId: p.id,
    leaguePlayerId: p.leaguePlayerId,
    name: p.name,
    shortName: shortenFullName(p.name),
    number: p.number,
    photoUrl: p.photoUrl,
    nicknames: p.nicknames ?? [],
    teamId: null,
    isRoster: true,
    isScraped: false,
  }
}

export function playerRefFromScraped(s: ScrapedFields): PlayerRef {
  const name = scrapedFullName(s)
  return {
    rosterPlayerId: null,
    leaguePlayerId: s.id,
    name,
    shortName: shortenFullName(name),
    number: null,
    photoUrl: null,
    nicknames: [],
    teamId: s.teamId,
    isRoster: false,
    isScraped: true,
  }
}

// Look up a PlayerRef from a leaguePlayerId, given pre-built maps. Useful
// for stats/AI flows that fetch roster and goals separately and reconcile
// in memory.
export function playerRefFromLeagueId(
  leaguePlayerId: number,
  scrapedById: Map<number, ScrapedFields>,
  rosterByLeagueId: Map<number, RosterFields>,
): PlayerRef | null {
  return playerRefFromMatchEvent({
    rosterPlayer: rosterByLeagueId.get(leaguePlayerId) ?? null,
    scrapedPlayer: scrapedById.get(leaguePlayerId) ?? null,
    leaguePlayerId,
  })
}

// Convenience accessors for the common shapes used across the app.

type GoalLike = {
  rosterPlayerId?: number | null
  leaguePlayerId?: number | null
  rosterPlayer?: RosterFields | null
  scrapedPlayer?: ScrapedFields | null
  assistRosterPlayerId?: number | null
  assistLeaguePlayerId?: number | null
  assistRosterPlayer?: RosterFields | null
  assistPlayer?: ScrapedFields | null
}

type CardLike = {
  rosterPlayerId?: number | null
  leaguePlayerId?: number | null
  rosterPlayer?: RosterFields | null
  scrapedPlayer?: ScrapedFields | null
}

export function scorerRef(goal: GoalLike): PlayerRef | null {
  return playerRefFromMatchEvent({
    rosterPlayer: goal.rosterPlayer,
    scrapedPlayer: goal.scrapedPlayer,
    rosterPlayerId: goal.rosterPlayerId,
    leaguePlayerId: goal.leaguePlayerId,
  })
}

export function assistRef(goal: GoalLike): PlayerRef | null {
  return playerRefFromMatchEvent({
    rosterPlayer: goal.assistRosterPlayer,
    scrapedPlayer: goal.assistPlayer,
    rosterPlayerId: goal.assistRosterPlayerId,
    leaguePlayerId: goal.assistLeaguePlayerId,
  })
}

export function cardPlayerRef(card: CardLike): PlayerRef | null {
  return playerRefFromMatchEvent({
    rosterPlayer: card.rosterPlayer,
    scrapedPlayer: card.scrapedPlayer,
    rosterPlayerId: card.rosterPlayerId,
    leaguePlayerId: card.leaguePlayerId,
  })
}

// True when the ref belongs to AC SED. Roster players are by definition
// AC SED; scraped-only players are matched against the team ID.
export function isACSEDRef(ref: PlayerRef | null, acsedTeamId: number): boolean {
  if (!ref) return false
  if (ref.isRoster) return true
  return ref.teamId === acsedTeamId
}

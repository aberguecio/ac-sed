import { prisma } from './db'

interface StandingRow {
  teamName: string
  position: number
  points: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
}

/**
 * Calculate standings based on matches played up to a specific date
 * Extracted from lib/ai.ts getMatchContext() for reusability
 */
export async function calculateStandingsUpToDate(
  tournamentId: number,
  stageId: number,
  groupId: number,
  upToDate?: Date
): Promise<StandingRow[]> {
  // Get all teams in the group from the stored standings
  const storedStandings = await prisma.standing.findMany({
    where: {
      tournamentId,
      stageId,
      groupId,
    },
    include: { team: true },
  })

  // Get all matches played in this group up to the specified date
  const whereClause: any = {
    tournamentId,
    stageId,
    groupId,
    homeScore: { not: null }, // Only count played matches
  }

  if (upToDate) {
    whereClause.date = { lte: upToDate }
  }

  const groupMatches = await prisma.match.findMany({
    where: whereClause,
    include: {
      homeTeam: true,
      awayTeam: true,
    },
  })

  // Calculate standings manually based on matches played
  const teamStats = new Map<
    string,
    { points: number; won: number; drawn: number; lost: number; gf: number; ga: number }
  >()

  // Initialize all teams with zero stats
  for (const standing of storedStandings) {
    const teamName = standing.team.name
    teamStats.set(teamName, { points: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 })
  }

  // Calculate stats from matches
  for (const m of groupMatches) {
    const homeScore = m.homeScore ?? 0
    const awayScore = m.awayScore ?? 0
    const homeTeamName = m.homeTeam?.name ?? 'TBD'
    const awayTeamName = m.awayTeam?.name ?? 'TBD'

    // Initialize teams if not in stored standings (shouldn't happen, but safe)
    if (!teamStats.has(homeTeamName)) {
      teamStats.set(homeTeamName, { points: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 })
    }
    if (!teamStats.has(awayTeamName)) {
      teamStats.set(awayTeamName, { points: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 })
    }

    const homeStats = teamStats.get(homeTeamName)!
    const awayStats = teamStats.get(awayTeamName)!

    // Update goals
    homeStats.gf += homeScore
    homeStats.ga += awayScore
    awayStats.gf += awayScore
    awayStats.ga += homeScore

    // Update results and points
    if (homeScore > awayScore) {
      homeStats.won++
      homeStats.points += 3
      awayStats.lost++
    } else if (awayScore > homeScore) {
      awayStats.won++
      awayStats.points += 3
      homeStats.lost++
    } else {
      homeStats.drawn++
      homeStats.points += 1
      awayStats.drawn++
      awayStats.points += 1
    }
  }

  // Convert to standings array
  const standingsRows: StandingRow[] = Array.from(teamStats.entries()).map(([teamName, stats]) => ({
    teamName,
    position: 0, // Will be set after sorting
    points: stats.points,
    won: stats.won,
    drawn: stats.drawn,
    lost: stats.lost,
    goalsFor: stats.gf,
    goalsAgainst: stats.ga,
    goalDifference: stats.gf - stats.ga,
  }))

  // Sort by points, then goal difference, then goals for
  standingsRows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference
    return b.goalsFor - a.goalsFor
  })

  // Assign positions
  standingsRows.forEach((row, index) => {
    row.position = index + 1
  })

  return standingsRows
}

/**
 * Calculate top scorers based on goals in matches up to a specific date
 */
export async function calculateScorersUpToDate(
  tournamentId: number,
  stageId: number,
  groupId: number,
  upToDate?: Date
): Promise<Array<{ playerName: string; teamName: string; goals: number }>> {
  // Get all matches in this group up to the specified date
  const whereClause: any = {
    tournamentId,
    stageId,
    groupId,
    homeScore: { not: null }, // Only played matches
  }

  if (upToDate) {
    whereClause.date = { lte: upToDate }
  }

  const matches = await prisma.match.findMany({
    where: whereClause,
    select: { id: true },
  })

  const matchIds = matches.map(m => m.id)

  if (matchIds.length === 0) {
    return []
  }

  // Get all goals from these matches
  const goals = await prisma.matchGoal.findMany({
    where: {
      matchId: { in: matchIds },
    },
    include: {
      scrapedPlayer: true,
    },
  })

  // Aggregate goals by player
  const playerGoals = new Map<string, { playerName: string; teamName: string; goals: number }>()

  for (const goal of goals) {
    const playerName = `${goal.scrapedPlayer.firstName} ${goal.scrapedPlayer.lastName}`.trim()
    const teamName = goal.teamName
    const key = `${playerName}::${teamName}`

    if (!playerGoals.has(key)) {
      playerGoals.set(key, { playerName, teamName, goals: 0 })
    }

    playerGoals.get(key)!.goals++
  }

  // Convert to array and sort by goals
  const scorers = Array.from(playerGoals.values())
  scorers.sort((a, b) => b.goals - a.goals)

  return scorers
}

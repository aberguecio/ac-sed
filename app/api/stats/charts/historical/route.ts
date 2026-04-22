import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { calculateStandingsUpToDate } from '@/lib/stats-calculator'

const ACSED_TEAM_NAME = 'AC Sed'

export async function GET() {
  try {
    // Get AC SED team
    const acsedTeam = await prisma.team.findFirst({
      where: { name: ACSED_TEAM_NAME },
    })

    if (!acsedTeam) {
      return NextResponse.json({ error: 'AC SED team not found' }, { status: 404 })
    }

    // Get all tournaments with stages
    const tournaments = await prisma.tournament.findMany({
      include: {
        stages: {
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    // Get all matches for AC SED across all tournaments (played matches only)
    const allMatches = await prisma.match.findMany({
      where: {
        AND: [
          {
            OR: [
              { homeTeamId: acsedTeam.id },
              { awayTeamId: acsedTeam.id },
            ],
          },
          {
            homeScore: { not: null },
            awayScore: { not: null },
          },
        ],
      },
      include: {
        tournament: true,
        stage: true,
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: { date: 'asc' },
    })

    // 1. Historical Positions Timeline - Position after EACH match
    const positionsTimeline: Array<{
      tournamentId: number
      tournamentName: string
      stageId: number
      stageName: string
      groupName: string
      groupId: number
      position: number
      points: number
      matchNumber: number
      date: string
      opponent: string
      result: string
    }> = []

    // Group matches by tournament/stage/group
    const matchesByPhase = new Map<string, typeof allMatches>()
    allMatches.forEach((match) => {
      if (!match.tournamentId || !match.stageId || !match.groupId) return
      const key = `${match.tournamentId}-${match.stageId}-${match.groupId}`
      if (!matchesByPhase.has(key)) {
        matchesByPhase.set(key, [])
      }
      matchesByPhase.get(key)!.push(match)
    })

    // For each phase, calculate position after each match
    for (const [phaseKey, matches] of matchesByPhase.entries()) {
      const [tournamentIdStr, stageIdStr, groupIdStr] = phaseKey.split('-')
      const tournamentId = Number(tournamentIdStr)
      const stageId = Number(stageIdStr)
      const groupId = Number(groupIdStr)

      // Get phase info
      const tournament = tournaments.find((t) => t.id === tournamentId)
      const stage = tournament?.stages.find((s) => s.id === stageId)
      const group = await prisma.group.findUnique({ where: { id: groupId } })

      let matchNumber = 0
      for (const match of matches) {
        matchNumber++
        const upToDate = new Date(match.date)
        upToDate.setDate(upToDate.getDate() + 1) // Include this match

        // Calculate standings up to this match
        const standings = await calculateStandingsUpToDate(tournamentId, stageId, groupId, upToDate)
        const acsedStanding = standings.find((s) => s.teamName === ACSED_TEAM_NAME)

        if (acsedStanding) {
          const isHome = match.homeTeamId === acsedTeam.id
          const opponent = isHome ? match.awayTeam?.name : match.homeTeam?.name
          const goalsFor = isHome ? match.homeScore! : match.awayScore!
          const goalsAgainst = isHome ? match.awayScore! : match.homeScore!

          let result = 'E'
          if (goalsFor > goalsAgainst) result = 'V'
          else if (goalsFor < goalsAgainst) result = 'D'

          positionsTimeline.push({
            tournamentId,
            tournamentName: tournament?.name || 'Unknown',
            stageId,
            stageName: stage?.name || 'Unknown',
            groupName: group?.name || '',
            groupId,
            position: acsedStanding.position,
            points: acsedStanding.points,
            matchNumber,
            date: match.date.toISOString(),
            opponent: opponent || 'Unknown',
            result,
          })
        }
      }
    }

    // 2. Tournament Comparison - Get final standings for each phase
    const tournamentStats = new Map<
      number,
      {
        tournamentId: number
        tournamentName: string
        stages: Array<{
          stageId: number
          stageName: string
          points: number
          goalsFor: number
          goalsAgainst: number
          won: number
          drawn: number
          lost: number
          position: number
        }>
      }
    >()

    // Get final standings from DB (final position of each phase)
    const finalStandings = await prisma.standing.findMany({
      where: { teamId: acsedTeam.id },
      include: { tournament: true },
    })

    finalStandings.forEach((standing) => {
      if (!tournamentStats.has(standing.tournamentId)) {
        tournamentStats.set(standing.tournamentId, {
          tournamentId: standing.tournamentId,
          tournamentName: standing.tournament?.name || 'Unknown',
          stages: [],
        })
      }

      const stage = tournaments
        .find((t) => t.id === standing.tournamentId)
        ?.stages.find((s) => s.id === standing.stageId)

      tournamentStats.get(standing.tournamentId)!.stages.push({
        stageId: standing.stageId,
        stageName: stage?.name || 'Unknown',
        points: standing.points,
        goalsFor: standing.goalsFor,
        goalsAgainst: standing.goalsAgainst,
        won: standing.won,
        drawn: standing.drawn,
        lost: standing.lost,
        position: standing.position,
      })
    })

    const tournamentComparison = Array.from(tournamentStats.values())

    // 3. Historical Streak (W/D/L sequence) - grouped by phase
    const streak = allMatches.map((match) => {
      const isHome = match.homeTeamId === acsedTeam.id
      const goalsFor = isHome ? match.homeScore! : match.awayScore!
      const goalsAgainst = isHome ? match.awayScore! : match.homeScore!

      let result: 'W' | 'D' | 'L' = 'D'
      if (goalsFor > goalsAgainst) result = 'W'
      else if (goalsFor < goalsAgainst) result = 'L'

      return {
        date: match.date.toISOString(),
        tournamentId: match.tournamentId || 0,
        tournamentName: match.tournament?.name || 'Unknown',
        stageId: match.stageId || 0,
        stageName: match.stage?.name || '',
        groupId: match.groupId || 0,
        opponent: isHome ? match.awayTeam?.name || 'Unknown' : match.homeTeam?.name || 'Unknown',
        goalsFor,
        goalsAgainst,
        result,
      }
    })

    // 4. Results Distribution
    const resultsDistribution = new Map<
      string,
      { tournamentName: string; won: number; drawn: number; lost: number; total: number }
    >()

    allMatches.forEach((match) => {
      const key = `${match.tournamentId}-${match.tournament?.name || 'Unknown'}`
      if (!resultsDistribution.has(key)) {
        resultsDistribution.set(key, {
          tournamentName: match.tournament?.name || 'Unknown',
          won: 0,
          drawn: 0,
          lost: 0,
          total: 0,
        })
      }

      const isHome = match.homeTeamId === acsedTeam.id
      const goalsFor = isHome ? match.homeScore! : match.awayScore!
      const goalsAgainst = isHome ? match.awayScore! : match.homeScore!

      const stats = resultsDistribution.get(key)!
      stats.total++

      if (goalsFor > goalsAgainst) stats.won++
      else if (goalsFor === goalsAgainst) stats.drawn++
      else stats.lost++
    })

    const distribution = Array.from(resultsDistribution.values()).map((stats) => ({
      tournamentName: stats.tournamentName,
      wonPct: (stats.won / stats.total) * 100,
      drawnPct: (stats.drawn / stats.total) * 100,
      lostPct: (stats.lost / stats.total) * 100,
      total: stats.total,
    }))

    return NextResponse.json({
      positionsTimeline,
      tournamentComparison,
      streak,
      resultsDistribution: distribution,
    })
  } catch (err) {
    console.error('Charts historical error:', err)
    return NextResponse.json({ error: 'Failed to fetch historical data' }, { status: 500 })
  }
}

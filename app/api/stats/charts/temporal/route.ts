import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { calculateStandingsUpToDate, calculateScorersUpToDate } from '@/lib/stats-calculator'

const ACSED_TEAM_NAME = 'AC Sed'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const tournamentId = Number(searchParams.get('tournamentId'))
    const stageId = Number(searchParams.get('stageId'))
    const upToDate = searchParams.get('upToDate') // Optional: filter matches up to this date (ISO string)

    if (!tournamentId || !stageId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    // Prepare upToDate filter
    let upToDateObj: Date | null = null
    if (upToDate) {
      upToDateObj = new Date(upToDate)
      upToDateObj.setDate(upToDateObj.getDate() + 1) // Include matches on the selected date
    }

    // Get all PLAYED matches for this tournament/stage (filtered by upToDate if provided)
    const allMatches = await prisma.match.findMany({
      where: {
        tournamentId,
        stageId,
        homeScore: { not: null },
        awayScore: { not: null },
        ...(upToDateObj && {
          date: { lte: upToDateObj }
        })
      },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        roundName: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
      },
    })

    // Get ALL AC SED matches (including future ones) for performanceVsOpponents
    // Don't filter by upToDate here - we want to show future opponents with averages
    const allAcsedMatches = await prisma.match.findMany({
      where: {
        tournamentId,
        stageId,
        OR: [
          { homeTeam: { name: ACSED_TEAM_NAME } },
          { awayTeam: { name: ACSED_TEAM_NAME } }
        ]
      },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
      },
    })

    if (allMatches.length === 0) {
      return NextResponse.json({
        positionEvolution: [],
        pointsProgress: [],
        performanceByMatch: [],
        scorersEvolution: [],
        radarComparison: null,
        performanceVsOpponents: [],
      })
    }

    // Get groupId from standings
    const standingsSample = await prisma.standing.findFirst({
      where: { tournamentId, stageId },
      select: { groupId: true },
    })

    if (!standingsSample) {
      return NextResponse.json({ error: 'No standings found' }, { status: 404 })
    }

    const groupId = standingsSample.groupId

    // Group matches by round/match day
    const matchDays: { date: Date; matches: typeof allMatches }[] = []
    const uniqueDates = new Set<string>()

    allMatches.forEach((match) => {
      const dateKey = match.date.toISOString().split('T')[0]
      if (!uniqueDates.has(dateKey)) {
        uniqueDates.add(dateKey)
        matchDays.push({
          date: match.date,
          matches: allMatches.filter(
            (m) => m.date.toISOString().split('T')[0] === dateKey
          ),
        })
      }
    })

    // Calculate standings and scorers for each match day
    const positionEvolution: Array<{
      matchDay: number
      date: string
      position: number
      points: number
    }> = []

    const pointsProgress: Array<{
      matchDay: number
      date: string
      points: number
      goalsFor: number
      goalsAgainst: number
    }> = []

    const performanceByMatch: Array<{
      matchDay: number
      date: string
      opponent: string
      goalsFor: number
      goalsAgainst: number
      result: 'W' | 'D' | 'L'
    }> = []

    const performanceVsOpponents: Array<{
      matchDay: number
      opponent: string
      acsedGoalsFor: number | null
      acsedGoalsAgainst: number | null
      avgGoalsFor: number
      avgGoalsAgainst: number
      isFuture: boolean
    }> = []

    // Track scorers evolution
    const scorersMap = new Map<string, Array<{ matchDay: number; goals: number }>>()

    for (let i = 0; i < matchDays.length; i++) {
      const md = matchDays[i]
      const upToDate = new Date(md.date)
      upToDate.setDate(upToDate.getDate() + 1)

      const standings = await calculateStandingsUpToDate(tournamentId, stageId, groupId, upToDate)
      const acsedStanding = standings.find((s) => s.teamName === ACSED_TEAM_NAME)

      if (acsedStanding) {
        positionEvolution.push({
          matchDay: i + 1,
          date: md.date.toISOString(),
          position: acsedStanding.position,
          points: acsedStanding.points,
        })

        pointsProgress.push({
          matchDay: i + 1,
          date: md.date.toISOString(),
          points: acsedStanding.points,
          goalsFor: acsedStanding.goalsFor,
          goalsAgainst: acsedStanding.goalsAgainst,
        })
      }

      // Get AC SED match for this match day
      const acsedMatch = md.matches.find(
        (m) =>
          m.homeTeam?.name === ACSED_TEAM_NAME || m.awayTeam?.name === ACSED_TEAM_NAME
      )

      if (acsedMatch) {
        const isHome = acsedMatch.homeTeam?.name === ACSED_TEAM_NAME
        const goalsFor = isHome ? acsedMatch.homeScore! : acsedMatch.awayScore!
        const goalsAgainst = isHome ? acsedMatch.awayScore! : acsedMatch.homeScore!
        const opponent = isHome ? acsedMatch.awayTeam?.name : acsedMatch.homeTeam?.name

        let result: 'W' | 'D' | 'L' = 'D'
        if (goalsFor > goalsAgainst) result = 'W'
        else if (goalsFor < goalsAgainst) result = 'L'

        performanceByMatch.push({
          matchDay: i + 1,
          date: md.date.toISOString(),
          opponent: opponent || 'Unknown',
          goalsFor,
          goalsAgainst,
          result,
        })
      }

      // Calculate scorers up to this date
      const scorers = await calculateScorersUpToDate(tournamentId, stageId, groupId, upToDate)
      const acsedScorers = scorers.filter((s) => s.teamName === ACSED_TEAM_NAME)

      acsedScorers.forEach((scorer) => {
        if (!scorersMap.has(scorer.playerName)) {
          scorersMap.set(scorer.playerName, [])
        }
        scorersMap.get(scorer.playerName)!.push({
          matchDay: i + 1,
          goals: scorer.goals,
        })
      })
    }

    // Build performanceVsOpponents from all AC SED matches (played + future)
    allAcsedMatches.forEach((match, idx) => {
      const isHome = match.homeTeam?.name === ACSED_TEAM_NAME
      const opponent = isHome ? match.awayTeam?.name : match.homeTeam?.name
      const opponentId = isHome ? match.awayTeamId : match.homeTeamId
      // A match is "future" if:
      // 1. Its scores are null (not played yet), OR
      // 2. If upToDate filter is active and match date is after upToDate
      const isFuture = (match.homeScore === null || match.awayScore === null) ||
                       (upToDateObj && match.date > upToDateObj)

      // AC SED data (null if future)
      const acsedGoalsFor = isFuture ? null : (isHome ? match.homeScore! : match.awayScore!)
      const acsedGoalsAgainst = isFuture ? null : (isHome ? match.awayScore! : match.homeScore!)

      // Calculate average from other teams vs this opponent
      let avgGoalsFor = 0
      let avgGoalsAgainst = 0

      if (opponentId) {
        const opponentMatches = allMatches.filter(m => {
          const isOpponentHome = m.homeTeamId === opponentId
          const isOpponentAway = m.awayTeamId === opponentId
          const isAcsedInMatch = m.homeTeam?.name === ACSED_TEAM_NAME || m.awayTeam?.name === ACSED_TEAM_NAME
          return (isOpponentHome || isOpponentAway) && !isAcsedInMatch
        })

        if (opponentMatches.length > 0) {
          let totalGoalsFor = 0
          let totalGoalsAgainst = 0

          opponentMatches.forEach(m => {
            const opponentIsHome = m.homeTeamId === opponentId
            if (opponentIsHome) {
              totalGoalsFor += m.awayScore || 0
              totalGoalsAgainst += m.homeScore || 0
            } else {
              totalGoalsFor += m.homeScore || 0
              totalGoalsAgainst += m.awayScore || 0
            }
          })

          avgGoalsFor = totalGoalsFor / opponentMatches.length
          avgGoalsAgainst = totalGoalsAgainst / opponentMatches.length
        } else if (!isFuture && acsedGoalsFor !== null && acsedGoalsAgainst !== null) {
          // No other matches, use AC SED's data if played
          avgGoalsFor = acsedGoalsFor
          avgGoalsAgainst = acsedGoalsAgainst
        }
      }

      performanceVsOpponents.push({
        matchDay: idx + 1,
        opponent: opponent || 'Unknown',
        acsedGoalsFor,
        acsedGoalsAgainst,
        avgGoalsFor,
        avgGoalsAgainst,
        isFuture,
      })
    })

    // Format scorers evolution
    const scorersEvolution = Array.from(scorersMap.entries()).map(([name, data]) => ({
      playerName: name,
      data: data,
    }))

    // Calculate radar comparison (latest standings)
    const latestStandings = await calculateStandingsUpToDate(
      tournamentId,
      stageId,
      groupId,
      new Date()
    )

    const acsedStanding = latestStandings.find((s) => s.teamName === ACSED_TEAM_NAME)

    if (!acsedStanding) {
      return NextResponse.json({
        positionEvolution,
        pointsProgress,
        performanceByMatch,
        scorersEvolution,
        radarComparison: null,
        performanceVsOpponents,
      })
    }

    // Calculate division averages
    const totalTeams = latestStandings.length
    const divisionAvg = {
      goalsFor: latestStandings.reduce((sum, s) => sum + s.goalsFor, 0) / totalTeams,
      goalsAgainst: latestStandings.reduce((sum, s) => sum + s.goalsAgainst, 0) / totalTeams,
      points: latestStandings.reduce((sum, s) => sum + s.points, 0) / totalTeams,
      won: latestStandings.reduce((sum, s) => sum + s.won, 0) / totalTeams,
      matchesPlayed: latestStandings.reduce((sum, s) => sum + s.won + s.drawn + s.lost, 0) / totalTeams,
    }

    const acsedMatchesPlayed = acsedStanding.won + acsedStanding.drawn + acsedStanding.lost

    const radarComparison = {
      acsed: {
        goalsFor: acsedStanding.goalsFor,
        goalsAgainst: acsedStanding.goalsAgainst,
        points: acsedStanding.points,
        won: acsedStanding.won,
        matchesPlayed: acsedMatchesPlayed,
      },
      divisionAvg,
    }

    return NextResponse.json({
      positionEvolution,
      pointsProgress,
      performanceByMatch,
      scorersEvolution,
      radarComparison,
      performanceVsOpponents,
    })
  } catch (err) {
    console.error('Charts temporal error:', err)
    return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 })
  }
}

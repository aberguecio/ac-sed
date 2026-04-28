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

    // Read standings from DB (scraped data) filtered by tournament/stage
    const standingsFromDB = await prisma.standing.findMany({
      where: {
        tournamentId,
        stageId,
      },
      include: {
        team: true,
        group: true,
      },
      orderBy: { position: 'asc' }
    })

    if (standingsFromDB.length === 0) {
      return NextResponse.json({
        standings: [],
        topScorers: [],
        teamScorers: [],
        fixtures: [],
        goalsFor: 0,
        goalsAgainst: 0,
        totalMatches: 5,
        matchesPlayed: 0,
        matchesRemaining: 5,
        groupName: 'Sin datos - ejecutar scraper',
      })
    }

    // Get groupId and groupName from standings
    const groupId = standingsFromDB[0].groupId
    const groupName = standingsFromDB[0].group?.name ?? 'Sin nombre'

    // If upToDate is provided, recalculate standings up to that date
    // Otherwise, use the standings from the DB (latest)
    let standingsData
    if (upToDate) {
      const upToDateObj = new Date(upToDate)
      upToDateObj.setDate(upToDateObj.getDate() + 1) // Include matches on the selected date
      const calculated = await calculateStandingsUpToDate(tournamentId, stageId, groupId, upToDateObj)
      standingsData = calculated
    } else {
      standingsData = standingsFromDB.map((s) => ({
        teamName: s.team.name,
        position: s.position,
        played: s.won + s.drawn + s.lost,
        won: s.won,
        drawn: s.drawn,
        lost: s.lost,
        goalsFor: s.goalsFor,
        goalsAgainst: s.goalsAgainst,
        points: s.points,
        goalDifference: s.goalsFor - s.goalsAgainst,
      }))
    }

    // Get ALL matches from DB (only AC SED matches for this tournament/stage)
    // Always get all matches, but filter results based on upToDate
    const allMatchesFromDB = await prisma.match.findMany({
      where: {
        tournamentId,
        stageId,
        OR: [
          { homeTeam: { name: ACSED_TEAM_NAME } },
          { awayTeam: { name: ACSED_TEAM_NAME } }
        ]
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: { date: 'desc' },
    })

    // If upToDate is provided, hide scores for matches after that date
    let upToDateObj: Date | null = null
    if (upToDate) {
      upToDateObj = new Date(upToDate)
      upToDateObj.setDate(upToDateObj.getDate() + 1)
    }

    const fixtures = allMatchesFromDB.map((m) => {
      // If upToDate filter is active and match is after the filter date, hide scores
      const shouldHideScore = upToDateObj && m.date > upToDateObj

      return {
        date: m.date,
        homeTeam: m.homeTeam?.name ?? 'TBD',
        homeTeamId: m.homeTeam?.id,
        homeTeamLogo: m.homeTeam?.logoUrl,
        awayTeam: m.awayTeam?.name ?? 'TBD',
        awayTeamId: m.awayTeam?.id,
        awayTeamLogo: m.awayTeam?.logoUrl,
        homeScore: shouldHideScore ? null : m.homeScore,
        awayScore: shouldHideScore ? null : m.awayScore,
      }
    })

    const matchesPlayed = fixtures.filter((f) => f.homeScore !== null && f.awayScore !== null).length
    const totalMatches = 5 // 5 matches per phase in Liga B
    const matchesRemaining = Math.max(0, totalMatches - matchesPlayed)

    // Calculate team stats
    const acsedStanding = standingsData.find((s) => s.teamName === ACSED_TEAM_NAME) || {
      goalsFor: 0,
      goalsAgainst: 0,
      won: 0,
      drawn: 0,
      lost: 0,
    }

    // Get top scorers - either calculated from matches up to date, or from DB
    let topScorers
    let teamScorers
    if (upToDate) {
      const upToDateObj = new Date(upToDate)
      upToDateObj.setDate(upToDateObj.getDate() + 1)
      const allScorers = await calculateScorersUpToDate(tournamentId, stageId, groupId, upToDateObj)

      // Filter top scorers for this division
      const divisionTeams = standingsData.map((s: any) => s.teamName)
      topScorers = allScorers
        .filter(s => divisionTeams.includes(s.teamName))
        .slice(0, 10)

      // Get AC SED scorers
      teamScorers = allScorers.filter(s => s.teamName === ACSED_TEAM_NAME)
    } else {
      // Get top scorers from DB for this tournament
      const topScorersAll = await prisma.leagueScorer.findMany({
        where: { tournamentId },
        include: {
          team: true,
        },
        orderBy: { goals: 'desc' },
      })

      // Filter top scorers for this division
      const divisionTeams = standingsData.map((s: any) => s.teamName)
      topScorers = topScorersAll
        .filter((s) => divisionTeams.includes(s.team.name))
        .slice(0, 10)
        .map((s) => ({
          playerName: s.playerName,
          teamName: s.team.name,
          goals: s.goals,
        }))

      // Get AC SED scorers
      teamScorers = topScorersAll
        .filter((s) => s.team.name === ACSED_TEAM_NAME)
        .map((s) => ({
          playerName: s.playerName,
          goals: s.goals,
        }))
    }

    // Get AC SED assists
    const assistsQuery = await prisma.matchGoal.findMany({
      where: {
        match: {
          tournamentId,
          stageId,
          ...(upToDate && {
            date: {
              lte: new Date(upToDate + 'T23:59:59Z')
            }
          })
        },
        teamName: ACSED_TEAM_NAME,
        assistLeaguePlayerId: { not: null }
      },
      include: {
        assistPlayer: true
      }
    })

    // Count assists per player
    const assistsMap = new Map<string, number>()
    assistsQuery.forEach((goal) => {
      if (goal.assistPlayer) {
        const playerName = `${goal.assistPlayer.firstName} ${goal.assistPlayer.lastName}`
        assistsMap.set(playerName, (assistsMap.get(playerName) || 0) + 1)
      }
    })

    const teamAssists = Array.from(assistsMap.entries())
      .map(([playerName, assists]) => ({ playerName, assists }))
      .sort((a, b) => b.assists - a.assists)

    // Format standings for frontend (add team relation)
    const standingsForFrontend = upToDate
      ? await Promise.all(standingsData.map(async (s: any, index: number) => {
          const team = await prisma.team.findFirst({ where: { name: s.teamName } })
          return {
            id: team?.id || index, // Use team ID or index as fallback
            position: s.position,
            played: s.won + s.drawn + s.lost,
            won: s.won,
            drawn: s.drawn,
            lost: s.lost,
            goalsFor: s.goalsFor,
            goalsAgainst: s.goalsAgainst,
            points: s.points,
            team: team || { id: index, name: s.teamName, logoUrl: null },
          }
        }))
      : standingsFromDB

    return NextResponse.json({
      standings: standingsForFrontend,
      topScorers,
      teamScorers,
      teamAssists,
      fixtures,
      goalsFor: acsedStanding.goalsFor,
      goalsAgainst: acsedStanding.goalsAgainst,
      totalMatches,
      matchesPlayed,
      matchesRemaining,
      groupName,
      tournamentId,
      stageId,
      groupId,
    })
  } catch (err) {
    console.error('Stats error:', err)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}

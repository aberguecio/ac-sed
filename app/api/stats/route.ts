import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateCoachAnalysis } from '@/lib/coach-analysis'
import { calculateStandingsUpToDate, calculateScorersUpToDate } from '@/lib/stats-calculator'
import crypto from 'crypto'

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
        analysis: null,
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

    // Get all matches from DB (only AC SED matches for this tournament/stage)
    // If upToDate is provided, only get matches up to that date
    const matchWhereClause: any = {
      tournamentId,
      stageId,
      OR: [
        { homeTeam: { name: ACSED_TEAM_NAME } },
        { awayTeam: { name: ACSED_TEAM_NAME } }
      ]
    }

    if (upToDate) {
      // Add 1 day to include matches on the selected date
      const maxDate = new Date(upToDate)
      maxDate.setDate(maxDate.getDate() + 1)
      matchWhereClause.date = { lte: maxDate }
    }

    const allMatchesFromDB = await prisma.match.findMany({
      where: matchWhereClause,
      include: {
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: { date: 'desc' },
    })

    const fixtures = allMatchesFromDB.map((m) => ({
      homeTeam: m.homeTeam?.name ?? 'TBD',
      awayTeam: m.awayTeam?.name ?? 'TBD',
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    }))

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

    // Generate or get cached analysis
    const dataForHash = {
      standings: standingsData,
      matchesPlayed,
      matchesRemaining,
      teamScorers,
    }
    const dataHash = crypto.createHash('md5').update(JSON.stringify(dataForHash)).digest('hex')

    // Check for cached analysis
    let analysis = null
    const cachedAnalysis = await prisma.tournamentAnalysis.findFirst({
      where: {
        tournamentId,
        stageId,
        dataHash,
      },
      orderBy: { generatedAt: 'desc' }
    })

    if (cachedAnalysis) {
      analysis = cachedAnalysis.content
    }
    // If no analysis exists, we'll return null and let the client trigger generation

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
      fixtures,
      analysis,
      goalsFor: acsedStanding.goalsFor,
      goalsAgainst: acsedStanding.goalsAgainst,
      totalMatches,
      matchesPlayed,
      matchesRemaining,
      groupName,
      dataHash, // Para que el frontend pueda generar análisis
      tournamentId,
      stageId,
      groupId,
    })
  } catch (err) {
    console.error('Stats error:', err)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}

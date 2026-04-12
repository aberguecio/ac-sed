import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateCoachAnalysis } from '@/lib/coach-analysis'
import crypto from 'crypto'

const ACSED_TEAM_NAME = 'AC Sed'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const tournamentId = Number(searchParams.get('tournamentId'))
    const stageId = Number(searchParams.get('stageId'))

    if (!tournamentId || !stageId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    // Read standings from DB (scraped data) filtered by tournament/stage
    const standingsFromDB = await prisma.standing.findMany({
      where: {
        tournamentId,
        stageId,
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
    const groupName = standingsFromDB[0].groupName

    const standingsData = standingsFromDB.map((s) => ({
      teamName: s.teamName,
      position: s.position,
      played: s.played,
      won: s.won,
      drawn: s.drawn,
      lost: s.lost,
      goalsFor: s.goalsFor,
      goalsAgainst: s.goalsAgainst,
      points: s.points,
    }))

    // Get all matches from DB (only AC SED matches for this tournament/stage)
    const allMatchesFromDB = await prisma.match.findMany({
      where: {
        tournamentId,
        stageId,
        OR: [
          { homeTeam: ACSED_TEAM_NAME },
          { awayTeam: ACSED_TEAM_NAME }
        ]
      },
      orderBy: { date: 'desc' },
    })

    const fixtures = allMatchesFromDB.map((m) => ({
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
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

    // Get top scorers from DB for this tournament
    const topScorersAll = await prisma.leagueScorer.findMany({
      where: { tournamentId },
      orderBy: { goals: 'desc' },
    })

    // Filter top scorers for this division
    const divisionTeams = standingsData.map((s) => s.teamName)
    const topScorers = topScorersAll
      .filter((s) => divisionTeams.includes(s.teamName))
      .slice(0, 10)
      .map((s) => ({
        playerName: s.playerName,
        teamName: s.teamName,
        goals: s.goals,
      }))

    // Get AC SED scorers
    const teamScorers = topScorersAll
      .filter((s) => s.teamName === ACSED_TEAM_NAME)
      .map((s) => ({
        playerName: s.playerName,
        goals: s.goals,
      }))

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

    return NextResponse.json({
      standings: standingsData,
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

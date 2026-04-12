import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateCoachAnalysis } from '@/lib/coach-analysis'
import crypto from 'crypto'

const LIGAB_API = 'https://api.ligab.cl/v1'
const ACSED_TEAM_ID = 2836
const ACSED_TEAM_NAME = 'AC Sed'

async function fetchAPI(endpoint: string) {
  const res = await fetch(`${LIGAB_API}${endpoint}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function POST(request: Request) {
  try {
    const { tournamentId, stageId } = await request.json()

    if (!tournamentId || !stageId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    // Find AC SED's group
    const groups = await fetchAPI(`/stages/${stageId}/groups`)
    let acsedGroupId: number | null = null

    for (const group of groups) {
      const standings = await fetchAPI(`/groups/${group.id}/standings`).catch(() => [])
      const hasAcSed = standings.some((s: any) => s.team?.id === ACSED_TEAM_ID)
      if (hasAcSed) {
        acsedGroupId = group.id
        break
      }
    }

    if (!acsedGroupId) {
      return NextResponse.json({ error: 'AC SED not found in this stage' }, { status: 404 })
    }

    // Fetch all data
    const [standings, matchDays, topScorersAll] = await Promise.all([
      fetchAPI(`/groups/${acsedGroupId}/standings`),
      fetchAPI(`/stages/${stageId}/match-days?filter={"include":[{"relation":"matches","scope":{"include":[{"relation":"homeTeam"},{"relation":"awayTeam"}],"where":{"groupId":${acsedGroupId}}}}]}`),
      fetchAPI(`/tournaments/${tournamentId}/top-scorers`).catch(() => []),
    ])

    // Process standings
    const standingsData = standings.map((s: any) => ({
      teamName: s.team?.name || 'Unknown',
      position: 0,
      played: s.played || 0,
      won: s.won || 0,
      drawn: s.drawn || 0,
      lost: s.lost || 0,
      goalsFor: s.goalsFor || 0,
      goalsAgainst: s.goalsAgainst || 0,
      points: s.points || 0,
    }))
    standingsData.sort((a: any, b: any) => b.points - a.points)
    standingsData.forEach((s: any, i: number) => (s.position = i + 1))

    // Process matches
    const allMatches = matchDays.flatMap((md: any) => md.matches || [])
    const acsedMatches = allMatches.filter((m: any) =>
      m.homeTeam?.id === ACSED_TEAM_ID || m.awayTeam?.id === ACSED_TEAM_ID
    )

    const fixtures = acsedMatches.map((m: any) => ({
      homeTeam: m.homeTeam?.name || 'Unknown',
      awayTeam: m.awayTeam?.name || 'Unknown',
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    }))

    const matchesPlayed = fixtures.filter((f: any) => f.homeScore !== null).length
    const totalMatches = 5 // 5 matches per phase
    const matchesRemaining = totalMatches - matchesPlayed

    // Get AC SED scorers
    const teamScorers = (topScorersAll || [])
      .filter((s: any) => (s.team?.name || s.teamName) === ACSED_TEAM_NAME)
      .map((s: any) => ({
        playerName: s.player ? `${s.player.firstName} ${s.player.lastName}`.trim() : s.playerName || 'Unknown',
        goals: s.goals || 0,
      }))

    // Get historical matches from our database for upcoming rivals
    const upcomingRivals = fixtures
      .filter((f: any) => !f.homeScore && !f.awayScore)
      .slice(0, matchesRemaining)
      .map((f: any) => f.homeTeam === ACSED_TEAM_NAME ? f.awayTeam : f.homeTeam)

    const previousMatches = upcomingRivals.length > 0
      ? await prisma.match.findMany({
          where: {
            OR: upcomingRivals.map((rival: string) => ({
              OR: [
                { homeTeam: ACSED_TEAM_NAME, awayTeam: rival },
                { homeTeam: rival, awayTeam: ACSED_TEAM_NAME }
              ]
            })),
            homeScore: { not: null },
            awayScore: { not: null }
          },
          orderBy: { date: 'desc' },
          take: 10
        })
      : []

    // Generate new analysis (force regeneration)
    const analysis = await generateCoachAnalysis({
      standings: standingsData,
      fixtures,
      teamScorers,
      matchesPlayed,
      matchesRemaining,
      topScorersAll,
      previousMatches,
    })

    // Calculate new data hash
    const dataForHash = {
      standings: standingsData,
      matchesPlayed,
      matchesRemaining,
      teamScorers,
    }
    const dataHash = crypto.createHash('md5').update(JSON.stringify(dataForHash)).digest('hex')

    // Save to database
    await prisma.tournamentAnalysis.upsert({
      where: {
        tournamentId_stageId_groupId: {
          tournamentId,
          stageId,
          groupId: acsedGroupId,
        },
      },
      update: {
        content: analysis,
        dataHash,
        generatedAt: new Date(),
        aiProvider: process.env.AI_PROVIDER ?? 'openai',
      },
      create: {
        tournamentId,
        stageId,
        groupId: acsedGroupId,
        content: analysis,
        dataHash,
        aiProvider: process.env.AI_PROVIDER ?? 'openai',
      },
    })

    return NextResponse.json({ success: true, analysis })
  } catch (err) {
    console.error('Error regenerating analysis:', err)
    return NextResponse.json({ error: 'Failed to regenerate analysis' }, { status: 500 })
  }
}
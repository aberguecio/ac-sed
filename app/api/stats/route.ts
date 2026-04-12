import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateText } from 'ai'
import { openai, createOpenAI } from '@ai-sdk/openai'
import crypto from 'crypto'

const LIGAB_API = 'https://api.ligab.cl/v1'
const ACSED_TEAM_ID = 2836
const ACSED_TEAM_NAME = 'AC Sed'

async function fetchAPI(endpoint: string) {
  const res = await fetch(`${LIGAB_API}${endpoint}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

function getAIModel() {
  const model = process.env.AI_MODEL ?? 'gpt-4o-mini'
  const apiKey = process.env.AI_API_KEY
  const baseURL = process.env.AI_BASE_URL

  if (baseURL) {
    const customProvider = createOpenAI({ baseURL, apiKey: apiKey ?? 'dummy-key' })
    return customProvider(model)
  }
  return openai(model)
}

async function generateAnalysis(data: any): Promise<string> {
  const { standings, fixtures, teamScorers, matchesPlayed, matchesRemaining } = data

  const acsedStanding = standings.find((s: any) => s.teamName === ACSED_TEAM_NAME)
  if (!acsedStanding) return ''

  const position = acsedStanding.position
  const points = acsedStanding.points
  const isFirst = position === 1
  const isLast = position === standings.length
  const pointsToFirst = isFirst ? 0 : standings[0].points - points
  const pointsAboveLast = isLast ? 0 : points - standings[standings.length - 1].points

  const upcomingMatches = fixtures
    .filter((f: any) => !f.homeScore && !f.awayScore)
    .slice(0, matchesRemaining)

  const prompt = `Eres el coach exigente del AC SED. Analiza la situación actual y escribe un análisis motivador pero realista.

Situación actual:
- Posición: ${position} de ${standings.length} equipos
- Puntos: ${points}
- Partidos jugados: ${matchesPlayed}
- Partidos restantes: ${matchesRemaining}
- Diferencia con el primero: ${pointsToFirst} puntos
- Ventaja sobre el último: ${pointsAboveLast} puntos

Tabla actual:
${standings.slice(0, 5).map((s: any) => `${s.position}. ${s.teamName}: ${s.points}pts (PJ:${s.played} G:${s.won} E:${s.drawn} P:${s.lost})`).join('\n')}

Próximos rivales:
${upcomingMatches.map((m: any) => {
  const rival = m.homeTeam === ACSED_TEAM_NAME ? m.awayTeam : m.homeTeam
  const rivalStanding = standings.find((s: any) => s.teamName === rival)
  return `- ${rival} (Posición: ${rivalStanding?.position || '?'}, Puntos: ${rivalStanding?.points || '?'})`
}).join('\n')}

Goleadores del equipo:
${teamScorers.slice(0, 3).map((s: any) => `- ${s.playerName}: ${s.goals} goles`).join('\n')}

Escribe un análisis de 3-4 párrafos como un coach argentino exigente pero motivador. Incluye:
1. Análisis de la situación actual (qué necesitamos para campeonar o evitar descenso)
2. Evaluación de los próximos partidos y qué resultados necesitamos
3. Mensaje motivador pero realista al equipo
4. Si queda 1 partido, ser MUY específico sobre los escenarios

Usa frases cortas y directas. Sé específico con números y escenarios.`

  const { text } = await generateText({
    model: getAIModel(),
    prompt,
    maxTokens: 600,
  })

  return text
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const tournamentId = Number(searchParams.get('tournamentId'))
    const stageId = Number(searchParams.get('stageId'))

    if (!tournamentId || !stageId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    // Find AC SED's group
    const groups = await fetchAPI(`/stages/${stageId}/groups`)
    let acsedGroupId: number | null = null
    let groupName = ''

    for (const group of groups) {
      const standings = await fetchAPI(`/groups/${group.id}/standings`).catch(() => [])
      const hasAcSed = standings.some((s: any) => s.team?.id === ACSED_TEAM_ID)
      if (hasAcSed) {
        acsedGroupId = group.id
        groupName = group.name
        break
      }
    }

    if (!acsedGroupId) {
      return NextResponse.json({
        standings: [],
        topScorers: [],
        teamScorers: [],
        fixtures: [],
        analysis: null,
        goalsFor: 0,
        goalsAgainst: 0,
        totalMatches: 10,
        matchesPlayed: 0,
        matchesRemaining: 0,
        groupName: 'Sin división',
      })
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
    const totalMatches = 10 // Standard for Liga B
    const matchesRemaining = totalMatches - matchesPlayed

    // Calculate team stats
    const acsedStanding = standingsData.find((s: any) => s.teamName === ACSED_TEAM_NAME) || {
      goalsFor: 0,
      goalsAgainst: 0,
    }

    // Filter top scorers for this division
    const divisionTeams = standingsData.map((s: any) => s.teamName)
    const topScorers = (topScorersAll || []).filter((s: any) =>
      divisionTeams.includes(s.team?.name || s.teamName)
    )

    // Get AC SED scorers
    const teamScorers = (topScorersAll || [])
      .filter((s: any) => (s.team?.name || s.teamName) === ACSED_TEAM_NAME)
      .map((s: any) => ({
        playerName: s.player?.name || s.playerName || 'Unknown',
        goals: s.goals || 0,
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
    const cachedAnalysis = await prisma.tournamentAnalysis.findUnique({
      where: {
        tournamentId_stageId_groupId: {
          tournamentId,
          stageId,
          groupId: acsedGroupId,
        },
      },
    })

    if (cachedAnalysis && cachedAnalysis.dataHash === dataHash) {
      analysis = cachedAnalysis.content
    } else if (matchesPlayed > 0) {
      // Generate new analysis
      analysis = await generateAnalysis({
        standings: standingsData,
        fixtures,
        teamScorers,
        matchesPlayed,
        matchesRemaining,
      })

      // Save to cache
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
    }

    return NextResponse.json({
      standings: standingsData,
      topScorers: topScorers.slice(0, 10).map((s: any) => ({
        playerName: s.player?.name || s.playerName || 'Unknown',
        teamName: s.team?.name || s.teamName || 'Unknown',
        goals: s.goals || 0,
      })),
      teamScorers,
      fixtures,
      analysis,
      goalsFor: acsedStanding.goalsFor,
      goalsAgainst: acsedStanding.goalsAgainst,
      totalMatches,
      matchesPlayed,
      matchesRemaining,
      groupName,
    })
  } catch (err) {
    console.error('Stats error:', err)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
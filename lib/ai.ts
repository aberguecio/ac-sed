import { generateText } from 'ai'
import { openai, createOpenAI } from '@ai-sdk/openai'
import type { Match } from '@prisma/client'
import { prisma } from '@/lib/db'

function getModel() {
  const model = process.env.AI_MODEL ?? 'gpt-4o-mini'
  const apiKey = process.env.AI_API_KEY
  const baseURL = process.env.AI_BASE_URL

  // Custom endpoint (LiteLLM, vLLM, LocalAI, etc.)
  if (baseURL) {
    const customProvider = createOpenAI({
      baseURL,
      apiKey: apiKey ?? 'dummy-key',
    })
    return customProvider(model)
  }

  // Default OpenAI
  return openai(model)
}

export async function generateMatchNews(
  match: Match
): Promise<{ title: string; content: string }> {
  const isHome = match.homeTeam.toUpperCase().includes('ACSED') || match.homeTeam.toUpperCase().includes('AC SED')
  const rival = isHome ? match.awayTeam : match.homeTeam
  const acsedScore = isHome ? match.homeScore : match.awayScore
  const rivalScore = isHome ? match.awayScore : match.homeScore
  const result =
    acsedScore !== null && rivalScore !== null
      ? acsedScore > rivalScore
        ? 'victoria'
        : acsedScore < rivalScore
          ? 'derrota'
          : 'empate'
      : 'partido'

  const hasPhaseContext = match.tournamentId !== null && match.stageId !== null
  const hasGroupContext = hasPhaseContext && match.groupId !== null

  // Fetch goals, cards, and phase context in parallel
  const [goals, cards, previousMatches, standingsRows, upcomingMatches] = await Promise.all([
    prisma.matchGoal.findMany({
      where: { matchId: match.id },
      include: { scrapedPlayer: true }
    }),
    prisma.matchCard.findMany({
      where: { matchId: match.id },
      include: { scrapedPlayer: true }
    }),
    // A. Previous played matches in same phase (excluding current)
    hasPhaseContext
      ? prisma.match.findMany({
          where: {
            tournamentId: match.tournamentId!,
            stageId: match.stageId!,
            OR: [
              { homeTeam: { contains: 'AC SED', mode: 'insensitive' } },
              { awayTeam: { contains: 'AC SED', mode: 'insensitive' } },
            ],
            homeScore: { not: null },
            id: { not: match.id },
          },
          orderBy: { date: 'asc' },
        })
      : Promise.resolve([]),
    // B. Standings for the group
    hasGroupContext
      ? prisma.standing.findMany({
          where: {
            tournamentId: match.tournamentId!,
            stageId: match.stageId!,
            groupId: match.groupId!,
          },
          orderBy: { position: 'asc' },
        })
      : Promise.resolve([]),
    // C. Upcoming matches (no score yet) in same phase
    hasPhaseContext
      ? prisma.match.findMany({
          where: {
            tournamentId: match.tournamentId!,
            stageId: match.stageId!,
            OR: [
              { homeTeam: { contains: 'AC SED', mode: 'insensitive' } },
              { awayTeam: { contains: 'AC SED', mode: 'insensitive' } },
            ],
            homeScore: null,
          },
          orderBy: { date: 'asc' },
        })
      : Promise.resolve([]),
  ])

  // Format goals by team
  const acsedGoals = goals.filter(g => g.teamName.toUpperCase().includes('ACSED') || g.teamName.toUpperCase().includes('AC SED'))
  const rivalGoals = goals.filter(g => !g.teamName.toUpperCase().includes('ACSED') && !g.teamName.toUpperCase().includes('AC SED'))

  // Format cards
  const acsedCards = cards.filter(c => c.teamName.toUpperCase().includes('ACSED') || c.teamName.toUpperCase().includes('AC SED'))

  let goalsInfo = ''
  if (acsedGoals.length > 0) {
    const goalScorers = acsedGoals.map(g => `${g.scrapedPlayer.firstName} ${g.scrapedPlayer.lastName}`).join(', ')
    goalsInfo += `\n- Goleadores AC SED: ${goalScorers}`
  }
  if (rivalGoals.length > 0) {
    const goalScorers = rivalGoals.map(g => `${g.scrapedPlayer.firstName} ${g.scrapedPlayer.lastName}`).join(', ')
    goalsInfo += `\n- Goleadores ${rival}: ${goalScorers}`
  }

  let cardsInfo = ''
  if (acsedCards.length > 0) {
    const yellowCards = acsedCards.filter(c => c.cardType === 'yellow')
    const redCards = acsedCards.filter(c => c.cardType === 'red')
    if (yellowCards.length > 0) {
      cardsInfo += `\n- Tarjetas amarillas AC SED: ${yellowCards.map(c => `${c.scrapedPlayer.firstName} ${c.scrapedPlayer.lastName}`).join(', ')}`
    }
    if (redCards.length > 0) {
      cardsInfo += `\n- Tarjetas rojas AC SED: ${redCards.map(c => `${c.scrapedPlayer.firstName} ${c.scrapedPlayer.lastName}`).join(', ')}`
    }
  }

  // Build previous matches context
  let streakInfo = ''
  if (previousMatches.length > 0) {
    const matchSummaries = previousMatches.map(m => {
      const isHomeMatch = m.homeTeam.toUpperCase().includes('AC SED') || m.homeTeam.toUpperCase().includes('ACSED')
      const our = (isHomeMatch ? m.homeScore : m.awayScore) ?? 0
      const their = (isHomeMatch ? m.awayScore : m.homeScore) ?? 0
      const rivalName = isHomeMatch ? m.awayTeam : m.homeTeam
      const resultLabel = our > their ? 'victoria' : our < their ? 'derrota' : 'empate'
      return `${resultLabel} ${our}-${their} vs ${rivalName}`
    })
    streakInfo = `\n- Partidos anteriores en esta fase: ${matchSummaries.join(' | ')}`
  }

  // Build standings info
  let standingsInfo = ''
  if (standingsRows.length > 0) {
    const acsed = standingsRows.find(s =>
      s.teamName.toUpperCase().includes('AC SED') || s.teamName.toUpperCase().includes('ACSED')
    )
    if (acsed) {
      const totalTeams = standingsRows.length
      const isChampionZone = acsed.position <= 2
      const isRelegationZone = acsed.position > totalTeams - 2
      const zoneLabel = isChampionZone
        ? ' (zona de campeón/ascenso)'
        : isRelegationZone
          ? ' (zona de descenso)'
          : ''
      standingsInfo = `\n- Posición actual en la tabla: ${acsed.position}° de ${totalTeams} equipos${zoneLabel}, ${acsed.points} puntos (G:${acsed.won} E:${acsed.drawn} P:${acsed.lost})`
    }
  }

  // Build upcoming matches info
  let upcomingInfo = ''
  if (hasPhaseContext) {
    const remaining = upcomingMatches.length
    if (remaining === 0) {
      // This was the last match of the phase
      const acsed = standingsRows.find(s =>
        s.teamName.toUpperCase().includes('AC SED') || s.teamName.toUpperCase().includes('ACSED')
      )
      if (acsed) {
        const isChampion = acsed.position === 1
        const isPromotion = acsed.position === 2
        const isRelegation = acsed.position > standingsRows.length - 2
        const outcome = isChampion
          ? 'CAMPEÓN de la fase'
          : isPromotion
            ? 'clasificado en zona de ascenso'
            : isRelegation
              ? 'en zona de DESCENSO'
              : `finalizó ${acsed.position}° de ${standingsRows.length}`
        upcomingInfo = `\n- ÚLTIMO partido de la fase. AC SED ${outcome} con ${acsed.points} puntos.`
      } else {
        upcomingInfo = `\n- ÚLTIMO partido de la fase.`
      }
    } else if (remaining === 1) {
      upcomingInfo = `\n- Quedan ${remaining} partido(s) en la fase — última jornada decisiva.`
    } else {
      upcomingInfo = `\n- Partidos restantes en la fase: ${remaining}`
    }
  }

  const prompt = `Eres el periodista del Club AC SED. Escribe una crónica deportiva en español sobre el siguiente partido de la Liga B chilena.

Datos del partido:
- Fecha: ${match.date.toLocaleDateString('es-CL')}
- ${isHome ? 'Local' : 'Visitante'}: AC SED
- Rival: ${rival}
- Resultado: AC SED ${acsedScore ?? '?'} - ${rivalScore ?? '?'} ${rival}
- ${match.roundName ? `Jornada: ${match.roundName}` : ''}${goalsInfo}${cardsInfo}${streakInfo}${standingsInfo}${upcomingInfo}

Genera:
1. Un TÍTULO periodístico corto y atractivo (máximo 10 palabras)
2. Una CRÓNICA de aproximadamente 300 palabras que incluya: análisis del resultado (${result}), menciona a los goleadores específicos, desempeño del equipo, importancia del partido para la tabla, contexto de la racha y clasificación si es relevante.

Responde ÚNICAMENTE en este formato JSON (sin markdown):
{"title": "...", "content": "..."}`

  const { text } = await generateText({
    model: getModel(),
    prompt,
    maxTokens: 800,
  })

  try {
    const parsed = JSON.parse(text.trim())
    return { title: parsed.title ?? 'Crónica del partido', content: parsed.content ?? text }
  } catch {
    // If JSON parse fails, extract manually
    const titleMatch = text.match(/"title"\s*:\s*"([^"]+)"/)
    const contentMatch = text.match(/"content"\s*:\s*"([\s\S]+?)"(?:\s*\}|$)/)
    return {
      title: titleMatch?.[1] ?? 'Crónica del partido',
      content: contentMatch?.[1]?.replace(/\\n/g, '\n') ?? text,
    }
  }
}

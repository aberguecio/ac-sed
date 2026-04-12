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

  // Fetch goals and cards for this match
  const [goals, cards] = await Promise.all([
    prisma.matchGoal.findMany({
      where: { matchId: match.id },
      include: { scrapedPlayer: true }
    }),
    prisma.matchCard.findMany({
      where: { matchId: match.id },
      include: { scrapedPlayer: true }
    })
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

  const prompt = `Eres el periodista del Club AC SED. Escribe una crónica deportiva en español sobre el siguiente partido de la Liga B chilena.

Datos del partido:
- Fecha: ${match.date.toLocaleDateString('es-CL')}
- ${isHome ? 'Local' : 'Visitante'}: AC SED
- Rival: ${rival}
- Resultado: AC SED ${acsedScore ?? '?'} - ${rivalScore ?? '?'} ${rival}
- ${match.roundName ? `Jornada: ${match.roundName}` : ''}${goalsInfo}${cardsInfo}

Genera:
1. Un TÍTULO periodístico corto y atractivo (máximo 10 palabras)
2. Una CRÓNICA de aproximadamente 300 palabras que incluya: análisis del resultado (${result}), menciona a los goleadores específicos, desempeño del equipo, importancia del partido para la tabla.

Responde ÚNICAMENTE en este formato JSON (sin markdown):
{"title": "...", "content": "..."}`

  const { text } = await generateText({
    model: getModel(),
    prompt,
    maxTokens: 600,
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

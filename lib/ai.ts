import { generateText } from 'ai'
import { openai, createOpenAI } from '@ai-sdk/openai'
import type { Match } from '@prisma/client'

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
  const isHome = match.homeTeam.toUpperCase().includes('ACSED')
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

  const prompt = `Eres el periodista del Club AC SED. Escribe una crónica deportiva en español sobre el siguiente partido de la Liga B chilena.

Datos del partido:
- Fecha: ${match.date.toLocaleDateString('es-CL')}
- ${isHome ? 'Local' : 'Visitante'}: AC SED
- Rival: ${rival}
- Resultado: AC SED ${acsedScore ?? '?'} - ${rivalScore ?? '?'} ${rival}
- ${match.roundName ? `Jornada: ${match.roundName}` : ''}

Genera:
1. Un TÍTULO periodístico corto y atractivo (máximo 10 palabras)
2. Una CRÓNICA de aproximadamente 300 palabras que incluya: análisis del resultado (${result}), desempeño del equipo, importancia del partido para la tabla.

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

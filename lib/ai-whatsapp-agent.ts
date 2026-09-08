import { generateObject, generateText } from 'ai'
import { getAiConfig, getModelForChannel, cleanModelText } from '@/lib/ai-config'
import { pickEnabledTools } from '@/lib/ai-whatsapp-tools'
import { isOutOfCreditError, notifyAiOutOfCredits } from '@/lib/whatsapp-notifier'

const SYSTEM_PROMPT = `Eres el bot del club AC SED (fútbol amateur, Liga B, onda cervecera).
Respondes preguntas en el grupo de WhatsApp del equipo cuando alguien te menciona.

Estilo:
- Español, tono de DT/Capitan cercano, breve y directo (idealmente <200 caracteres salvo que la respuesta requiera datos extensos).
- Sin markdown, sin **negritas**, sin listas con guiones, sin JSON. Texto plano de WhatsApp.
- Puedes usar emojis con moderación (⚽ 🍻 🔥 🏆) si encajan.

Cómo responder:
- Usa las tools para averiguar datos antes de responder. NUNCA inventes nombres, marcadores ni números.
- Para preguntas de clasificación / ascenso / descenso: llama getTournamentInfo (formato y reglas) y getPromotionProjection (puntos actuales y máximos posibles por equipo). Recuerda: 6 equipos por fase, todos contra todos (5 partidos), 2 ascienden y 2 descienden.
- Para preguntas sobre un partido específico: usa listMatches o getLastPlayedMatch para encontrarlo, luego getMatchDetails o getMatchGoals según necesites.
- Para preguntas sobre un jugador por nombre: usa searchPlayer para obtener id, bio y phoneNumber. Si phoneNumber no es null, etiquétalo con @{phoneNumber} en tu respuesta (ej: "@56991234567 "). Luego llama getPlayerSeasonStats con el id para las estadísticas.
- Para asistencia a un partido ("quiénes van", "cuántos confirmaron"): getNextMatch (o listMatches) para encontrar el matchId, después getMatchAttendance(matchId).

Preguntas sobre un equipo RIVAL (cómo viene, cómo le fue, goleador, suspendidos):
- "Cómo viene el rival" / "sus últimos partidos" / "está ganando o perdiendo" → listMatches({ opponent: "<nombre>", status: "played", order: "desc", limit: 5 }). El filtro opponent trae TODOS los partidos donde ese equipo jugó (contra cualquiera), no solo vs AC SED.
- "Goleador del rival" → getTopScorers({ teamName: "<nombre>", limit: 3 }).
- "Quién está suspendido en el rival" / "cómo viene el rival de tarjetas" → getTeamCards({ teamName: "<nombre>" }). Fijate en likelySuspendedNextMatch.
- NO uses getHeadToHead para "cómo viene el rival": getHeadToHead es SOLO el historial AC SED vs ese rival, no la forma del rival.

Torneos anteriores / datos históricos:
- Si preguntan por un torneo pasado ("el torneo anterior", "Apertura 2025"), primero llama listTournaments para ver qué torneos hay cargados y mapear el nombre al id. Después usa tournamentId en las otras tools.

Otras reglas:
- Si la pregunta es ambigua (ej: "el partido pasado" cuando hay varios candidatos), responde con el más reciente y aclara cuál es.
- Antes de responder que no tienes información, agota todas las tools disponibles. Si una tool no devuelve datos, prueba con otras (listMatches, getRemainingFixtures, getLastPlayedMatch, etc.) antes de rendirte.
- Si no encuentras los datos en las tools, dilo con honestidad ("no tengo ese dato"), no inventes.

Privacidad: nunca escribas el número de teléfono de un jugador como texto plano. Si el jugador tiene phoneNumber, etiquétalo usando @{phoneNumber} (ej: "@56991234567") — eso crea una mención de WhatsApp. Si phoneNumber es null, usa nombre o apodo. La bio del jugador sí puedes mencionarla si es relevante.`

export interface AnswerGroupQuestionResult {
  answer: string
  toolCalls: number
  finishReason: string
}

export interface SenderInfo {
  playerId: number
  playerName: string
  nicknames: string[]
  phoneNumber: string
}

const FALLBACK_ANSWER = 'Uy, no pude procesar bien esa pregunta. ¿Podés reformularla?'

function buildSenderBlock(s: SenderInfo): string {
  const nick = s.nicknames.length > 0 ? ` (apodos: ${s.nicknames.join(', ')})` : ''
  return `Contexto del remitente: ${s.playerName}${nick}, playerId=${s.playerId}, phoneNumber=${s.phoneNumber}.
Si la pregunta es sobre sí mismo ("mis goles", "mis tarjetas", "voy?"), usa ese playerId directamente sin llamar searchPlayer.
Si necesitás etiquetarlo en la respuesta, usá @${s.phoneNumber}.`
}

/**
 * Numeric-looking strings and "true"/"false" become real values; keys the model
 * sent as null are dropped so an optional parameter reads as absent.
 */
function coerceArgValues(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string') {
      if (/^-?\d+(\.\d+)?$/.test(value.trim())) {
        out[key] = Number(value)
        continue
      }
      if (value === 'true' || value === 'false') {
        out[key] = value === 'true'
        continue
      }
    }
    out[key] = value
  }
  return out
}

/**
 * Second half of the MiniMax tool-argument fix (the first is the coercing
 * schemas in `ai-whatsapp-tools.ts`). AI SDK v4 aborts the entire
 * `generateText` when a tool call fails validation, so a single malformed call
 * — `getTeamCards({"tournamentId":201})` with no `teamName`, which is required
 * — costs the group its answer.
 *
 * Try the cheap repair first: coerce the values and re-validate against the
 * tool's own zod schema. If the call is missing a required argument, that
 * cannot be invented locally, so ask the model to rewrite the arguments
 * against the schema. Give up with `null` and let the SDK throw if neither
 * works.
 */
function buildToolCallRepair(model: Parameters<typeof generateText>[0]['model'], tools: Record<string, any>) {
  return async ({ toolCall, error }: { toolCall: any; error: unknown }) => {
    const schema = tools[toolCall.toolName]?.parameters
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`[whatsapp ai] repairing tool call ${toolCall.toolName}: ${reason}`)

    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(toolCall.args ?? '{}')
    } catch {
      parsed = {}
    }

    const coerced = coerceArgValues(parsed)
    if (schema?.safeParse?.(coerced)?.success) {
      return { ...toolCall, args: JSON.stringify(coerced) }
    }

    if (!schema) return null

    try {
      const { object } = await generateObject({
        model,
        schema,
        prompt:
          `La llamada a la tool "${toolCall.toolName}" fue rechazada: ${reason}\n` +
          `Argumentos originales: ${toolCall.args}\n` +
          'Devolvé los argumentos corregidos que respeten el esquema. No inventes datos: ' +
          'si falta un argumento obligatorio, deducilo de los argumentos originales.',
      })
      return { ...toolCall, args: JSON.stringify(object) }
    } catch (repairErr) {
      console.warn(`[whatsapp ai] repair failed for ${toolCall.toolName}:`, repairErr)
      return null
    }
  }
}

export async function answerGroupQuestion(
  question: string,
  sender?: SenderInfo,
): Promise<AnswerGroupQuestionResult> {
  const cfg = await getAiConfig('whatsapp')
  try {
    const tools = pickEnabledTools(cfg.enabledTools)
    const baseSystem = cfg.systemPromptOverride ?? SYSTEM_PROMPT
    const system = sender ? `${buildSenderBlock(sender)}\n\n${baseSystem}` : baseSystem
    const model = getModelForChannel(cfg)
    const { text, toolCalls, finishReason } = await generateText({
      model,
      system,
      prompt: question,
      maxTokens: cfg.maxTokens,
      temperature: cfg.temperature,
      ...(tools
        ? {
            tools,
            maxSteps: cfg.maxSteps ?? 15,
            experimental_repairToolCall: buildToolCallRepair(model, tools as Record<string, any>),
          }
        : {}),
    })
    return {
      answer: cleanModelText(text) || FALLBACK_ANSWER,
      toolCalls: toolCalls?.length ?? 0,
      finishReason,
    }
  } catch (err) {
    logAgentError(err)
    if (isOutOfCreditError(err)) {
      void notifyAiOutOfCredits({ channel: 'whatsapp', provider: cfg.provider, model: cfg.model, error: err })
    }
    return { answer: FALLBACK_ANSWER, toolCalls: 0, finishReason: 'error' }
  }
}

function logAgentError(err: unknown): void {
  if (!(err instanceof Error)) {
    console.error('[whatsapp ai] generation failed:', String(err))
    return
  }
  const e = err as Error & { toolName?: string; toolArgs?: string }
  const parts = [`name=${e.name}`]
  if (e.toolName) parts.push(`tool=${e.toolName}`)
  if (e.toolArgs) parts.push(`args=${e.toolArgs}`)
  parts.push(`msg=${e.message.split('\n')[0].slice(0, 200)}`)
  console.error('[whatsapp ai] generation failed', parts.join(' '))
}

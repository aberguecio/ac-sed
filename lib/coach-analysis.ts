import { generateText } from 'ai'
import { openai, createOpenAI } from '@ai-sdk/openai'

const ACSED_TEAM_NAME = 'AC Sed'

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

export async function generateCoachAnalysis(data: any): Promise<string> {
  const { standings, fixtures, teamScorers, matchesPlayed, matchesRemaining, topScorersAll } = data

  const acsedStanding = standings.find((s: any) => s.teamName === ACSED_TEAM_NAME)
  if (!acsedStanding) return ''

  const position = acsedStanding.position
  const points = acsedStanding.points
  const isFirst = position === 1
  const isLast = position === standings.length
  const pointsToFirst = isFirst ? 0 : standings[0].points - points
  const pointsAboveLast = isLast ? 0 : points - standings[standings.length - 1].points
  const goalsPerMatch = matchesPlayed > 0 ? (acsedStanding.goalsFor / matchesPlayed).toFixed(1) : '0'
  const goalsAgainstPerMatch = matchesPlayed > 0 ? (acsedStanding.goalsAgainst / matchesPlayed).toFixed(1) : '0'

  const upcomingMatches = fixtures
    .filter((f: any) => !f.homeScore && !f.awayScore)
    .slice(0, matchesRemaining)

  // Get detailed info about next rival
  let nextRivalInfo = ''
  if (upcomingMatches.length > 0) {
    const nextMatch = upcomingMatches[0]
    const nextRival = nextMatch.homeTeam === ACSED_TEAM_NAME ? nextMatch.awayTeam : nextMatch.homeTeam
    const nextRivalStanding = standings.find((s: any) => s.teamName === nextRival)

    if (nextRivalStanding) {
      const rivalGoalsPerMatch = nextRivalStanding.played > 0 ?
        (nextRivalStanding.goalsFor / nextRivalStanding.played).toFixed(1) : '0'

      // Find rival's top scorer
      const rivalScorers = (topScorersAll || [])
        .filter((s: any) => (s.team?.name || s.teamName) === nextRival)
        .map((s: any) => ({
          name: s.player ? `${s.player.firstName} ${s.player.lastName}`.trim() : 'Jugador',
          goals: s.goals || 0
        }))

      const rivalTopScorer = rivalScorers[0]

      nextRivalInfo = `
Próximo rival detallado:
- ${nextRival}: Posición ${nextRivalStanding.position}°
- Puntos: ${nextRivalStanding.points} (G:${nextRivalStanding.won} E:${nextRivalStanding.drawn} P:${nextRivalStanding.lost})
- Promedio goles: ${rivalGoalsPerMatch} por partido
- Goles a favor/contra: ${nextRivalStanding.goalsFor}/${nextRivalStanding.goalsAgainst}
${rivalTopScorer ? `- Goleador: ${rivalTopScorer.name} con ${rivalTopScorer.goals} goles` : ''}`
    }
  }

  // Check if we played against the next rival before (from our database)
  let previousMatchInfo = ''
  if (upcomingMatches.length > 0) {
    const nextMatch = upcomingMatches[0]
    const nextRival = nextMatch.homeTeam === ACSED_TEAM_NAME ? nextMatch.awayTeam : nextMatch.homeTeam

    // previousMatches should be passed from the API after querying our database
    const previousMatches = data.previousMatches || []

    // Find the most recent match against this rival
    const recentMatch = previousMatches
      .filter((m: any) =>
        (m.homeTeam === ACSED_TEAM_NAME && m.awayTeam === nextRival) ||
        (m.awayTeam === ACSED_TEAM_NAME && m.homeTeam === nextRival)
      )
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]

    if (recentMatch) {
      const weWereHome = recentMatch.homeTeam === ACSED_TEAM_NAME
      const ourScore = weWereHome ? recentMatch.homeScore : recentMatch.awayScore
      const theirScore = weWereHome ? recentMatch.awayScore : recentMatch.homeScore
      const result = ourScore > theirScore ? 'GANAMOS' : ourScore < theirScore ? 'PERDIMOS' : 'EMPATAMOS'
      const matchDate = new Date(recentMatch.date).toLocaleDateString('es-CL', {
        month: 'long',
        year: 'numeric'
      })

      previousMatchInfo = `

ÚLTIMO ANTECEDENTE CONTRA ${nextRival}:
- ${matchDate}: ${result} ${ourScore}-${theirScore}
- ${weWereHome ? 'Jugamos de local' : 'Jugamos de visitante'}
${recentMatch.roundName ? `- Fase: ${recentMatch.roundName}` : ''}
${result === 'PERDIMOS' ? '- REVANCHA PENDIENTE' : result === 'GANAMOS' ? '- A mantener la superioridad' : '- A romper el empate'}`
    }
  }

  const prompt = `Eres el coach exigente del AC SED. Analiza la situación actual y escribe un análisis motivador pero realista.

${matchesPlayed === 0 ? `
INICIO DE FASE:
- Fase de 5 PARTIDOS que está por comenzar
- Total de equipos en la división: ${standings.length}

${nextRivalInfo}
${previousMatchInfo}

Todos los partidos de la fase:
${upcomingMatches.map((m: any) => {
  const rival = m.homeTeam === ACSED_TEAM_NAME ? m.awayTeam : m.homeTeam
  const rivalStanding = standings.find((s: any) => s.teamName === rival)
  const local = m.homeTeam === ACSED_TEAM_NAME ? 'LOCAL' : 'VISITANTE'
  return `- vs ${rival} (${local}) - Posición: ${rivalStanding?.position || '?'}°, Puntos: ${rivalStanding?.points || '?'}`
}).join('\n')}
` : matchesRemaining === 0 ? `
FASE TERMINADA:
- Posición final: ${position}° de ${standings.length} equipos
- Puntos: ${points}
- Rendimiento: G:${acsedStanding.won} E:${acsedStanding.drawn} P:${acsedStanding.lost}
- Goles a favor: ${acsedStanding.goalsFor} | Goles en contra: ${acsedStanding.goalsAgainst}

Goleadores del equipo:
${teamScorers.slice(0, 5).map((s: any) => `- ${s.playerName}: ${s.goals} goles`).join('\n')}

${position <= 2 ? '- FELICITAR al equipo por el excelente rendimiento (posición ' + position + ')' : ''}
${teamScorers.length > 0 && teamScorers[0].goals >= 5 ? '- FELICITAR a los goleadores, especialmente a ' + teamScorers[0].playerName : ''}
${acsedStanding.goalsAgainst <= 5 ? '- FELICITAR al arquero y defensas por los pocos goles recibidos (' + acsedStanding.goalsAgainst + ' goles)' : ''}
${position > 2 ? '- Hacer crítica constructiva sobre qué mejorar para la próxima fase' : ''}
` : `
Situación actual:
- Posición: ${position} de ${standings.length} equipos
- Puntos: ${points}
- Partidos jugados: ${matchesPlayed} de 5 (FASE DE 5 PARTIDOS)
- Partidos restantes: ${matchesRemaining}
- Diferencia con el primero: ${pointsToFirst} puntos
- Ventaja sobre el último: ${pointsAboveLast} puntos
- Promedio goles a favor: ${goalsPerMatch} por partido
- Promedio goles en contra: ${goalsAgainstPerMatch} por partido

Tabla actual:
${standings.slice(0, 6).map((s: any) => `${s.position}. ${s.teamName}: ${s.points}pts (PJ:${s.played} G:${s.won} E:${s.drawn} P:${s.lost} GF:${s.goalsFor} GC:${s.goalsAgainst})`).join('\n')}

${nextRivalInfo}
${previousMatchInfo}

Todos los próximos partidos:
${upcomingMatches.map((m: any) => {
  const rival = m.homeTeam === ACSED_TEAM_NAME ? m.awayTeam : m.homeTeam
  const rivalStanding = standings.find((s: any) => s.teamName === rival)
  const local = m.homeTeam === ACSED_TEAM_NAME ? 'LOCAL' : 'VISITANTE'
  return `- vs ${rival} (${local}) - Posición: ${rivalStanding?.position || '?'}°, Puntos: ${rivalStanding?.points || '?'}`
}).join('\n')}

Goleadores del equipo:
${teamScorers.slice(0, 5).map((s: any) => `- ${s.playerName}: ${s.goals} goles`).join('\n')}
`}

Escribe un análisis de 3-4 párrafos como un coach argentino exigente pero motivador.

IMPORTANTE:
- Esta es una fase de 5 PARTIDOS
${matchesPlayed === 0 ? '- Enfócate en el primer rival y la importancia de empezar bien la fase' : ''}
${matchesPlayed > 0 && matchesRemaining > 0 ? '- Analiza detalladamente al próximo rival (sus fortalezas, debilidades, cómo jugarles)' : ''}
${previousMatchInfo ? '- MENCIONA el partido previo contra este rival y qué cambiar/mantener' : ''}
${matchesRemaining === 1 ? '- Es el ÚLTIMO partido, sé MUY específico sobre todos los escenarios posibles' : ''}
${matchesRemaining === 2 ? '- Quedan 2 partidos, enfócate en el próximo rival pero sin perder de vista el panorama general' : ''}
${matchesRemaining === 0 ? '- Incluye felicitaciones o críticas según corresponda' : ''}
- Usa frases cortas y directas típicas del fútbol argentino
${matchesPlayed > 0 && teamScorers.length > 0 ? '- Menciona específicamente a los jugadores por nombre cuando sea relevante' : ''}`

  const { text } = await generateText({
    model: getAIModel(),
    prompt,
    maxTokens: 700,
  })

  return text
}
import { generateText } from 'ai'
import { openai, createOpenAI } from '@ai-sdk/openai'
import type { Match } from '@prisma/client'
import { prisma } from '@/lib/db'
import { isACSED } from '@/lib/team-utils'

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

// Export this function to reuse in other parts of the app
export async function getMatchContext(match: Match) {
  const hasPhaseContext = match.tournamentId !== null && match.stageId !== null
  const hasGroupContext = hasPhaseContext && match.groupId !== null

  // Get opponent name for historical lookup
  const homeTeamName = match.homeTeam?.name ?? 'TBD'
  const awayTeamName = match.awayTeam?.name ?? 'TBD'
  const isHome = isACSED(homeTeamName)
  const opponentName = isHome ? awayTeamName : homeTeamName

  // Fetch all context data in parallel
  const [goals, cards, previousMatches, upcomingMatches, otherMatchesInRound, historicalMatches] = await Promise.all([
    prisma.matchGoal.findMany({
      where: { matchId: match.id },
      include: { scrapedPlayer: true }
    }),
    prisma.matchCard.findMany({
      where: { matchId: match.id },
      include: { scrapedPlayer: true }
    }),
    // Previous played matches BEFORE this match's date
    hasPhaseContext
      ? prisma.match.findMany({
          where: {
            tournamentId: match.tournamentId!,
            stageId: match.stageId!,
            OR: [
              { homeTeam: { name: { contains: 'AC SED', mode: 'insensitive' } } },
              { awayTeam: { name: { contains: 'AC SED', mode: 'insensitive' } } },
            ],
            homeScore: { not: null },
            id: { not: match.id },
            date: { lt: match.date },
          },
          include: {
            homeTeam: true,
            awayTeam: true,
          },
          orderBy: { date: 'asc' },
        })
      : Promise.resolve([]),
    // Upcoming matches AFTER this match's date
    hasPhaseContext
      ? prisma.match.findMany({
          where: {
            tournamentId: match.tournamentId!,
            stageId: match.stageId!,
            OR: [
              { homeTeam: { name: { contains: 'AC SED', mode: 'insensitive' } } },
              { awayTeam: { name: { contains: 'AC SED', mode: 'insensitive' } } },
            ],
            date: { gt: match.date },
          },
          orderBy: { date: 'asc' },
          include: {
            homeTeam: true,
            awayTeam: true,
          },
        })
      : Promise.resolve([]),
    // Other matches in the same round (for relevant teams ±1 position)
    hasGroupContext
      ? prisma.match.findMany({
          where: {
            tournamentId: match.tournamentId!,
            stageId: match.stageId!,
            groupId: match.groupId!,
            id: { not: match.id },
            date: {
              gte: new Date(match.date.getTime() - 3 * 24 * 60 * 60 * 1000), // -3 days
              lte: new Date(match.date.getTime() + 3 * 24 * 60 * 60 * 1000), // +3 days
            },
            homeScore: { not: null }, // Only played matches
          },
          include: {
            homeTeam: true,
            awayTeam: true,
          },
        })
      : Promise.resolve([]),
    // Historical matches against this opponent (outside current phase)
    prisma.match.findMany({
      where: {
        OR: [
          {
            homeTeam: { name: opponentName },
            awayTeam: { name: { contains: 'AC SED', mode: 'insensitive' } },
          },
          {
            awayTeam: { name: opponentName },
            homeTeam: { name: { contains: 'AC SED', mode: 'insensitive' } },
          },
        ],
        homeScore: { not: null }, // Only played matches
        id: { not: match.id }, // Exclude current match
        // Exclude matches from the current phase
        NOT: hasPhaseContext
          ? {
              tournamentId: match.tournamentId!,
              stageId: match.stageId!,
            }
          : undefined,
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: { date: 'desc' },
    }),
  ])

  // Calculate standings based on matches played up to this point in time
  let standingsRows: any[] = []
  if (hasGroupContext) {
    // Get all teams in the group from the stored standings
    const storedStandings = await prisma.standing.findMany({
      where: {
        tournamentId: match.tournamentId!,
        stageId: match.stageId!,
        groupId: match.groupId!,
      },
      include: { team: true },
    })

    // Get all matches played in this group up to and including this match date
    const groupMatches = await prisma.match.findMany({
      where: {
        tournamentId: match.tournamentId!,
        stageId: match.stageId!,
        groupId: match.groupId!,
        date: { lte: match.date },
        homeScore: { not: null }, // Only count played matches
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
    })

    // Calculate standings manually based on matches played up to this date
    const teamStats = new Map<string, { points: number; won: number; drawn: number; lost: number; gf: number; ga: number }>()

    // Initialize all teams with zero stats
    for (const standing of storedStandings) {
      const teamName = standing.team.name
      teamStats.set(teamName, { points: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 })
    }

    // Calculate stats from matches
    for (const m of groupMatches) {
      const homeScore = m.homeScore ?? 0
      const awayScore = m.awayScore ?? 0
      const homeTeamName = m.homeTeam?.name ?? 'TBD'
      const awayTeamName = m.awayTeam?.name ?? 'TBD'

      // Initialize teams if not in stored standings (shouldn't happen, but safe)
      if (!teamStats.has(homeTeamName)) {
        teamStats.set(homeTeamName, { points: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 })
      }
      if (!teamStats.has(awayTeamName)) {
        teamStats.set(awayTeamName, { points: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 })
      }

      const homeStats = teamStats.get(homeTeamName)!
      const awayStats = teamStats.get(awayTeamName)!

      // Update goals
      homeStats.gf += homeScore
      homeStats.ga += awayScore
      awayStats.gf += awayScore
      awayStats.ga += homeScore

      // Update results and points
      if (homeScore > awayScore) {
        homeStats.won++
        homeStats.points += 3
        awayStats.lost++
      } else if (awayScore > homeScore) {
        awayStats.won++
        awayStats.points += 3
        homeStats.lost++
      } else {
        homeStats.drawn++
        homeStats.points += 1
        awayStats.drawn++
        awayStats.points += 1
      }
    }

    // Convert to standings array and sort
    standingsRows = Array.from(teamStats.entries()).map(([teamName, stats]) => ({
      teamName,
      position: 0, // Will be set after sorting
      points: stats.points,
      won: stats.won,
      drawn: stats.drawn,
      lost: stats.lost,
      goalsFor: stats.gf,
      goalsAgainst: stats.ga,
      goalDifference: stats.gf - stats.ga,
    }))

    // Sort by points, then goal difference, then goals for
    standingsRows.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference
      return b.goalsFor - a.goalsFor
    })

    // Assign positions
    standingsRows.forEach((row, index) => {
      row.position = index + 1
    })
  }

  return {
    match,
    goals,
    cards,
    previousMatches,
    standingsRows,
    upcomingMatches,
    otherMatchesInRound,
    historicalMatches,
    hasPhaseContext,
    hasGroupContext,
  }
}

export async function generateMatchNews(
  match: Match & { homeTeam: { name: string } | null; awayTeam: { name: string } | null }
): Promise<{ title: string; content: string }> {
  const homeTeamName = match.homeTeam?.name ?? 'TBD'
  const awayTeamName = match.awayTeam?.name ?? 'TBD'
  const isHome = homeTeamName.toUpperCase().includes('ACSED') || homeTeamName.toUpperCase().includes('AC SED')
  const rival = isHome ? awayTeamName : homeTeamName
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

  // Use centralized function to get all context
  const context = await getMatchContext(match)
  const {
    goals,
    cards,
    previousMatches,
    standingsRows,
    upcomingMatches,
    otherMatchesInRound,
    historicalMatches,
    hasPhaseContext,
    hasGroupContext,
  } = context

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
      const homeTeamName = m.homeTeam?.name ?? 'TBD'
      const awayTeamName = m.awayTeam?.name ?? 'TBD'
      const isHomeMatch = homeTeamName.toUpperCase().includes('AC SED') || homeTeamName.toUpperCase().includes('ACSED')
      const our = (isHomeMatch ? m.homeScore : m.awayScore) ?? 0
      const their = (isHomeMatch ? m.awayScore : m.homeScore) ?? 0
      const rivalName = isHomeMatch ? awayTeamName : homeTeamName
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

  // Process other matches in the round (±1 position teams)
  let otherResultsInfo = ''
  if (otherMatchesInRound.length > 0 && standingsRows.length > 0) {
    const acsed = standingsRows.find(s =>
      s.teamName.toUpperCase().includes('AC SED') || s.teamName.toUpperCase().includes('ACSED')
    )
    if (acsed) {
      // Get teams within ±1 position
      const relevantTeams = standingsRows.filter(s =>
        Math.abs(s.position - acsed.position) <= 1 &&
        !s.teamName.toUpperCase().includes('AC SED') &&
        !s.teamName.toUpperCase().includes('ACSED')
      )

      const relevantResults = otherMatchesInRound.filter(m => {
        const homeTeamName = m.homeTeam?.name ?? 'TBD'
        const awayTeamName = m.awayTeam?.name ?? 'TBD'
        return relevantTeams.some(t =>
          homeTeamName.includes(t.teamName) || awayTeamName.includes(t.teamName)
        )
      })

      if (relevantResults.length > 0) {
        const resultsStr = relevantResults.map(m => {
          const homeTeamName = m.homeTeam?.name ?? 'TBD'
          const awayTeamName = m.awayTeam?.name ?? 'TBD'
          // Find which relevant team played
          const relevantTeam = relevantTeams.find(t =>
            homeTeamName.includes(t.teamName) || awayTeamName.includes(t.teamName)
          )
          if (!relevantTeam) return null

          const teamWon = (homeTeamName.includes(relevantTeam.teamName) && m.homeScore! > m.awayScore!) ||
                         (awayTeamName.includes(relevantTeam.teamName) && m.awayScore! > m.homeScore!)
          const teamLost = (homeTeamName.includes(relevantTeam.teamName) && m.homeScore! < m.awayScore!) ||
                          (awayTeamName.includes(relevantTeam.teamName) && m.awayScore! < m.homeScore!)
          const result = teamWon ? 'ganó' : teamLost ? 'perdió' : 'empató'

          return `[${relevantTeam.position}°] ${relevantTeam.teamName} ${result} ${m.homeScore}-${m.awayScore}`
        }).filter(Boolean).join(' | ')

        if (resultsStr) {
          otherResultsInfo = `\n- Otros resultados relevantes de la jornada: ${resultsStr}`
        }
      }
    }
  }

  // Build historical head-to-head info
  let historicalInfo = ''
  if (historicalMatches.length > 0) {
    // Calculate historical record
    let wins = 0
    let draws = 0
    let losses = 0
    const matchDetails: string[] = []

    for (const m of historicalMatches) {
      const homeTeamName = m.homeTeam?.name ?? 'TBD'
      const awayTeamName = m.awayTeam?.name ?? 'TBD'
      const isHomeMatch = isACSED(homeTeamName)
      const acsedScore = isHomeMatch ? (m.homeScore ?? 0) : (m.awayScore ?? 0)
      const rivalScore = isHomeMatch ? (m.awayScore ?? 0) : (m.homeScore ?? 0)

      if (acsedScore > rivalScore) wins++
      else if (acsedScore < rivalScore) losses++
      else draws++

      // Add last 3 matches with dates
      if (matchDetails.length < 3) {
        const resultLabel = acsedScore > rivalScore ? 'victoria' : acsedScore < rivalScore ? 'derrota' : 'empate'
        const dateStr = m.date.toLocaleDateString('es-CL', { year: 'numeric', month: 'short' })
        matchDetails.push(`${resultLabel} ${acsedScore}-${rivalScore} (${dateStr})`)
      }
    }

    const total = wins + draws + losses
    historicalInfo = `\n- Historial vs ${rival} (partidos FUERA de la fase actual): ${wins} victorias, ${draws} empates, ${losses} derrotas en ${total} enfrentamientos previos`
    if (matchDetails.length > 0) {
      historicalInfo += `\n  Últimos enfrentamientos: ${matchDetails.join(' | ')}`
    }
  }

  // Build upcoming matches info with rivals' form
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
    } else {
      // Show next rivals with their position
      const nextRivals = upcomingMatches.slice(0, 2).map(m => {
        const homeTeamName = m.homeTeam?.name ?? 'TBD'
        const awayTeamName = m.awayTeam?.name ?? 'TBD'
        const isHome = homeTeamName.toUpperCase().includes('AC SED') || homeTeamName.toUpperCase().includes('ACSED')
        const rivalName = isHome ? awayTeamName : homeTeamName
        const rivalStanding = standingsRows.find(s => s.teamName === rivalName)
        const positionStr = rivalStanding ? ` [${rivalStanding.position}°]` : ''
        return `${rivalName}${positionStr}`
      })

      if (remaining <= 2) {
        // Calculate points needed for objectives
        const acsed = standingsRows.find(s =>
          s.teamName.toUpperCase().includes('AC SED') || s.teamName.toUpperCase().includes('ACSED')
        )
        if (acsed) {
          const maxPossiblePoints = acsed.points + (remaining * 3)
          const leader = standingsRows[0]
          const second = standingsRows[1]
          const thirdLast = standingsRows[standingsRows.length - 3]

          let objectiveInfo = ''
          if (acsed.position > 2 && second) {
            const pointsNeeded = second.points - acsed.points + 1
            if (pointsNeeded <= remaining * 3) {
              objectiveInfo = ` Necesita ${pointsNeeded} puntos para alcanzar zona de ascenso.`
            }
          } else if (acsed.position === 2 && leader) {
            const pointsForFirst = leader.points - acsed.points + 1
            if (pointsForFirst <= remaining * 3) {
              objectiveInfo = ` ${pointsForFirst} puntos para ser líder.`
            }
          } else if (acsed.position > standingsRows.length - 2 && thirdLast) {
            const pointsToEscape = thirdLast.points - acsed.points + 1
            objectiveInfo = ` Necesita ${pointsToEscape} puntos para salir del descenso.`
          }

          upcomingInfo = `\n- Últimos ${remaining} partidos: vs ${nextRivals.join(', ')}.${objectiveInfo}`
        } else {
          upcomingInfo = `\n- Próximos rivales: ${nextRivals.join(', ')} (quedan ${remaining} partidos)`
        }
      } else {
        upcomingInfo = `\n- Próximos rivales: ${nextRivals.join(', ')} (quedan ${remaining} partidos)`
      }
    }
  }

  const prompt = `Eres el periodista del Club AC SED. Escribe una crónica deportiva en español sobre el siguiente partido de la Liga B chilena.

Datos del partido:
- Fecha: ${match.date.toLocaleDateString('es-CL')}
- ${isHome ? 'Local' : 'Visitante'}: AC SED
- Rival: ${rival}
- Resultado: AC SED ${acsedScore ?? '?'} - ${rivalScore ?? '?'} ${rival}
- ${match.roundName ? `Jornada: ${match.roundName}` : ''}${goalsInfo}${cardsInfo}${streakInfo}${standingsInfo}${otherResultsInfo}${historicalInfo}${upcomingInfo}

Genera:
1. Un TÍTULO periodístico corto y atractivo (máximo 10 palabras)
2. Una CRÓNICA de aproximadamente 300 palabras que incluya:
   - Análisis del resultado (${result}) y cómo se desarrolló el partido
   - Menciona a los goleadores específicos si los hay
   - Desempeño del equipo e importancia del partido para la tabla
   - Contexto de la racha y clasificación si es relevante
   - Si hay historial vs el rival (partidos FUERA de esta fase), úsalo para dar contexto interesante (ej: "rompimos una racha negativa", "mantuvimos el buen récord histórico")
   - Si es relevante, menciona cómo afectaron otros resultados de la jornada a nuestra posición
   - En los últimos 2 partidos de la fase, incluye cálculos de puntos necesarios para objetivos
   - Usa el contexto de manera inteligente: NO menciones todo, solo lo que hace la historia más interesante

IMPORTANTE: Solo usa información relevante para la narrativa. Si estamos en mitad de tabla sin opciones claras, no fuerces mencionar clasificación. Si otros resultados no nos afectan, no los menciones. El historial vs el rival solo menciónalo si aporta valor a la narrativa.

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

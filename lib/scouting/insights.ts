import type {
  CommonOpponentsL2Result,
  CommonOpponentsResult,
  CurrentStandingsResult,
  DisciplineResult,
  HeadToHeadResult,
  PythagoreanResult,
  RecentFormResult,
  ScorersResult,
  ScoutingInsight,
  StrengthOfScheduleResult,
  VolatilityResult,
} from './types'
import { WEIGHTS } from './weights'

export interface InsightInput {
  rivalName: string
  headToHead: HeadToHeadResult
  commonOpponents: CommonOpponentsResult
  commonOpponentsL2: CommonOpponentsL2Result
  recentForm: RecentFormResult
  pythagorean: PythagoreanResult
  strengthOfSchedule: StrengthOfScheduleResult
  volatility: VolatilityResult
  discipline: DisciplineResult
  scorers: ScorersResult
  currentStandings: CurrentStandingsResult
}

export function buildInsights(input: InsightInput): ScoutingInsight[] {
  const out: ScoutingInsight[] = []

  // L2 common opponents: surface a strong / weak opponent inferred from the second layer.
  // yImpliedRating = weighted avg GD of Y vs its other rivals (not A, not X).
  const sortedL2 = [...input.commonOpponentsL2.rows].sort((a, b) => Math.abs(b.yImpliedRating) - Math.abs(a.yImpliedRating))
  if (sortedL2[0] && Math.abs(sortedL2[0].yImpliedRating) > 1) {
    const r = sortedL2[0]
    const samples = r.secondaryOpponents.length
    const rating = r.yImpliedRating
    const ratingLabel = `GD ${rating > 0 ? '+' : ''}${rating.toFixed(1)} sobre ${samples} ${samples === 1 ? 'rival' : 'rivales'}`
    let descriptor: string
    if (rating >= 4) descriptor = 'domina al resto del torneo'
    else if (rating >= 1) descriptor = 'rinde por encima del promedio del resto'
    else if (rating <= -4) descriptor = 'pierde por mucho contra el resto'
    else descriptor = 'rinde por debajo del promedio del resto'
    const tail =
      rating > 0
        ? 'Cómo le fue a cada uno contra él pesa más en la comparación (factor proporcional al rating).'
        : 'Si los dos le ganaron, es esperable y la comparación pesa menos. Si alguno no le ganó, eso sí es señal fuerte.'
    out.push({
      text: `${r.yName} ${descriptor} (${ratingLabel}). ${tail}`,
      weight: Math.abs(rating) * 0.8,
      category: 'commonL2',
    })
  }

  // Common opponents: surface the top contrasts (qualitative outcome first).
  for (const o of input.commonOpponents.opponents.slice(0, 3)) {
    if (Math.abs(o.outcomeDelta) < 0.5 && Math.abs(o.gdDelta) < 0.7) continue
    const outcomeLabel = o.outcomeDelta > 0 ? 'mejor resultado' : o.outcomeDelta < 0 ? 'peor resultado' : 'igual resultado'
    const gdNote = `(GD ${formatSigned(o.acsedGD)} vs ${formatSigned(o.rivalGD)}, Δ resultado ${formatSigned(o.outcomeDelta)})`
    out.push({
      text: `Contra ${o.opponentName}, AC SED tiene ${outcomeLabel} que ${input.rivalName} ${gdNote}.`,
      weight: Math.abs(o.outcomeDelta) * 1.5 * o.weight + Math.abs(o.gdDelta) * 0.4 * o.weight,
      category: 'common',
    })
  }

  // Head-to-head dominance / drought.
  if (input.headToHead.sampleSize >= 2) {
    if (input.headToHead.weightedScore > 0.4) {
      out.push({
        text: `Histórico positivo vs ${input.rivalName}: ${(input.headToHead.winRate * 100).toFixed(0)}% de victorias en ${input.headToHead.sampleSize} partidos.`,
        weight: 1.5 * input.headToHead.weightedScore,
        category: 'h2h',
      })
    } else if (input.headToHead.weightedScore < -0.4) {
      out.push({
        text: `Cuesta arriba vs ${input.rivalName}: ${(input.headToHead.lossRate * 100).toFixed(0)}% de derrotas en ${input.headToHead.sampleSize} cruces.`,
        weight: 1.5 * Math.abs(input.headToHead.weightedScore),
        category: 'h2h',
      })
    }
  }

  // Recent form streak / trend.
  const rivalStreak = input.recentForm.rival.currentStreak
  if (rivalStreak && rivalStreak.length >= 2) {
    if (rivalStreak.type === 'L') {
      out.push({
        text: `${input.rivalName} viene de ${rivalStreak.length} derrotas consecutivas.`,
        weight: rivalStreak.length,
        category: 'form',
      })
    } else if (rivalStreak.type === 'W') {
      out.push({
        text: `${input.rivalName} llega con ${rivalStreak.length} victorias seguidas.`,
        weight: rivalStreak.length,
        category: 'form',
      })
    }
  }

  if (Math.abs(input.recentForm.rival.trend) > 0.3) {
    const dir = input.recentForm.rival.trend > 0 ? 'en alza' : 'en caída'
    out.push({
      text: `Tendencia del rival ${dir} en su ventana reciente (Δ ${formatSigned(input.recentForm.rival.trend)}).`,
      weight: Math.abs(input.recentForm.rival.trend) * 2,
      category: 'form',
    })
  }

  // Pythagorean over/under-performance.
  const pythDelta = input.pythagorean.rival.delta
  if (Math.abs(pythDelta) > 0.15 && input.pythagorean.rival.played >= 3) {
    if (pythDelta > 0) {
      out.push({
        text: `${input.rivalName} viene sobre-rindiendo: gana ${pct(input.pythagorean.rival.actualWinPct)} cuando su GF/GC esperaba ${pct(input.pythagorean.rival.expectedWinPct)}.`,
        weight: Math.abs(pythDelta) * 3,
        category: 'pyth',
      })
    } else {
      out.push({
        text: `${input.rivalName} viene rindiendo bajo lo esperado por sus goles: ${pct(input.pythagorean.rival.actualWinPct)} reales vs ${pct(input.pythagorean.rival.expectedWinPct)} esperado.`,
        weight: Math.abs(pythDelta) * 3,
        category: 'pyth',
      })
    }
  }

  // Strength of schedule context.
  // diff = sosACSED - sosRival. sosX = mean PPG of opponents X has faced.
  // diff > 0 => AC SED faced tougher rivals than the opponent did
  //          => AC SED's points are deflated AND/OR rival's points are inflated.
  // diff < 0 => the opposite.
  if (Math.abs(input.strengthOfSchedule.diff) > 0.4) {
    const acsedSoS = input.strengthOfSchedule.sosACSED.toFixed(2)
    const rivalSoS = input.strengthOfSchedule.sosRival.toFixed(2)
    if (input.strengthOfSchedule.diff > 0) {
      out.push({
        text: `Sus puntos están inflados: enfrentaron rivales más débiles que nosotros (SoS rivales ${rivalSoS} vs nuestros ${acsedSoS} PPG).`,
        weight: Math.abs(input.strengthOfSchedule.diff) * 2,
        category: 'sos',
      })
    } else {
      out.push({
        text: `Nuestros puntos pueden estar inflados: enfrentamos rivales más débiles que ellos (SoS nuestros ${acsedSoS} vs rivales ${rivalSoS} PPG).`,
        weight: Math.abs(input.strengthOfSchedule.diff) * 2,
        category: 'sos',
      })
    }
  }

  // Goal-scorer concentration.
  if (input.scorers.rivalHHI > WEIGHTS.highHHI && input.scorers.rivalTop[0]) {
    const top = input.scorers.rivalTop[0]
    out.push({
      text: `${top.playerName} concentra el ${pct(top.share)} de los goles del rival — clave si está o no.`,
      weight: 2 + input.scorers.rivalHHI,
      category: 'scorers',
    })
  }

  // Recent reds.
  if (input.discipline.rivalRecentReds > 0) {
    out.push({
      text: `Roja(s) reciente(s) en el rival (${input.discipline.rivalRecentReds} en sus últimos partidos) — pueden tener sanciones.`,
      weight: input.discipline.rivalRecentReds,
      category: 'discipline',
    })
  }

  // Volatility flag.
  if (input.volatility.rivalStdDev > 2.5) {
    out.push({
      text: `Rival irregular (σ GD ${input.volatility.rivalStdDev.toFixed(1)}): da partidos extremos en ambos sentidos.`,
      weight: input.volatility.rivalStdDev / 2,
      category: 'volatility',
    })
  }

  // Standings positioning.
  const acsedRow = input.currentStandings.acsed
  const rivalRow = input.currentStandings.rival
  if (acsedRow && rivalRow && Math.abs(acsedRow.position - rivalRow.position) >= 2) {
    out.push({
      text: `Posiciones actuales: AC SED ${ord(acsedRow.position)} (${rivalRow.points < acsedRow.points ? 'arriba' : 'abajo'} del rival, ${ord(rivalRow.position)}).`,
      weight: Math.abs(acsedRow.position - rivalRow.position),
      category: 'standings',
    })
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, 5)
}

function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`
}

function formatSigned(x: number): string {
  return x > 0 ? `+${x.toFixed(2)}` : x.toFixed(2)
}

function ord(n: number): string {
  return `${n}°`
}

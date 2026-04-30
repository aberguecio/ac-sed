import { WEIGHTS } from './weights'

export function monthsBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.4375
  return ms / msPerMonth
}

export function recencyWeight(matchDate: Date, asOfDate: Date): number {
  const months = Math.max(0, monthsBetween(matchDate, asOfDate))
  return Math.pow(0.5, months / WEIGHTS.halfLifeMonths)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  const sq = values.map((v) => (v - m) ** 2)
  return Math.sqrt(mean(sq))
}

export function weightedMean(pairs: { value: number; weight: number }[]): number {
  const totalW = pairs.reduce((acc, p) => acc + p.weight, 0)
  if (totalW <= 0) return 0
  const sum = pairs.reduce((acc, p) => acc + p.value * p.weight, 0)
  return sum / totalW
}

export function logistic(x: number): number {
  // Numerically safe sigmoid.
  if (x >= 0) {
    const z = Math.exp(-x)
    return 1 / (1 + z)
  }
  const z = Math.exp(x)
  return z / (1 + z)
}

/**
 * Standard iterative Levenshtein (edit) distance between two strings.
 * O(m*n) time, O(n) space. Case-sensitive — normalise inputs before calling.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const row = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = row[j]
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1])
      prev = temp
    }
  }
  return row[n]
}

/**
 * Returns the best (minimum) Levenshtein distance between `query` and any of
 * the candidate strings. All comparisons are lower-cased internally.
 * Returns Infinity if `candidates` is empty.
 */
export function bestLevenshtein(query: string, candidates: string[]): number {
  if (candidates.length === 0) return Infinity
  const q = query.toLowerCase()
  return Math.min(...candidates.map(c => levenshtein(q, c.toLowerCase())))
}

/**
 * Cleans up tournament names by removing common prefixes and suffixes.
 * Removes:
 * - "Liga B + Lunes, " from the beginning (if present)
 * - " Rinconada" from the end (if present)
 *
 * Examples:
 * - "Liga B + Lunes, Otoño 2025" → "Otoño 2025"
 * - "Verano 2024 Rinconada" → "Verano 2024"
 * - "Liga B + Lunes, Primavera 2025 Rinconada" → "Primavera 2025"
 */
export function cleanTournamentName(name: string): string {
  let cleaned = name

  // Remove "Liga B + Lunes, " prefix
  if (cleaned.startsWith('Liga B + Lunes, ')) {
    cleaned = cleaned.substring('Liga B + Lunes, '.length)
  }

  // Remove " Rinconada" suffix
  if (cleaned.endsWith(' Rinconada')) {
    cleaned = cleaned.substring(0, cleaned.length - ' Rinconada'.length)
  }

  return cleaned
}

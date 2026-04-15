export interface ParsedEntry {
  rawName: string
  notes: string | null
}

export interface PlayerWithAliases {
  id: number
  name: string
  aliases: { id: number; alias: string }[]
}

export type MatchConfidence = 'exact' | 'fuzzy' | 'none'

export interface MatchResult {
  rawName: string
  notes: string | null
  player: PlayerWithAliases | null
  confidence: MatchConfidence
  matchedAlias: string | null // which alias/name was matched
}

// Invisible Unicode chars commonly pasted from WhatsApp
const INVISIBLE_CHARS = /[\u2060\u200b\u200c\u200d\uFEFF\u00ad]/g

function normalize(s: string): string {
  return s
    .replace(INVISIBLE_CHARS, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritical marks
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }
  return dp[m][n]
}

/**
 * Parses a WhatsApp-style attendance message like:
 *
 *   1. Hernan
 *   2. Gallet
 *   5. ⁠Riquelme (-10)
 *   9. ⁠Ladron jr
 *
 * Returns an array of { rawName, notes } entries.
 */
export function parseAttendanceMessage(text: string): ParsedEntry[] {
  const lines = text.split('\n')
  const entries: ParsedEntry[] = []

  // Match lines like: "1. Name", "10. Name (note)", "1) Name"
  const linePattern = /^\d+[\.\)]\s*(.*)/

  for (const line of lines) {
    const clean = line.replace(INVISIBLE_CHARS, '').trim()
    const m = clean.match(linePattern)
    if (!m) continue

    let rest = m[1].trim().replace(INVISIBLE_CHARS, '')

    // Extract trailing parenthesized note, e.g. "Riquelme (-10)" or "Tomas (llego tarde)"
    let notes: string | null = null
    const noteMatch = rest.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
    if (noteMatch) {
      rest = noteMatch[1].trim()
      notes = noteMatch[2].trim()
    }

    const rawName = rest.trim()
    if (rawName.length === 0) continue

    entries.push({ rawName, notes })
  }

  return entries
}

/**
 * Matches parsed entries against a list of players+aliases using fuzzy logic.
 * Returns a MatchResult per entry, with the best matching player (or null).
 */
export function matchParsedEntries(
  entries: ParsedEntry[],
  players: PlayerWithAliases[]
): MatchResult[] {
  return entries.map((entry) => {
    const normInput = normalize(entry.rawName)

    // Build candidate list: player name + all aliases
    type Candidate = { player: PlayerWithAliases; label: string; normLabel: string }
    const candidates: Candidate[] = []
    for (const p of players) {
      candidates.push({ player: p, label: p.name, normLabel: normalize(p.name) })
      for (const a of p.aliases) {
        candidates.push({ player: p, label: a.alias, normLabel: normalize(a.alias) })
      }
    }

    // 1. Exact match
    for (const c of candidates) {
      if (c.normLabel === normInput) {
        return { rawName: entry.rawName, notes: entry.notes, player: c.player, confidence: 'exact', matchedAlias: c.label }
      }
    }

    // 2. StartsWith / contains (only if input >= 3 chars)
    if (normInput.length >= 3) {
      for (const c of candidates) {
        if (c.normLabel.startsWith(normInput) || normInput.startsWith(c.normLabel)) {
          return { rawName: entry.rawName, notes: entry.notes, player: c.player, confidence: 'fuzzy', matchedAlias: c.label }
        }
      }

      // 3. Levenshtein distance ≤ 2 (only for names >= 4 chars to avoid false positives)
      if (normInput.length >= 4) {
        let bestCandidate: Candidate | null = null
        let bestDist = 3 // threshold

        for (const c of candidates) {
          if (Math.abs(c.normLabel.length - normInput.length) > 3) continue
          const dist = levenshtein(normInput, c.normLabel)
          if (dist < bestDist) {
            bestDist = dist
            bestCandidate = c
          }
        }

        if (bestCandidate) {
          return { rawName: entry.rawName, notes: entry.notes, player: bestCandidate.player, confidence: 'fuzzy', matchedAlias: bestCandidate.label }
        }
      }
    }

    return { rawName: entry.rawName, notes: entry.notes, player: null, confidence: 'none', matchedAlias: null }
  })
}

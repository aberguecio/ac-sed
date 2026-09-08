import type { Match } from '@prisma/client'

/**
 * What the scraper observed about a match, as a closed set of cases.
 *
 * The scraper used to hand back a single `newMatches` bag that meant two
 * incompatible things — "a row appeared" and "the result arrived" — and every
 * consumer had to remember to re-filter it. One of them forgot, and four
 * fixture republications turned that into 20 news articles about matches
 * nobody had played, with invented scorelines.
 *
 * With the cases named, a `created` match cannot reach the chronicle
 * generator: the rule stops being something each call site has to recall.
 * Adding an effect — pinging the group when a match is rescheduled, say —
 * becomes a new branch here rather than a change to the scraper.
 */
export type MatchChange =
  | { kind: 'created'; match: Match }
  | { kind: 'result-arrived'; match: Match; score: { home: number; away: number } }
  | { kind: 'rescheduled'; match: Match; from: Date; to: Date }
  | { kind: 'updated'; match: Match; fields: string[] }

/**
 * The matches a chronicle may describe: their result is in. This is the only
 * door to news generation from a scrape.
 */
export function matchesWithNewResult(changes: MatchChange[]): Match[] {
  return changes.filter(c => c.kind === 'result-arrived').map(c => c.match)
}

/**
 * Matches that either appeared or got their result — the historical meaning of
 * `newMatches`. Kept for the callers that legitimately want both.
 */
export function newOrScoredMatches(changes: MatchChange[]): Match[] {
  return changes
    .filter(c => c.kind === 'created' || c.kind === 'result-arrived')
    .map(c => c.match)
}

/** One-line summary for the scrape log. */
export function summarizeChanges(changes: MatchChange[]): string {
  const counts = changes.reduce<Record<string, number>>((acc, c) => {
    acc[c.kind] = (acc[c.kind] ?? 0) + 1
    return acc
  }, {})
  const parts = Object.entries(counts).map(([kind, count]) => `${count} ${kind}`)
  return parts.length > 0 ? parts.join(', ') : 'no changes'
}

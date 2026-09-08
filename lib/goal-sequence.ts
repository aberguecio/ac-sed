/**
 * Ordering of the goals of a match.
 *
 * The league's API gives no minute and no order — `saveMatchEvents` stores
 * whatever sequence the events endpoint returned, and the admin used to read
 * the goals in `createdAt` order, i.e. that same arbitrary sequence.
 *
 * The model here has one source of truth for display, `MatchGoal.orderIndex`,
 * and two ways of setting it:
 *
 * - **A goal with a minute is placed by its minute.** It cannot be dragged:
 *   its position is a consequence of the data.
 * - **A goal without a minute is placed by hand**, and stays anchored behind
 *   the minuted goal it currently follows (or at the front, when no minuted
 *   goal precedes it). Dragging one only rewrites `orderIndex`.
 *
 * The sequencing functions are pure, so the ordering can be reasoned about —
 * and checked — without a database. The two helpers at the bottom are the only
 * ones that touch Prisma.
 */
import { prisma } from './db'
import type { Prisma } from '@prisma/client'

export interface SequencedGoal {
  id: number
  minute: number | null
  orderIndex: number | null
  createdAt: Date
}

/**
 * The order as currently stored: `orderIndex` when set, then `createdAt` for
 * the rows that predate this feature, then id as a last resort — goals of one
 * match are written in the same scrape, milliseconds apart, so `createdAt`
 * alone can tie.
 */
export function storedOrder<T extends SequencedGoal>(goals: T[]): T[] {
  return [...goals].sort((a, b) => {
    const ai = a.orderIndex ?? Number.MAX_SAFE_INTEGER
    const bi = b.orderIndex ?? Number.MAX_SAFE_INTEGER
    if (ai !== bi) return ai - bi
    const at = a.createdAt.getTime()
    const bt = b.createdAt.getTime()
    if (at !== bt) return at - bt
    return a.id - b.id
  })
}

/**
 * Re-places the minuted goals in minute order while keeping every minute-less
 * goal attached to the goal it follows.
 *
 * Run after a minute is added, changed or cleared: setting `min 12` on a goal
 * has to move it, and the goals a human dragged around it must not scatter.
 */
export function normalizeByMinute<T extends SequencedGoal>(goals: T[]): T[] {
  const order = storedOrder(goals)

  // A minute-less goal belongs to the block of the last minuted goal before
  // it; the ones ahead of every minuted goal form the leading block.
  const leading: T[] = []
  const blocks: { anchor: T; followers: T[] }[] = []

  for (const goal of order) {
    if (goal.minute === null) {
      if (blocks.length === 0) leading.push(goal)
      else blocks[blocks.length - 1].followers.push(goal)
      continue
    }
    blocks.push({ anchor: goal, followers: [] })
  }

  // Stable: two goals sharing a minute keep the order they had.
  blocks.sort((a, b) => a.anchor.minute! - b.anchor.minute!)

  return [...leading, ...blocks.flatMap(b => [b.anchor, ...b.followers])]
}

/** `orderIndex` values for a sequence, 1-based and gapless. */
export function orderIndexFor(goalIds: number[]): Map<number, number> {
  return new Map(goalIds.map((id, i) => [id, i + 1]))
}

/**
 * Whether a proposed sequence respects the rule that minuted goals cannot
 * move: read on their own they must still be in ascending minute order.
 *
 * The editor does not let a minuted goal be dragged, so a violation means a
 * stale page or a hand-made request — worth rejecting rather than silently
 * reordering someone's match.
 */
export function minuteOrderViolation(sequence: SequencedGoal[]): string | null {
  const minuted = sequence.filter(g => g.minute !== null)
  for (let i = 1; i < minuted.length; i++) {
    const prev = minuted[i - 1]
    const curr = minuted[i]
    if (curr.minute! < prev.minute!) {
      return `el gol ${curr.id} (min ${curr.minute}) no puede ir después del gol ${prev.id} (min ${prev.minute})`
    }
  }
  return null
}

/**
 * Reads a client-sent sequence against what the match actually has: same
 * goals, no repeats, nothing missing.
 */
export function validateSequenceIds(
  proposed: number[],
  actual: number[],
): string | null {
  if (proposed.length !== actual.length) {
    return `la secuencia trae ${proposed.length} goles y el partido tiene ${actual.length}`
  }
  const seen = new Set<number>()
  for (const id of proposed) {
    if (seen.has(id)) return `el gol ${id} aparece dos veces en la secuencia`
    seen.add(id)
  }
  const missing = actual.filter(id => !seen.has(id))
  if (missing.length > 0) return `faltan goles en la secuencia: ${missing.join(', ')}`
  return null
}

/** Tolerates both the Prisma client and a transaction client. */
type Db = typeof prisma | Prisma.TransactionClient

const SEQUENCE_SELECT = { id: true, minute: true, orderIndex: true, createdAt: true } as const

/** Writes `orderIndex` 1..N, skipping the rows that already hold their value. */
async function writeSequence(sequence: SequencedGoal[], db: Db): Promise<number> {
  const indexes = orderIndexFor(sequence.map(g => g.id))
  let written = 0

  for (const goal of sequence) {
    const next = indexes.get(goal.id)!
    if (goal.orderIndex === next) continue
    await db.matchGoal.update({ where: { id: goal.id }, data: { orderIndex: next } })
    written++
  }

  return written
}

/**
 * Stores an explicit sequence — the result of a drag. Rejects it if a minuted
 * goal would end up out of minute order, since those are not movable.
 */
export async function applyGoalSequence(
  matchId: number,
  goalIds: number[],
): Promise<{ ok: true; written: number } | { ok: false; error: string }> {
  const goals = await prisma.matchGoal.findMany({
    where: { matchId },
    select: SEQUENCE_SELECT,
  })

  const idsError = validateSequenceIds(goalIds, goals.map(g => g.id))
  if (idsError) return { ok: false, error: idsError }

  const byId = new Map(goals.map(g => [g.id, g]))
  const sequence = goalIds.map(id => byId.get(id)!)

  const violation = minuteOrderViolation(sequence)
  if (violation) return { ok: false, error: violation }

  const written = await prisma.$transaction(tx => writeSequence(sequence, tx))
  return { ok: true, written }
}

/**
 * Re-places the minuted goals of a match by minute, keeping the minute-less
 * ones anchored. Run after a minute is set, changed or cleared.
 */
export async function renormalizeGoalOrder(matchId: number, db: Db = prisma): Promise<number> {
  const goals = await db.matchGoal.findMany({ where: { matchId }, select: SEQUENCE_SELECT })
  return writeSequence(normalizeByMinute(goals), db)
}

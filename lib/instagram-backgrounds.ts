import { prisma } from '@/lib/db'
import type { InstagramBackground } from '@prisma/client'

/**
 * Pick `n` backgrounds from the auto-eligible pool, biased toward the
 * least-used so the rotation stays balanced. Ties on `usageCount` are
 * broken randomly. When the pool is smaller than `n` the remaining slots
 * repeat already-picked entries. The `usageCount` increment is NOT done
 * here — it happens in the publish endpoint after a post is actually
 * published, so drafts that are never sent don't inflate the counter.
 *
 * Returns an empty array when the auto-eligible pool is empty (callers
 * fall back to the default template).
 */
export async function pickRandomBackgrounds(n: number): Promise<InstagramBackground[]> {
  if (n <= 0) return []
  const pool = await prisma.instagramBackground.findMany({
    where: { autoEligible: true },
  })
  if (pool.length === 0) return []

  const sorted = [...pool].sort((a, b) => {
    if (a.usageCount !== b.usageCount) return a.usageCount - b.usageCount
    return Math.random() - 0.5
  })

  const out: InstagramBackground[] = []
  for (let i = 0; i < n; i++) out.push(sorted[i % sorted.length])
  return out
}

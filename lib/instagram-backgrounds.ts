import { prisma } from '@/lib/db'
import type { InstagramBackground } from '@prisma/client'

/**
 * Pick `n` backgrounds from the uploaded pool. When the pool has at least `n`
 * entries the picks are distinct (Fisher–Yates). When the pool is smaller the
 * remaining slots are filled by repeating already-picked entries. Returns an
 * empty array if the pool itself is empty (callers should fall back to the
 * default template).
 */
export async function pickRandomBackgrounds(n: number): Promise<InstagramBackground[]> {
  if (n <= 0) return []
  const pool = await prisma.instagramBackground.findMany()
  if (pool.length === 0) return []

  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const out: InstagramBackground[] = []
  for (let i = 0; i < n; i++) out.push(shuffled[i % shuffled.length])
  return out
}

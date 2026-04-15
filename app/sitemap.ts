import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db'

// Generated on request (not at build time) so the build doesn't need DB access.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://acsed.cl'

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1.0 },
    { url: `${base}/news`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/players`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/stats`, changeFrequency: 'weekly', priority: 0.7 },
  ]

  let newsEntries: MetadataRoute.Sitemap = []
  try {
    const news = await prisma.newsArticle.findMany({
      where: { published: true },
      select: { slug: true, generatedAt: true },
    })
    newsEntries = news.map((n: { slug: string; generatedAt: Date }) => ({
      url: `${base}/news/${n.slug}`,
      lastModified: n.generatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))
  } catch (err) {
    // DB unreachable — return static routes only so the sitemap still serves.
    console.error('[sitemap] failed to load news articles:', err)
  }

  return [...staticEntries, ...newsEntries]
}

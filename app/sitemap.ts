import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://acsed.cl'

  const news = await prisma.newsArticle.findMany({
    where: { published: true },
    select: { slug: true, generatedAt: true },
  })

  return [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1.0 },
    { url: `${base}/news`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/players`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/stats`, changeFrequency: 'weekly', priority: 0.7 },
    ...news.map((n) => ({
      url: `${base}/news/${n.slug}`,
      lastModified: n.generatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ]
}

import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://acsed.cl'
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/unsubscribe'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}

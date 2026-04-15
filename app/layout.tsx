import type { Metadata } from 'next'
import './globals.css'

// TODO(SEO): remove `force-dynamic` once ISR behavior is verified across all routes.
// See .claude/plans/inherited-sniffing-puffin.md (Deferred section A).
export const dynamic = 'force-dynamic'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://acsed.cl'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'AC SED — Club Atlético SED | Liga B Chile',
    template: '%s | AC SED',
  },
  description:
    'Sitio oficial del Club Atlético SED. Resultados, plantel, estadísticas y noticias de Liga B Chile',
  keywords: ['AC SED', 'ACSED', 'Club Atlético SED', 'Liga B', 'Liga B Chile', 'fútbol Chile'],
  applicationName: 'AC SED',
  authors: [{ name: 'Club Atlético SED' }],
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    url: siteUrl,
    siteName: 'AC SED',
    title: 'AC SED — Club Atlético SED | Liga B Chile',
    description: 'Sitio oficial del Club Atlético SED en Liga B Chile.',
    images: [{ url: '/ACSED.webp', width: 1200, height: 630, alt: 'AC SED' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AC SED — Club Atlético SED',
    description: 'Sitio oficial del Club Atlético SED en Liga B Chile.',
    images: ['/ACSED.webp'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  alternates: { canonical: siteUrl },
  icons: { icon: '/icon.png' },
}

const sportsTeamJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SportsTeam',
  name: 'Club Atlético SED',
  alternateName: ['AC SED', 'ACSED'],
  sport: 'Soccer',
  url: siteUrl,
  logo: `${siteUrl}/ACSED.webp`,
  memberOf: { '@type': 'SportsOrganization', name: 'Liga B Chile' },
  // TODO(SEO): fill in real social profile URLs (Instagram, X, Facebook, YouTube)
  sameAs: [] as string[],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(sportsTeamJsonLd) }}
        />
        {children}
      </body>
    </html>
  )
}

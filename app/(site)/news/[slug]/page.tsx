import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { StandingsTable } from '@/components/standings-table'
import { getMatchContext } from '@/lib/ai'

interface Props {
  params: Promise<{ slug: string }>
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://acsed.cl'

function buildArticleDescription(content: string, max = 160): string {
  const plain = content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // strip markdown images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // strip markdown links, keep text
    .replace(/[#*_`>~-]+/g, ' ') // strip common markdown tokens
    .replace(/<[^>]+>/g, ' ') // strip HTML tags
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= max) return plain
  return plain.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const article = await prisma.newsArticle.findUnique({ where: { slug } })
  if (!article) return { title: 'Artículo no encontrado' }

  const description = buildArticleDescription(article.content)
  const url = `${siteUrl}/news/${slug}`
  const image = article.imageUrl ?? `${siteUrl}/ACSED.webp`

  return {
    title: article.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: article.title,
      description,
      siteName: 'AC SED',
      locale: 'es_CL',
      publishedTime: article.generatedAt.toISOString(),
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description,
      images: [image],
    },
  }
}

export default async function NewsDetailPage({ params }: Props) {
  const { slug } = await params
  const article = await prisma.newsArticle.findUnique({
    where: { slug, published: true },
    include: {
      match: {
        include: {
          homeTeam: true,
          awayTeam: true,
        }
      }
    },
  })

  if (!article) notFound()

  // Calculate standings at the time of the match (if there is a match)
  let standings: any[] = []
  if (article.match) {
    const context = await getMatchContext(article.match)

    // Convert standingsRows to the format expected by StandingsTable
    if (context.standingsRows.length > 0) {
      // Get team IDs for each team name
      const teamNames = context.standingsRows.map(s => s.teamName)
      const teams = await prisma.team.findMany({
        where: { name: { in: teamNames } }
      })

      standings = context.standingsRows.map(row => {
        const team = teams.find(t => t.name === row.teamName)
        return {
          id: 0, // Not needed for display
          position: row.position,
          played: row.won + row.drawn + row.lost,
          won: row.won,
          drawn: row.drawn,
          lost: row.lost,
          goalsFor: row.goalsFor,
          goalsAgainst: row.goalsAgainst,
          points: row.points,
          team: team || { id: 0, name: row.teamName, logoUrl: null }
        }
      })
    }
  }

  const date = new Date(article.generatedAt).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const articleUrl = `${siteUrl}/news/${slug}`
  const articleImage = article.imageUrl ?? `${siteUrl}/ACSED.webp`
  const newsArticleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    image: [articleImage],
    datePublished: article.generatedAt.toISOString(),
    dateModified: article.generatedAt.toISOString(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl },
    author: { '@type': 'Organization', name: 'Club Atlético SED', url: siteUrl },
    publisher: {
      '@type': 'Organization',
      name: 'Club Atlético SED',
      logo: { '@type': 'ImageObject', url: `${siteUrl}/ACSED.webp` },
    },
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(newsArticleJsonLd) }}
      />
      <Link href="/news" className="text-wheat text-sm hover:underline mb-6 inline-block">
        ← Volver a noticias
      </Link>

      <article>
        <header className="mb-8">
          <p className="text-wheat text-sm font-medium uppercase tracking-wider mb-3">{date}</p>
          <h1 className="text-3xl md:text-4xl font-extrabold text-navy leading-tight mb-4">{article.title}</h1>
          {article.imageUrl && (
            <img
              src={article.imageUrl}
              alt={article.title}
              className="w-full rounded-xl object-cover max-h-96 mb-6 shadow-sm"
            />
          )}
          {article.match && (
            <div className="bg-navy text-cream rounded-xl px-5 py-3 inline-flex items-center gap-3 text-sm">
              <span className="font-bold">{article.match.homeTeam?.name ?? 'TBD'}</span>
              <span className="bg-wheat text-navy font-extrabold px-3 py-1 rounded text-base">
                {article.match.homeScore ?? '?'} — {article.match.awayScore ?? '?'}
              </span>
              <span className="font-bold">{article.match.awayTeam?.name ?? 'TBD'}</span>
            </div>
          )}
        </header>

        <div className="prose prose-lg max-w-none text-gray-700 leading-relaxed">
          {article.content.split('\n').map((paragraph, i) =>
            paragraph.trim() ? (
              <p key={i} className="mb-4 text-justify">
                {paragraph}
              </p>
            ) : null
          )}
        </div>

        {standings.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-bold text-navy mb-3">Tabla de posiciones</h2>
            <StandingsTable standings={standings} />
          </div>
        )}
      </article>
    </div>
  )
}

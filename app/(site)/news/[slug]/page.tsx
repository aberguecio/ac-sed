import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { StandingsTable } from '@/components/standings-table'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const article = await prisma.newsArticle.findUnique({ where: { slug } })
  if (!article) return { title: 'Artículo no encontrado' }
  return { title: `${article.title} — AC SED` }
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

  const tournamentId = article.match?.tournamentId ?? 201
  const stageId = article.match?.stageId ?? 396
  const groupId = article.match?.groupId ?? 2300

  const standings = await prisma.standing.findMany({
    where: { tournamentId, stageId, groupId },
    include: { team: true },
    orderBy: { position: 'asc' },
  })

  const date = new Date(article.generatedAt).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
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
            paragraph.trim() ? <p key={i}>{paragraph}</p> : null
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

import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

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
    include: { match: true },
  })

  if (!article) notFound()

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
              <span className="font-bold">{article.match.homeTeam}</span>
              <span className="bg-wheat text-navy font-extrabold px-3 py-1 rounded text-base">
                {article.match.homeScore ?? '?'} — {article.match.awayScore ?? '?'}
              </span>
              <span className="font-bold">{article.match.awayTeam}</span>
            </div>
          )}
        </header>

        <div className="prose prose-lg max-w-none text-gray-700 leading-relaxed">
          {article.content.split('\n').map((paragraph, i) =>
            paragraph.trim() ? <p key={i}>{paragraph}</p> : null
          )}
        </div>

        <footer className="mt-10 pt-6 border-t border-cream-dark/30 text-xs text-gray-400">
          Generado con IA · {article.aiProvider}
        </footer>
      </article>
    </div>
  )
}

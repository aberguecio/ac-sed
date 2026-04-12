import { prisma } from '@/lib/db'
import { NewsCard } from '@/components/news-card'
import { NewsletterSignup } from '@/components/newsletter-signup'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Noticias — AC SED' }
export const revalidate = 60

interface Props {
  searchParams: Promise<{ page?: string }>
}

export default async function NewsPage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1'))
  const perPage = 9

  const [articles, total] = await Promise.all([
    prisma.newsArticle.findMany({
      where: { published: true },
      orderBy: { generatedAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.newsArticle.count({ where: { published: true } }),
  ])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-extrabold text-navy mb-8">Noticias</h1>

      {articles.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg mb-10">No hay noticias publicadas aún.</p>
          <NewsletterSignup />
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((article) => (
              <NewsCard key={article.id} article={article} />
            ))}
          </div>

          {/* Newsletter signup */}
          <div className="mt-12">
            <NewsletterSignup />
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-10">
              {page > 1 && (
                <Link
                  href={`/news?page=${page - 1}`}
                  className="px-4 py-2 rounded-lg border border-cream-dark/50 hover:bg-cream-dark/30 text-sm"
                >
                  ← Anterior
                </Link>
              )}
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={`/news?page=${p}`}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    p === page
                      ? 'bg-navy text-cream'
                      : 'border border-cream-dark/50 hover:bg-cream-dark/30'
                  }`}
                >
                  {p}
                </Link>
              ))}
              {page < totalPages && (
                <Link
                  href={`/news?page=${page + 1}`}
                  className="px-4 py-2 rounded-lg border border-cream-dark/50 hover:bg-cream-dark/30 text-sm"
                >
                  Siguiente →
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

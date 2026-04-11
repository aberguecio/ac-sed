import Link from 'next/link'
import type { NewsArticle } from '@prisma/client'

interface Props {
  article: NewsArticle
}

export function NewsCard({ article }: Props) {
  const excerpt = article.content.slice(0, 150) + (article.content.length > 150 ? '…' : '')
  const date = new Date(article.generatedAt).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <Link href={`/news/${article.slug}`} className="group block">
      <article className="bg-white rounded-xl shadow-sm border border-cream-dark/30 overflow-hidden h-full hover:shadow-md transition-shadow">
        <div className="bg-navy h-2" />
        <div className="p-5">
          <p className="text-xs text-wheat font-medium uppercase tracking-wider mb-2">{date}</p>
          <h3 className="text-navy font-bold text-lg leading-snug mb-3 group-hover:text-navy-light transition-colors line-clamp-2">
            {article.title}
          </h3>
          <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">{excerpt}</p>
        </div>
        <div className="px-5 pb-4">
          <span className="text-wheat text-sm font-medium group-hover:underline">Leer más →</span>
        </div>
      </article>
    </Link>
  )
}

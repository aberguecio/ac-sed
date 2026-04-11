import { prisma } from '@/lib/db'
import Link from 'next/link'

export default async function AdminDashboard() {
  const [totalPlayers, totalNews, publishedNews, lastScrape, totalMatches] = await Promise.all([
    prisma.player.count({ where: { active: true } }),
    prisma.newsArticle.count(),
    prisma.newsArticle.count({ where: { published: true } }),
    prisma.scrapeLog.findFirst({ orderBy: { startedAt: 'desc' } }),
    prisma.match.count(),
  ])

  const stats = [
    { label: 'Jugadores', value: totalPlayers, href: '/admin/players', color: 'bg-navy' },
    { label: 'Noticias', value: `${publishedNews}/${totalNews}`, href: '/admin/news', color: 'bg-wheat' },
    { label: 'Partidos scrapeados', value: totalMatches, href: '/admin/scrape', color: 'bg-green-600' },
  ]

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-navy mb-8">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">
        {stats.map(({ label, value, href, color }) => (
          <Link key={label} href={href}>
            <div className={`${color} text-white rounded-xl p-5 hover:opacity-90 transition-opacity`}>
              <p className="text-3xl font-extrabold">{value}</p>
              <p className="text-sm opacity-80 mt-1">{label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Last scrape */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 max-w-lg">
        <h2 className="font-bold text-navy text-lg mb-4">Último Scrape</h2>
        {lastScrape ? (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Estado</dt>
              <dd className={`font-semibold ${lastScrape.status === 'success' ? 'text-green-600' : lastScrape.status === 'error' ? 'text-red-500' : 'text-yellow-500'}`}>
                {lastScrape.status}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Iniciado</dt>
              <dd>{new Date(lastScrape.startedAt).toLocaleString('es-CL')}</dd>
            </div>
            {lastScrape.matchesFound !== null && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Partidos nuevos</dt>
                <dd className="font-semibold">{lastScrape.matchesFound}</dd>
              </div>
            )}
            {lastScrape.errorMessage && (
              <div className="mt-2 bg-red-50 rounded p-3 text-red-600 text-xs">
                {lastScrape.errorMessage}
              </div>
            )}
          </dl>
        ) : (
          <p className="text-gray-400 text-sm">Ningún scrape ejecutado aún.</p>
        )}
        <Link
          href="/admin/scrape"
          className="mt-4 inline-block bg-navy text-cream px-4 py-2 rounded-lg text-sm font-medium hover:bg-navy-light transition-colors"
        >
          Ir a Scraping →
        </Link>
      </div>
    </div>
  )
}

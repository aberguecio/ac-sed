import { prisma } from '@/lib/db'
import { StandingsTable } from '@/components/standings-table'
import { NewsCard } from '@/components/news-card'
import Link from 'next/link'

export const revalidate = 300 // revalidate every 5 min

const ACSED_TEAM_NAME = 'AC Sed'

export default async function HomePage() {
  // Get the most recent tournament and stage
  const latestStanding = await prisma.standing.findFirst({
    where: {
      team: {
        name: ACSED_TEAM_NAME
      }
    },
    orderBy: [
      { tournamentId: 'desc' },
      { stageId: 'desc' }
    ],
  })

  let standings: Awaited<ReturnType<typeof prisma.standing.findMany<{ include: { team: true } }>>> = []
  let acsedStanding: typeof standings[number] | null = null

  if (latestStanding) {
    // Get standings for the same tournament/stage/group as AC SED
    standings = await prisma.standing.findMany({
      where: {
        tournamentId: latestStanding.tournamentId,
        stageId: latestStanding.stageId,
        groupId: latestStanding.groupId,
      },
      include: {
        team: true,
      },
      orderBy: { position: 'asc' },
    })
    acsedStanding = standings.find(s => s.team.name === ACSED_TEAM_NAME) || null
  }

  const [latestNews, latestMatches] = await Promise.all([
    prisma.newsArticle.findMany({
      where: { published: true },
      orderBy: { generatedAt: 'desc' },
      take: 3,
    }),
    prisma.match.findMany({
      where: latestStanding ? {
        tournamentId: latestStanding.tournamentId,
        stageId: latestStanding.stageId,
        groupId: latestStanding.groupId,
        homeScore: { not: null },
        awayScore: { not: null },
      } : {
        homeScore: { not: null },
        awayScore: { not: null },
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: { date: 'desc' },
      take: 5,
    }),
  ])

  const lastMatch = latestMatches[0]

  return (
    <>
      {/* Hero */}
      <section className="bg-navy text-cream py-16 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-4">
              Club Atlético<br />
              <span className="text-wheat">AC SED</span>
            </h1>
            <p className="text-cream/70 text-lg mb-6">Liga B Chile — Temporada {new Date().getFullYear()}</p>
            <div className="flex gap-4">
              <Link
                href="/news"
                className="bg-wheat text-navy px-6 py-2.5 rounded-lg font-semibold hover:bg-wheat-light transition-colors"
              >
                Últimas noticias
              </Link>
              <Link
                href="/stats"
                className="border border-cream/30 text-cream px-6 py-2.5 rounded-lg font-semibold hover:bg-navy-light transition-colors"
              >
                Estadísticas
              </Link>
            </div>
          </div>

          {/* Stats cards */}
          {acsedStanding && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Posición', value: `#${acsedStanding.position}` },
                { label: 'Puntos', value: acsedStanding.points },
                { label: 'Partidos', value: acsedStanding.played },
              ].map(({ label, value }) => (
                <div key={label} className="bg-navy-light/60 rounded-xl p-4 text-center min-w-[90px]">
                  <p className="text-wheat text-2xl font-extrabold">{value}</p>
                  <p className="text-cream/60 text-xs mt-1">{label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-10 grid md:grid-cols-3 gap-8">
        {/* Left: standings + last results */}
        <div className="md:col-span-2 space-y-8">
          {/* Tabla de posiciones */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-navy">Tabla de Posiciones</h2>
              <Link href="/stats" className="text-sm text-wheat hover:underline">Ver estadísticas →</Link>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-cream-dark/30 overflow-hidden">
              <div className="overflow-x-auto">
                <StandingsTable standings={standings} />
              </div>
            </div>
          </section>

          {/* Últimos resultados */}
          {latestMatches.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-navy mb-4">Últimos Resultados</h2>
              <div className="space-y-3">
                {latestMatches.map((m) => {
                  const homeTeamName = m.homeTeam?.name ?? 'TBD'
                  const awayTeamName = m.awayTeam?.name ?? 'TBD'
                  const isAcsedHome = homeTeamName.toUpperCase().includes('ACSED')
                  return (
                    <div
                      key={m.id}
                      className="bg-white rounded-xl px-4 py-3 border border-cream-dark/30 flex items-center justify-between"
                    >
                      <span className={`text-sm font-medium ${isAcsedHome ? 'text-navy font-bold' : 'text-gray-600'}`}>
                        {homeTeamName}
                      </span>
                      <span className="font-bold text-lg text-navy mx-3 tabular-nums">
                        {m.homeScore ?? '?'} — {m.awayScore ?? '?'}
                      </span>
                      <span className={`text-sm font-medium ${!isAcsedHome ? 'text-navy font-bold' : 'text-gray-600'}`}>
                        {awayTeamName}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        {/* Right: latest news */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-navy">Noticias</h2>
            <Link href="/news" className="text-sm text-wheat hover:underline">Ver todas →</Link>
          </div>
          {latestNews.length === 0 ? (
            <p className="text-gray-400 text-sm">Sin noticias publicadas aún.</p>
          ) : (
            <div className="space-y-4">
              {latestNews.map((article) => (
                <NewsCard key={article.id} article={article} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

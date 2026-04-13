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
    include: {
      tournament: true,
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
        OR: [
          { homeTeam: { name: ACSED_TEAM_NAME } },
          { awayTeam: { name: ACSED_TEAM_NAME } },
        ],
      } : {
        homeScore: { not: null },
        awayScore: { not: null },
        OR: [
          { homeTeam: { name: ACSED_TEAM_NAME } },
          { awayTeam: { name: ACSED_TEAM_NAME } },
        ],
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
      {/* Hero with Background Image */}
      <section className="relative bg-navy text-cream py-20 px-4 overflow-hidden">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src="/team-1.jpg"
            alt="AC SED Team"
            className="w-full h-full object-cover opacity-60"
            style={{ objectPosition: '70% 35%' }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/30 to-navy/10"></div>
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1">
              <div className="flex items-center gap-6 mb-6">
                <img src="/ACSED-transaparent.webp" alt="AC SED Logo" className="h-32 w-auto" />
                <div>
                  <h1 className="text-5xl md:text-6xl font-extrabold leading-tight">
                    Athletic Club<br />
                    <span className="text-wheat">SED</span>
                  </h1>
                </div>
              </div>
              <p className="text-cream/80 text-xl mb-8">
                {latestStanding?.tournament?.name || `Temporada ${new Date().getFullYear()}`}
              </p>
              <div className="flex gap-4">
                <Link
                  href="/news"
                  className="bg-wheat text-navy px-8 py-3 rounded-lg font-bold hover:bg-wheat-light transition-all transform hover:scale-105 shadow-lg"
                >
                  Últimas noticias
                </Link>
                <Link
                  href="/stats"
                  className="border-2 border-cream/50 text-cream px-8 py-3 rounded-lg font-bold hover:bg-cream/10 transition-all backdrop-blur-sm"
                >
                  Estadísticas
                </Link>
              </div>
            </div>

            {/* Stats cards with glassmorphism */}
            {acsedStanding && (
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Posición', value: `#${acsedStanding.position}`, color: 'text-wheat' },
                  { label: 'Puntos', value: acsedStanding.points, color: 'text-green-400' },
                  { label: 'Partidos', value: acsedStanding.played, color: 'text-blue-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white/10 backdrop-blur-md rounded-2xl p-6 text-center min-w-[110px] border border-white/20 hover:bg-white/20 transition-all transform hover:scale-105">
                    <p className={`${color} text-4xl font-extrabold mb-1`}>{value}</p>
                    <p className="text-cream/70 text-sm font-medium">{label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Last Match Highlight - Inside same section */}
          {lastMatch && (
            <div className="max-w-6xl mx-auto relative z-10 mt-16">
              <h2 className="text-sm uppercase tracking-wider text-wheat mb-4 text-center">Último Partido</h2>
              <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/20">
                <div className="flex items-start justify-between gap-8 -mt-2">
                  <div className="flex-1 flex items-center justify-end gap-4">
                    <p className={`text-2xl md:text-3xl font-bold ${lastMatch.homeTeam?.name === ACSED_TEAM_NAME ? 'text-wheat' : 'text-cream'}`}>
                      {lastMatch.homeTeam?.name ?? 'TBD'}
                    </p>
                    {lastMatch.homeTeam?.name === ACSED_TEAM_NAME ? (
                      <img src="/ACSED-transaparent.webp" alt="AC SED" className="h-28 w-auto" />
                    ) : lastMatch.homeTeam?.logoUrl ? (
                      <img
                        src={`https://liga-b.nyc3.digitaloceanspaces.com/team/${lastMatch.homeTeam.id}/${lastMatch.homeTeam.logoUrl}`}
                        alt={lastMatch.homeTeam.name}
                        className="h-28 w-28 object-contain"
                      />
                    ) : null}
                  </div>
                  <div className="text-center px-8 pt-2">
                    <div className="bg-wheat rounded-2xl px-8 py-6 min-w-[160px]">
                      <p className="text-5xl font-extrabold text-navy tabular-nums">
                        {lastMatch.homeScore ?? '?'} - {lastMatch.awayScore ?? '?'}
                      </p>
                    </div>
                    <p className="text-cream/60 text-sm mt-3">
                      {new Date(lastMatch.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}
                    </p>
                  </div>
                  <div className="flex-1 flex items-center justify-start gap-4">
                    {lastMatch.awayTeam?.name === ACSED_TEAM_NAME ? (
                      <img src="/ACSED-transaparent.webp" alt="AC SED" className="h-28 w-auto" />
                    ) : lastMatch.awayTeam?.logoUrl ? (
                      <img
                        src={`https://liga-b.nyc3.digitaloceanspaces.com/team/${lastMatch.awayTeam.id}/${lastMatch.awayTeam.logoUrl}`}
                        alt={lastMatch.awayTeam.name}
                        className="h-28 w-28 object-contain"
                      />
                    ) : null}
                    <p className={`text-2xl md:text-3xl font-bold ${lastMatch.awayTeam?.name === ACSED_TEAM_NAME ? 'text-wheat' : 'text-cream'}`}>
                      {lastMatch.awayTeam?.name ?? 'TBD'}
                    </p>
                  </div>
                </div>
              </div>
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
              <h2 className="text-2xl font-bold text-navy">Tabla de Posiciones</h2>
              <Link href="/stats" className="text-sm text-wheat hover:underline font-medium">Ver estadísticas →</Link>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-cream-dark/30 overflow-hidden">
              <div className="overflow-x-auto">
                <StandingsTable standings={standings} />
              </div>
            </div>
          </section>

          {/* Últimos resultados */}
          {latestMatches.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold text-navy mb-4">Últimos Resultados</h2>
              <div className="space-y-3">
                {latestMatches.slice(1).map((m) => {
                  const homeTeamName = m.homeTeam?.name ?? 'TBD'
                  const awayTeamName = m.awayTeam?.name ?? 'TBD'
                  const isAcsedHome = homeTeamName.toUpperCase().includes('ACSED')
                  return (
                    <div
                      key={m.id}
                      className="bg-white rounded-xl px-5 py-4 border border-cream-dark/30 flex items-center justify-between hover:shadow-md transition-shadow"
                    >
                      <span className={`text-sm font-medium ${isAcsedHome ? 'text-navy font-bold' : 'text-gray-600'}`}>
                        {homeTeamName}
                      </span>
                      <span className="font-bold text-xl text-navy mx-3 tabular-nums">
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
            <h2 className="text-2xl font-bold text-navy">Noticias</h2>
            <Link href="/news" className="text-sm text-wheat hover:underline font-medium">Ver todas →</Link>
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

      {/* Team Gallery */}
      <section className="bg-cream py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-extrabold text-navy mb-2">Nuestro Equipo</h2>
            <p className="text-gray-600">Momentos destacados de la temporada</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['team-1.jpg', 'team-2.jpg', 'team-3.jpg', 'team-4.jpg'].map((img, idx) => (
              <div
                key={idx}
                className="relative aspect-square rounded-2xl overflow-hidden group cursor-pointer shadow-lg hover:shadow-2xl transition-all duration-300"
              >
                <img
                  src={`/${img}`}
                  alt={`AC SED Team ${idx + 1}`}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-navy/0 group-hover:bg-navy/20 transition-colors duration-300"></div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

import { prisma } from "@/lib/db";
import { StandingsTable } from "@/components/standings-table";
import { NewsCard } from "@/components/news-card";
import { TeamLogo } from "@/components/team-logo";
import Link from "next/link";
import { ACSED_TEAM_NAME, isACSED } from "@/lib/team-utils";

export const revalidate = 300; // revalidate every 5 min

export default async function HomePage() {
  // Get the most recent tournament and stage
  const latestStanding = await prisma.standing.findFirst({
    where: {
      team: {
        name: ACSED_TEAM_NAME,
      },
    },
    include: {
      tournament: true,
    },
    orderBy: [{ tournamentId: "desc" }, { stageId: "desc" }],
  });

  let standings: Awaited<
    ReturnType<typeof prisma.standing.findMany<{ include: { team: true } }>>
  > = [];
  let acsedStanding: (typeof standings)[number] | null = null;

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
      orderBy: { position: "asc" },
    });
    acsedStanding =
      standings.find((s) => s.team.name === ACSED_TEAM_NAME) || null;
  }

  const [latestNews, allPhaseMatches] = await Promise.all([
    prisma.newsArticle.findMany({
      where: { published: true },
      orderBy: { generatedAt: "desc" },
      take: 3,
    }),
    prisma.match.findMany({
      where: latestStanding
        ? {
            tournamentId: latestStanding.tournamentId,
            stageId: latestStanding.stageId,
            groupId: latestStanding.groupId,
            OR: [
              { homeTeam: { name: ACSED_TEAM_NAME } },
              { awayTeam: { name: ACSED_TEAM_NAME } },
            ],
          }
        : {
            OR: [
              { homeTeam: { name: ACSED_TEAM_NAME } },
              { awayTeam: { name: ACSED_TEAM_NAME } },
            ],
          },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: { date: "asc" },
    }),
  ]);

  // Separar partidos jugados y por jugar
  const playedMatches = allPhaseMatches.filter(
    (m) => m.homeScore !== null && m.awayScore !== null
  );
  const upcomingMatches = allPhaseMatches.filter(
    (m) => m.homeScore === null || m.awayScore === null
  );

  const lastMatch = playedMatches[playedMatches.length - 1];

  return (
    <>
      {/* Hero with Background Image */}
      <section className="relative bg-navy text-cream py-20 px-4 overflow-hidden">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src="/team-1.webp"
            alt="AC SED Team"
            className="w-full h-full object-cover opacity-60"
            style={{ objectPosition: "70% 35%" }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/30 to-navy/10"></div>
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1">
              <div className="flex items-center gap-6 mb-6">
                <img
                  src="/ACSED-transaparent.webp"
                  alt="AC SED Logo"
                  className="h-32 w-auto"
                />
                <div>
                  <h1 className="text-5xl md:text-6xl font-extrabold leading-tight">
                    Athletic Club
                    <br />
                    <span className="text-wheat">SED</span>
                  </h1>
                </div>
              </div>
              <p className="text-cream/80 text-xl mb-8">
                {latestStanding?.tournament?.name ||
                  `Temporada ${new Date().getFullYear()}`}
              </p>
              <div className="flex gap-4">
                <Link
                  href="/news"
                  className="bg-wheat text-navy py-3 rounded-lg font-bold hover:bg-wheat-light transition-all transform hover:scale-105 shadow-lg text-sm md:text-base inline-flex items-center justify-center min-w-[140px] md:min-w-[160px]"
                >
                  Últimas noticias
                </Link>
                <Link
                  href="/stats"
                  className="border-2 border-cream/50 text-cream py-3 rounded-lg font-bold hover:bg-cream/10 transition-all backdrop-blur-sm text-sm md:text-base inline-flex items-center justify-center min-w-[140px] md:min-w-[160px]"
                >
                  Estadísticas
                </Link>
              </div>
            </div>

            {/* Stats cards with glassmorphism */}
            {acsedStanding && (
              <div className="grid grid-cols-3 gap-2 md:gap-4">
                {[
                  {
                    label: "Posición",
                    value: `#${acsedStanding.position}`,
                    color: "text-wheat",
                  },
                  {
                    label: "Puntos",
                    value: acsedStanding.points,
                    color: "text-green-400",
                  },
                  {
                    label: "Partidos",
                    value: acsedStanding.played,
                    color: "text-blue-400",
                  },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    className="bg-white/10 backdrop-blur-md rounded-xl md:rounded-2xl p-3 md:p-6 text-center border border-white/20 hover:bg-white/20 transition-all transform hover:scale-105"
                  >
                    <p
                      className={`${color} text-2xl md:text-4xl font-extrabold mb-1`}
                    >
                      {value}
                    </p>
                    <p className="text-cream/70 text-xs md:text-sm font-medium">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Last Match Highlight - Inside same section */}
          {lastMatch && (
            <div className="max-w-6xl mx-auto relative z-10 mt-16">
              <h2 className="text-sm uppercase tracking-wider text-wheat mb-4 text-center">
                Último Partido
              </h2>
              <div className="bg-white/10 backdrop-blur-md rounded-3xl p-4 md:p-8 border border-white/20">
                {/* Mobile Layout */}
                <div className="flex md:hidden flex-col gap-6">
                  {/* Home Team */}
                  <div className="flex items-center justify-center gap-3">
                    <TeamLogo
                      teamId={lastMatch.homeTeam?.id ?? 0}
                      teamName={lastMatch.homeTeam?.name ?? "TBD"}
                      logoUrl={lastMatch.homeTeam?.logoUrl ?? null}
                      size="lg"
                      className="h-12 w-12 md:h-16 md:w-16"
                      textSize="text-[16px] md:text-[20px]"
                    />
                    <p
                      className={`text-xl font-bold text-center ${
                        isACSED(lastMatch.homeTeam?.name)
                          ? "text-wheat"
                          : "text-cream"
                      }`}
                    >
                      {lastMatch.homeTeam?.name ?? "TBD"}
                    </p>
                  </div>

                  {/* Score */}
                  <div className="text-center">
                    <div className="bg-wheat rounded-2xl px-6 py-4 inline-block">
                      <p className="text-4xl font-extrabold text-navy tabular-nums">
                        {lastMatch.homeScore ?? "?"} -{" "}
                        {lastMatch.awayScore ?? "?"}
                      </p>
                    </div>
                    <p className="text-cream/60 text-xs mt-2">
                      {new Date(lastMatch.date).toLocaleDateString("es-CL", {
                        day: "numeric",
                        month: "long",
                      })}
                    </p>
                  </div>

                  {/* Away Team */}
                  <div className="flex items-center justify-center gap-3">
                    <TeamLogo
                      teamId={lastMatch.awayTeam?.id ?? 0}
                      teamName={lastMatch.awayTeam?.name ?? "TBD"}
                      logoUrl={lastMatch.awayTeam?.logoUrl ?? null}
                      size="lg"
                      className="h-12 w-12 md:h-16 md:w-16"
                      textSize="text-[16px] md:text-[20px]"
                    />
                    <p
                      className={`text-xl font-bold text-center ${
                        isACSED(lastMatch.awayTeam?.name)
                          ? "text-wheat"
                          : "text-cream"
                      }`}
                    >
                      {lastMatch.awayTeam?.name ?? "TBD"}
                    </p>
                  </div>
                </div>

                {/* Desktop Layout */}
                <div className="hidden md:flex items-start justify-between gap-8 -mt-2">
                  <div className="flex-1 flex items-center justify-end gap-4">
                    <p
                      className={`text-2xl md:text-3xl font-bold ${
                        isACSED(lastMatch.homeTeam?.name)
                          ? "text-wheat"
                          : "text-cream"
                      }`}
                    >
                      {lastMatch.homeTeam?.name ?? "TBD"}
                    </p>
                    <TeamLogo
                      teamId={lastMatch.homeTeam?.id ?? 0}
                      teamName={lastMatch.homeTeam?.name ?? "TBD"}
                      logoUrl={lastMatch.homeTeam?.logoUrl ?? null}
                      size="lg"
                      className="h-20 w-20 md:h-28 md:w-28"
                      textSize="text-[24px] md:text-[36px]"
                    />
                  </div>
                  <div className="text-center px-8 pt-2">
                    <div className="bg-wheat rounded-2xl px-8 py-6 min-w-[160px]">
                      <p className="text-5xl font-extrabold text-navy tabular-nums">
                        {lastMatch.homeScore ?? "?"} -{" "}
                        {lastMatch.awayScore ?? "?"}
                      </p>
                    </div>
                    <p className="text-cream/60 text-sm mt-3">
                      {new Date(lastMatch.date).toLocaleDateString("es-CL", {
                        day: "numeric",
                        month: "long",
                      })}
                    </p>
                  </div>
                  <div className="flex-1 flex items-center justify-start gap-4">
                    <TeamLogo
                      teamId={lastMatch.awayTeam?.id ?? 0}
                      teamName={lastMatch.awayTeam?.name ?? "TBD"}
                      logoUrl={lastMatch.awayTeam?.logoUrl ?? null}
                      size="lg"
                      className="h-20 w-20 md:h-28 md:w-28"
                      textSize="text-[24px] md:text-[36px]"
                    />
                    <p
                      className={`text-2xl md:text-3xl font-bold ${
                        isACSED(lastMatch.awayTeam?.name)
                          ? "text-wheat"
                          : "text-cream"
                      }`}
                    >
                      {lastMatch.awayTeam?.name ?? "TBD"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid md:grid-cols-3 gap-4 md:gap-8">
          {/* Left: standings + last results + team gallery */}
          <div className="md:col-span-2 space-y-6 md:space-y-8 min-w-0">
            {/* Tabla de posiciones */}
            <section className="min-w-0">
              <div className="flex items-center justify-between mb-4 gap-2">
                <h2 className="text-lg md:text-2xl font-bold text-navy">
                  Tabla de Posiciones
                </h2>
                <Link
                  href="/stats"
                  className="text-xs md:text-sm text-wheat hover:underline font-medium whitespace-nowrap flex-shrink-0"
                >
                  Ver estadísticas →
                </Link>
              </div>
              <div className="bg-white rounded-lg md:rounded-2xl shadow-lg border border-cream-dark/30 overflow-hidden">
                <div className="overflow-x-auto">
                  <StandingsTable standings={standings} />
                </div>
              </div>
            </section>

            {/* Partidos de Fase */}
            {allPhaseMatches.length > 0 && (
              <section className="min-w-0">
                <h2 className="text-lg md:text-2xl font-bold text-navy mb-4">
                  Partidos de Fase
                </h2>

                {/* Próximos Partidos */}
                {upcomingMatches.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-wheat mb-3">
                      PRÓXIMOS PARTIDOS
                    </h3>
                    <div className="space-y-2 md:space-y-3">
                      {upcomingMatches.map((m) => {
                        const homeTeamName = m.homeTeam?.name ?? "TBD";
                        const awayTeamName = m.awayTeam?.name ?? "TBD";
                        const isAcsedHome = isACSED(m.homeTeam?.name);
                        const isAcsedAway = isACSED(m.awayTeam?.name);
                        const matchDate = new Date(m.date);
                        const dateStr = matchDate.toLocaleDateString("es-CL", {
                          day: "numeric",
                          month: "short",
                        });
                        const timeStr = matchDate.toLocaleTimeString("es-CL", {
                          hour: "2-digit",
                          minute: "2-digit",
                        });

                        return (
                          <div
                            key={m.id}
                            className="bg-white rounded-lg md:rounded-xl px-3 md:px-5 py-3 md:py-4 border border-cream-dark/30 hover:shadow-md transition-shadow min-w-0"
                          >
                            <div className="flex items-center gap-2 md:gap-3">
                              {/* Home Team */}
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <TeamLogo
                                  teamId={m.homeTeam?.id ?? 0}
                                  teamName={homeTeamName}
                                  logoUrl={m.homeTeam?.logoUrl ?? null}
                                  size="md"
                                  className="h-12 w-12 md:h-16 md:w-16"
                                  textSize="text-[16px] md:text-[20px]"
                                />
                                <span
                                  className={`text-xs md:text-sm font-medium truncate ${
                                    isAcsedHome
                                      ? "text-navy font-bold"
                                      : "text-gray-600"
                                  }`}
                                >
                                  {homeTeamName}
                                </span>
                              </div>

                              <span className="text-xs md:text-sm text-gray-400 font-medium flex-shrink-0">
                                vs
                              </span>

                              {/* Away Team */}
                              <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                                <span
                                  className={`text-xs md:text-sm font-medium truncate text-right ${
                                    isAcsedAway
                                      ? "text-navy font-bold"
                                      : "text-gray-600"
                                  }`}
                                >
                                  {awayTeamName}
                                </span>
                                <TeamLogo
                                  teamId={m.awayTeam?.id ?? 0}
                                  teamName={awayTeamName}
                                  logoUrl={m.awayTeam?.logoUrl ?? null}
                                  size="md"
                                  className="h-12 w-12 md:h-16 md:w-16"
                                  textSize="text-[16px] md:text-[20px]"
                                />
                              </div>
                            </div>

                            {/* Fecha, Hora, Cancha */}
                            <div className="flex flex-wrap justify-center gap-3 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <span>📅</span>
                                <span>{dateStr}</span>
                              </span>
                              <span className="flex items-center gap-1">
                                <span>🕐</span>
                                <span>{timeStr}</span>
                              </span>
                              {m.venue && (
                                <span className="flex items-center gap-1">
                                  <span>🏟️</span>
                                  <span>{m.venue}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Partidos Jugados */}
                {playedMatches.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 mb-3">
                      RESULTADOS
                    </h3>
                    <div className="space-y-2 md:space-y-3">
                      {playedMatches.reverse().map((m) => {
                        const homeTeamName = m.homeTeam?.name ?? "TBD";
                        const awayTeamName = m.awayTeam?.name ?? "TBD";
                        const isAcsedHome = isACSED(m.homeTeam?.name);
                        const isAcsedAway = isACSED(m.awayTeam?.name);
                        const matchDate = new Date(m.date);
                        const dateStr = matchDate.toLocaleDateString("es-CL", {
                          day: "numeric",
                          month: "short",
                        });

                        return (
                          <div
                            key={m.id}
                            className="bg-white rounded-lg md:rounded-xl px-3 md:px-5 py-3 md:py-4 border border-cream-dark/30 hover:shadow-md transition-shadow min-w-0"
                          >
                            <div className="flex items-center gap-2 md:gap-3">
                              {/* Home Team */}
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <TeamLogo
                                  teamId={m.homeTeam?.id ?? 0}
                                  teamName={homeTeamName}
                                  logoUrl={m.homeTeam?.logoUrl ?? null}
                                  size="md"
                                  className="h-12 w-12 md:h-16 md:w-16"
                                  textSize="text-[16px] md:text-[20px]"
                                />
                                <span
                                  className={`text-xs md:text-sm font-medium truncate ${
                                    isAcsedHome
                                      ? "text-navy font-bold"
                                      : "text-gray-600"
                                  }`}
                                >
                                  {homeTeamName}
                                </span>
                              </div>

                              <span className="font-bold text-sm md:text-xl text-navy tabular-nums whitespace-nowrap flex-shrink-0">
                                {m.homeScore ?? "?"} — {m.awayScore ?? "?"}
                              </span>

                              {/* Away Team */}
                              <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                                <span
                                  className={`text-xs md:text-sm font-medium truncate text-right ${
                                    isAcsedAway
                                      ? "text-navy font-bold"
                                      : "text-gray-600"
                                  }`}
                                >
                                  {awayTeamName}
                                </span>
                                <TeamLogo
                                  teamId={m.awayTeam?.id ?? 0}
                                  teamName={awayTeamName}
                                  logoUrl={m.awayTeam?.logoUrl ?? null}
                                  size="md"
                                  className="h-12 w-12 md:h-16 md:w-16"
                                  textSize="text-[16px] md:text-[20px]"
                                />
                              </div>
                            </div>

                            <div className="flex flex-wrap justify-center gap-3 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <span>📅</span>
                                <span>{dateStr}</span>
                              </span>
                              {m.venue && (
                                <span className="flex items-center gap-1">
                                  <span>🏟️</span>
                                  <span>{m.venue}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Team Gallery */}
            <section className="min-w-0">
              <div className="mb-4">
                <h2 className="text-lg md:text-2xl font-bold text-navy">
                  Nuestro Equipo
                </h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {["team-1.webp", "team-2.webp", "team-3.webp", "team-4.webp"].map(
                  (img, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-square rounded-xl md:rounded-2xl overflow-hidden group cursor-pointer shadow-lg hover:shadow-2xl transition-all duration-300"
                    >
                      <img
                        src={`/${img}`}
                        alt={`AC SED Team ${idx + 1}`}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-navy/0 group-hover:bg-navy/20 transition-colors duration-300"></div>
                    </div>
                  )
                )}
              </div>
            </section>
          </div>

          {/* Right: latest news */}
          <div className="min-w-0">
            <div className="flex items-center justify-between mb-4 gap-2">
              <h2 className="text-lg md:text-2xl font-bold text-navy">
                Noticias
              </h2>
              <Link
                href="/news"
                className="text-xs md:text-sm text-wheat hover:underline font-medium whitespace-nowrap flex-shrink-0"
              >
                Ver todas →
              </Link>
            </div>
            {latestNews.length === 0 ? (
              <p className="text-gray-400 text-sm">
                Sin noticias publicadas aún.
              </p>
            ) : (
              <div className="space-y-3 md:space-y-4">
                {latestNews.map((article) => (
                  <NewsCard key={article.id} article={article} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

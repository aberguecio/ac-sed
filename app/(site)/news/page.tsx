import { prisma } from '@/lib/db'
import { NewsCard } from '@/components/news-card'
import { NewsletterSignup } from '@/components/newsletter-signup'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Noticias',
  description: 'Noticias, crónicas y resúmenes de los partidos de AC SED en Liga B Chile.',
  alternates: { canonical: '/news' },
  openGraph: {
    title: 'Noticias — AC SED',
    description: 'Noticias, crónicas y resúmenes de los partidos de AC SED en Liga B Chile.',
    url: '/news',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Noticias — AC SED',
    description: 'Noticias, crónicas y resúmenes de los partidos de AC SED en Liga B Chile.',
  },
}
export const revalidate = 60

interface PhaseGroup {
  tournamentId: number | null
  stageId: number | null
  groupId: number | null
  phaseName: string
  dateRange: { start: Date; end: Date }
  news: any[]
}

interface Props {
  searchParams: Promise<{ page?: string }>
}

export default async function NewsPage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1'))
  const phasesPerPage = 2

  // Get all distinct phases from matches
  const allPhases = await prisma.match.groupBy({
    by: ['tournamentId', 'stageId', 'groupId'],
    orderBy: [
      { tournamentId: 'desc' },
      { stageId: 'desc' },
      { groupId: 'desc' },
    ],
  })

  const totalPhases = allPhases.length
  const totalPages = Math.ceil(totalPhases / phasesPerPage)

  // Get phases for current page
  const phases = allPhases.slice((page - 1) * phasesPerPage, page * phasesPerPage)

  // Build phase groups with news
  const phaseGroupsRaw = await Promise.all(
    phases.map(async (phase) => {
      // Get all matches in this phase to determine date range
      const phaseMatches = await prisma.match.findMany({
        where: {
          tournamentId: phase.tournamentId,
          stageId: phase.stageId,
          groupId: phase.groupId,
        },
        select: { date: true, id: true },
        orderBy: { date: 'asc' },
      })

      if (phaseMatches.length === 0) {
        return null
      }

      // Get tournament info
      const tournament = phase.tournamentId ? await prisma.tournament.findUnique({
        where: { id: phase.tournamentId },
        select: { name: true },
      }) : null

      // Get stage info
      const stage = phase.stageId ? await prisma.stage.findUnique({
        where: { id: phase.stageId },
        select: { name: true },
      }) : null

      // Get group info
      const group = phase.groupId ? await prisma.group.findUnique({
        where: { id: phase.groupId },
        select: { name: true },
      }) : null

      const dateRange = {
        start: phaseMatches[0].date,
        end: phaseMatches[phaseMatches.length - 1].date,
      }

      // Get news from this phase (either linked to phase matches OR within date range)
      const matchIds = phaseMatches.map((m) => m.id)

      const news = await prisma.newsArticle.findMany({
        where: {
          published: true,
          OR: [
            { matchId: { in: matchIds } },
            {
              AND: [
                { generatedAt: { gte: dateRange.start } },
                { generatedAt: { lte: dateRange.end } },
              ],
            },
          ],
        },
        orderBy: { generatedAt: 'desc' },
      })

      const tournamentName = tournament?.name || `Torneo ${phase.tournamentId}`
      const stageName = stage?.name || `Fase ${phase.stageId}`
      const groupName = group?.name || `Grupo ${phase.groupId}`

      const phaseName = `${tournamentName} - ${stageName} - ${groupName}`

      return {
        tournamentId: phase.tournamentId,
        stageId: phase.stageId,
        groupId: phase.groupId,
        phaseName,
        dateRange,
        news,
      }
    })
  )

  const validPhaseGroups = phaseGroupsRaw.filter((g): g is PhaseGroup => g !== null)

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-extrabold text-navy mb-8">Noticias</h1>

      {validPhaseGroups.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg mb-10">No hay noticias publicadas aún.</p>
          <NewsletterSignup />
        </div>
      ) : (
        <>
          {/* Phase groups */}
          <div className="space-y-12">
            {validPhaseGroups.map((phaseGroup, idx) => (
              <div key={`${phaseGroup.tournamentId}-${phaseGroup.stageId}-${phaseGroup.groupId}`}>
                {/* Phase header */}
                <div className="mb-6 border-b-2 border-wheat pb-2">
                  <h2 className="text-2xl font-bold text-navy">{phaseGroup.phaseName}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {phaseGroup.dateRange.start.toLocaleDateString('es-ES')} - {phaseGroup.dateRange.end.toLocaleDateString('es-ES')}
                  </p>
                </div>

                {/* News in this phase */}
                {phaseGroup.news.length === 0 ? (
                  <p className="text-gray-400 text-sm italic">No hay noticias en esta fase.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {phaseGroup.news.map((article) => (
                      <NewsCard key={article.id} article={article} />
                    ))}
                  </div>
                )}
              </div>
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

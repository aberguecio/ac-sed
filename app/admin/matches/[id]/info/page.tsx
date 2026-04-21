import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { TeamLogo } from '@/components/team-logo'
import { MatchContextEditor } from './match-context-editor'
import { GoalsAssistsEditor } from './goals-assists-editor'
import { LockToggle } from './lock-toggle'
import { ACSED_TEAM_NAME } from '@/lib/team-utils'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MatchInfoPage({ params }: PageProps) {
  const { id } = await params
  const matchId = parseInt(id)
  if (!Number.isFinite(matchId)) notFound()

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      homeTeam: true,
      awayTeam: true,
      stage: true,
      goals: {
        where: {
          teamName: ACSED_TEAM_NAME,
        },
        include: {
          scrapedPlayer: true,
          assistPlayer: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!match) notFound()

  // Get all players for the assist selector (only those with leaguePlayerId)
  const players = await prisma.player.findMany({
    where: { active: true, leaguePlayerId: { not: null } },
    orderBy: [{ number: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, number: true, leaguePlayerId: true },
  })

  return (
    <div className="p-4 sm:p-8">
      <Link href="/admin/matches" className="text-xs text-gray-500 hover:text-navy mb-2 inline-block">
        ← Volver a partidos
      </Link>

      {/* Match Header with Lock Status */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <div className="flex items-center gap-3">
            {match.homeTeam && (
              <TeamLogo
                teamId={match.homeTeam.id}
                teamName={match.homeTeam.name}
                logoUrl={match.homeTeam.logoUrl}
                size="md"
              />
            )}
            <span className="text-lg font-bold text-navy">{match.homeTeam?.name ?? '—'}</span>
            {match.homeScore != null && match.awayScore != null && (
              <span className="text-lg font-bold text-gray-600">
                {match.homeScore} - {match.awayScore}
              </span>
            )}
            <span className="text-gray-400">vs</span>
            <span className="text-lg font-bold text-navy">{match.awayTeam?.name ?? '—'}</span>
            {match.awayTeam && (
              <TeamLogo
                teamId={match.awayTeam.id}
                teamName={match.awayTeam.name}
                logoUrl={match.awayTeam.logoUrl}
                size="md"
              />
            )}
          </div>
          <div className="text-sm text-gray-500">
            <div>
              {new Date(match.date).toLocaleString('es-CL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
            {match.venue && <div className="text-xs text-gray-400">{match.venue}</div>}
          </div>
        </div>

        {/* Lock Status Banner */}
        {match.eventsLocked ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3">
            <span className="text-lg">🔒</span>
            <div className="flex-1 text-sm">
              <p className="font-medium text-amber-900">Partido bloqueado contra scraper</p>
              <p className="text-amber-700 text-xs mt-1">
                El scraper NO sobreescribirá los goles/asistencias de este partido. Tus ediciones manuales están protegidas.
              </p>
            </div>
            <LockToggle matchId={matchId} initialLocked={match.eventsLocked} />
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-3">
            <span className="text-lg">🔓</span>
            <div className="flex-1 text-sm">
              <p className="font-medium text-blue-900">Partido desbloqueado</p>
              <p className="text-blue-700 text-xs mt-1">
                El scraper puede actualizar los goles/asistencias automáticamente. Se bloqueará automáticamente al editar goles/asistencias.
              </p>
            </div>
            <LockToggle matchId={matchId} initialLocked={match.eventsLocked} />
          </div>
        )}
      </div>

      {/* Match Context Section */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 className="text-lg font-bold text-navy mb-4">Contexto del Partido</h2>
        <p className="text-sm text-gray-500 mb-4">
          Agrega información adicional sobre el partido (clima, lesiones, contexto especial, etc.) que será usada por la IA para generar noticias y posts de Instagram.
        </p>
        <MatchContextEditor matchId={matchId} initialContext={match.context} />
      </div>

      {/* Goals and Assists Section */}
      {match.goals.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-navy mb-4">Goles y Asistencias</h2>
          <p className="text-sm text-gray-500 mb-4">
            Asigna asistencias a cada gol. Esta información será usada en noticias y posts de Instagram.
          </p>
          <GoalsAssistsEditor matchId={matchId} goals={match.goals} players={players} />
        </div>
      )}

      {match.goals.length === 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-6 text-center">
          <p className="text-gray-400 text-sm">No hay goles registrados para este partido.</p>
        </div>
      )}
    </div>
  )
}

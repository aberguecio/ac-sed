import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { TeamLogo } from '@/components/team-logo'
import { PUBLIC_PLAYER_SELECT } from '@/lib/player-utils'
import { AttendanceEditor } from './attendance-editor'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AttendancePage({ params }: PageProps) {
  const { id } = await params
  const matchId = parseInt(id)
  if (!Number.isFinite(matchId)) notFound()

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true, stage: true },
  })
  if (!match) notFound()

  const [players, playerMatches] = await Promise.all([
    prisma.player.findMany({
      where: { active: true },
      orderBy: [{ number: 'asc' }, { name: 'asc' }],
      select: {
        ...PUBLIC_PLAYER_SELECT,
        phoneNumber: true,
      },
    }),
    prisma.playerMatch.findMany({ where: { matchId } }),
  ])

  const byPlayerId = new Map(playerMatches.map(pm => [pm.playerId, pm]))
  const rows = players.map(player => ({
    player,
    playerMatch: byPlayerId.get(player.id) ?? null,
  }))

  const hasAnyRow = playerMatches.length > 0

  return (
    <div className="p-4 sm:p-8">
      <Link href="/admin/matches" className="text-xs text-gray-500 hover:text-navy mb-2 inline-block">
        ← Volver a partidos
      </Link>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
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
            {match.venue && <div>{match.venue}</div>}
          </div>
        </div>
      </div>

      <AttendanceEditor matchId={matchId} initialRows={rows} initialized={hasAnyRow} />
    </div>
  )
}

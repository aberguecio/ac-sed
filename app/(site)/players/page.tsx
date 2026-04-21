import { prisma } from '@/lib/db'
import { PlayerCard } from '@/components/player-card'
import { PUBLIC_PLAYER_SELECT } from '@/lib/player-utils'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Plantel',
  description: 'Plantel oficial de AC SED: jugadores, posiciones, números y estadísticas de goles en Liga B Chile.',
  alternates: { canonical: '/players' },
  openGraph: {
    title: 'Plantel — AC SED',
    description: 'Plantel oficial de AC SED: jugadores, posiciones y estadísticas.',
    url: '/players',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Plantel — AC SED',
    description: 'Plantel oficial de AC SED: jugadores, posiciones y estadísticas.',
  },
}
export const revalidate = 300

export default async function PlayersPage() {
  // Get current tournament/phase info
  const latestMatch = await prisma.match.findFirst({
    orderBy: { date: 'desc' },
    select: { tournamentId: true, stageId: true, groupId: true }
  })

  const players = await prisma.player.findMany({
    where: { active: true },
    select: {
      ...PUBLIC_PLAYER_SELECT,
    },
    orderBy: [{ number: 'asc' }, { name: 'asc' }],
  })

  // Get all goals from MatchGoal and count by leaguePlayerId
  const allGoals = await prisma.matchGoal.findMany({
    select: {
      leaguePlayerId: true,
      match: {
        select: {
          tournamentId: true,
          stageId: true,
          groupId: true
        }
      }
    }
  })

  // Calculate stats for each player
  const playersWithStats = players.map(player => {
    if (!player.leaguePlayerId) {
      return { ...player, totalGoals: 0, currentPhaseGoals: 0 }
    }

    const playerGoals = allGoals.filter(g => g.leaguePlayerId === player.leaguePlayerId)
    const totalGoals = playerGoals.length
    const currentPhaseGoals = latestMatch
      ? playerGoals.filter(g =>
          g.match.tournamentId === latestMatch.tournamentId &&
          g.match.stageId === latestMatch.stageId &&
          g.match.groupId === latestMatch.groupId
        ).length
      : 0

    return {
      ...player,
      totalGoals,
      currentPhaseGoals
    }
  })

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-extrabold text-navy mb-8">Plantel</h1>

      {players.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg">No hay jugadores registrados aún.</p>
          <p className="text-gray-400 text-sm mt-2">Los jugadores pueden añadirse desde el panel de administración.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {playersWithStats.map((player) => (
            <PlayerCard key={player.id} player={player} />
          ))}
        </div>
      )}
    </div>
  )
}

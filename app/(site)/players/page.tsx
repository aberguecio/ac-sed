import { prisma } from '@/lib/db'
import { PlayerCard } from '@/components/player-card'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Plantel — AC SED' }
export const revalidate = 300

export default async function PlayersPage() {
  const players = await prisma.player.findMany({
    where: { active: true },
    orderBy: [{ number: 'asc' }, { name: 'asc' }],
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
          {players.map((player) => (
            <PlayerCard key={player.id} player={player} />
          ))}
        </div>
      )}
    </div>
  )
}

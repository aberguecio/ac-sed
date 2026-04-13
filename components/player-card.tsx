import type { Player } from '@prisma/client'
import { HexagonStats } from './hexagon-stats'

interface Props {
  player: Player
}

function getInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

const POSITION_LABELS: Record<string, string> = {
  GK: 'Arquero',
  goalkeeper: 'Arquero',
  arquero: 'Arquero',
  DF: 'Defensa',
  defender: 'Defensa',
  defensa: 'Defensa',
  MF: 'Mediocampista',
  midfielder: 'Mediocampista',
  mediocampista: 'Mediocampista',
  FW: 'Delantero',
  forward: 'Delantero',
  delantero: 'Delantero',
}

function hasAnyStats(player: Player) {
  return (
    player.statRitmo != null ||
    player.statDisparo != null ||
    player.statPase != null ||
    player.statRegate != null ||
    player.statDefensa != null ||
    player.statFisico != null
  )
}

export function PlayerCard({ player }: Props) {
  const posLabel = player.position
    ? POSITION_LABELS[player.position.toLowerCase()] ?? player.position
    : null

  const showStats = hasAnyStats(player)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-cream-dark/30 overflow-hidden text-center hover:shadow-md transition-shadow">
      <div className="bg-navy pt-6 pb-3 px-4">
        {player.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.photoUrl}
            alt={player.name}
            className="w-20 h-20 rounded-full mx-auto object-cover border-2 border-wheat"
          />
        ) : (
          <div className="w-20 h-20 rounded-full mx-auto bg-wheat flex items-center justify-center text-navy font-bold text-xl">
            {getInitials(player.name)}
          </div>
        )}
        {player.number && (
          <span className="mt-2 inline-block bg-wheat/20 text-wheat text-xs font-bold px-2 py-0.5 rounded">
            #{player.number}
          </span>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-bold text-navy text-base leading-tight">{player.name}</h3>
        {posLabel && <p className="text-sm text-wheat mt-1">{posLabel}</p>}
        {player.bio && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{player.bio}</p>}
      </div>

      {showStats && (
        <div className="bg-navy px-2 pb-4 flex justify-center">
          <HexagonStats
            stats={{
              statRitmo: player.statRitmo,
              statDisparo: player.statDisparo,
              statPase: player.statPase,
              statRegate: player.statRegate,
              statDefensa: player.statDefensa,
              statFisico: player.statFisico,
            }}
            size={160}
          />
        </div>
      )}
    </div>
  )
}

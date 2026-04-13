import type { Standing, Team } from '@prisma/client'
import clsx from 'clsx'

interface Props {
  standings: (Standing & { team: Team })[]
  highlightTeam?: string
}

export function StandingsTable({ standings, highlightTeam = 'ACSED' }: Props) {
  if (standings.length === 0) {
    return <p className="text-center text-sm text-gray-400 py-6">Sin datos de tabla disponibles.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="bg-navy text-cream text-left">
            <th className="px-3 py-2 w-8">#</th>
            <th className="px-3 py-2">Equipo</th>
            <th className="px-3 py-2 text-center">PJ</th>
            <th className="px-3 py-2 text-center">PG</th>
            <th className="px-3 py-2 text-center">PE</th>
            <th className="px-3 py-2 text-center">PP</th>
            <th className="px-3 py-2 text-center">GF</th>
            <th className="px-3 py-2 text-center">GC</th>
            <th className="px-3 py-2 text-center font-bold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => {
            const teamName = s.team.name
            const isAcsed = teamName.toUpperCase().includes(highlightTeam)
            return (
              <tr
                key={s.id}
                className={clsx(
                  'border-b border-cream-dark/30',
                  isAcsed ? 'bg-wheat/20 font-semibold' : 'hover:bg-cream-dark/30'
                )}
              >
                <td className="px-3 py-2 text-gray-500">{s.position}</td>
                <td className="px-3 py-2">
                  {isAcsed ? <span className="text-navy font-bold">{teamName}</span> : teamName}
                </td>
                <td className="px-3 py-2 text-center">{s.played}</td>
                <td className="px-3 py-2 text-center">{s.won}</td>
                <td className="px-3 py-2 text-center">{s.drawn}</td>
                <td className="px-3 py-2 text-center">{s.lost}</td>
                <td className="px-3 py-2 text-center">{s.goalsFor}</td>
                <td className="px-3 py-2 text-center">{s.goalsAgainst}</td>
                <td className="px-3 py-2 text-center font-bold text-navy">{s.points}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

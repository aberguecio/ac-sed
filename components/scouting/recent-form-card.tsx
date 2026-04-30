'use client'

import type { RecentFormResult, RecentFormTeam } from '@/lib/scouting/types'
import { FormulaTag } from './formula-tag'

export function RecentFormCard({
  data,
  acsedName,
  rivalName,
}: {
  data: RecentFormResult
  acsedName: string
  rivalName: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      <h3 className="text-md font-bold text-navy px-4 py-2 bg-gray-50 flex items-center gap-2">
        Forma reciente
        <FormulaTag
          formula="ratio = puntos / (3·N) ; trend = avg(GD 2ª mitad) − avg(GD 1ª mitad)"
          explanation="Últimos 10 partidos de cualquier torneo. ratio en [0,1]. trend > 0 = mejorando (más GD en la mitad reciente)."
        />
      </h3>
      <div className="p-4 space-y-4">
        <TeamRow name={acsedName} team={data.acsed} />
        <TeamRow name={rivalName} team={data.rival} />
      </div>
    </div>
  )
}

function TeamRow({ name, team }: { name: string; team: RecentFormTeam }) {
  const ratio = Math.round(team.pointsRatio * 100)
  const trendArrow = team.trend > 0.1 ? '↗' : team.trend < -0.1 ? '↘' : '→'
  const trendColor = team.trend > 0.1 ? 'text-green-600' : team.trend < -0.1 ? 'text-red-600' : 'text-gray-500'

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <div className="text-sm font-semibold text-navy">{name}</div>
        <div className="text-xs text-gray-500">
          <span className={trendColor}>{trendArrow}</span> {ratio}% pts
        </div>
      </div>
      <div className="flex gap-1">
        {team.results.length === 0 ? (
          <span className="text-xs text-gray-400">Sin partidos.</span>
        ) : (
          team.results.map((r, i) => (
            <span
              key={i}
              className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center ${
                r === 'W'
                  ? 'bg-green-500 text-white'
                  : r === 'L'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-300 text-gray-700'
              }`}
            >
              {r}
            </span>
          ))
        )}
      </div>
      {team.currentStreak && team.currentStreak.length >= 2 && (
        <div className="text-[11px] text-gray-500 mt-1">
          Racha actual: {team.currentStreak.length} {team.currentStreak.type === 'W' ? 'victorias' : team.currentStreak.type === 'L' ? 'derrotas' : 'empates'}
        </div>
      )}
    </div>
  )
}

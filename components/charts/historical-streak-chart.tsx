'use client'

import { cleanTournamentName } from '@/lib/string-utils'

interface StreakData {
  date: string
  tournamentId: number
  tournamentName: string
  stageId: number
  stageName: string
  groupId: number
  opponent: string
  goalsFor: number
  goalsAgainst: number
  result: 'W' | 'D' | 'L'
}

interface Props {
  data: StreakData[]
}

export function HistoricalStreakChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
          🔄 Racha Histórica de Resultados por Fase
        </h2>
        <div className="p-4">
          <p className="text-gray-400 text-center py-8">No hay datos disponibles</p>
        </div>
      </div>
    )
  }

  const getResultColor = (result: string) => {
    if (result === 'W') return 'bg-green-500'
    if (result === 'L') return 'bg-red-500'
    return 'bg-gray-400'
  }

  const getResultIcon = (result: string) => {
    if (result === 'W') return 'V'
    if (result === 'L') return 'D'
    return 'E'
  }

  // Group matches by phase
  const phaseGroups = new Map<string, StreakData[]>()
  data.forEach((match) => {
    const phaseKey = `${match.tournamentId}-${match.stageId}-${match.groupId}`
    if (!phaseGroups.has(phaseKey)) {
      phaseGroups.set(phaseKey, [])
    }
    phaseGroups.get(phaseKey)!.push(match)
  })

  // Convert to array for rendering
  const phases = Array.from(phaseGroups.entries()).map(([phaseKey, matches]) => {
    const firstMatch = matches[0]
    return {
      phaseKey,
      stageName: firstMatch.stageName,
      tournamentName: firstMatch.tournamentName,
      groupId: firstMatch.groupId,
      matches,
    }
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
      <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
        🔄 Racha Histórica de Resultados por Fase
      </h2>
      <div className="p-4">
        <div className="overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {phases.map((phase) => (
              <div key={phase.phaseKey} className="flex flex-col gap-1">
                {/* Phase header */}
                <div className="mb-2 text-center">
                  <p className="text-xs font-semibold text-gray-700 whitespace-nowrap">
                    {phase.stageName}
                  </p>
                  <p className="text-[10px] text-gray-500 whitespace-nowrap">
                    {cleanTournamentName(phase.tournamentName)}
                  </p>
                </div>

                {/* Matches in this phase (vertical) */}
                <div className="flex flex-col gap-1">
                  {phase.matches.map((match, matchIdx) => (
                    <div
                      key={matchIdx}
                      className={`w-12 h-12 ${getResultColor(
                        match.result
                      )} rounded flex items-center justify-center text-white font-bold text-sm cursor-pointer hover:scale-110 transition-transform group relative`}
                      title={`${match.opponent} ${match.goalsFor}-${match.goalsAgainst} (${new Date(match.date).toLocaleDateString('es-CL')})`}
                    >
                      {getResultIcon(match.result)}

                      {/* Tooltip on hover */}
                      <div className="hidden group-hover:block absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                        <div className="text-center">
                          <p className="font-bold">J{matchIdx + 1}: {match.opponent}</p>
                          <p>{match.goalsFor} - {match.goalsAgainst}</p>
                          <p className="text-gray-300">{new Date(match.date).toLocaleDateString('es-CL')}</p>
                        </div>
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Match count */}
                <div className="mt-1 text-center">
                  <p className="text-[10px] text-gray-500">{phase.matches.length} partidos</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex gap-4 justify-center text-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-green-500 rounded flex items-center justify-center text-white text-xs font-bold">
              V
            </div>
            <span className="text-gray-600">Victoria</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gray-400 rounded flex items-center justify-center text-white text-xs font-bold">
              E
            </div>
            <span className="text-gray-600">Empate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-red-500 rounded flex items-center justify-center text-white text-xs font-bold">
              D
            </div>
            <span className="text-gray-600">Derrota</span>
          </div>
        </div>

        <div className="mt-4 text-center text-sm text-gray-600">
          <p>Cada columna representa una fase. Scroll horizontal para ver todas las fases. Pasa el cursor sobre cada resultado para ver detalles.</p>
        </div>
      </div>
    </div>
  )
}

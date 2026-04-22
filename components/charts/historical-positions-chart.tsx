'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts'
import { cleanTournamentName } from '@/lib/string-utils'

interface PositionData {
  tournamentId: number
  tournamentName: string
  stageId: number
  stageName: string
  groupName: string
  groupId: number
  position: number
  points: number
  matchNumber: number
  date: string
  opponent: string
  result: string
}

interface Props {
  data: PositionData[]
}

const PHASE_COLORS = [
  '#1e3a8a', // navy
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#0ea5e9', // sky
  '#a855f7', // violet
  '#f43f5e', // rose
]

export function HistoricalPositionsChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
          🏆 Evolución Histórica de Posiciones (Por Partido)
        </h2>
        <div className="p-4">
          <p className="text-gray-400 text-center py-8">No hay datos disponibles</p>
        </div>
      </div>
    )
  }

  // Group data by phase (tournament + stage + group)
  const phaseGroups = new Map<string, PositionData[]>()
  data.forEach((d) => {
    const phaseKey = `${d.tournamentId}-${d.stageId}-${d.groupId}`
    if (!phaseGroups.has(phaseKey)) {
      phaseGroups.set(phaseKey, [])
    }
    phaseGroups.get(phaseKey)!.push(d)
  })

  // Create preliminary phase info
  const preliminaryPhases = Array.from(phaseGroups.entries()).map(([phaseKey, matches], idx) => {
    const firstMatch = matches[0]
    return {
      phaseKey,
      dataKey: `phase_${phaseKey}`,
      name: `${firstMatch.stageName}${firstMatch.groupName ? ` (${firstMatch.groupName})` : ''}`,
      color: PHASE_COLORS[idx % PHASE_COLORS.length],
      tournamentName: firstMatch.tournamentName,
    }
  })

  // Create chart data with all points, each phase has its own dataKey
  const chartData = data.map((d, idx) => {
    const phaseKey = `${d.tournamentId}-${d.stageId}-${d.groupId}`
    const dataPoint: any = {
      globalIndex: idx + 1,
      label: `${d.stageName}${d.groupName ? ` (${d.groupName})` : ''} - P${d.matchNumber}`,
      opponent: d.opponent,
      points: d.points,
      result: d.result,
      stageName: d.stageName,
      groupName: d.groupName,
      phaseKey,
    }

    // Set position for this phase only, null for others
    preliminaryPhases.forEach((phase) => {
      if (phase.phaseKey === phaseKey) {
        dataPoint[phase.dataKey] = d.position
      } else {
        dataPoint[phase.dataKey] = null
      }
    })

    return dataPoint
  })

  // Now add index ranges to phases
  const phases = preliminaryPhases.map((phase) => {
    const firstIndex = chartData.findIndex((d) => d.phaseKey === phase.phaseKey)
    const lastIndex = chartData.findLastIndex((d) => d.phaseKey === phase.phaseKey)
    return {
      ...phase,
      startIndex: firstIndex >= 0 ? chartData[firstIndex].globalIndex : 0,
      endIndex: lastIndex >= 0 ? chartData[lastIndex].globalIndex : 0,
    }
  })

  // Get max position for Y axis
  const maxPosition = Math.max(...data.map((d) => d.position))

  // Calculate dynamic width for mobile scroll
  const totalMatches = chartData.length
  const minWidthPerMatch = 30 // pixels per match
  const minWidth = Math.max(800, totalMatches * minWidthPerMatch)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
      <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
        🏆 Evolución Histórica de Posiciones (Por Partido)
      </h2>
      <div className="p-4">
        <div className="overflow-x-auto overflow-y-hidden -mx-4 px-4">
          <div style={{ minWidth: `${minWidth}px`, width: '100%' }}>
            <ResponsiveContainer width="100%" height={300} className="md:!h-[400px]">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="globalIndex"
              label={{ value: 'Partidos', position: 'insideBottom', offset: -5 }}
              stroke="#666"
            />
            <YAxis
              reversed
              domain={[1, maxPosition]}
              label={{ value: 'Posición', angle: -90, position: 'insideLeft' }}
              stroke="#666"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #ccc',
                borderRadius: '8px',
              }}
              labelFormatter={(value, payload: any) => {
                if (payload && payload[0]) {
                  const data = payload[0].payload
                  return `${data.label} vs ${data.opponent}`
                }
                return value
              }}
              formatter={(value: any, name: string, props: any) => {
                if (value === null) return null
                const data = props.payload
                // Find the phase name for this dataKey
                const phase = phases.find(p => p.dataKey === name)
                return [
                  <div key="tooltip" className="text-sm">
                    <p className="font-semibold">{phase?.name}</p>
                    <p>Posición: {value}</p>
                    <p>Puntos: {data.points}</p>
                    <p>Resultado: {data.result}</p>
                  </div>,
                  '',
                ]
              }}
            />
            {/* Background areas for each phase */}
            {phases.map((phase, idx) => (
              <ReferenceArea
                key={`area-${phase.phaseKey}`}
                x1={phase.startIndex}
                x2={phase.endIndex}
                fill={phase.color}
                fillOpacity={0.08}
                strokeOpacity={0}
              />
            ))}

            {/* Reference lines for ascenso and descenso */}
            <ReferenceLine
              y={2}
              stroke="#10b981"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{ value: 'Ascenso', position: 'right', fill: '#10b981', fontSize: 12, fontWeight: 'bold' }}
            />

            {maxPosition >= 4 && (
              <ReferenceLine
                y={maxPosition - 1}
                stroke="#ef4444"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{ value: 'Descenso', position: 'right', fill: '#ef4444', fontSize: 12, fontWeight: 'bold' }}
              />
            )}

            {/* Draw one line per phase using the same chartData */}
            {phases.map((phase) => (
              <Line
                key={phase.phaseKey}
                type="monotone"
                dataKey={phase.dataKey}
                stroke={phase.color}
                strokeWidth={2}
                dot={{ fill: phase.color, r: 4 }}
                activeDot={{ r: 6 }}
                connectNulls={false}
                name={phase.name}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6">
          <p className="text-xs md:text-sm font-semibold text-gray-700 mb-2">Fases:</p>
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-1 md:gap-2">
            {phases.map((phase) => (
              <div key={phase.phaseKey} className="flex items-center gap-1 md:gap-2 text-[10px] md:text-xs">
                <div
                  className="w-6 md:w-8 h-0.5 md:h-1 rounded flex-shrink-0"
                  style={{ backgroundColor: phase.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-700 truncate">{phase.name}</p>
                  <p className="text-gray-500 text-[9px] md:text-[10px] truncate">{cleanTournamentName(phase.tournamentName)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 text-center text-xs md:text-sm text-gray-600">
          <p>Cada columna de color representa una fase. Los puntos muestran la posición después de cada partido.</p>
          <p className="mt-1">Las líneas punteadas marcan la zona de <span className="text-green-600 font-semibold">Ascenso</span> (top 2) y la zona de <span className="text-red-600 font-semibold">Descenso</span>.</p>
        </div>
      </div>
    </div>
  )
}

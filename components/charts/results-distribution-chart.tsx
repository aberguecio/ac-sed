'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'
import { cleanTournamentName } from '@/lib/string-utils'

interface DistributionData {
  tournamentName: string
  wonPct: number
  drawnPct: number
  lostPct: number
  total: number
}

interface Props {
  data: DistributionData[]
}

export function ResultsDistributionChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
          🥧 Distribución de Resultados por Torneo
        </h2>
        <div className="p-4">
          <p className="text-gray-400 text-center py-8">No hay datos disponibles</p>
        </div>
      </div>
    )
  }

  const chartData = data.map((d) => {
    const cleanName = cleanTournamentName(d.tournamentName)
    return {
      name: cleanName.length > 20
        ? cleanName.substring(0, 20) + '...'
        : cleanName,
      fullName: cleanName,
      'Victorias': d.wonPct,
      'Empates': d.drawnPct,
      'Derrotas': d.lostPct,
      total: d.total,
    }
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
      <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
        🥧 Distribución de Resultados por Torneo (%)
      </h2>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis type="number" domain={[0, 100]} unit="%" stroke="#666" />
            <YAxis
              dataKey="name"
              type="category"
              width={150}
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
                  return `${payload[0].payload.fullName} (${payload[0].payload.total} partidos)`
                }
                return value
              }}
              formatter={(value: any) => `${value.toFixed(1)}%`}
            />
            <Legend />
            <Bar dataKey="Victorias" stackId="a" fill="#10b981" />
            <Bar dataKey="Empates" stackId="a" fill="#9ca3af" />
            <Bar dataKey="Derrotas" stackId="a" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 text-center text-sm text-gray-600">
          <p>Porcentaje de victorias, empates y derrotas en cada torneo</p>
        </div>
      </div>
    </div>
  )
}

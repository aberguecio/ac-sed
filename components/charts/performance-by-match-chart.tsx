'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface PerformanceData {
  matchDay: number
  date: string
  opponent: string
  goalsFor: number
  goalsAgainst: number
  result: 'W' | 'D' | 'L'
}

interface Props {
  data: PerformanceData[]
}

export function PerformanceByMatchChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
          🔥 Rendimiento por Partido
        </h2>
        <div className="p-4">
          <p className="text-gray-400 text-center py-8">No hay datos disponibles</p>
        </div>
      </div>
    )
  }

  const chartData = data.map((d) => ({
    ...d,
    goalDifference: d.goalsFor - d.goalsAgainst,
    matchLabel: `J${d.matchDay}`,
  }))

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
      <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
        🔥 Rendimiento por Partido
      </h2>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="matchLabel"
              label={{ value: 'Jornada', position: 'insideBottom', offset: -5 }}
              stroke="#666"
            />
            <YAxis
              label={{ value: 'Goles', angle: -90, position: 'insideLeft' }}
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
                  return `Jornada ${payload[0].payload.matchDay} vs ${payload[0].payload.opponent}`
                }
                return value
              }}
              formatter={(value: any, name: string) => {
                if (name === 'goalsFor') return [value, 'Goles a Favor']
                if (name === 'goalsAgainst') return [value, 'Goles en Contra']
                return [value, name]
              }}
            />
            <Legend />
            <Bar dataKey="goalsFor" fill="#10b981" name="Goles a Favor" />
            <Bar dataKey="goalsAgainst" fill="#ef4444" name="Goles en Contra" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

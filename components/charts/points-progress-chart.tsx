'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface PointsProgressData {
  matchDay: number
  date: string
  points: number
  goalsFor: number
  goalsAgainst: number
}

interface Props {
  data: PointsProgressData[]
}

export function PointsProgressChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
          📊 Progreso de Puntos Acumulados
        </h2>
        <div className="p-4">
          <p className="text-gray-400 text-center py-8">No hay datos disponibles</p>
        </div>
      </div>
    )
  }

  // Calculate ideal pace (assuming 3 points per match for top 2 finish)
  const idealPoints = data.map((d) => ({
    matchDay: d.matchDay,
    idealPoints: d.matchDay * 2.5, // Promedio para zona alta
  }))

  const chartData = data.map((d, idx) => ({
    ...d,
    idealPoints: idealPoints[idx].idealPoints,
  }))

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
      <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
        📊 Progreso de Puntos Acumulados
      </h2>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="matchDay"
              label={{ value: 'Jornada', position: 'insideBottom', offset: -5 }}
              stroke="#666"
            />
            <YAxis
              label={{ value: 'Puntos', angle: -90, position: 'insideLeft' }}
              stroke="#666"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #ccc',
                borderRadius: '8px',
              }}
              labelFormatter={(value) => `Jornada ${value}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="points"
              stroke="#1e3a8a"
              strokeWidth={3}
              dot={{ fill: '#1e3a8a', r: 5 }}
              activeDot={{ r: 7 }}
              name="Puntos Reales"
            />
            <Line
              type="monotone"
              dataKey="idealPoints"
              stroke="#fbbf24"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Ritmo Ideal (Top 2)"
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-4 text-center text-sm text-gray-600">
          <p>
            El "Ritmo Ideal" representa el promedio de puntos necesarios para mantenerse en zona de ascenso (Top 2)
          </p>
        </div>
      </div>
    </div>
  )
}

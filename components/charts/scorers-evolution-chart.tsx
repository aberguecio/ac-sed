'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface ScorerData {
  playerName: string
  data: Array<{ matchDay: number; goals: number }>
}

interface Props {
  data: ScorerData[]
}

const COLORS = [
  '#1e3a8a', // navy
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
]

export function ScorersEvolutionChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
          ⚽ Evolución de Goleadores AC SED
        </h2>
        <div className="p-4">
          <p className="text-gray-400 text-center py-8">No hay datos disponibles</p>
        </div>
      </div>
    )
  }

  // Merge all scorers data into a single array with match days
  const allMatchDays = new Set<number>()
  data.forEach((scorer) => {
    scorer.data.forEach((d) => allMatchDays.add(d.matchDay))
  })

  const chartData = Array.from(allMatchDays)
    .sort((a, b) => a - b)
    .map((matchDay) => {
      const dataPoint: any = { matchDay }
      data.forEach((scorer) => {
        const scorerData = scorer.data.find((d) => d.matchDay === matchDay)
        dataPoint[scorer.playerName] = scorerData ? scorerData.goals : 0
      })
      return dataPoint
    })

  // Only show top 5 scorers to avoid clutter
  const topScorers = data
    .map((scorer) => ({
      ...scorer,
      totalGoals: Math.max(...scorer.data.map((d) => d.goals)),
    }))
    .sort((a, b) => b.totalGoals - a.totalGoals)
    .slice(0, 5)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
      <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
        ⚽ Evolución de Goleadores AC SED
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
              label={{ value: 'Goles Acumulados', angle: -90, position: 'insideLeft' }}
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
            {topScorers.map((scorer, index) => (
              <Line
                key={scorer.playerName}
                type="monotone"
                dataKey={scorer.playerName}
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                name={scorer.playerName}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {topScorers.length > 5 && (
          <div className="mt-4 text-center text-sm text-gray-600">
            <p>Mostrando los top 5 goleadores. Total de goleadores: {data.length}</p>
          </div>
        )}
      </div>
    </div>
  )
}

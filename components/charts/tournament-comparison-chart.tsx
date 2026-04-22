'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { cleanTournamentName } from '@/lib/string-utils'

interface TournamentData {
  tournamentId: number
  tournamentName: string
  stages: Array<{
    stageId: number
    stageName: string
    points: number
    goalsFor: number
    goalsAgainst: number
    won: number
    drawn: number
    lost: number
    position: number
  }>
}

interface Props {
  data: TournamentData[]
}

export function TournamentComparisonChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
          📉 Comparación de Rendimiento entre Torneos
        </h2>
        <div className="p-4">
          <p className="text-gray-400 text-center py-8">No hay datos disponibles</p>
        </div>
      </div>
    )
  }

  // Aggregate stats per tournament (sum across stages)
  const chartData = data.map((tournament) => {
    const totals = tournament.stages.reduce(
      (acc, stage) => ({
        points: acc.points + stage.points,
        goalsFor: acc.goalsFor + stage.goalsFor,
        goalsAgainst: acc.goalsAgainst + stage.goalsAgainst,
        won: acc.won + stage.won,
        played: acc.played + stage.won + stage.drawn + stage.lost,
      }),
      { points: 0, goalsFor: 0, goalsAgainst: 0, won: 0, played: 0 }
    )

    const cleanName = cleanTournamentName(tournament.tournamentName)
    return {
      name: cleanName.length > 20
        ? cleanName.substring(0, 20) + '...'
        : cleanName,
      fullName: cleanName,
      ...totals,
    }
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
      <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
        📉 Comparación de Rendimiento entre Torneos
      </h2>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="name"
              stroke="#666"
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis stroke="#666" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #ccc',
                borderRadius: '8px',
              }}
              labelFormatter={(value, payload: any) => {
                if (payload && payload[0]) {
                  return payload[0].payload.fullName
                }
                return value
              }}
              formatter={(value: any, name: string) => {
                if (name === 'points') return [value, 'Puntos']
                if (name === 'goalsFor') return [value, 'Goles a Favor']
                if (name === 'won') return [value, 'Victorias']
                return [value, name]
              }}
            />
            <Legend />
            <Bar dataKey="points" fill="#1e3a8a" name="Puntos" />
            <Bar dataKey="goalsFor" fill="#10b981" name="Goles" />
            <Bar dataKey="won" fill="#f59e0b" name="Victorias" />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 text-center text-sm text-gray-600">
          <p>Totales acumulados de todas las fases de cada torneo</p>
        </div>
      </div>
    </div>
  )
}

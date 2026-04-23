'use client'

import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts'

interface RadarData {
  acsed: {
    goalsFor: number
    goalsAgainst: number
    points: number
    won: number
    matchesPlayed: number
  }
  divisionAvg: {
    goalsFor: number
    goalsAgainst: number
    points: number
    won: number
    matchesPlayed: number
  }
}

interface Props {
  data: RadarData | null
}

export function RadarComparisonChart({ data }: Props) {
  if (!data) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
          🎯 Comparación de Rendimiento vs Promedio de la División
        </h2>
        <div className="p-4">
          <p className="text-gray-400 text-center py-8">No hay datos disponibles</p>
        </div>
      </div>
    )
  }

  // Evitar división por cero
  const acsedMatches = data.acsed.matchesPlayed || 1
  const divAvgMatches = data.divisionAvg.matchesPlayed || 1

  const chartData = [
    {
      metric: 'Goles pp',
      'AC SED': Number((data.acsed.goalsFor / acsedMatches).toFixed(2)),
      'Promedio División': Number((data.divisionAvg.goalsFor / divAvgMatches).toFixed(2)),
    },
    {
      metric: 'Puntos pp',
      'AC SED': Number((data.acsed.points / acsedMatches).toFixed(2)),
      'Promedio División': Number((data.divisionAvg.points / divAvgMatches).toFixed(2)),
    },
    {
      metric: 'Efectividad',
      'AC SED': Number(((data.acsed.points / (acsedMatches * 3)) * 10).toFixed(2)),
      'Promedio División': Number(((data.divisionAvg.points / (divAvgMatches * 3)) * 10).toFixed(2)),
    },
    {
      metric: 'Ratio GF/GC',
      'AC SED': Number((data.acsed.goalsFor / (data.acsed.goalsAgainst || 1)).toFixed(2)),
      'Promedio División': Number((data.divisionAvg.goalsFor / (data.divisionAvg.goalsAgainst || 1)).toFixed(2)),
    },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
      <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
        🎯 Comparación de Rendimiento vs Promedio de la División
      </h2>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={400}>
          <RadarChart data={chartData}>
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis dataKey="metric" stroke="#666" />
            <PolarRadiusAxis stroke="#666" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #ccc',
                borderRadius: '8px',
              }}
            />
            <Legend />
            <Radar
              name="AC SED"
              dataKey="AC SED"
              stroke="#1e3a8a"
              fill="#1e3a8a"
              fillOpacity={0.6}
            />
            <Radar
              name="Promedio División"
              dataKey="Promedio División"
              stroke="#f59e0b"
              fill="#f59e0b"
              fillOpacity={0.3}
            />
          </RadarChart>
        </ResponsiveContainer>
        <div className="mt-4 text-center text-xs md:text-sm text-gray-600">
          <p>
            <strong>Goles pp:</strong> Goles por partido · <strong>Puntos pp:</strong> Puntos por partido · <strong>Efectividad:</strong> % puntos obtenidos vs posibles (escala 0-10) · <strong>Ratio GF/GC:</strong> Goles a favor / Goles en contra
          </p>
        </div>
      </div>
    </div>
  )
}

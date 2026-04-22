'use client'

import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts'

interface RadarData {
  acsed: {
    goalsFor: number
    goalsAgainst: number
    points: number
    won: number
  }
  divisionAvg: {
    goalsFor: number
    goalsAgainst: number
    points: number
    won: number
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

  const chartData = [
    {
      metric: 'Goles a Favor',
      'AC SED': data.acsed.goalsFor,
      'Promedio División': data.divisionAvg.goalsFor,
    },
    {
      metric: 'Puntos',
      'AC SED': data.acsed.points,
      'Promedio División': data.divisionAvg.points,
    },
    {
      metric: 'Victorias',
      'AC SED': data.acsed.won,
      'Promedio División': data.divisionAvg.won,
    },
    {
      metric: 'Defensa',
      'AC SED': Math.max(0, 10 - data.acsed.goalsAgainst), // Invertir para que más sea mejor
      'Promedio División': Math.max(0, 10 - data.divisionAvg.goalsAgainst),
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
        <div className="mt-4 text-center text-sm text-gray-600">
          <p>
            Comparación de estadísticas clave de AC SED versus el promedio de todos los equipos de la división
          </p>
        </div>
      </div>
    </div>
  )
}

'use client'

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'

interface PerformanceVsOpponent {
  matchDay: number
  opponent: string
  acsedGoalsFor: number | null
  acsedGoalsAgainst: number | null
  avgGoalsFor: number
  avgGoalsAgainst: number
  isFuture: boolean
}

interface Props {
  data: PerformanceVsOpponent[]
}

export function BidirectionalPerformanceChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
          🎯 Rendimiento vs Promedio de la División
        </h2>
        <div className="p-4">
          <p className="text-gray-400 text-center py-8">No hay datos disponibles</p>
        </div>
      </div>
    )
  }

  // Transform data for bidirectional chart
  const chartData = data.map((d) => ({
    matchDay: `J${d.matchDay}${d.isFuture ? ' 🔮' : ''}`,
    opponent: d.opponent,
    isFuture: d.isFuture,
    // AC SED (null for future matches)
    acsedGF: d.acsedGoalsFor !== null ? d.acsedGoalsFor : null,
    acsedGC: d.acsedGoalsAgainst !== null ? -d.acsedGoalsAgainst : null,
    acsedDiff: (d.acsedGoalsFor !== null && d.acsedGoalsAgainst !== null)
      ? d.acsedGoalsFor - d.acsedGoalsAgainst
      : null,
    // Promedio (always shown)
    avgGF: d.avgGoalsFor,
    avgGC: -d.avgGoalsAgainst,
    avgDiff: d.avgGoalsFor - d.avgGoalsAgainst,
  }))

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
      <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
        Rendimiento vs Promedio de la División
      </h2>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={500}>
          <ComposedChart data={chartData} barCategoryGap="15%" barGap={0}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="matchDay"
              stroke="#666"
            />
            <YAxis
              stroke="#666"
              label={{ value: 'Goles', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #ccc',
                borderRadius: '8px',
              }}
              labelFormatter={(value, payload: any) => {
                if (payload && payload[0]) {
                  return `${payload[0].payload.matchDay} vs ${payload[0].payload.opponent}`
                }
                return value
              }}
              formatter={(value: any, name: string) => {
                const absValue = Math.abs(value)
                if (name === 'acsedGF') return [absValue, 'AC SED Goles a Favor']
                if (name === 'avgGF') return [absValue, 'Promedio Goles a Favor']
                if (name === 'acsedGC') return [absValue, 'AC SED Goles en Contra']
                if (name === 'avgGC') return [absValue, 'Promedio Goles en Contra']
                if (name === 'acsedDiff') return [value, 'AC SED Diferencia']
                if (name === 'avgDiff') return [value, 'Promedio Diferencia']
                return [absValue, name]
              }}
            />
            <Legend
              formatter={(value) => {
                if (value === 'acsedGF') return 'AC SED GF'
                if (value === 'avgGF') return 'Promedio GF'
                if (value === 'acsedGC') return 'AC SED GC'
                if (value === 'avgGC') return 'Promedio GC'
                if (value === 'acsedDiff') return 'AC SED Dif'
                if (value === 'avgDiff') return 'Promedio Dif'
                return value
              }}
            />
            <ReferenceLine y={0} stroke="#666" strokeWidth={2} />
            {/* Goals For - Positive */}
            <Bar dataKey="acsedGF" fill="#047857" name="acsedGF" />
            <Bar dataKey="avgGF" fill="#6ee7b7" name="avgGF" />
            {/* Goals Against - Negative */}
            <Bar dataKey="acsedGC" fill="#b91c1c" name="acsedGC" />
            <Bar dataKey="avgGC" fill="#fca5a5" name="avgGC" />
            {/* Difference Lines */}
            <Line type="monotone" dataKey="acsedDiff" stroke="#1e3a8a" strokeWidth={3} dot={{ r: 4 }} name="acsedDiff" connectNulls={false} />
            <Line type="monotone" dataKey="avgDiff" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} name="avgDiff" connectNulls={true} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="mt-4 text-center text-xs md:text-sm text-gray-600">
          <p className="mb-2">
            <strong>Barras:</strong> Goles a favor (arriba) y en contra (abajo) de AC SED vs promedio de otros equipos contra el mismo rival
          </p>
          <p className="mb-2">
            <strong>Líneas:</strong> Diferencia de gol (GF - GC) de AC SED (azul sólido) vs promedio (naranja punteado)
          </p>
          <p className="text-xs text-gray-500">
            🔮 = Partidos futuros (solo se muestran promedios como referencia)
          </p>
        </div>
      </div>
    </div>
  )
}

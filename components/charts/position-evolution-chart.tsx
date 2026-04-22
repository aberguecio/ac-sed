'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

interface PositionEvolutionData {
  matchDay: number
  date: string
  position: number
  points: number
}

interface Props {
  data: PositionEvolutionData[]
}

export function PositionEvolutionChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
          📈 Evolución de la Posición en la Tabla
        </h2>
        <div className="p-4">
          <p className="text-gray-400 text-center py-8">No hay datos disponibles</p>
        </div>
      </div>
    )
  }

  const maxPosition = Math.max(...data.map((d) => d.position))

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
      <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
        📈 Evolución de la Posición en la Tabla
      </h2>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="matchDay"
              label={{ value: 'Jornada', position: 'insideBottom', offset: -5 }}
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
              labelFormatter={(value) => `Jornada ${value}`}
              formatter={(value: any, name: string) => {
                if (name === 'position') return [value, 'Posición']
                return [value, 'Puntos']
              }}
            />
            {/* Zona de ascenso (top 2) */}
            <ReferenceLine
              y={2}
              stroke="#10b981"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{ value: 'Ascenso', position: 'right', fill: '#10b981', fontSize: 12, fontWeight: 'bold' }}
            />
            {/* Zona de descenso (últimos 2) */}
            {maxPosition >= 4 && (
              <ReferenceLine
                y={maxPosition - 1}
                stroke="#ef4444"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{ value: 'Descenso', position: 'right', fill: '#ef4444', fontSize: 12, fontWeight: 'bold' }}
              />
            )}
            <Line
              type="monotone"
              dataKey="position"
              stroke="#1e3a8a"
              strokeWidth={3}
              dot={{ fill: '#1e3a8a', r: 5 }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-4 flex gap-4 justify-center text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 bg-green-500" />
            <span className="text-gray-600">Zona de Ascenso</span>
          </div>
          {maxPosition >= 4 && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-1 bg-red-500" />
              <span className="text-gray-600">Zona de Descenso</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

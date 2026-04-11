'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { StandingsTable } from '@/components/standings-table'
import type { Standing, LeagueScorer } from '@prisma/client'

interface ChartData {
  standings: Standing[]
  scorers: LeagueScorer[]
}

export default function StatsPage() {
  const [data, setData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/stats/chart-data')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10 text-center">
        <p className="text-gray-400">Cargando estadísticas…</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-12">
      <h1 className="text-3xl font-extrabold text-navy">Estadísticas</h1>

      {/* Points chart */}
      {data?.standings && data.standings.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-navy mb-5">Puntos por Equipo</h2>
          <div className="bg-white rounded-xl shadow-sm border border-cream-dark/30 p-6">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.standings} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDE8DC" />
                <XAxis
                  dataKey="teamName"
                  tick={{ fontSize: 11, fill: '#1B2B4B' }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11, fill: '#1B2B4B' }} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #EDE8DC' }}
                  formatter={(v: number) => [`${v} pts`, 'Puntos']}
                />
                <Bar
                  dataKey="points"
                  fill="#C8A96E"
                  radius={[4, 4, 0, 0]}
                  label={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Scorers chart */}
      {data?.scorers && data.scorers.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-navy mb-5">Goleadores</h2>
          <div className="bg-white rounded-xl shadow-sm border border-cream-dark/30 p-6">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.scorers} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDE8DC" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="playerName" type="category" width={130} tick={{ fontSize: 11, fill: '#1B2B4B' }} />
                <Tooltip formatter={(v: number) => [`${v} goles`, 'Goles']} />
                <Bar dataKey="goals" fill="#1B2B4B" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Scorers table */}
          <div className="mt-4 bg-white rounded-xl shadow-sm border border-cream-dark/30 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy text-cream text-left">
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Jugador</th>
                  <th className="px-4 py-2">Equipo</th>
                  <th className="px-4 py-2 text-center">Goles</th>
                </tr>
              </thead>
              <tbody>
                {data.scorers.map((s, i) => (
                  <tr key={s.id} className="border-b border-cream-dark/30 hover:bg-cream-dark/20">
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2 font-medium">{s.playerName}</td>
                    <td className="px-4 py-2 text-gray-600">{s.teamName}</td>
                    <td className="px-4 py-2 text-center font-bold text-navy">{s.goals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Full standings */}
      {data?.standings && data.standings.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-navy mb-5">Tabla de Posiciones</h2>
          <div className="bg-white rounded-xl shadow-sm border border-cream-dark/30 overflow-hidden">
            <StandingsTable standings={data.standings} />
          </div>
        </section>
      )}

      {!data?.standings?.length && !data?.scorers?.length && (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg">No hay estadísticas disponibles.</p>
          <p className="text-gray-400 text-sm mt-2">Ejecutá el scraper desde el panel de administración.</p>
        </div>
      )}
    </div>
  )
}

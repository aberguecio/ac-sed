'use client'

import { useEffect, useState } from 'react'
import { StandingsTable } from '@/components/standings-table'

const TOURNAMENTS = [
  { id: 201, name: 'Apertura 2026', stages: [{ id: 396, name: 'Fase 1' }] },
  { id: 191, name: 'Clausura 2025', stages: [
    { id: 371, name: 'Fase 1' },
    { id: 384, name: 'Fase 2' }
  ]},
  { id: 178, name: 'Apertura 2025', stages: [
    { id: 351, name: 'Fase 1' },
    { id: 360, name: 'Fase 2' }
  ]},
  { id: 172, name: 'Clausura 2024', stages: [
    { id: 322, name: 'Fase 1' },
    { id: 335, name: 'Fase 2' }
  ]},
]

interface TeamStats {
  standings: any[]
  topScorers: any[]
  teamScorers: any[]
  fixtures: any[]
  analysis: string | null
  goalsFor: number
  goalsAgainst: number
  totalMatches: number
  matchesPlayed: number
  matchesRemaining: number
  groupName: string
}

export default function StatsPage() {
  const [selectedTournament, setSelectedTournament] = useState(TOURNAMENTS[0])
  const [selectedStage, setSelectedStage] = useState(TOURNAMENTS[0].stages[0])
  const [stats, setStats] = useState<TeamStats | null>(null)
  const [loading, setLoading] = useState(false)

  async function fetchStats() {
    setLoading(true)
    try {
      const res = await fetch(`/api/stats?tournamentId=${selectedTournament.id}&stageId=${selectedStage.id}`)
      const data = await res.json()
      setStats(data)
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchStats()
  }, [selectedStage])

  const goalsPerMatch = stats && stats.matchesPlayed > 0
    ? (stats.goalsFor / stats.matchesPlayed).toFixed(2)
    : '0.00'

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold text-navy mb-8">Estadísticas</h1>

      {/* Tournament Selector */}
      <div className="bg-white rounded-lg p-4 shadow-sm mb-6">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Torneo</label>
            <select
              value={selectedTournament.id}
              onChange={(e) => {
                const t = TOURNAMENTS.find(t => t.id === Number(e.target.value))!
                setSelectedTournament(t)
                setSelectedStage(t.stages[0])
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            >
              {TOURNAMENTS.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Fase</label>
            <select
              value={selectedStage.id}
              onChange={(e) => {
                const s = selectedTournament.stages.find(s => s.id === Number(e.target.value))!
                setSelectedStage(s)
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            >
              {selectedTournament.stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-navy"></div>
        </div>
      ) : stats ? (
        <>
          {/* Division Badge */}
          {stats.groupName && (
            <div className="text-center mb-6">
              <span className="inline-block bg-navy text-cream px-4 py-2 rounded-lg font-semibold">
                {stats.groupName}
              </span>
            </div>
          )}

          {/* Main Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Standings */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">Tabla de Posiciones</h2>
              <StandingsTable standings={stats.standings} />
            </div>

            {/* Division Top Scorers */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">Goleadores División</h2>
              <div className="p-4">
                {stats.topScorers.length > 0 ? (
                  <div className="space-y-2">
                    {stats.topScorers.slice(0, 10).map((scorer: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center py-2 border-b last:border-0">
                        <div>
                          <span className="font-semibold">{idx + 1}. {scorer.playerName}</span>
                          <span className="text-sm text-gray-500 ml-2">({scorer.teamName})</span>
                        </div>
                        <span className="font-bold text-navy">{scorer.goals}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-center py-8">Sin goleadores registrados</p>
                )}
              </div>
            </div>
          </div>

          {/* Team Stats Row */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* AC SED Scorers */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">Goleadores AC SED</h2>
              <div className="p-4">
                {stats.teamScorers.length > 0 ? (
                  <div className="space-y-2">
                    {stats.teamScorers.map((scorer: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center py-2 border-b last:border-0">
                        <span className="font-semibold">{scorer.playerName}</span>
                        <span className="font-bold text-navy">{scorer.goals} gol{scorer.goals !== 1 ? 'es' : ''}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-center py-8">Sin goles registrados</p>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">Estadísticas del Torneo</h2>
              <div className="p-4 grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-navy">{stats.goalsFor}</p>
                  <p className="text-sm text-gray-500">Goles a Favor</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-red-500">{stats.goalsAgainst}</p>
                  <p className="text-sm text-gray-500">Goles en Contra</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-wheat">{goalsPerMatch}</p>
                  <p className="text-sm text-gray-500">Goles por Partido</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-500">{stats.matchesPlayed}/{stats.totalMatches}</p>
                  <p className="text-sm text-gray-500">Partidos Jugados</p>
                </div>
              </div>
            </div>
          </div>

          {/* AI Analysis */}
          {stats.analysis && (
            <div className="bg-gradient-to-r from-navy to-navy-light text-cream rounded-xl p-6 shadow-lg">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                🎯 Análisis del Coach
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="whitespace-pre-wrap">{stats.analysis}</p>
              </div>
            </div>
          )}

          {/* Remaining Fixtures */}
          {stats.matchesRemaining > 0 && (
            <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
                Próximos Partidos ({stats.matchesRemaining})
              </h2>
              <div className="p-4 space-y-2">
                {stats.fixtures.filter((f: any) => !f.homeScore && !f.awayScore).map((match: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center py-2 border-b last:border-0">
                    <span className={match.homeTeam.includes('SED') ? 'font-bold' : ''}>{match.homeTeam}</span>
                    <span className="text-gray-400">vs</span>
                    <span className={match.awayTeam.includes('SED') ? 'font-bold' : ''}>{match.awayTeam}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-center text-gray-400 py-12">No hay datos disponibles</p>
      )}
    </div>
  )
}
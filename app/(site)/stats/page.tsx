'use client'

import { useEffect, useState } from 'react'
import { StandingsTable } from '@/components/standings-table'

interface Tournament {
  id: number
  name: string
  stages: { id: number; name: string }[]
}

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
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null)
  const [selectedStage, setSelectedStage] = useState<{ id: number; name: string } | null>(null)
  const [stats, setStats] = useState<TeamStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingTournaments, setLoadingTournaments] = useState(true)
  const [generatingAnalysis, setGeneratingAnalysis] = useState(false)

  async function fetchTournaments() {
    setLoadingTournaments(true)
    try {
      const res = await fetch('/api/tournaments')
      const data = await res.json()
      setTournaments(data)
      if (data.length > 0) {
        setSelectedTournament(data[0])
        setSelectedStage(data[0].stages[0])
      }
    } catch (err) {
      console.error('Error fetching tournaments:', err)
    }
    setLoadingTournaments(false)
  }

  async function fetchStats() {
    if (!selectedTournament || !selectedStage) return

    setLoading(true)
    try {
      const res = await fetch(`/api/stats?tournamentId=${selectedTournament.id}&stageId=${selectedStage.id}`)
      const data = await res.json()
      setStats(data)

      // Si no hay análisis, generarlo en background
      if (!data.analysis && data.dataHash) {
        generateAnalysis(data)
      }
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
    setLoading(false)
  }

  async function generateAnalysis(statsData: any) {
    setGeneratingAnalysis(true)
    try {
      const res = await fetch('/api/stats/generate-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: statsData.tournamentId,
          stageId: statsData.stageId,
          groupId: statsData.groupId,
          dataHash: statsData.dataHash,
          standingsData: statsData.standings,
          fixtures: statsData.fixtures,
          teamScorers: statsData.teamScorers,
          matchesPlayed: statsData.matchesPlayed,
          matchesRemaining: statsData.matchesRemaining,
        }),
      })

      const result = await res.json()
      if (result.analysis) {
        // Actualizar el análisis en el estado
        setStats(prev => prev ? { ...prev, analysis: result.analysis } : null)
      }
    } catch (err) {
      console.error('Error generating analysis:', err)
    } finally {
      setGeneratingAnalysis(false)
    }
  }

  useEffect(() => {
    fetchTournaments()
  }, [])

  useEffect(() => {
    if (selectedStage) {
      fetchStats()
    }
  }, [selectedStage])

  const goalsPerMatch = stats && stats.matchesPlayed > 0
    ? (stats.goalsFor / stats.matchesPlayed).toFixed(2)
    : '0.00'

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold text-navy mb-8">Estadísticas del Torneo</h1>

      {/* Tournament Selector */}
      {loadingTournaments ? (
        <div className="bg-white rounded-lg p-4 shadow-sm mb-6">
          <div className="flex items-center gap-3">
            <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-navy"></div>
            <p className="text-gray-600">Cargando torneos...</p>
          </div>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="bg-white rounded-lg p-4 shadow-sm mb-6">
          <p className="text-gray-600">No hay torneos disponibles. Ejecuta el scraper primero.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg p-4 shadow-sm mb-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Torneo</label>
              <select
                value={selectedTournament?.id || ''}
                onChange={(e) => {
                  const t = tournaments.find(t => t.id === Number(e.target.value))
                  if (t) {
                    setSelectedTournament(t)
                    setSelectedStage(t.stages[0])
                  }
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Fase</label>
              <select
                value={selectedStage?.id || ''}
                onChange={(e) => {
                  const s = selectedTournament?.stages.find(s => s.id === Number(e.target.value))
                  if (s) setSelectedStage(s)
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                disabled={!selectedTournament}
              >
                {selectedTournament?.stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-navy"></div>
        </div>
      ) : stats ? (
        <>
          {/* Division Badge with Line */}
          {stats.groupName && (
            <div className="mb-8">
              <div className="border-b-4 border-navy pb-2">
                <h2 className="text-xl font-bold text-navy">{stats.groupName}</h2>
              </div>
            </div>
          )}

          {/* Quick Stats Row */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
            <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
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

          {/* Full Standings Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
            <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">Tabla de Posiciones</h2>
            <StandingsTable standings={stats.standings} />
          </div>

          {/* Scorers Row: AC SED + Division */}
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

            {/* Division Top Scorers */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">Goleadores del Campeonato</h2>
              <div className="p-4">
                {stats.topScorers.length > 0 ? (
                  <div className="space-y-2">
                    {stats.topScorers.slice(0, 12).map((scorer: any, idx: number) => (
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

          {/* AI Analysis - Coach Commentary */}
          {(stats.analysis || generatingAnalysis) && (
            <div className="bg-gradient-to-r from-navy to-navy-light text-cream rounded-xl p-6 shadow-lg mb-8">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                🎯 Análisis del Coach
              </h2>
              {generatingAnalysis ? (
                <div className="flex items-center gap-3">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-cream"></div>
                  <p className="text-cream/80">Generando análisis del coach...</p>
                </div>
              ) : (
                <div className="prose prose-invert max-w-none">
                  <p className="whitespace-pre-wrap">{stats.analysis}</p>
                </div>
              )}
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
'use client'

import { useEffect, useState } from 'react'
import { StandingsTable } from '@/components/standings-table'

interface Tournament {
  id: number
  name: string
  stages: { id: number; name: string }[]
}

interface MatchDay {
  matchDay: number
  date: string
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

interface HeadToHeadRecord {
  opponent: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
}

export default function StatsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null)
  const [selectedStage, setSelectedStage] = useState<{ id: number; name: string } | null>(null)
  const [stats, setStats] = useState<TeamStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMatchDayChange, setLoadingMatchDayChange] = useState(false)
  const [loadingTournaments, setLoadingTournaments] = useState(true)
  const [matchDays, setMatchDays] = useState<MatchDay[]>([])
  const [selectedMatchDay, setSelectedMatchDay] = useState<number | null>(null)
  const [headToHead, setHeadToHead] = useState<HeadToHeadRecord[]>([])
  const [loadingHeadToHead, setLoadingHeadToHead] = useState(false)

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

  async function fetchMatchDays() {
    if (!selectedTournament || !selectedStage) return

    try {
      const res = await fetch(`/api/stats/match-days?tournamentId=${selectedTournament.id}&stageId=${selectedStage.id}`)
      const data = await res.json()
      setMatchDays(data)

      // Set selected match day to the most recent played match day
      if (data.length > 0) {
        // Get matches to find the most recent played match
        const matchesRes = await fetch(`/api/stats?tournamentId=${selectedTournament.id}&stageId=${selectedStage.id}`)
        const matchesData = await matchesRes.json()

        // Find the most recent match day that has been played
        const today = new Date()
        let mostRecentPlayedDay = 1

        for (const md of data) {
          const matchDate = new Date(md.date)
          if (matchDate <= today) {
            mostRecentPlayedDay = md.matchDay
          }
        }

        setSelectedMatchDay(mostRecentPlayedDay)
      }
    } catch (err) {
      console.error('Error fetching match days:', err)
    }
  }

  async function fetchStats(isMatchDayChange = false) {
    if (!selectedTournament || !selectedStage) return

    // Use different loading state for match day changes vs initial load
    if (isMatchDayChange) {
      setLoadingMatchDayChange(true)
    } else {
      setLoading(true)
    }

    try {
      // Build query params
      let url = `/api/stats?tournamentId=${selectedTournament.id}&stageId=${selectedStage.id}`

      // Add upToDate filter if a specific match day is selected
      if (selectedMatchDay !== null && matchDays.length > 0) {
        const matchDay = matchDays.find(md => md.matchDay === selectedMatchDay)
        if (matchDay) {
          url += `&upToDate=${matchDay.date}`
        }
      }

      const res = await fetch(url)
      const data = await res.json()
      setStats(data)
    } catch (err) {
      console.error('Error fetching stats:', err)
    }

    if (isMatchDayChange) {
      setLoadingMatchDayChange(false)
    } else {
      setLoading(false)
    }
  }

  async function fetchHeadToHead() {
    setLoadingHeadToHead(true)
    try {
      const res = await fetch('/api/stats/head-to-head')
      const data = await res.json()
      setHeadToHead(data)
    } catch (err) {
      console.error('Error fetching head to head:', err)
    }
    setLoadingHeadToHead(false)
  }

  useEffect(() => {
    fetchTournaments()
    fetchHeadToHead()
  }, [])

  useEffect(() => {
    if (selectedStage) {
      fetchMatchDays()
    }
  }, [selectedStage])

  // Initial load when stage is selected
  useEffect(() => {
    if (selectedStage && selectedMatchDay !== null) {
      fetchStats(false)
    }
  }, [selectedStage])

  // Match day change - use different loading state
  useEffect(() => {
    if (selectedStage && selectedMatchDay !== null) {
      fetchStats(true)
    }
  }, [selectedMatchDay])

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
        <div className="bg-white rounded-lg p-3 md:p-4 shadow-sm mb-6">
          <div className="flex gap-2 md:gap-4 mb-3 md:mb-4">
            <div className="flex-1">
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">Torneo</label>
              <select
                value={selectedTournament?.id || ''}
                onChange={(e) => {
                  const t = tournaments.find(t => t.id === Number(e.target.value))
                  if (t) {
                    setSelectedTournament(t)
                    setSelectedStage(t.stages[0])
                  }
                }}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 md:px-3 md:py-2 text-sm"
              >
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">Fase</label>
              <select
                value={selectedStage?.id || ''}
                onChange={(e) => {
                  const s = selectedTournament?.stages.find(s => s.id === Number(e.target.value))
                  if (s) setSelectedStage(s)
                }}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 md:px-3 md:py-2 text-sm"
                disabled={!selectedTournament}
              >
                {selectedTournament?.stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Match Day Timeline */}
          {matchDays.length > 0 && selectedMatchDay !== null && (
            <div className="border-t border-gray-200 pt-3 md:pt-4">
              <div className="relative">
                {/* Match day dots */}
                <div className="relative flex justify-between items-center">
                  {/* Line connecting dots - z-index 1 */}
                  <div className="absolute top-3 md:top-5 left-0 right-0 h-0.5 md:h-1 bg-gray-200 pointer-events-none" style={{ zIndex: 1 }} />

                  {/* Active line - z-index 2 */}
                  <div
                    className="absolute top-3 md:top-5 left-0 h-0.5 md:h-1 bg-navy transition-all duration-300 pointer-events-none"
                    style={{
                      width: `${((selectedMatchDay - 1) / (matchDays.length - 1)) * 100}%`,
                      zIndex: 2
                    }}
                  />

                  {matchDays.map((md) => {
                    const isSelected = md.matchDay === selectedMatchDay
                    const isPast = md.matchDay < selectedMatchDay
                    const today = new Date()
                    const matchDate = new Date(md.date)
                    const isFuture = matchDate > today

                    return (
                      <button
                        key={md.matchDay}
                        onClick={() => !isFuture && setSelectedMatchDay(md.matchDay)}
                        disabled={isFuture || loadingMatchDayChange}
                        className={`flex flex-col items-center group relative ${isFuture || loadingMatchDayChange ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                        style={{ zIndex: isSelected ? 4 : 3 }}
                      >
                        {/* Dot - always has white background to cover lines */}
                        <div className="w-7 h-7 md:w-10 md:h-10 rounded-full bg-white flex items-center justify-center relative">
                          <div
                            className={`w-full h-full rounded-full border-2 md:border-4 transition-all duration-200 flex items-center justify-center font-bold text-xs md:text-sm
                              ${isSelected
                                ? 'border-navy text-white bg-navy scale-110 shadow-lg'
                                : isPast
                                  ? 'bg-navy/20 border-navy/40 text-navy hover:scale-105'
                                  : 'bg-white border-gray-300 text-gray-400 hover:border-gray-400 hover:scale-105'
                              }`}
                          >
                            {md.matchDay}
                          </div>
                        </div>

                        {/* Date label */}
                        <div className="mt-1 md:mt-2 text-center">
                          <div className="text-[10px] md:text-xs text-gray-400 whitespace-nowrap">
                            {new Date(md.date).toLocaleDateString('es-CL', {
                              day: '2-digit',
                              month: 'short'
                            })}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
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

          {/* Historical Stats Divider */}
          <div className="my-8 border-t border-gray-300"></div>

          {/* Historical Head-to-Head */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">
              Historial vs Equipos
            </h2>
            <div className="p-4">
              {loadingHeadToHead ? (
                <p className="text-gray-400 text-center py-8">Cargando historial...</p>
              ) : headToHead.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No hay historial disponible</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-2 font-semibold text-gray-700">Equipo</th>
                        <th className="text-center py-2 px-2 font-semibold text-gray-700">PJ</th>
                        <th className="text-center py-2 px-2 font-semibold text-green-600">G</th>
                        <th className="text-center py-2 px-2 font-semibold text-gray-600">E</th>
                        <th className="text-center py-2 px-2 font-semibold text-red-600">P</th>
                        <th className="text-center py-2 px-2 font-semibold text-gray-700">GF</th>
                        <th className="text-center py-2 px-2 font-semibold text-gray-700">GC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {headToHead.map((record, idx) => (
                        <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2 px-2 font-medium text-navy">{record.opponent}</td>
                          <td className="py-2 px-2 text-center">{record.played}</td>
                          <td className="py-2 px-2 text-center text-green-600 font-semibold">{record.won}</td>
                          <td className="py-2 px-2 text-center text-gray-600">{record.drawn}</td>
                          <td className="py-2 px-2 text-center text-red-600 font-semibold">{record.lost}</td>
                          <td className="py-2 px-2 text-center">{record.goalsFor}</td>
                          <td className="py-2 px-2 text-center">{record.goalsAgainst}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <p className="text-center text-gray-400 py-12">No hay datos disponibles</p>
      )}
    </div>
  )
}
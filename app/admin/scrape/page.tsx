'use client'

import { useState, useEffect } from 'react'

interface ScrapeLog {
  id: number
  startedAt: string
  finishedAt: string | null
  status: string
  tournamentId: number | null
  tournamentName: string | null
  stageIds: string | null
  matchesFound: number | null
  newMatches: number | null
  updatedMatches: number | null
  teamsProcessed: number | null
  standingsSaved: number | null
  groupsFound: number | null
  errorMessage: string | null
  triggeredBy: string
}

const TOURNAMENTS = [
  { id: 0, name: 'Torneo Activo (Automático)' },
  { id: 191, name: 'Clausura 2025' },
  { id: 178, name: 'Apertura 2025' },
  { id: 172, name: 'Clausura 2024' },
  { id: 160, name: 'Apertura 2024' },
]

export default function AdminScrapePage() {
  const [logs, setLogs] = useState<ScrapeLog[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [selectedTournament, setSelectedTournament] = useState(0)

  async function fetchLogs() {
    const res = await fetch('/api/scrape/logs')
    const data = await res.json()
    setLogs(data)
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  async function handleScrape() {
    setLoading(true)
    setMessage(null)
    try {
      const tournament = TOURNAMENTS.find(t => t.id === selectedTournament)
      const body = tournament?.id === 0
        ? {}
        : { tournamentId: tournament?.id }

      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({
          type: 'success',
          text: `Scrape completado. ${data.newMatches} partidos nuevos. ${data.articlesGenerated || 0} noticias generadas.`,
        })
        await fetchLogs()
      } else {
        setMessage({ type: 'error', text: data.error ?? 'Error desconocido' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de red' })
    }
    setLoading(false)
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-navy mb-2">Scraping</h1>
      <p className="text-gray-500 text-sm mb-8">
        Ejecuta el scraper manualmente para obtener los datos más recientes de ligab.cl.
        El scraper automático corre todos los lunes a las 8:00 AM (hora Chile).
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Seleccionar Torneo
        </label>
        <select
          value={selectedTournament}
          onChange={(e) => setSelectedTournament(Number(e.target.value))}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-navy"
          disabled={loading}
        >
          {TOURNAMENTS.map((tournament) => (
            <option key={tournament.id} value={tournament.id}>
              {tournament.name}
            </option>
          ))}
        </select>

        <button
          onClick={handleScrape}
          disabled={loading}
          className="bg-navy text-cream px-6 py-3 rounded-lg font-semibold hover:bg-navy-light transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Scrapeando… (puede tardar ~60s)
            </>
          ) : (
            '🔄 Ejecutar Scrape'
          )}
        </button>
      </div>

      {message && (
        <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* Logs table */}
      <div className="mt-10">
        <h2 className="font-bold text-navy text-lg mb-4">Historial de Scrapes</h2>
        {logs.length === 0 ? (
          <p className="text-gray-400 text-sm">Sin historial aún.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-gray-500 font-medium">Inicio</th>
                  <th className="px-4 py-3 text-left text-gray-500 font-medium">Torneo</th>
                  <th className="px-4 py-3 text-left text-gray-500 font-medium">Estado</th>
                  <th className="px-4 py-3 text-left text-gray-500 font-medium">Estadísticas</th>
                  <th className="px-4 py-3 text-left text-gray-500 font-medium">Por</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(log.startedAt).toLocaleString('es-CL', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-navy">{log.tournamentName || '—'}</div>
                      {log.stageIds && (
                        <div className="text-xs text-gray-400">
                          {JSON.parse(log.stageIds).length} fase{JSON.parse(log.stageIds).length > 1 ? 's' : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                        log.status === 'success' ? 'bg-green-100 text-green-700' :
                        log.status === 'error' ? 'bg-red-100 text-red-600' :
                        'bg-yellow-100 text-yellow-600'
                      }`}>
                        {log.status}
                      </span>
                      {log.errorMessage && (
                        <p className="text-red-400 text-xs mt-1 max-w-xs truncate" title={log.errorMessage}>
                          {log.errorMessage}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5 text-xs">
                        <div className="flex gap-2">
                          <span className="text-gray-500">Partidos:</span>
                          <span className="font-medium text-green-600">{log.newMatches || 0} nuevos</span>
                          <span className="text-gray-400">/ {log.updatedMatches || 0} actualizados</span>
                        </div>
                        {(log.teamsProcessed || log.standingsSaved || log.groupsFound) ? (
                          <div className="text-gray-400">
                            {log.groupsFound ? `${log.groupsFound} grupos · ` : ''}
                            {log.teamsProcessed ? `${log.teamsProcessed} equipos · ` : ''}
                            {log.standingsSaved ? `${log.standingsSaved} posiciones` : ''}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{log.triggeredBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

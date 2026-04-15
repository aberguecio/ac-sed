'use client'

import { useState, useEffect } from 'react'
import { TeamLogo } from '@/components/team-logo'
import { isACSED } from '@/lib/team-utils'
import type { MatchResult } from '@/lib/attendance-parser'

interface Team {
  id: number
  name: string
  logoUrl: string | null
}

interface Match {
  id: number
  date: string
  venue: string | null
  homeTeamId: number | null
  awayTeamId: number | null
  homeScore: number | null
  awayScore: number | null
  roundName: string | null
  homeTeam: Team | null
  awayTeam: Team | null
  _count: { attendance: number }
}

interface Player {
  id: number
  name: string
  number: number | null
  photoUrl: string | null
  aliases: { id: number; alias: string }[]
}

interface AttendanceRecord {
  id: number
  playerId: number
  notes: string | null
  player: Player
}

// MatchResult extended with optional manual override
interface UIMatchResult extends MatchResult {
  overridePlayerId?: number | null
  overrideNotes?: string
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getOpponent(match: Match): Team | null {
  if (match.homeTeam && !isACSED(match.homeTeam.name)) return match.homeTeam
  if (match.awayTeam && !isACSED(match.awayTeam.name)) return match.awayTeam
  return match.homeTeam ?? match.awayTeam
}

export default function AdminMatchesPage() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null)

  // Parse mode
  const [whatsappText, setWhatsappText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseResults, setParseResults] = useState<UIMatchResult[] | null>(null)

  // All active players (for manual overrides)
  const [allPlayers, setAllPlayers] = useState<Player[]>([])

  // Existing attendance
  const [existingAttendance, setExistingAttendance] = useState<AttendanceRecord[]>([])
  const [loadingAttendance, setLoadingAttendance] = useState(false)
  const [saving, setSaving] = useState(false)

  async function fetchMatches() {
    const res = await fetch('/api/admin/matches')
    setMatches(await res.json())
    setLoading(false)
  }

  async function fetchPlayers() {
    const res = await fetch('/api/players?withAliases=1')
    const data = await res.json()
    setAllPlayers(data)
  }

  useEffect(() => {
    fetchMatches()
    fetchPlayers()
  }, [])

  async function selectMatch(match: Match) {
    setSelectedMatch(match)
    setWhatsappText('')
    setParseResults(null)
    setLoadingAttendance(true)

    const res = await fetch(`/api/admin/matches/${match.id}/attendance`)
    setExistingAttendance(await res.json())
    setLoadingAttendance(false)
  }

  async function handleParse() {
    if (!whatsappText.trim()) return
    setParsing(true)
    const res = await fetch('/api/admin/attendance/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: whatsappText }),
    })
    const data = await res.json()
    setParseResults((data.results as MatchResult[]).map(r => ({ ...r, overridePlayerId: undefined, overrideNotes: r.notes ?? '' })))
    setParsing(false)
  }

  function updateOverride(idx: number, field: 'overridePlayerId' | 'overrideNotes', value: number | null | string) {
    setParseResults(prev =>
      prev ? prev.map((r, i) => i === idx ? { ...r, [field]: value } : r) : prev
    )
  }

  function removeEntry(idx: number) {
    setParseResults(prev => prev ? prev.filter((_, i) => i !== idx) : prev)
  }

  async function handleSave() {
    if (!selectedMatch || !parseResults) return
    setSaving(true)

    const attendees = parseResults
      .map(r => {
        const playerId = r.overridePlayerId !== undefined
          ? r.overridePlayerId
          : r.player?.id ?? null
        const notes = r.overrideNotes !== undefined ? r.overrideNotes : r.notes ?? ''
        return playerId ? { playerId, notes: notes || null } : null
      })
      .filter(Boolean) as Array<{ playerId: number; notes: string | null }>

    await fetch(`/api/admin/matches/${selectedMatch.id}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendees }),
    })

    setParseResults(null)
    setWhatsappText('')
    const res = await fetch(`/api/admin/matches/${selectedMatch.id}/attendance`)
    setExistingAttendance(await res.json())
    await fetchMatches()
    setSaving(false)
  }

  async function handleClearAttendance() {
    if (!selectedMatch) return
    if (!confirm('¿Eliminar toda la asistencia de este partido?')) return
    await fetch(`/api/admin/matches/${selectedMatch.id}/attendance`, { method: 'DELETE' })
    setExistingAttendance([])
    await fetchMatches()
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-navy mb-8">Partidos</h1>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* Match list */}
        <div className="lg:col-span-2">
          {loading ? (
            <p className="text-gray-400 text-sm">Cargando partidos…</p>
          ) : matches.length === 0 ? (
            <p className="text-gray-400 text-sm">No hay partidos.</p>
          ) : (
            <div className="space-y-2">
              {matches.map(match => {
                const opponent = getOpponent(match)
                const played = match.homeScore !== null && match.awayScore !== null
                const isSelected = selectedMatch?.id === match.id
                const attendanceCount = match._count.attendance

                return (
                  <button
                    key={match.id}
                    onClick={() => selectMatch(match)}
                    className={`w-full text-left rounded-xl border p-4 transition-colors ${
                      isSelected
                        ? 'border-navy bg-navy text-cream'
                        : 'border-gray-100 bg-white hover:border-navy/30 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <TeamLogo
                        teamId={opponent?.id ?? 0}
                        teamName={opponent?.name ?? ''}
                        logoUrl={opponent?.logoUrl ?? null}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm truncate ${isSelected ? 'text-cream' : 'text-navy'}`}>
                          vs {opponent?.name ?? 'Desconocido'}
                        </p>
                        <p className={`text-xs ${isSelected ? 'text-cream/60' : 'text-gray-400'}`}>
                          {formatDate(match.date)} · {formatTime(match.date)}
                        </p>
                        {match.venue && (
                          <p className={`text-xs ${isSelected ? 'text-cream/60' : 'text-gray-400'}`}>
                            {match.venue}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {played && (
                          <p className={`text-sm font-bold ${isSelected ? 'text-wheat' : 'text-navy'}`}>
                            {isACSED(match.homeTeam?.name) ? match.homeScore : match.awayScore}
                            {' – '}
                            {isACSED(match.homeTeam?.name) ? match.awayScore : match.homeScore}
                          </p>
                        )}
                        {attendanceCount > 0 && (
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                            isSelected ? 'bg-wheat/20 text-wheat' : 'bg-green-100 text-green-700'
                          }`}>
                            {attendanceCount} jugadores
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-3">
          {!selectedMatch ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400">
              <p className="text-4xl mb-3">⚽</p>
              <p className="text-sm">Seleccioná un partido para gestionar la asistencia</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Match header */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center gap-3 mb-1">
                  <TeamLogo
                    teamId={getOpponent(selectedMatch)?.id ?? 0}
                    teamName={getOpponent(selectedMatch)?.name ?? ''}
                    logoUrl={getOpponent(selectedMatch)?.logoUrl ?? null}
                    size="sm"
                  />
                  <div>
                    <h2 className="font-bold text-navy">
                      AC SED vs {getOpponent(selectedMatch)?.name ?? 'Desconocido'}
                    </h2>
                    <p className="text-xs text-gray-400">
                      {formatDate(selectedMatch.date)} · {formatTime(selectedMatch.date)}
                      {selectedMatch.venue && ` · ${selectedMatch.venue}`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Existing attendance */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-navy">
                    Asistencia registrada
                    {existingAttendance.length > 0 && (
                      <span className="ml-2 text-sm font-normal text-gray-400">
                        ({existingAttendance.length} jugadores)
                      </span>
                    )}
                  </h3>
                  {existingAttendance.length > 0 && (
                    <button
                      onClick={handleClearAttendance}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                {loadingAttendance ? (
                  <p className="text-sm text-gray-400">Cargando…</p>
                ) : existingAttendance.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin asistencia registrada.</p>
                ) : (
                  <div className="space-y-1">
                    {existingAttendance.map((record, i) => (
                      <div key={record.id} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                        <span className="text-xs text-gray-300 w-5 text-right">{i + 1}</span>
                        {record.player.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={record.player.photoUrl} alt={record.player.name} className="w-7 h-7 rounded-full object-cover border border-cream-dark" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-navy/10 flex items-center justify-center text-navy text-xs font-bold">
                            {record.player.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                          </div>
                        )}
                        <span className="flex-1 text-sm font-medium text-navy">{record.player.name}</span>
                        {record.notes && (
                          <span className="text-xs text-gray-400 italic">{record.notes}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* WhatsApp parser */}
              <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
                <h3 className="font-bold text-navy">Parsear mensaje de WhatsApp</h3>

                <textarea
                  value={whatsappText}
                  onChange={e => setWhatsappText(e.target.value)}
                  placeholder={`Pegá el mensaje de WhatsApp aquí:\n\n1. Hernan\n2. Gallet\n3. Riquelme (-10)\n4. Ladron jr`}
                  rows={8}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-navy resize-none"
                />

                <button
                  onClick={handleParse}
                  disabled={parsing || !whatsappText.trim()}
                  className="w-full bg-navy text-cream py-2 rounded-lg text-sm font-semibold hover:bg-navy-light disabled:opacity-50"
                >
                  {parsing ? 'Parseando…' : 'Parsear lista'}
                </button>

                {/* Parse results */}
                {parseResults && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-navy">
                        Resultado ({parseResults.filter(r => (r.overridePlayerId !== undefined ? r.overridePlayerId : r.player?.id)).length} / {parseResults.length} identificados)
                      </p>
                    </div>

                    {parseResults.map((result, idx) => {
                      const resolvedPlayerId = result.overridePlayerId !== undefined
                        ? result.overridePlayerId
                        : result.player?.id ?? null
                      const isMatched = resolvedPlayerId !== null
                      const notes = result.overrideNotes !== undefined ? result.overrideNotes : result.notes ?? ''

                      return (
                        <div
                          key={idx}
                          className={`rounded-lg border p-3 space-y-2 ${
                            isMatched ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold ${isMatched ? 'text-green-600' : 'text-red-500'}`}>
                                {isMatched ? '✓' : '✗'}
                              </span>
                              <div>
                                <span className="text-sm font-medium text-navy">{result.rawName}</span>
                                {result.player && result.overridePlayerId === undefined && (
                                  <span className="ml-2 text-xs text-gray-400">
                                    → {result.player.name}
                                    {result.confidence === 'fuzzy' && ' (fuzzy)'}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => removeEntry(idx)}
                              className="text-xs text-gray-300 hover:text-red-400 shrink-0"
                            >
                              ✕
                            </button>
                          </div>

                          {/* Manual player override */}
                          {(!isMatched || result.confidence === 'fuzzy') && (
                            <select
                              value={resolvedPlayerId ?? ''}
                              onChange={e => updateOverride(idx, 'overridePlayerId', e.target.value ? parseInt(e.target.value) : null)}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-navy bg-white"
                            >
                              <option value="">— Seleccionar jugador —</option>
                              {allPlayers.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.number ? `#${p.number} ` : ''}{p.name}
                                </option>
                              ))}
                            </select>
                          )}

                          {/* Notes */}
                          <input
                            type="text"
                            value={notes}
                            onChange={e => updateOverride(idx, 'overrideNotes', e.target.value)}
                            placeholder="Nota (ej: llegó al 2do tiempo)"
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-navy bg-white"
                          />
                        </div>
                      )
                    })}

                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                    >
                      {saving ? 'Guardando…' : `Guardar asistencia (${parseResults.filter(r => (r.overridePlayerId !== undefined ? r.overridePlayerId : r.player?.id)).length} jugadores)`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

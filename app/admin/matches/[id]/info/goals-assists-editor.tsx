'use client'

import { useState } from 'react'

interface Goal {
  id: number
  leaguePlayerId: number | null
  rosterPlayerId: number | null
  scrapedPlayer: { id: number; firstName: string; lastName: string; teamId: number | null } | null
  rosterPlayer: { id: number; name: string; number: number | null; photoUrl: string | null; nicknames: string[]; leaguePlayerId: number | null } | null
  assistPlayer: { id: number; firstName: string; lastName: string } | null
  assistRosterPlayer: { id: number; name: string; number: number | null; photoUrl: string | null; nicknames: string[]; leaguePlayerId: number | null } | null
  assistLeaguePlayerId: number | null
  assistRosterPlayerId: number | null
  teamName: string
}

interface Player {
  id: number
  name: string
  number: number | null
  leaguePlayerId: number | null
}

interface GoalsAssistsEditorProps {
  matchId: number
  goals: Goal[]
  players: Player[]
}

// Resolve the rosterPlayerId currently linked to a goal/assist. When the
// stored rosterPlayerId is null, fall back to looking up by leaguePlayerId
// (so existing scraper-only goals select the matching roster player by
// default).
function resolveRosterId(
  rosterPlayerId: number | null,
  leaguePlayerId: number | null,
  players: Player[],
): number | null {
  if (rosterPlayerId != null) return rosterPlayerId
  if (leaguePlayerId != null) {
    const match = players.find(p => p.leaguePlayerId === leaguePlayerId)
    if (match) return match.id
  }
  return null
}

export function GoalsAssistsEditor({ matchId, goals, players }: GoalsAssistsEditorProps) {
  const [goalScorers, setGoalScorers] = useState<Map<number, number | null>>(
    new Map(
      goals.map(g => [g.id, resolveRosterId(g.rosterPlayerId, g.leaguePlayerId, players)])
    )
  )
  const [goalAssists, setGoalAssists] = useState<Map<number, number | null>>(
    new Map(
      goals.map(g => [g.id, resolveRosterId(g.assistRosterPlayerId, g.assistLeaguePlayerId, players)])
    )
  )
  const [saving, setSaving] = useState<number | null>(null)
  const [messages, setMessages] = useState<Map<number, { type: 'success' | 'error'; text: string }>>(new Map())

  const handleScorerChange = async (goalId: number, rosterPlayerId: number) => {
    setGoalScorers(prev => new Map(prev).set(goalId, rosterPlayerId))
    setSaving(goalId)
    setMessages(prev => {
      const newMap = new Map(prev)
      newMap.delete(goalId)
      return newMap
    })

    try {
      const res = await fetch(`/api/admin/match-goals/${goalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rosterPlayerId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al guardar')
      }

      setMessages(prev => new Map(prev).set(goalId, { type: 'success', text: '✓ Guardado' }))
      setTimeout(() => {
        setMessages(prev => {
          const newMap = new Map(prev)
          newMap.delete(goalId)
          return newMap
        })
      }, 2000)
    } catch (err) {
      setMessages(prev => new Map(prev).set(goalId, {
        type: 'error',
        text: err instanceof Error ? err.message : 'Error'
      }))
    } finally {
      setSaving(null)
    }
  }

  const handleAssistChange = async (goalId: number, assistRosterPlayerId: number | null) => {
    setGoalAssists(prev => new Map(prev).set(goalId, assistRosterPlayerId))
    setSaving(goalId)
    setMessages(prev => {
      const newMap = new Map(prev)
      newMap.delete(goalId)
      return newMap
    })

    try {
      const res = await fetch(`/api/admin/match-goals/${goalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistRosterPlayerId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al guardar')
      }

      setMessages(prev => new Map(prev).set(goalId, { type: 'success', text: '✓ Guardado' }))
      setTimeout(() => {
        setMessages(prev => {
          const newMap = new Map(prev)
          newMap.delete(goalId)
          return newMap
        })
      }, 2000)
    } catch (err) {
      setMessages(prev => new Map(prev).set(goalId, {
        type: 'error',
        text: err instanceof Error ? err.message : 'Error'
      }))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-4">
      {goals.map(goal => {
        const scraperScorer = goal.scrapedPlayer
          ? `${goal.scrapedPlayer.firstName} ${goal.scrapedPlayer.lastName}`
          : '(sin atribución de scraper)'
        const currentScorer = goalScorers.get(goal.id) ?? ''
        const currentAssist = goalAssists.get(goal.id)
        const message = messages.get(goal.id)
        const isSaving = saving === goal.id

        return (
          <div
            key={goal.id}
            className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
          >
            <div className="space-y-3">
              {/* Goal info */}
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <span className="text-lg">⚽</span>
                <div>
                  <div className="text-xs text-gray-500">{goal.teamName}</div>
                  <div className="text-xs text-gray-400">Scraper detectó: {scraperScorer}</div>
                </div>
              </div>

              {/* Scorer selector */}
              <div className="flex items-center gap-3">
                <label htmlFor={`scorer-${goal.id}`} className="text-sm text-gray-600 whitespace-nowrap w-24">
                  Goleador:
                </label>
                <select
                  id={`scorer-${goal.id}`}
                  value={currentScorer}
                  onChange={e => handleScorerChange(goal.id, parseInt(e.target.value))}
                  disabled={isSaving}
                  className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {currentScorer === '' && <option value="">Sin asignar</option>}
                  {players.map(player => (
                    <option key={player.id} value={player.id}>
                      {player.number ? `#${player.number} ` : ''}{player.name}
                      {player.leaguePlayerId == null ? ' (parche)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assist selector */}
              <div className="flex items-center gap-3">
                <label htmlFor={`assist-${goal.id}`} className="text-sm text-gray-600 whitespace-nowrap w-24">
                  Asistencia de:
                </label>
                <select
                  id={`assist-${goal.id}`}
                  value={currentAssist ?? ''}
                  onChange={e => handleAssistChange(goal.id, e.target.value ? parseInt(e.target.value) : null)}
                  disabled={isSaving}
                  className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Sin asistencia</option>
                  {players.map(player => (
                    <option key={player.id} value={player.id}>
                      {player.number ? `#${player.number} ` : ''}{player.name}
                      {player.leaguePlayerId == null ? ' (parche)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Message */}
              {message && (
                <div className="text-center pt-2">
                  <span
                    className={`text-xs ${
                      message.type === 'success' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {message.text}
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

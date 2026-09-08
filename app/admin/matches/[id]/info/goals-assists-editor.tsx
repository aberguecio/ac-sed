'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ACSED_TEAM_NAME, ACSED_TEAM_ID } from '@/lib/team-utils'

interface Goal {
  id: number
  leaguePlayerId: number | null
  rosterPlayerId: number | null
  minute: number | null
  orderIndex: number | null
  scrapedPlayer: { id: number; firstName: string; lastName: string; teamId: number | null } | null
  rosterPlayer: { id: number; name: string; number: number | null; photoUrl: string | null; nicknames: string[]; leaguePlayerId: number | null } | null
  assistPlayer: { id: number; firstName: string; lastName: string } | null
  assistRosterPlayer: { id: number; name: string; number: number | null; photoUrl: string | null; nicknames: string[]; leaguePlayerId: number | null } | null
  assistLeaguePlayerId: number | null
  assistRosterPlayerId: number | null
  teamName: string
}

function isAcsedGoal(goal: Goal): boolean {
  if (goal.rosterPlayerId != null) return true
  if (goal.scrapedPlayer?.teamId === ACSED_TEAM_ID) return true
  return goal.teamName === ACSED_TEAM_NAME
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
  const router = useRouter()
  const acsedGoals = goals.filter(isAcsedGoal)
  const [goalScorers, setGoalScorers] = useState<Map<number, number | null>>(
    new Map(
      acsedGoals.map(g => [g.id, resolveRosterId(g.rosterPlayerId, g.leaguePlayerId, players)])
    )
  )
  const [goalAssists, setGoalAssists] = useState<Map<number, number | null>>(
    new Map(
      acsedGoals.map(g => [g.id, resolveRosterId(g.assistRosterPlayerId, g.assistLeaguePlayerId, players)])
    )
  )
  // Minutes live as strings so the field can be emptied without becoming 0.
  const [minutes, setMinutes] = useState<Map<number, string>>(
    new Map(goals.map(g => [g.id, g.minute != null ? String(g.minute) : '']))
  )
  // The order shown, which is also what gets sent on a drop. The server
  // arrives already sorted; this only changes when someone drags.
  const [sequence, setSequence] = useState<number[]>(goals.map(g => g.id))
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropTargetId, setDropTargetId] = useState<number | null>(null)
  const [saving, setSaving] = useState<number | null>(null)
  const [messages, setMessages] = useState<Map<number, { type: 'success' | 'error'; text: string }>>(new Map())
  const [orderMessage, setOrderMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // `router.refresh()` re-renders the server component with the new order and
  // minutes; without this the local copies would keep showing the pre-save
  // state. Keyed on a signature so it only fires when the data really moved.
  const serverSignature = goals.map(g => `${g.id}:${g.minute ?? ''}`).join(',')
  useEffect(() => {
    setSequence(goals.map(g => g.id))
    setMinutes(new Map(goals.map(g => [g.id, g.minute != null ? String(g.minute) : ''])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSignature])

  const goalsById = new Map(goals.map(g => [g.id, g]))
  const orderedGoals = sequence.map(id => goalsById.get(id)).filter((g): g is Goal => g != null)

  const flashMessage = (goalId: number, message: { type: 'success' | 'error'; text: string }) => {
    setMessages(prev => new Map(prev).set(goalId, message))
    if (message.type === 'success') {
      setTimeout(() => {
        setMessages(prev => {
          const next = new Map(prev)
          next.delete(goalId)
          return next
        })
      }, 2000)
    }
  }

  const clearMessage = (goalId: number) => {
    setMessages(prev => {
      const next = new Map(prev)
      next.delete(goalId)
      return next
    })
  }

  const patchGoal = async (goalId: number, body: Record<string, unknown>) => {
    setSaving(goalId)
    clearMessage(goalId)
    try {
      const res = await fetch(`/api/admin/match-goals/${goalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al guardar')
      }
      flashMessage(goalId, { type: 'success', text: '✓ Guardado' })
      return true
    } catch (err) {
      flashMessage(goalId, {
        type: 'error',
        text: err instanceof Error ? err.message : 'Error',
      })
      return false
    } finally {
      setSaving(null)
    }
  }

  const handleScorerChange = async (goalId: number, rosterPlayerId: number) => {
    setGoalScorers(prev => new Map(prev).set(goalId, rosterPlayerId))
    await patchGoal(goalId, { rosterPlayerId })
  }

  const handleAssistChange = async (goalId: number, assistRosterPlayerId: number | null) => {
    setGoalAssists(prev => new Map(prev).set(goalId, assistRosterPlayerId))
    await patchGoal(goalId, { assistRosterPlayerId })
  }

  // A minute decides where its goal sits, so saving one re-sorts the list on
  // the server; `router.refresh()` pulls the new order back.
  const handleMinuteCommit = async (goalId: number) => {
    const raw = (minutes.get(goalId) ?? '').trim()
    const stored = goalsById.get(goalId)?.minute ?? null
    const parsed = raw === '' ? null : Number(raw)

    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 0 || parsed > 200)) {
      flashMessage(goalId, { type: 'error', text: 'Minuto inválido' })
      return
    }
    if (parsed === stored) return

    const ok = await patchGoal(goalId, { minute: parsed })
    if (ok) router.refresh()
  }

  const persistSequence = async (nextSequence: number[]) => {
    setOrderMessage(null)
    try {
      const res = await fetch(`/api/admin/matches/${matchId}/goal-order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalIds: nextSequence }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al guardar el orden')
      }
      setOrderMessage({ type: 'success', text: '✓ Orden guardado' })
      setTimeout(() => setOrderMessage(null), 2000)
      router.refresh()
    } catch (err) {
      // Put the list back the way the server has it.
      setSequence(goals.map(g => g.id))
      setOrderMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al guardar el orden',
      })
    }
  }

  const handleDrop = (targetId: number) => {
    const sourceId = draggingId
    setDraggingId(null)
    setDropTargetId(null)
    if (sourceId == null || sourceId === targetId) return

    const from = sequence.indexOf(sourceId)
    const to = sequence.indexOf(targetId)
    if (from < 0 || to < 0) return

    const next = [...sequence]
    next.splice(from, 1)
    next.splice(to, 0, sourceId)
    setSequence(next)
    void persistSequence(next)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Los goles con minuto se ordenan por minuto y no se mueven. Los que no tienen minuto se
        arrastran a su lugar.
      </p>

      {orderMessage && (
        <div
          className={`text-xs ${orderMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
        >
          {orderMessage.text}
        </div>
      )}

      {orderedGoals.map((goal, position) => {
        const isAcsed = isAcsedGoal(goal)
        const scraperScorer = goal.scrapedPlayer
          ? `${goal.scrapedPlayer.firstName} ${goal.scrapedPlayer.lastName}`
          : '(sin atribución de scraper)'
        const minuteValue = minutes.get(goal.id) ?? ''
        const isMinuted = goal.minute != null
        const isDragging = draggingId === goal.id
        const isDropTarget = dropTargetId === goal.id && draggingId != null && draggingId !== goal.id
        const message = messages.get(goal.id)
        const isSaving = saving === goal.id

        // Position + minute + drag handle. Shared by our goals and the
        // rival's: the sequence only reads as a match if every goal is in it.
        const orderControls = (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-400 w-6 text-right">{position + 1}</span>
            <span
              draggable={!isMinuted}
              onDragStart={() => setDraggingId(goal.id)}
              onDragEnd={() => {
                setDraggingId(null)
                setDropTargetId(null)
              }}
              title={isMinuted ? 'Tiene minuto: su lugar lo define el minuto' : 'Arrastrar para reordenar'}
              className={`select-none text-sm ${
                isMinuted ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 cursor-grab active:cursor-grabbing'
              }`}
              aria-hidden={isMinuted}
            >
              ⠿
            </span>
            <label className="flex items-center gap-1 text-xs text-gray-500">
              min
              <input
                type="number"
                min={0}
                max={200}
                inputMode="numeric"
                value={minuteValue}
                onChange={e => setMinutes(prev => new Map(prev).set(goal.id, e.target.value))}
                onBlur={() => handleMinuteCommit(goal.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                disabled={isSaving}
                aria-label={`Minuto del gol ${position + 1}`}
                className="w-14 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 disabled:opacity-50"
              />
              &apos;
            </label>
          </div>
        )

        const rowClasses = [
          'border rounded-lg transition-colors',
          isDropTarget ? 'border-navy border-dashed' : 'border-gray-200',
          isDragging ? 'opacity-50' : '',
          isAcsed ? 'p-4 hover:border-gray-300' : 'p-3 bg-gray-50 opacity-90',
        ].join(' ')

        return (
          <div
            key={goal.id}
            onDragOver={e => {
              if (draggingId == null) return
              e.preventDefault()
              setDropTargetId(goal.id)
            }}
            onDragLeave={() => setDropTargetId(prev => (prev === goal.id ? null : prev))}
            onDrop={e => {
              e.preventDefault()
              handleDrop(goal.id)
            }}
            className={rowClasses}
          >
            <div className="space-y-3">
              {/* Goal info + ordering */}
              <div
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${
                  isAcsed ? 'pb-2 border-b border-gray-100' : ''
                }`}
              >
                <span className="text-lg">⚽</span>
                <div className="flex-1 min-w-[10rem]">
                  <div className="text-xs text-gray-500">{goal.teamName}</div>
                  <div className={`text-xs ${isAcsed ? 'text-gray-400' : 'text-gray-700'}`}>
                    {isAcsed ? `Scraper detectó: ${scraperScorer}` : scraperScorer}
                  </div>
                </div>
                {orderControls}
                {!isAcsed && <span className="text-xs text-gray-400">🔒 rival</span>}
              </div>

              {isAcsed && (
                <>
                  {/* Scorer selector */}
                  <div className="flex items-center gap-3">
                    <label htmlFor={`scorer-${goal.id}`} className="text-sm text-gray-600 whitespace-nowrap w-24">
                      Goleador:
                    </label>
                    <select
                      id={`scorer-${goal.id}`}
                      value={goalScorers.get(goal.id) ?? ''}
                      onChange={e => handleScorerChange(goal.id, parseInt(e.target.value))}
                      disabled={isSaving}
                      className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {(goalScorers.get(goal.id) ?? '') === '' && <option value="">Sin asignar</option>}
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
                      value={goalAssists.get(goal.id) ?? ''}
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
                </>
              )}

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

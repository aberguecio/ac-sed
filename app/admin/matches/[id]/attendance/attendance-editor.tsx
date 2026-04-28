'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AttendanceStatus } from '@prisma/client'

interface PlayerLite {
  id: number
  name: string
  position: string | null
  number: number | null
  photoUrl: string | null
  phoneNumber: string | null
}

interface PlayerMatchLite {
  id: number
  playerId: number
  matchId: number
  attendanceStatus: AttendanceStatus
  rating: number | null
  notes: string | null
}

interface Row {
  player: PlayerLite
  playerMatch: PlayerMatchLite | null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  matchId: number
  initialRows: Row[]
  initialized: boolean
}

const STATUSES: { value: AttendanceStatus; label: string; badgeClass: string }[] = [
  { value: 'PENDING', label: 'Pendiente', badgeClass: 'bg-gray-100 text-gray-600 border-gray-200' },
  { value: 'CONFIRMED', label: 'Confirmado', badgeClass: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'DECLINED', label: 'No va', badgeClass: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'LATE', label: 'Tarde', badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'VISITING', label: 'De visita', badgeClass: 'bg-teal-100 text-teal-700 border-teal-200' },
  { value: 'NO_SHOW', label: 'No show', badgeClass: 'bg-orange-100 text-orange-700 border-orange-200' },
]

function badgeFor(status: AttendanceStatus) {
  return STATUSES.find(s => s.value === status)?.badgeClass ?? 'bg-gray-100 text-gray-600'
}

function formatPhone(phone: string | null): string {
  if (!phone) return 'sin WhatsApp'
  // 56995620994 -> +56 9 9562 0994
  if (phone.length === 11 && phone.startsWith('569')) {
    return `+56 9 ${phone.slice(3, 7)} ${phone.slice(7)}`
  }
  return phone
}

export function AttendanceEditor({ matchId, initialRows, initialized }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>(initialRows)
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({})
  const timeouts = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const [initializing, startInit] = useTransition()
  const [broadcasting, startBroadcast] = useTransition()

  const counters = useMemo(() => {
    const c: Record<AttendanceStatus, number> = {
      PENDING: 0,
      CONFIRMED: 0,
      DECLINED: 0,
      LATE: 0,
      VISITING: 0,
      NO_SHOW: 0,
    }
    for (const r of rows) {
      const s = r.playerMatch?.attendanceStatus ?? 'PENDING'
      c[s] += 1
    }
    return c
  }, [rows])

  const pendingWithPhone = useMemo(() => {
    return rows.filter((r: Row) => {
      const s = r.playerMatch?.attendanceStatus ?? 'PENDING'
      return s === 'PENDING' && !!r.player.phoneNumber
    }).length
  }, [rows])

  async function handleInit() {
    startInit(async () => {
      const res = await fetch(`/api/admin/matches/${matchId}/attendance/init`, { method: 'POST' })
      if (!res.ok) {
        alert('Error al inicializar asistencia')
        return
      }
      router.refresh()
    })
  }

  async function handleBroadcast() {
    if (pendingWithPhone === 0) {
      alert('No hay jugadores pendientes con WhatsApp registrado.')
      return
    }
    const confirmed = confirm(
      `Se enviará una encuesta por WhatsApp a ${pendingWithPhone} jugador(es) pendiente(s). ` +
        `El envío toma unos segundos por jugador (delay aleatorio 3–10s para que se sienta humano). ¿Continuar?`
    )
    if (!confirmed) return

    startBroadcast(async () => {
      const res = await fetch(`/api/admin/matches/${matchId}/attendance/broadcast`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Error al enviar: ${err.error ?? res.status}`)
        return
      }
      const data = await res.json() as {
        sent: number
        skipped: number
        failed: Array<{ playerId: number; reason: string }>
        total: number
      }
      const failSummary = data.failed.length
        ? `\nFallidos: ${data.failed.length} (${data.failed.map(f => `#${f.playerId}: ${f.reason}`).join('; ')})`
        : ''
      alert(
        `Encuestas enviadas: ${data.sent} / ${data.total}. Saltados: ${data.skipped}.${failSummary}`
      )
      router.refresh()
    })
  }

  function setSave(playerId: number, state: SaveState) {
    setSaveStates(prev => ({ ...prev, [playerId]: state }))
    if (state === 'saved') {
      setTimeout(() => {
        setSaveStates(prev => ({ ...prev, [playerId]: 'idle' }))
      }, 1500)
    }
  }

  async function sendPatch(playerId: number, patch: Record<string, unknown>, snapshot: Row) {
    setSave(playerId, 'saving')
    try {
      const res = await fetch(`/api/admin/matches/${matchId}/attendance/${playerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Error al guardar')
        setRows(prev => prev.map(r => (r.player.id === playerId ? snapshot : r)))
        setSave(playerId, 'error')
        setTimeout(() => setSave(playerId, 'idle'), 2000)
        return
      }
      const saved = await res.json() as PlayerMatchLite
      setRows(prev => prev.map(r => (r.player.id === playerId ? { ...r, playerMatch: saved } : r)))
      setSave(playerId, 'saved')
    } catch {
      alert('Error de red al guardar')
      setRows(prev => prev.map(r => (r.player.id === playerId ? snapshot : r)))
      setSave(playerId, 'error')
      setTimeout(() => setSave(playerId, 'idle'), 2000)
    }
  }

  function debouncedPatch(playerId: number, patch: Record<string, unknown>, snapshot: Row) {
    const prev = timeouts.current.get(playerId)
    if (prev) clearTimeout(prev)
    const t = setTimeout(() => {
      sendPatch(playerId, patch, snapshot)
      timeouts.current.delete(playerId)
    }, 500)
    timeouts.current.set(playerId, t)
    setSave(playerId, 'saving')
  }

  function updateLocal(playerId: number, patch: Partial<PlayerMatchLite>) {
    setRows(prev =>
      prev.map(r => {
        if (r.player.id !== playerId) return r
        const current = r.playerMatch ?? {
          id: 0,
          playerId,
          matchId,
          attendanceStatus: 'PENDING' as AttendanceStatus,
          rating: null,
          notes: null,
        }
        return { ...r, playerMatch: { ...current, ...patch } }
      })
    )
  }

  function onStatusChange(row: Row, next: AttendanceStatus) {
    const snapshot = { ...row }
    updateLocal(row.player.id, { attendanceStatus: next })
    sendPatch(row.player.id, { attendanceStatus: next }, snapshot)
  }

  function onRatingChange(row: Row, raw: string) {
    const snapshot = { ...row }
    const next = raw === '' ? null : parseInt(raw)
    if (next !== null && (!Number.isFinite(next) || next < 1 || next > 10)) return
    updateLocal(row.player.id, { rating: next })
    debouncedPatch(row.player.id, { rating: next }, snapshot)
  }

  function onNotesChange(row: Row, next: string) {
    const snapshot = { ...row }
    updateLocal(row.player.id, { notes: next })
    debouncedPatch(row.player.id, { notes: next || null }, snapshot)
  }

  if (!initialized) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="text-gray-500 mb-4">Aún no se ha inicializado la asistencia para este partido.</p>
        <button
          onClick={handleInit}
          disabled={initializing}
          className="bg-navy text-cream px-5 py-2 rounded-lg text-sm font-semibold hover:bg-navy-light disabled:opacity-50"
        >
          {initializing ? 'Inicializando…' : 'Inicializar asistencia'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          {STATUSES.map(s => (
            <span
              key={s.value}
              className={`text-xs px-2.5 py-1 rounded-full border ${s.badgeClass}`}
            >
              {s.label}: {counters[s.value]}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleBroadcast}
            disabled={broadcasting || pendingWithPhone === 0}
            title={pendingWithPhone === 0 ? 'No hay pendientes con WhatsApp' : `${pendingWithPhone} jugador(es) pendiente(s) con WhatsApp`}
            className="text-xs px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {broadcasting ? 'Enviando…' : `Enviar encuesta WhatsApp (${pendingWithPhone})`}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-xs sm:text-sm min-w-[900px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-medium">
              <th className="px-2 py-2 sm:px-3 sm:py-3 text-left">#</th>
              <th className="px-2 py-2 sm:px-3 sm:py-3 text-left">Jugador</th>
              <th className="px-2 py-2 sm:px-3 sm:py-3 text-left">WhatsApp</th>
              <th className="px-2 py-2 sm:px-3 sm:py-3 text-left">Estado</th>
              <th className="px-2 py-2 sm:px-3 sm:py-3 text-left">Rating</th>
              <th className="px-2 py-2 sm:px-3 sm:py-3 text-left">Notas</th>
              <th className="px-2 py-2 sm:px-3 sm:py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const pm = r.playerMatch
              const status = pm?.attendanceStatus ?? 'PENDING'
              const saveState = saveStates[r.player.id] ?? 'idle'
              return (
                <tr key={r.player.id} className="border-b border-gray-50 hover:bg-gray-50 align-middle">
                  <td className="px-2 py-1.5 sm:px-3 sm:py-2 text-gray-400">{r.player.number ?? '—'}</td>
                  <td className="px-2 py-1.5 sm:px-3 sm:py-2">
                    <div className="flex items-center gap-2">
                      {r.player.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.player.photoUrl}
                          alt={r.player.name}
                          className="w-8 h-8 rounded-full object-cover border border-cream-dark"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-navy/10 flex items-center justify-center text-navy text-xs font-bold">
                          {r.player.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-navy">{r.player.name}</div>
                        <div className="text-xs text-gray-400">{r.player.position ?? ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 sm:px-3 sm:py-2 text-xs text-gray-500">
                    {formatPhone(r.player.phoneNumber)}
                  </td>
                  <td className="px-2 py-1.5 sm:px-3 sm:py-2">
                    <select
                      value={status}
                      onChange={(e) => onStatusChange(r, e.target.value as AttendanceStatus)}
                      className={`text-xs border rounded-full px-2 py-1 ${badgeFor(status)}`}
                    >
                      {STATUSES.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 sm:px-3 sm:py-2">
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={pm?.rating ?? ''}
                      onChange={(e) => onRatingChange(r, e.target.value)}
                      placeholder="—"
                      className="w-14 border border-gray-200 rounded px-1.5 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-navy"
                    />
                  </td>
                  <td className="px-2 py-1.5 sm:px-3 sm:py-2">
                    <input
                      type="text"
                      value={pm?.notes ?? ''}
                      onChange={(e) => onNotesChange(r, e.target.value)}
                      placeholder="—"
                      className="w-40 border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-navy"
                    />
                  </td>
                  <td className="px-2 py-1.5 sm:px-3 sm:py-2 min-w-[24px] text-center">
                    {saveState === 'saving' && (
                      <span className="inline-block w-3 h-3 rounded-full border-2 border-gray-300 border-t-navy animate-spin" />
                    )}
                    {saveState === 'saved' && (
                      <span className="text-green-600 text-xs">✓</span>
                    )}
                    {saveState === 'error' && (
                      <span className="text-red-500 text-xs">!</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface LockToggleProps {
  matchId: number
  initialLocked: boolean
}

export function LockToggle({ matchId, initialLocked }: LockToggleProps) {
  const router = useRouter()
  const [locked, setLocked] = useState(initialLocked)
  const [loading, setLoading] = useState(false)

  const handleToggle = async () => {
    if (!confirm(
      locked
        ? '¿Desbloquear partido?\n\nEsto permitirá que el scraper actualice automáticamente los goles/asistencias en el próximo scrape.'
        : '¿Bloquear partido?\n\nEsto impedirá que el scraper sobrescriba los goles/asistencias de este partido.'
    )) {
      return
    }

    setLoading(true)

    try {
      const res = await fetch(`/api/admin/matches/${matchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventsLocked: !locked }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al actualizar')
      }

      setLocked(!locked)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al actualizar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        locked
          ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
          : 'bg-blue-100 text-blue-900 hover:bg-blue-200 border border-blue-300'
      }`}
    >
      {loading ? 'Actualizando...' : locked ? '🔒 Desbloquear partido' : '🔓 Bloquear partido'}
    </button>
  )
}

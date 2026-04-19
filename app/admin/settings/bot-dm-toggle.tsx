'use client'

import { useState, useTransition } from 'react'

export function BotDmToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const toggle = () => {
    const next = !enabled
    setEnabled(next)
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/bot-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aiAllowDms: next }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } catch (err) {
        setEnabled(!next)
        setError(err instanceof Error ? err.message : 'error')
      }
    })
  }

  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="font-medium text-navy">Permitir mensajes al interno</p>
        <p className="text-xs text-gray-500 mt-1">
          Si está activo, el bot también responde DMs privados (útil para debug).
          Por defecto solo responde en el grupo del equipo.
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={enabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2 ${
          enabled ? 'bg-navy' : 'bg-gray-300'
        } ${pending ? 'opacity-60' : ''}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      {error && <span className="text-xs text-red-500 ml-3">{error}</span>}
    </div>
  )
}

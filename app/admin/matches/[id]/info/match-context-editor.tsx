'use client'

import { useState } from 'react'

interface MatchContextEditorProps {
  matchId: number
  initialContext: string | null
}

export function MatchContextEditor({ matchId, initialContext }: MatchContextEditorProps) {
  const [context, setContext] = useState(initialContext || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch(`/api/admin/matches/${matchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: context.trim() || null }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al guardar')
      }

      setMessage({ type: 'success', text: '✓ Contexto guardado exitosamente' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al guardar',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <textarea
        value={context}
        onChange={e => setContext(e.target.value)}
        placeholder="Ej: Partido jugado con lluvia intensa. Juan Pérez jugó lesionado desde el minuto 30..."
        className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 min-h-[120px]"
        maxLength={5000}
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">{context.length} / 5000 caracteres</span>
        {message && (
          <span
            className={`text-xs ${
              message.type === 'success' ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {message.text}
          </span>
        )}
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-3 px-4 py-2 bg-navy text-cream rounded-lg text-sm font-medium hover:bg-navy-light disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'Guardando...' : 'Guardar Contexto'}
      </button>
    </div>
  )
}

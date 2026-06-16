'use client'

import { useState, useTransition } from 'react'

type Status = {
  configured: boolean
  source: 'db' | 'env' | 'none'
  tokenPreview: string | null
  tokenExpiresAt: string | null
  lastRefreshAt: string | null
  lastRefreshError: string | null
}

function fmt(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
}

export function InstagramTokenForm({ initial }: { initial: Status }) {
  const [status, setStatus] = useState(initial)
  const [token, setToken] = useState('')
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const refreshStatus = async () => {
    const res = await fetch('/api/admin/instagram-config')
    if (res.ok) setStatus(await res.json())
  }

  const save = () => {
    setMsg(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/instagram-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
        setToken('')
        setMsg({ kind: 'ok', text: 'Token guardado.' })
        await refreshStatus()
      } catch (err) {
        setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'error' })
      }
    })
  }

  const refreshNow = () => {
    setMsg(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/instagram-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'refresh' }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
        setMsg({ kind: 'ok', text: 'Token renovado por 60 días más.' })
        await refreshStatus()
      } catch (err) {
        setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'error' })
      }
    })
  }

  const expired = status.tokenExpiresAt ? new Date(status.tokenExpiresAt).getTime() <= Date.now() : false

  return (
    <div className="space-y-4">
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between items-center py-2 border-b border-gray-50">
          <dt className="text-gray-500">Estado</dt>
          <dd>
            {!status.configured ? (
              <span className="text-red-500 font-semibold">✗ Sin token</span>
            ) : expired ? (
              <span className="text-red-500 font-semibold">✗ Vencido</span>
            ) : (
              <span className="text-green-600 font-semibold">✓ Activo</span>
            )}
          </dd>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-gray-50">
          <dt className="text-gray-500">Token</dt>
          <dd className="font-mono text-navy">
            {status.tokenPreview ?? '—'}{' '}
            <span className="text-xs text-gray-400">({status.source})</span>
          </dd>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-gray-50">
          <dt className="text-gray-500">Vence</dt>
          <dd className={`font-semibold ${expired ? 'text-red-500' : 'text-navy'}`}>
            {fmt(status.tokenExpiresAt)}
          </dd>
        </div>
        <div className="flex justify-between items-center py-2">
          <dt className="text-gray-500">Última renovación</dt>
          <dd className="text-navy">{fmt(status.lastRefreshAt)}</dd>
        </div>
      </dl>

      {status.lastRefreshError && (
        <p className="text-xs text-red-500 bg-red-50 rounded p-2">
          Último error de renovación: {status.lastRefreshError}
        </p>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-navy">Pegar nuevo token de larga duración</label>
        <input
          type="password"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="IGAA…"
          autoComplete="off"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-navy"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending || token.trim().length < 20}
            className="bg-navy text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
          >
            Guardar token
          </button>
          <button
            type="button"
            onClick={refreshNow}
            disabled={pending || !status.configured}
            className="border border-navy text-navy text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
          >
            Refrescar ahora
          </button>
          {msg && (
            <span className={`text-xs ${msg.kind === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
              {msg.text}
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        El token se renueva solo cada lunes (cron <code>refresh-ig-token</code>). Si llegó a vencer,
        generá uno nuevo en el Graph API Explorer y pegalo acá — no se puede refrescar uno ya vencido.
      </p>
    </div>
  )
}

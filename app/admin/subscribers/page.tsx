'use client'

import { useState, useEffect } from 'react'

interface Subscriber {
  id: number
  email: string
  subscribedAt: string
  active: boolean
}

export default function AdminSubscribersPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [active, setActive] = useState(0)
  const [actionId, setActionId] = useState<number | null>(null)

  async function fetchSubscribers() {
    const res = await fetch('/api/subscribers')
    const data = await res.json()
    setSubscribers(data.subscribers ?? [])
    setTotal(data.total ?? 0)
    setActive(data.active ?? 0)
    setLoading(false)
  }

  useEffect(() => { fetchSubscribers() }, [])

  async function deactivate(id: number) {
    if (!confirm('¿Desactivar este suscriptor?')) return
    setActionId(id)
    await fetch(`/api/subscribers?id=${id}`, { method: 'DELETE' })
    await fetchSubscribers()
    setActionId(null)
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-navy mb-2">Suscriptores</h1>
      <p className="text-gray-400 text-sm mb-8">Personas suscritas al newsletter de AC SED.</p>

      {!loading && (
        <div className="flex gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 text-center min-w-[120px]">
            <p className="text-3xl font-extrabold text-navy">{total}</p>
            <p className="text-xs text-gray-400 mt-1">Total</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 text-center min-w-[120px]">
            <p className="text-3xl font-extrabold text-green-600">{active}</p>
            <p className="text-xs text-gray-400 mt-1">Activos</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 text-center min-w-[120px]">
            <p className="text-3xl font-extrabold text-gray-400">{total - active}</p>
            <p className="text-xs text-gray-400 mt-1">Inactivos</p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Cargando…</p>
      ) : subscribers.length === 0 ? (
        <p className="text-gray-400">No hay suscriptores aún.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Email</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Suscrito el</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Estado</th>
                <th className="px-4 py-3 text-right text-gray-500 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-navy font-medium">{s.email}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(s.subscribedAt).toLocaleDateString('es-CL')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${s.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.active && (
                      <button
                        onClick={() => deactivate(s.id)}
                        disabled={actionId === s.id}
                        className="text-xs px-3 py-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40"
                      >
                        Desactivar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

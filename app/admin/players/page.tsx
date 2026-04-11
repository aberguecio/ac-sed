'use client'

import { useState, useEffect } from 'react'

interface Player {
  id: number
  name: string
  position: string | null
  number: number | null
  bio: string | null
  active: boolean
}

const emptyForm = { name: '', position: '', number: '', bio: '' }

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  async function fetchPlayers() {
    const res = await fetch('/api/players')
    setPlayers(await res.json())
    setLoading(false)
  }

  useEffect(() => { fetchPlayers() }, [])

  function startEdit(p: Player) {
    setEditId(p.id)
    setForm({ name: p.name, position: p.position ?? '', number: p.number?.toString() ?? '', bio: p.bio ?? '' })
  }

  function cancelEdit() {
    setEditId(null)
    setForm(emptyForm)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const body = {
      name: form.name,
      position: form.position || null,
      number: form.number ? parseInt(form.number) : null,
      bio: form.bio || null,
    }
    if (editId) {
      await fetch(`/api/players/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } else {
      await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    }
    setForm(emptyForm)
    setEditId(null)
    await fetchPlayers()
    setSaving(false)
  }

  async function deletePlayer(id: number) {
    if (!confirm('¿Eliminar jugador?')) return
    await fetch(`/api/players/${id}`, { method: 'DELETE' })
    await fetchPlayers()
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-navy mb-8">Jugadores</h1>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Form */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-navy mb-4">{editId ? 'Editar Jugador' : 'Nuevo Jugador'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { name: 'name', label: 'Nombre *', placeholder: 'Juan Pérez', required: true },
              { name: 'position', label: 'Posición', placeholder: 'Delantero, Arquero…' },
              { name: 'number', label: 'Número', placeholder: '9', type: 'number' },
              { name: 'bio', label: 'Bio', placeholder: 'Pequeña descripción…' },
            ].map(({ name, label, placeholder, required, type }) => (
              <div key={name}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input
                  type={type ?? 'text'}
                  value={form[name as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [name]: e.target.value })}
                  placeholder={placeholder}
                  required={required}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
                />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-navy text-cream py-2 rounded-lg text-sm font-semibold hover:bg-navy-light disabled:opacity-50"
              >
                {saving ? 'Guardando…' : editId ? 'Guardar' : 'Crear'}
              </button>
              {editId && (
                <button type="button" onClick={cancelEdit} className="px-4 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50">
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Table */}
        <div className="lg:col-span-2">
          {loading ? (
            <p className="text-gray-400 text-sm">Cargando…</p>
          ) : players.length === 0 ? (
            <p className="text-gray-400 text-sm">Sin jugadores. Crea el primero.</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-gray-500 font-medium">#</th>
                    <th className="px-4 py-3 text-left text-gray-500 font-medium">Nombre</th>
                    <th className="px-4 py-3 text-left text-gray-500 font-medium">Posición</th>
                    <th className="px-4 py-3 text-right text-gray-500 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400">{p.number ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-navy">{p.name}</td>
                      <td className="px-4 py-3 text-gray-500">{p.position ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => startEdit(p)} className="text-xs px-3 py-1.5 rounded bg-navy text-cream hover:bg-navy-light">
                            Editar
                          </button>
                          <button onClick={() => deletePlayer(p.id)} className="text-xs px-3 py-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100">
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

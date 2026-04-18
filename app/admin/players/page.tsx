'use client'

import { useState, useEffect, useRef } from 'react'
import { HexagonStats, type PlayerStats } from '@/components/hexagon-stats'
import { TagsInput } from '@/components/tags-input'

interface Player {
  id: number
  name: string
  position: string | null
  number: number | null
  photoUrl: string | null
  bio: string | null
  active: boolean
  leaguePlayerId: number | null
  phoneNumber: string | null
  nicknames: string[]
  statRitmo: number | null
  statDisparo: number | null
  statPase: number | null
  statRegate: number | null
  statDefensa: number | null
  statFisico: number | null
  attended: number
  totalMatches: number
}

interface ScrapedPlayer {
  id: number
  firstName: string
  lastName: string
  teamName: string
  _count: {
    goals: number
    cards: number
  }
}

const STAT_KEYS: { key: keyof PlayerStats; label: string; color: string }[] = [
  { key: 'statRitmo', label: 'Ritmo', color: '#4ade80' },
  { key: 'statDisparo', label: 'Disparo', color: '#f87171' },
  { key: 'statPase', label: 'Pase', color: '#60a5fa' },
  { key: 'statRegate', label: 'Regate', color: '#fbbf24' },
  { key: 'statDefensa', label: 'Defensa', color: '#a78bfa' },
  { key: 'statFisico', label: 'Físico', color: '#fb923c' },
]

const emptyStats: PlayerStats = {
  statRitmo: null,
  statDisparo: null,
  statPase: null,
  statRegate: null,
  statDefensa: null,
  statFisico: null,
}

const emptyForm = { name: '', position: '', number: '', bio: '', phoneNumber: '' }

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [stats, setStats] = useState<PlayerStats>(emptyStats)
  const [nicknames, setNicknames] = useState<string[]>([])
  const [active, setActive] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Image state
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Linking state
  const [unlinkedScraped, setUnlinkedScraped] = useState<ScrapedPlayer[]>([])
  const [allUnlinkedScraped, setAllUnlinkedScraped] = useState<ScrapedPlayer[]>([])
  const [linkingPlayerId, setLinkingPlayerId] = useState<number | null>(null)
  const [scrapingLigaB, setScrapingLigaB] = useState(false)

  async function fetchPlayers() {
    const res = await fetch('/api/players?includeInactive=true')
    setPlayers(await res.json())
    setLoading(false)
  }

  async function fetchLinkData() {
    const res = await fetch('/api/admin/players/link')
    const data = await res.json()
    setUnlinkedScraped(data.unlinkedScraped || [])
    setAllUnlinkedScraped(data.allUnlinkedScraped || [])
  }

  useEffect(() => {
    fetchPlayers()
    fetchLinkData()
  }, [])

  useEffect(() => {
    if (!drawerOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDrawer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  function resetForm() {
    setEditId(null)
    setForm(emptyForm)
    setStats(emptyStats)
    setNicknames([])
    setActive(true)
    setPhotoUrl(null)
    setPhotoPreview(null)
    setPhotoFile(null)
  }

  function openCreate() {
    resetForm()
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    // defer reset so the exit animation sees the old values
    setTimeout(resetForm, 300)
  }

  function startEdit(p: Player) {
    setEditId(p.id)
    setForm({
      name: p.name,
      position: p.position ?? '',
      number: p.number?.toString() ?? '',
      bio: p.bio ?? '',
      phoneNumber: p.phoneNumber ?? '',
    })
    setStats({
      statRitmo: p.statRitmo,
      statDisparo: p.statDisparo,
      statPase: p.statPase,
      statRegate: p.statRegate,
      statDefensa: p.statDefensa,
      statFisico: p.statFisico,
    })
    setNicknames(p.nicknames ?? [])
    setActive(p.active)
    setPhotoUrl(p.photoUrl)
    setPhotoPreview(p.photoUrl)
    setPhotoFile(null)
    setDrawerOpen(true)
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function uploadPhoto(playerId: number): Promise<string | null> {
    if (!photoFile) return photoUrl
    setUploadingPhoto(true)
    const fd = new FormData()
    fd.append('file', photoFile)
    fd.append('playerId', String(playerId))
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    setUploadingPhoto(false)
    if (!res.ok) {
      alert('Error al subir la foto')
      return null
    }
    const data = await res.json()
    return data.url as string
  }

  function setStat(key: keyof PlayerStats, value: string) {
    const num = value === '' ? null : Math.max(0, Math.min(99, parseInt(value) || 0))
    setStats((prev) => ({ ...prev, [key]: num }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const baseBody = {
      name: form.name,
      position: form.position || null,
      number: form.number ? parseInt(form.number) : null,
      bio: form.bio || null,
      phoneNumber: form.phoneNumber.trim() === '' ? null : form.phoneNumber.trim(),
      nicknames,
      active,
      ...Object.fromEntries(
        Object.entries(stats).map(([k, v]) => [k, v ?? null])
      ),
    }

    let savedId = editId

    if (editId) {
      const res = await fetch(`/api/players/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(baseBody),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Error al guardar')
        setSaving(false)
        return
      }
    } else {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(baseBody),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Error al crear')
        setSaving(false)
        return
      }
      const created = await res.json()
      savedId = created.id
    }

    // Upload photo if a new file was selected
    if (photoFile && savedId) {
      const url = await uploadPhoto(savedId)
      if (url) {
        await fetch(`/api/players/${savedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoUrl: url }),
        })
      }
    }

    closeDrawer()
    await fetchPlayers()
    setSaving(false)
  }

  async function toggleActive(p: Player) {
    const next = !p.active
    const msg = next
      ? `¿Reactivar a ${p.name}? Volverá a aparecer en el plantel.`
      : `¿Desactivar a ${p.name}? Ya no aparecerá en el plantel público.`
    if (!confirm(msg)) return
    await fetch(`/api/players/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: next }),
    })
    await fetchPlayers()
  }

  async function linkPlayer(rosterPlayerId: number, scrapedPlayerId: number) {
    setLinkingPlayerId(rosterPlayerId)
    await fetch('/api/admin/players/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rosterPlayerId, scrapedPlayerId })
    })
    await fetchPlayers()
    await fetchLinkData()
    setLinkingPlayerId(null)
  }

  async function updateFromLigaB() {
    setScrapingLigaB(true)
    try {
      const res = await fetch('/api/admin/players/scrape', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Error al actualizar desde Liga B')
        return
      }
      const failedMsg = data.failed?.length ? ` · ${data.failed.length} fallaron` : ''
      alert(`Actualizado: ${data.created} nuevos, ${data.updated} actualizados${failedMsg}`)
      await fetchLinkData()
    } finally {
      setScrapingLigaB(false)
    }
  }

  async function generatePlayer(scrapedPlayerId: number) {
    setSaving(true)
    const res = await fetch('/api/admin/players/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scrapedPlayerId })
    })

    const data = await res.json()

    if (!res.ok) {
      alert(data.error || 'Error al generar jugador')
    }

    await fetchPlayers()
    await fetchLinkData()
    setSaving(false)
  }

  // Orden: activos primero → más asistencia primero → número asc → nombre asc
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    if (a.attended !== b.attended) return b.attended - a.attended
    if (a.number !== b.number) {
      if (a.number == null) return 1
      if (b.number == null) return -1
      return a.number - b.number
    }
    return a.name.localeCompare(b.name)
  })

  const previewStats: PlayerStats = {
    statRitmo: stats.statRitmo ?? 0,
    statDisparo: stats.statDisparo ?? 0,
    statPase: stats.statPase ?? 0,
    statRegate: stats.statRegate ?? 0,
    statDefensa: stats.statDefensa ?? 0,
    statFisico: stats.statFisico ?? 0,
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <h1 className="text-2xl font-extrabold text-navy">Jugadores</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={updateFromLigaB}
            disabled={scrapingLigaB}
            className="border border-navy text-navy px-4 py-2 rounded-lg text-sm font-semibold hover:bg-navy hover:text-cream disabled:opacity-50"
          >
            {scrapingLigaB ? 'Actualizando…' : '↻ Actualizar desde Liga B'}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="bg-navy text-cream px-4 py-2 rounded-lg text-sm font-semibold hover:bg-navy-light"
          >
            + Nuevo jugador
          </button>
        </div>
      </div>

      {/* Drawer backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-200 ${
          drawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeDrawer}
      />

      {/* Drawer panel */}
      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white z-50 shadow-2xl overflow-y-auto transition-transform duration-300 ease-out ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!drawerOpen}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="font-bold text-navy">{editId ? 'Editar Jugador' : 'Nuevo Jugador'}</h2>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Cerrar"
            className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-navy hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Active toggle */}
            <label className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 cursor-pointer">
              <div>
                <div className="text-sm font-medium text-navy">Activo en plantel</div>
                <div className="text-[11px] text-gray-500">
                  {active ? 'Aparece en el plantel público y en asistencia.' : 'Oculto del plantel público.'}
                </div>
              </div>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-5 h-5 accent-navy cursor-pointer"
              />
            </label>

            {/* Basic fields */}
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

            {/* Phone */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono (WhatsApp)</label>
              <input
                type="tel"
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                placeholder="+56 9 9562 0994"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
              />
              <p className="text-[11px] text-gray-400 mt-1">Opcional. Usado para consulta de asistencia.</p>
            </div>

            {/* Nicknames */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Apodos / Sobrenombres</label>
              <TagsInput
                value={nicknames}
                onChange={setNicknames}
                placeholder="Pancho, Tito..."
              />
              <p className="text-[11px] text-gray-400 mt-1">Presiona Enter o coma para agregar. Usados para posts e IA.</p>
            </div>

            {/* Photo upload */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Foto del jugador</label>
              <div className="flex items-center gap-3">
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoPreview}
                    alt="preview"
                    className="w-14 h-14 rounded-full object-cover border-2 border-wheat"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-cream-dark flex items-center justify-center text-gray-400 text-xs border-2 border-dashed border-gray-300">
                    Sin foto
                  </div>
                )}
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border border-dashed border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-500 hover:border-navy hover:text-navy transition-colors"
                  >
                    {photoPreview ? 'Cambiar foto' : 'Subir foto'}
                  </button>
                  {photoPreview && (
                    <button
                      type="button"
                      onClick={() => { setPhotoPreview(null); setPhotoFile(null); setPhotoUrl(null) }}
                      className="w-full mt-1 text-xs text-red-400 hover:text-red-600"
                    >
                      Quitar foto
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Estadísticas (0–99)</label>
              </div>

              {/* Hexagon preview */}
              <div className="flex justify-center bg-navy rounded-xl py-3 mb-4">
                <HexagonStats stats={previewStats} size={150} />
              </div>

              <div className="space-y-3">
                {STAT_KEYS.map(({ key, label, color }) => {
                  const val = stats[key] ?? 0
                  return (
                    <div key={key}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-gray-600">{label}</span>
                        <span className="text-xs font-bold text-navy w-8 text-right">{stats[key] ?? '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={99}
                          value={val}
                          onChange={(e) => setStat(key, e.target.value)}
                          style={{ accentColor: color }}
                          className="flex-1 h-1.5 rounded cursor-pointer"
                        />
                        <input
                          type="number"
                          min={0}
                          max={99}
                          value={stats[key] ?? ''}
                          onChange={(e) => setStat(key, e.target.value)}
                          placeholder="—"
                          className="w-12 border border-gray-200 rounded px-1 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-navy"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving || uploadingPhoto}
                className="flex-1 bg-navy text-cream py-2 rounded-lg text-sm font-semibold hover:bg-navy-light disabled:opacity-50"
              >
                {saving || uploadingPhoto ? 'Guardando…' : editId ? 'Guardar' : 'Crear'}
              </button>
              <button type="button" onClick={closeDrawer} className="px-4 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </aside>

      {/* Table */}
      <div>
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
                    <th className="px-4 py-3 text-left text-gray-500 font-medium">Jugador</th>
                    <th className="px-4 py-3 text-left text-gray-500 font-medium">Posición</th>
                    <th className="px-4 py-3 text-left text-gray-500 font-medium">Asistencia</th>
                    <th className="px-4 py-3 text-left text-gray-500 font-medium">Stats</th>
                    <th className="px-4 py-3 text-left text-gray-500 font-medium">Vinculación</th>
                    <th className="px-4 py-3 text-right text-gray-500 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((p) => {
                    const hasStats = STAT_KEYS.some(({ key }) => p[key] != null)
                    const attendancePct = p.totalMatches > 0
                      ? Math.round((p.attended / p.totalMatches) * 100)
                      : null
                    return (
                      <tr key={p.id} className={`border-b border-gray-50 hover:bg-gray-50 ${p.active ? '' : 'opacity-60'}`}>
                        <td className="px-4 py-3 text-gray-400">{p.number ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {p.photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.photoUrl} alt={p.name} className={`w-8 h-8 rounded-full object-cover border border-cream-dark ${p.active ? '' : 'grayscale'}`} />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-navy/10 flex items-center justify-center text-navy text-xs font-bold">
                                {p.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                              </div>
                            )}
                            <span className="font-medium text-navy">{p.name}</span>
                            {!p.active && (
                              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-semibold">
                                Inactivo
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{p.position ?? '—'}</td>
                        <td className="px-4 py-3">
                          {p.totalMatches === 0 ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : (
                            <span
                              className="text-xs text-navy font-medium tabular-nums"
                              title={`${p.attended} asistencias de ${p.totalMatches} partidos registrados`}
                            >
                              {p.attended}/{p.totalMatches}
                              <span className="ml-1 text-gray-400">({attendancePct}%)</span>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {hasStats ? (
                            <span className="text-xs text-wheat font-semibold">✦ Con stats</span>
                          ) : (
                            <span className="text-xs text-gray-300">Sin stats</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {p.leaguePlayerId ? (
                            <span className="text-xs text-green-600 font-semibold">✓ Vinculado</span>
                          ) : (
                            <select
                              onChange={(e) => {
                                const scrapedId = parseInt(e.target.value)
                                if (scrapedId) linkPlayer(p.id, scrapedId)
                              }}
                              disabled={linkingPlayerId === p.id}
                              className="text-xs border border-gray-300 rounded px-2 py-1 max-w-[180px] truncate"
                            >
                              <option value="">Vincular...</option>
                              {allUnlinkedScraped.map((sp) => (
                                <option key={sp.id} value={sp.id}>
                                  {sp.firstName} {sp.lastName}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => startEdit(p)} className="text-xs px-3 py-1.5 rounded bg-navy text-cream hover:bg-navy-light">
                              Editar
                            </button>
                            <button
                              onClick={() => toggleActive(p)}
                              className={
                                p.active
                                  ? 'text-xs px-3 py-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100'
                                  : 'text-xs px-3 py-1.5 rounded bg-green-50 text-green-700 hover:bg-green-100'
                              }
                            >
                              {p.active ? 'Desactivar' : 'Reactivar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* Unlinked Scraped Players */}
      {unlinkedScraped.length > 0 && (
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h2 className="font-bold text-navy mb-4">🔗 Jugadores Scrapeados de AC SED sin Vincular</h2>
          <p className="text-sm text-gray-600 mb-4">Estos jugadores fueron encontrados en partidos pero no están en el roster. Puedes generar un jugador automáticamente.</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {unlinkedScraped.map((sp) => (
              <div key={sp.id} className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="font-semibold text-navy">{sp.firstName} {sp.lastName}</p>
                <p className="text-xs text-gray-500 mb-2">{sp.teamName}</p>
                <p className="text-sm text-gray-600 mb-3">
                  {sp._count.goals} gol{sp._count.goals !== 1 ? 'es' : ''} • {sp._count.cards} tarjeta{sp._count.cards !== 1 ? 's' : ''}
                </p>
                <button
                  onClick={() => generatePlayer(sp.id)}
                  disabled={saving}
                  className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                >
                  Generar Jugador
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

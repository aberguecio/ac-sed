'use client'

import { useState, useEffect, useCallback } from 'react'
import { BackgroundUploadModal } from '@/components/background-upload-modal'

interface PostImage {
  id: number
  imageUrl: string
  backgroundUrl: string | null
  orderIndex: number
}

interface Post {
  id: number
  caption: string
  postType: string
  matchId: number | null
  igMediaId: string | null
  status: string
  errorMessage: string | null
  publishedAt: string | null
  aiProvider: string | null
  generatedAt: string
  images: PostImage[]
  match?: {
    id: number
    date: string
    homeScore: number | null
    awayScore: number | null
    venue: string | null
    homeTeam: { name: string } | null
    awayTeam: { name: string } | null
  } | null
}

interface Match {
  id: number
  date: string
  homeScore: number | null
  awayScore: number | null
  venue: string | null
  homeTeam: { name: string } | null
  awayTeam: { name: string } | null
}

interface Background {
  id: number
  name: string
  imageUrl: string
  usageCount: number
  autoEligible: boolean
  showOnHome: boolean
  aiProvider?: string | null
  aiPrompt?: string | null
  aiModel?: string | null
}

const AI_PROMPT_PRESETS = [
  'atardecer épico en cancha urbana',
  'estilo cinematográfico nocturno con luces de estadio',
  'doble exposición jugadores y cancha',
  'fondo abstracto con textura, paleta SED',
]

export default function InstagramAdminPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [actionId, setActionId] = useState<number | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Create modal state
  const [showCreate, setShowCreate] = useState(false)
  const [createType, setCreateType] = useState<'result' | 'promo' | 'custom'>('result')
  const [createMatchId, setCreateMatchId] = useState('')
  const [matches, setMatches] = useState<Match[]>([])
  const [creating, setCreating] = useState(false)

  // Edit modal state
  const [editCaption, setEditCaption] = useState('')
  const [savingCaption, setSavingCaption] = useState(false)
  const [generatingImage, setGeneratingImage] = useState<string | null>(null)
  const [templates, setTemplates] = useState<string[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [showTemplateModal, setShowTemplateModal] = useState<string | null>(null) // imageType being generated
  const [uploadingCustom, setUploadingCustom] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  // Backgrounds state
  const [backgrounds, setBackgrounds] = useState<Background[]>([])
  const [bgUploadQueue, setBgUploadQueue] = useState<File[] | null>(null)

  // AI background generator modal
  const [showAiBgModal, setShowAiBgModal] = useState(false)
  const [aiBgPrompt, setAiBgPrompt] = useState('')
  const [aiBgRefIds, setAiBgRefIds] = useState<number[]>([])
  const [aiBgName, setAiBgName] = useState('')
  const [generatingBg, setGeneratingBg] = useState(false)

  const fetchPosts = useCallback(async () => {
    const res = await fetch('/api/instagram?perPage=50')
    const data = await res.json()
    setPosts(data.posts ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  // Fetch templates + backgrounds on mount
  const fetchTemplates = useCallback(() => {
    fetch('/api/instagram/templates')
      .then(r => r.json())
      .then(d => {
        setTemplates(d.templates ?? [])
        setBackgrounds(d.backgrounds ?? [])
      })
      .catch(() => {})
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  // Fetch matches for create modal
  useEffect(() => {
    if (showCreate) {
      fetch('/api/instagram/matches')
        .then(r => r.json())
        .then(data => {
          const all = [
            ...(data.played ?? []),
            ...(data.upcoming ?? []),
          ]
          setMatches(all)
        })
        .catch(() => {})
    }
  }, [showCreate])

  const openEdit = async (post: Post) => {
    // Fetch full detail
    const res = await fetch(`/api/instagram/${post.id}`)
    const data = await res.json()
    setEditingPost(data)
    setEditCaption(data.caption)
  }

  const saveCaption = async () => {
    if (!editingPost) return
    setSavingCaption(true)
    const res = await fetch(`/api/instagram/${editingPost.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption: editCaption }),
    })
    const updated = await res.json()
    setSavingCaption(false)
    setEditingPost({ ...editingPost, ...updated, caption: editCaption })
    setPosts(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p))
    setSuccessMsg('Caption guardado')
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const regenerateCaption = async () => {
    if (!editingPost) return
    setActionId(editingPost.id)
    const res = await fetch(`/api/instagram/${editingPost.id}/regenerate`, { method: 'POST' })
    const updated = await res.json()
    setActionId(null)
    if (updated.caption) {
      setEditCaption(updated.caption)
      setEditingPost({ ...editingPost, ...updated })
      setPosts(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p))
    }
  }

  const generateImage = async (imageType: string, backgroundUrl?: string) => {
    if (!editingPost) return
    setGeneratingImage(imageType)
    setShowTemplateModal(null)

    const res = await fetch(`/api/instagram/${editingPost.id}/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageType, backgroundUrl: backgroundUrl || undefined }),
    })
    setGeneratingImage(null)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error desconocido' }))
      alert(`Error generando imagen: ${err.error || res.statusText}`)
      return
    }
    const image = await res.json()
    if (image.imageUrl) {
      const updatedImages = [...(editingPost.images ?? []), image].sort(
        (a, b) => a.orderIndex - b.orderIndex
      )
      setEditingPost({ ...editingPost, images: updatedImages })
      setPosts(prev =>
        prev.map(p => p.id === editingPost.id ? { ...p, images: updatedImages } : p)
      )
    }
  }

  const uploadCustomImage = async (file: File) => {
    if (!editingPost) return
    setUploadingCustom(true)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/instagram/${editingPost.id}/images`, {
      method: 'POST',
      body: formData,
    })
    setUploadingCustom(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error desconocido' }))
      alert(`Error subiendo imagen: ${err.error || res.statusText}`)
      return
    }
    const image = await res.json()
    if (image.imageUrl) {
      const updatedImages = [...(editingPost.images ?? []), image].sort(
        (a, b) => a.orderIndex - b.orderIndex
      )
      setEditingPost({ ...editingPost, images: updatedImages })
      setPosts(prev =>
        prev.map(p => p.id === editingPost.id ? { ...p, images: updatedImages } : p)
      )
    }
  }

  const deleteImage = async (imageId: number) => {
    if (!editingPost) return
    await fetch(`/api/instagram/${editingPost.id}/images?imageId=${imageId}`, { method: 'DELETE' })
    const updatedImages = (editingPost.images ?? []).filter(img => img.id !== imageId)
    setEditingPost({ ...editingPost, images: updatedImages })
    setPosts(prev =>
      prev.map(p => p.id === editingPost.id ? { ...p, images: updatedImages } : p)
    )
  }

  const publishPost = async (post: Post) => {
    if (!confirm('¿Publicar este post en Instagram? Esta acción no se puede deshacer.')) return
    setActionId(post.id)
    const res = await fetch(`/api/instagram/${post.id}/publish`, { method: 'POST' })
    const updated = await res.json()
    setActionId(null)
    if (updated.status === 'published') {
      setPosts(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p))
      setSuccessMsg('Post publicado en Instagram')
      setTimeout(() => setSuccessMsg(null), 5000)
    } else if (updated.error) {
      alert(`Error: ${updated.error}`)
      fetchPosts()
    }
  }

  const deletePost = async (post: Post) => {
    if (!confirm('¿Eliminar este post?')) return
    setActionId(post.id)
    await fetch(`/api/instagram/${post.id}`, { method: 'DELETE' })
    setPosts(prev => prev.filter(p => p.id !== post.id))
    setActionId(null)
  }

  const openBgUploader = (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBgUploadQueue(Array.from(files))
  }

  const deleteBackground = async (id: number) => {
    if (!confirm('¿Eliminar este fondo?')) return
    await fetch(`/api/instagram/backgrounds?id=${id}`, { method: 'DELETE' })
    fetchTemplates()
  }

  const toggleAiRef = (id: number) => {
    setAiBgRefIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 3) {
        alert('Máximo 3 imágenes de referencia')
        return prev
      }
      return [...prev, id]
    })
  }

  const closeAiBgModal = () => {
    if (generatingBg) return
    setShowAiBgModal(false)
    setAiBgPrompt('')
    setAiBgRefIds([])
    setAiBgName('')
  }

  const generateAiBackground = async () => {
    if (!aiBgPrompt.trim()) {
      alert('Escribí un prompt para la generación')
      return
    }
    setGeneratingBg(true)
    try {
      const res = await fetch('/api/instagram/backgrounds/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceIds: aiBgRefIds,
          prompt: aiBgPrompt.trim(),
          name: aiBgName.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        alert(`Error generando fondo: ${err.error}`)
        return
      }
      setShowAiBgModal(false)
      setAiBgPrompt('')
      setAiBgRefIds([])
      setAiBgName('')
      fetchTemplates()
      setSuccessMsg('Fondo AI generado')
      setTimeout(() => setSuccessMsg(null), 3000)
    } finally {
      setGeneratingBg(false)
    }
  }

  const patchBackground = async (id: number, patch: Partial<Pick<Background, 'name' | 'usageCount' | 'autoEligible' | 'showOnHome'>>) => {
    const res = await fetch(`/api/instagram/backgrounds?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(`Error: ${err.error ?? res.statusText}`)
      return
    }
    fetchTemplates()
  }

  const toggleAutoEligible = (bg: Background) =>
    patchBackground(bg.id, { autoEligible: !bg.autoEligible })

  const toggleShowOnHome = (bg: Background) =>
    patchBackground(bg.id, { showOnHome: !bg.showOnHome })

  const editUsageCount = (bg: Background) => {
    const input = prompt('Cantidad de usos:', String(bg.usageCount))
    if (input === null) return
    const n = parseInt(input, 10)
    if (!Number.isFinite(n) || n < 0) {
      alert('Tiene que ser un entero >= 0')
      return
    }
    patchBackground(bg.id, { usageCount: n })
  }

  const renameBackground = (bg: Background) => {
    const input = prompt('Nombre del fondo:', bg.name)
    if (input === null) return
    const trimmed = input.trim()
    if (trimmed.length === 0) {
      alert('Nombre no puede estar vacío')
      return
    }
    patchBackground(bg.id, { name: trimmed })
  }

  const createPost = async () => {
    setCreating(true)
    // If match selected, generate caption via AI by creating then regenerating
    const res = await fetch('/api/instagram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption: 'Generando caption...',
        postType: createType,
        matchId: createMatchId || undefined,
      }),
    })
    const post = await res.json()

    // If match linked, regenerate caption via AI
    if (createMatchId && post.id) {
      const regenRes = await fetch(`/api/instagram/${post.id}/regenerate`, { method: 'POST' })
      const updated = await regenRes.json()
      if (updated.caption) {
        post.caption = updated.caption
      }
    }

    setCreating(false)
    setShowCreate(false)
    setCreateMatchId('')
    fetchPosts()
    if (post.id) openEdit(post)
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'draft': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600">Borrador</span>
      case 'publishing': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-700">Publicando...</span>
      case 'published': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">Publicado</span>
      case 'failed': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">Error</span>
      default: return null
    }
  }

  const typeBadge = (type: string) => {
    switch (type) {
      case 'result': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-wheat/20 text-wheat-dark">Resultado</span>
      case 'promo': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">Promo</span>
      case 'custom': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-500">Custom</span>
      default: return null
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Cargando...</div>

  return (
    <div className="p-4 sm:p-8">
      {/* Success banner */}
      {successMsg && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex justify-between items-center">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-green-600 hover:text-green-800">x</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Instagram</h1>
          <p className="text-gray-500 text-sm mt-1">Gestionar posts de @ac.sed_2023</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-navy text-cream px-4 py-2 rounded-lg text-sm font-semibold hover:bg-navy-light transition-colors"
        >
          + Crear Post
        </button>
      </div>

      {/* Backgrounds section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-navy">Fondos disponibles</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAiBgModal(true)}
              className="text-xs px-3 py-1.5 bg-wheat text-navy font-semibold rounded-lg hover:opacity-80 transition-opacity"
            >
              ✨ Generar con AI
            </button>
            <label className="text-xs px-3 py-1.5 bg-navy text-cream font-semibold rounded-lg cursor-pointer hover:bg-navy-light transition-colors">
              + Subir fondos
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={e => {
                  openBgUploader(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          {backgrounds.length === 0 && templates.length === 0 && (
            <p className="text-gray-400 text-sm">No hay fondos. Sube imagenes para usarlas en los posts.</p>
          )}
          {templates.map(t => (
            <div key={t} className="relative group">
              <img
                src={t}
                alt=""
                className="w-20 h-20 rounded-lg object-cover border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setLightboxUrl(t)}
              />
              <span className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1 py-0.5 rounded">
                local
              </span>
            </div>
          ))}
          {backgrounds.map(bg => (
            <div
              key={bg.id}
              className={`relative group w-28 ${bg.autoEligible ? '' : 'opacity-50'}`}
            >
              <img
                src={bg.imageUrl}
                alt={bg.name}
                className="w-28 h-28 rounded-lg object-cover border border-wheat cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setLightboxUrl(bg.imageUrl)}
              />
              <button
                onClick={() => deleteBackground(bg.id)}
                title="Eliminar"
                className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                x
              </button>
              <button
                onClick={() => editUsageCount(bg)}
                title="Editar cantidad de usos"
                className="absolute top-0.5 left-0.5 bg-navy/80 text-cream text-[10px] px-1.5 py-0.5 rounded font-semibold hover:bg-navy"
              >
                {bg.usageCount} usos
              </button>
              {bg.showOnHome && (
                <span
                  title="Visible en el home"
                  className="absolute top-7 left-0.5 bg-green-600/90 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold"
                >
                  home
                </span>
              )}
              {bg.aiProvider && (
                <span
                  title={`Generado con ${bg.aiProvider}${bg.aiModel ? ` · ${bg.aiModel}` : ''}${bg.aiPrompt ? `\n\nPrompt:\n${bg.aiPrompt}` : ''}`}
                  className="absolute top-0.5 left-1/2 -translate-x-1/2 bg-wheat text-navy text-[10px] px-1.5 py-0.5 rounded font-bold"
                >
                  AI
                </span>
              )}
              <button
                onClick={() => renameBackground(bg)}
                title="Renombrar"
                className="absolute bottom-9 left-0.5 right-0.5 bg-wheat/90 text-navy text-[10px] px-1 py-0.5 rounded font-medium truncate text-left hover:bg-wheat"
              >
                {bg.name}
              </button>
              <div className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] px-1 py-0.5 flex items-center justify-between gap-1 rounded-b-lg">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bg.autoEligible}
                    onChange={() => toggleAutoEligible(bg)}
                    className="w-3 h-3 accent-wheat"
                  />
                  auto
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bg.showOnHome}
                    onChange={() => toggleShowOnHome(bg)}
                    className="w-3 h-3 accent-wheat"
                  />
                  home
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Posts table */}
      {posts.length === 0 ? (
        <p className="text-gray-400 text-center py-12">No hay posts de Instagram todavia</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-xs sm:text-sm min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-2 py-2 sm:px-4 sm:py-3">Tipo</th>
                <th className="px-2 py-2 sm:px-4 sm:py-3">Caption</th>
                <th className="px-2 py-2 sm:px-4 sm:py-3">Imgs</th>
                <th className="px-2 py-2 sm:px-4 sm:py-3">Estado</th>
                <th className="px-2 py-2 sm:px-4 sm:py-3">Fecha</th>
                <th className="px-2 py-2 sm:px-4 sm:py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {posts.map(post => (
                <tr key={post.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-2 py-2 sm:px-4 sm:py-3">{typeBadge(post.postType)}</td>
                  <td className="px-2 py-2 sm:px-4 sm:py-3 max-w-xs">
                    <p className="truncate text-navy font-medium">{post.caption.slice(0, 80)}{post.caption.length > 80 ? '...' : ''}</p>
                    {post.match && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {post.match.homeTeam?.name} {post.match.homeScore ?? '?'} - {post.match.awayScore ?? '?'} {post.match.awayTeam?.name}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-2 sm:px-4 sm:py-3">
                    <div className="flex gap-1">
                      {post.images.slice(0, 3).map(img => (
                        <img key={img.id} src={img.imageUrl} alt="" className="w-8 h-8 rounded object-cover" />
                      ))}
                      {post.images.length === 0 && <span className="text-gray-300 text-xs">Sin img</span>}
                      {post.images.length > 3 && <span className="text-xs text-gray-400">+{post.images.length - 3}</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2 sm:px-4 sm:py-3">
                    {statusBadge(post.status)}
                    {post.status === 'failed' && post.errorMessage && (
                      <p className="text-xs text-red-500 mt-1 max-w-[150px] truncate" title={post.errorMessage}>{post.errorMessage}</p>
                    )}
                  </td>
                  <td className="px-2 py-2 sm:px-4 sm:py-3 text-gray-400 text-xs">
                    {new Date(post.generatedAt).toLocaleDateString('es-CL')}
                    {post.publishedAt && (
                      <p className="text-green-600">Pub: {new Date(post.publishedAt).toLocaleDateString('es-CL')}</p>
                    )}
                  </td>
                  <td className="px-2 py-2 sm:px-4 sm:py-3">
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => openEdit(post)}
                        className="text-xs px-3 py-1.5 bg-wheat text-navy font-semibold rounded hover:opacity-80 disabled:opacity-40"
                        disabled={actionId === post.id}
                      >
                        Editar
                      </button>
                      {post.status === 'draft' && post.images.length > 0 && (
                        <button
                          onClick={() => publishPost(post)}
                          className="text-xs px-3 py-1.5 bg-navy text-cream font-semibold rounded hover:bg-navy-light disabled:opacity-40"
                          disabled={actionId === post.id}
                        >
                          Publicar
                        </button>
                      )}
                      {(post.status === 'draft' || post.status === 'failed') && (
                        <button
                          onClick={() => deletePost(post)}
                          className="text-xs px-3 py-1.5 bg-red-500 text-white font-semibold rounded hover:bg-red-600 disabled:opacity-40"
                          disabled={actionId === post.id}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-navy mb-4">Nuevo Post de Instagram</h2>

            <label className="block text-sm font-medium text-gray-600 mb-1">Tipo de post</label>
            <div className="flex gap-2 mb-4">
              {(['result', 'promo', 'custom'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setCreateType(t)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    createType === t ? 'bg-navy text-cream' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t === 'result' ? 'Resultado' : t === 'promo' ? 'Promo' : 'Custom'}
                </button>
              ))}
            </div>

            {createType !== 'custom' && (
              <>
                <label className="block text-sm font-medium text-gray-600 mb-1">Partido</label>
                <select
                  value={createMatchId}
                  onChange={e => setCreateMatchId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:ring-2 focus:ring-navy/30 focus:outline-none bg-white"
                >
                  <option value="">Seleccionar partido...</option>
                  {matches.map(m => {
                    const date = new Date(m.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                    const home = m.homeTeam?.name ?? 'TBD'
                    const away = m.awayTeam?.name ?? 'TBD'
                    const score = m.homeScore !== null
                      ? `${m.homeScore}-${m.awayScore}`
                      : 'por jugar'
                    return (
                      <option key={m.id} value={m.id}>
                        {date} — {home} vs {away} ({score})
                      </option>
                    )
                  })}
                </select>
              </>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowCreate(false); setCreateMatchId('') }}
                className="text-sm px-4 py-2 text-gray-500 hover:text-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={createPost}
                disabled={creating || (createType !== 'custom' && !createMatchId)}
                className="text-sm px-4 py-2 bg-navy text-cream rounded-lg font-semibold hover:bg-navy-light disabled:opacity-40"
              >
                {creating ? 'Creando...' : 'Crear Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingPost && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-navy">Editar Post</h2>
                {typeBadge(editingPost.postType)}
                {statusBadge(editingPost.status)}
              </div>
              <button onClick={() => setEditingPost(null)} className="text-gray-400 hover:text-gray-600 text-xl">x</button>
            </div>

            <div className="p-6">
              {/* Match info */}
              {editingPost.match && (
                <div className="mb-4 bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                  <span className="font-medium">Partido:</span>{' '}
                  {editingPost.match.homeTeam?.name} {editingPost.match.homeScore ?? '?'} - {editingPost.match.awayScore ?? '?'} {editingPost.match.awayTeam?.name}
                  <span className="ml-3 text-gray-400">
                    {new Date(editingPost.match.date).toLocaleDateString('es-CL')}
                  </span>
                </div>
              )}

              {/* Images section */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-navy mb-3">Imagenes del post</h3>

                {/* Current images */}
                <div className="flex gap-3 flex-wrap mb-3">
                  {(editingPost.images ?? []).map((img, idx) => (
                    <div key={img.id} className="relative group">
                      <img
                        src={img.imageUrl}
                        alt={`Imagen ${idx + 1}`}
                        className="w-32 h-32 rounded-lg object-cover border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setLightboxUrl(img.imageUrl)}
                      />
                      <span className="absolute top-1 left-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">
                        {idx + 1}
                      </span>
                      {editingPost.status === 'draft' && (
                        <button
                          onClick={() => deleteImage(img.id)}
                          className="absolute top-1 right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          x
                        </button>
                      )}
                    </div>
                  ))}
                  {(editingPost.images ?? []).length === 0 && (
                    <p className="text-gray-300 text-sm">Sin imagenes</p>
                  )}
                </div>

                {/* Add image buttons */}
                {editingPost.status === 'draft' && (
                  <div className="flex gap-2 flex-wrap">
                    {editingPost.matchId && (
                      <>
                        <button
                          onClick={() => setShowTemplateModal('result')}
                          disabled={!!generatingImage}
                          className="text-xs px-3 py-1.5 bg-wheat/20 text-wheat-dark font-medium rounded hover:bg-wheat/30 disabled:opacity-40"
                        >
                          {generatingImage === 'result' ? 'Generando...' : '+ Resultado'}
                        </button>
                        <button
                          onClick={() => setShowTemplateModal('standings')}
                          disabled={!!generatingImage}
                          className="text-xs px-3 py-1.5 bg-wheat/20 text-wheat-dark font-medium rounded hover:bg-wheat/30 disabled:opacity-40"
                        >
                          {generatingImage === 'standings' ? 'Generando...' : '+ Tabla'}
                        </button>
                        <button
                          onClick={() => setShowTemplateModal('promo')}
                          disabled={!!generatingImage}
                          className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 font-medium rounded hover:bg-blue-100 disabled:opacity-40"
                        >
                          {generatingImage === 'promo' ? 'Generando...' : '+ Promo'}
                        </button>
                      </>
                    )}
                    <label className={`text-xs px-3 py-1.5 bg-gray-100 text-gray-600 font-medium rounded hover:bg-gray-200 cursor-pointer ${uploadingCustom ? 'opacity-40 pointer-events-none' : ''}`}>
                      {uploadingCustom ? 'Subiendo...' : '+ Subir foto'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (file) uploadCustomImage(file)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Caption section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-navy">Caption</h3>
                  <span className="text-xs text-gray-400">{editCaption.length} / 2200</span>
                </div>
                <textarea
                  value={editCaption}
                  onChange={e => setEditCaption(e.target.value)}
                  rows={8}
                  maxLength={2200}
                  disabled={editingPost.status === 'published'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y focus:ring-2 focus:ring-navy/30 focus:outline-none disabled:bg-gray-50"
                />
                {editingPost.status === 'draft' && editingPost.matchId && (
                  <button
                    onClick={regenerateCaption}
                    disabled={actionId === editingPost.id}
                    className="mt-2 text-xs px-3 py-1.5 bg-gray-100 text-gray-600 font-medium rounded hover:bg-gray-200 disabled:opacity-40"
                  >
                    {actionId === editingPost.id ? 'Regenerando...' : 'Regenerar caption'}
                  </button>
                )}
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                <div>
                  {editingPost.status === 'draft' && (
                    <button
                      onClick={() => { deletePost(editingPost); setEditingPost(null) }}
                      className="text-xs px-3 py-1.5 text-red-500 font-medium hover:text-red-700"
                    >
                      Eliminar post
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  {editingPost.status === 'draft' && (
                    <button
                      onClick={saveCaption}
                      disabled={savingCaption}
                      className="text-sm px-4 py-2 bg-wheat text-navy font-semibold rounded-lg hover:opacity-80 disabled:opacity-40"
                    >
                      {savingCaption ? 'Guardando...' : 'Guardar'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI background generator modal */}
      {showAiBgModal && (
        <div className="fixed inset-0 bg-black/50 z-[65] flex items-center justify-center p-4" onClick={closeAiBgModal}>
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-navy">✨ Generar fondo con AI</h3>
              <button onClick={closeAiBgModal} disabled={generatingBg} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">×</button>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              La AI usa los fondos existentes como referencia y genera uno nuevo. El estilo editorial se aplica desde <code>/admin/ai-config</code>.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 mb-2">
                Referencias <span className="font-normal text-gray-400">({aiBgRefIds.length}/3)</span>
              </label>
              {backgrounds.length === 0 ? (
                <p className="text-xs text-gray-400">No hay fondos para usar como referencia. Subí al menos uno o generá sin refs.</p>
              ) : (
                <div className="flex gap-2 flex-wrap max-h-48 overflow-y-auto p-1 border border-gray-100 rounded-lg">
                  {backgrounds.map(bg => {
                    const selected = aiBgRefIds.includes(bg.id)
                    return (
                      <button
                        key={bg.id}
                        type="button"
                        onClick={() => toggleAiRef(bg.id)}
                        className={`relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${selected ? 'border-navy ring-2 ring-wheat' : 'border-gray-200 opacity-70 hover:opacity-100'}`}
                      >
                        <img src={bg.imageUrl} alt={bg.name} className="w-full h-full object-cover" />
                        {selected && (
                          <span className="absolute top-1 right-1 bg-navy text-cream text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
                            {aiBgRefIds.indexOf(bg.id) + 1}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Prompt</label>
              <textarea
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                rows={3}
                placeholder="Describí el fondo que querés generar..."
                value={aiBgPrompt}
                onChange={e => setAiBgPrompt(e.target.value)}
                disabled={generatingBg}
              />
            </div>

            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-600 mb-1">Presets</p>
              <div className="flex gap-2 flex-wrap">
                {AI_PROMPT_PRESETS.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAiBgPrompt(p)}
                    disabled={generatingBg}
                    className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-40"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre (opcional)</label>
              <input
                type="text"
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
                placeholder="Auto si lo dejás vacío"
                value={aiBgName}
                onChange={e => setAiBgName(e.target.value)}
                disabled={generatingBg}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={closeAiBgModal}
                disabled={generatingBg}
                className="px-4 py-1.5 text-sm rounded border border-gray-200 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={generateAiBackground}
                disabled={generatingBg || !aiBgPrompt.trim()}
                className="px-4 py-1.5 text-sm bg-navy text-cream font-semibold rounded disabled:opacity-40"
              >
                {generatingBg ? 'Generando…' : 'Generar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Preview"
            className="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Template picker modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-bold text-navy mb-4">Elegir fondo</h3>
            <p className="text-sm text-gray-500 mb-4">Selecciona una imagen de fondo para el overlay</p>

            <div className="grid grid-cols-4 gap-3 mb-4 max-h-[50vh] overflow-y-auto">
              {/* Default (no background = use template-1) */}
              <button
                onClick={() => { setSelectedTemplate(null) }}
                className={`rounded-lg border-2 p-1 transition-colors ${selectedTemplate === null ? 'border-navy' : 'border-gray-200 hover:border-gray-400'}`}
              >
                <div className="w-full aspect-square bg-gradient-to-br from-navy-dark to-navy rounded flex items-center justify-center text-cream text-xs">
                  Default
                </div>
              </button>
              {backgrounds.map(bg => (
                <button
                  key={`bg-${bg.id}`}
                  onClick={() => setSelectedTemplate(bg.imageUrl)}
                  className={`rounded-lg border-2 p-1 transition-colors ${selectedTemplate === bg.imageUrl ? 'border-navy' : 'border-gray-200 hover:border-gray-400'}`}
                >
                  <div className="relative">
                    <img src={bg.imageUrl} alt={bg.name} className="w-full aspect-square object-cover rounded" />
                    <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[10px] px-1 py-0.5 rounded truncate max-w-full">
                      {bg.name}
                    </span>
                  </div>
                </button>
              ))}
              {templates.map(t => (
                <button
                  key={t}
                  onClick={() => setSelectedTemplate(t)}
                  className={`rounded-lg border-2 p-1 transition-colors ${selectedTemplate === t ? 'border-navy' : 'border-gray-200 hover:border-gray-400'}`}
                >
                  <img src={t} alt="" className="w-full aspect-square object-cover rounded" />
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowTemplateModal(null)}
                className="text-sm px-4 py-2 text-gray-500 hover:text-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => generateImage(showTemplateModal, selectedTemplate ?? undefined)}
                className="text-sm px-4 py-2 bg-navy text-cream rounded-lg font-semibold hover:bg-navy-light"
              >
                Generar imagen
              </button>
            </div>
          </div>
        </div>
      )}

      {bgUploadQueue && bgUploadQueue.length > 0 && (
        <BackgroundUploadModal
          files={bgUploadQueue}
          onClose={() => setBgUploadQueue(null)}
          onAllUploaded={() => fetchTemplates()}
        />
      )}
    </div>
  )
}

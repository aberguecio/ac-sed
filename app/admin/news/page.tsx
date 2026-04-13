'use client'

import { useState, useEffect, useRef } from 'react'

interface Article {
  id: number
  title: string
  slug: string
  published: boolean
  featured: boolean
  generatedAt: string
  aiProvider: string
  emailSentAt: string | null
}

interface ArticleDetail {
  id: number
  title: string
  content: string
  imageUrl: string | null
  generatedAt: string
  match: { id: number; date: string } | null
  matchId?: number
  aiContext?: {
    matchDate: string
    matchInfo: string
    goalsCount: number
    goals: Array<{ minute: number | null; player: string; team: string }>
    cardsCount: number
    cards: Array<{ minute: number | null; type: string; player: string; team: string }>
    previousMatchesCount: number
    previousMatches: Array<{ date: string; match: string }>
    upcomingMatchesCount: number
    upcomingMatches: Array<{ date: string; match: string }>
    standingsCount: number
    standings: string[]
    otherResultsCount: number
    otherResults: string[]
  }
}

function toDateInputValue(isoString: string) {
  return isoString.slice(0, 10) // "YYYY-MM-DD"
}

function dayAfterMatch(matchDate: string) {
  const d = new Date(matchDate)
  d.setDate(d.getDate() + 1)
  return toDateInputValue(d.toISOString())
}

export default function AdminNewsPage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<number | null>(null)

  const [editingArticle, setEditingArticle] = useState<ArticleDetail | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [generatingVsImage, setGeneratingVsImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [sendingId, setSendingId] = useState<number | null>(null)
  const [sendResult, setSendResult] = useState<{ id: number; sent: number } | null>(null)

  async function fetchArticles() {
    const res = await fetch('/api/news?all=true&perPage=50')
    const data = await res.json()
    setArticles(data.articles ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchArticles() }, [])

  async function togglePublish(article: Article) {
    setActionId(article.id)
    await fetch(`/api/news/${article.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: !article.published }),
    })
    await fetchArticles()
    setActionId(null)
  }

  async function regenerate(id: number) {
    setActionId(id)
    await fetch(`/api/news/${id}/regenerate`, { method: 'POST' })
    await fetchArticles()
    setActionId(null)
  }

  async function deleteArticle(id: number) {
    if (!confirm('¿Eliminar esta noticia?')) return
    setActionId(id)
    await fetch(`/api/news/${id}`, { method: 'DELETE' })
    await fetchArticles()
    setActionId(null)
  }

  async function sendNewsletter(article: Article) {
    if (!confirm(`¿Enviar esta noticia por email a todos los suscriptores?\n\n"${article.title}"`)) return
    setSendingId(article.id)
    const res = await fetch(`/api/news/${article.id}/send`, { method: 'POST' })
    const data = await res.json()
    setSendResult({ id: article.id, sent: data.sent ?? 0 })
    await fetchArticles()
    setSendingId(null)
  }

  function openCreate() {
    setImageFile(null)
    setImagePreview(null)
    setEditTitle('')
    setEditContent('')
    setEditDate(toDateInputValue(new Date().toISOString()))
    setEditImageUrl(null)
    setEditingArticle({ id: 0, title: '', content: '', imageUrl: null, generatedAt: new Date().toISOString(), match: null })
  }

  async function openEdit(id: number) {
    setEditLoading(true)
    setImageFile(null)
    setImagePreview(null)
    setEditingArticle({ id, title: '', content: '', imageUrl: null, generatedAt: '', match: null })
    const res = await fetch(`/api/news/${id}`)
    const data: ArticleDetail = await res.json()
    setEditTitle(data.title)
    setEditContent(data.content)
    setEditDate(toDateInputValue(data.generatedAt))
    setEditImageUrl(data.imageUrl ?? null)
    setEditingArticle(data)
    setEditLoading(false)
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  async function generateVsImage() {
    if (!editingArticle?.match?.id && !editingArticle?.matchId) {
      alert('No se puede generar imagen VS: no hay partido asociado')
      return
    }

    setGeneratingVsImage(true)
    try {
      const res = await fetch('/api/news/generate-vs-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: editingArticle.match?.id || editingArticle.matchId })
      })

      if (res.ok) {
        const data = await res.json()
        setEditImageUrl(data.imageUrl)
        setImageFile(null)
        setImagePreview(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      } else {
        alert('Error generando imagen VS')
      }
    } catch (err) {
      console.error('Error generating VS image:', err)
      alert('Error generando imagen VS')
    } finally {
      setGeneratingVsImage(false)
    }
  }

  async function saveEdit() {
    if (!editingArticle) return
    setEditSaving(true)

    const isNew = editingArticle.id === 0

    // Upload image first if there's one
    let imageUrl = editImageUrl
    if (imageFile) {
      setUploadingImage(true)
      const formData = new FormData()
      formData.append('file', imageFile)
      if (!isNew) {
        formData.append('articleId', String(editingArticle.id))
      }
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json()
        imageUrl = uploadData.url
      }
      setUploadingImage(false)
    }

    if (isNew) {
      // Create new article
      await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          content: editContent,
          generatedAt: new Date(editDate).toISOString(),
          imageUrl,
        }),
      })
    } else {
      // Update existing article
      await fetch(`/api/news/${editingArticle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          content: editContent,
          generatedAt: new Date(editDate).toISOString(),
          imageUrl,
        }),
      })
    }

    setEditingArticle(null)
    setEditSaving(false)
    setImageFile(null)
    setImagePreview(null)
    await fetchArticles()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-extrabold text-navy">Noticias</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-navy text-cream rounded-lg font-semibold hover:bg-navy-light transition-colors"
        >
          + Crear Noticia
        </button>
      </div>

      {sendResult && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-green-700 text-sm font-medium">
            Newsletter enviado a <strong>{sendResult.sent}</strong> suscriptor{sendResult.sent !== 1 ? 'es' : ''}.
          </p>
          <button onClick={() => setSendResult(null)} className="text-green-400 hover:text-green-600 text-lg leading-none">×</button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Cargando…</p>
      ) : articles.length === 0 ? (
        <p className="text-gray-400">No hay noticias. Ejecuta el scraper para generar noticias automáticamente.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Título</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Fecha</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Estado</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">IA</th>
                <th className="px-4 py-3 text-right text-gray-500 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 max-w-xs">
                    <p className="font-medium text-navy truncate">{a.title}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(a.generatedAt).toLocaleDateString('es-CL')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${a.published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {a.published ? 'Publicado' : 'Borrador'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{a.aiProvider}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2 flex-wrap">
                      <button
                        onClick={() => togglePublish(a)}
                        disabled={actionId === a.id}
                        className="text-xs px-3 py-1.5 rounded bg-navy text-cream hover:bg-navy-light disabled:opacity-40"
                      >
                        {a.published ? 'Despublicar' : 'Publicar'}
                      </button>
                      <button
                        onClick={() => openEdit(a.id)}
                        disabled={actionId === a.id}
                        className="text-xs px-3 py-1.5 rounded bg-wheat text-navy hover:bg-wheat-light disabled:opacity-40"
                      >
                        Editar
                      </button>
                      {a.published && (
                        a.emailSentAt ? (
                          <span
                            title={`Enviado el ${new Date(a.emailSentAt).toLocaleDateString('es-CL')}`}
                            className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-400 cursor-default"
                          >
                            Enviado ✓
                          </span>
                        ) : (
                          <button
                            onClick={() => sendNewsletter(a)}
                            disabled={sendingId === a.id || actionId === a.id}
                            className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                          >
                            {sendingId === a.id ? 'Enviando…' : 'Enviar newsletter'}
                          </button>
                        )
                      )}
                      <button
                        onClick={() => regenerate(a.id)}
                        disabled={actionId === a.id}
                        className="text-xs px-3 py-1.5 rounded bg-wheat text-navy hover:bg-wheat-light disabled:opacity-40"
                      >
                        Regenerar
                      </button>
                      <button
                        onClick={() => deleteArticle(a.id)}
                        disabled={actionId === a.id}
                        className="text-xs px-3 py-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40"
                      >
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

      {editingArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-extrabold text-navy">Editar noticia</h2>
              <button
                onClick={() => setEditingArticle(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {editLoading ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1">Título</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1">Fecha de publicación</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={editDate}
                      onChange={e => setEditDate(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
                    />
                    <button
                      type="button"
                      onClick={() => setEditDate(toDateInputValue(new Date().toISOString()))}
                      className="text-xs px-3 py-2 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                    >
                      Hoy
                    </button>
                    {editingArticle.match && (
                      <button
                        type="button"
                        onClick={() => setEditDate(dayAfterMatch(editingArticle.match!.date))}
                        className="text-xs px-3 py-2 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                      >
                        Día después del partido
                      </button>
                    )}
                  </div>
                </div>

                {/* Image upload */}
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1">Imagen</label>
                  {(imagePreview ?? editImageUrl) && (
                    <div className="mb-2 relative inline-block">
                      <img
                        src={imagePreview ?? editImageUrl!}
                        alt="Vista previa"
                        className="h-40 rounded-lg object-cover border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImageFile(null)
                          setImagePreview(null)
                          setEditImageUrl(null)
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center hover:bg-red-600"
                        title="Quitar imagen"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageChange}
                      className="block text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-wheat file:text-navy hover:file:bg-wheat-light"
                    />
                    {(editingArticle?.match?.id || editingArticle?.matchId) && (
                      <button
                        type="button"
                        onClick={generateVsImage}
                        disabled={generatingVsImage}
                        className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Generar imagen VS con los logos de los equipos"
                      >
                        {generatingVsImage ? 'Generando...' : 'Generar imagen VS'}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG o WebP · máx. 5MB</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-navy mb-1">Contenido</label>
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    rows={14}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-navy/30"
                  />
                </div>

                {/* AI Context Debug */}
                {editingArticle.aiContext && (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-700">Contexto IA (Debug)</h3>

                    <div className="text-xs text-gray-600 space-y-2">
                      <div>
                        <span className="font-medium">Partido:</span> {editingArticle.aiContext.matchInfo}
                      </div>
                      <div>
                        <span className="font-medium">Fecha:</span> {editingArticle.aiContext.matchDate}
                      </div>

                      {editingArticle.aiContext.goalsCount > 0 && (
                        <details className="border-t pt-2">
                          <summary className="font-medium cursor-pointer">
                            Goles ({editingArticle.aiContext.goalsCount})
                          </summary>
                          <div className="mt-1 pl-3 space-y-0.5">
                            {editingArticle.aiContext.goals.map((g, i) => (
                              <div key={i} className="text-gray-500">
                                {g.minute ? `${g.minute}'` : '?'} - {g.player} ({g.team})
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {editingArticle.aiContext.cardsCount > 0 && (
                        <details className="border-t pt-2">
                          <summary className="font-medium cursor-pointer">
                            Tarjetas ({editingArticle.aiContext.cardsCount})
                          </summary>
                          <div className="mt-1 pl-3 space-y-0.5">
                            {editingArticle.aiContext.cards.map((c, i) => (
                              <div key={i} className="text-gray-500">
                                {c.minute ? `${c.minute}'` : '?'} - {c.type === 'yellow' ? '🟨' : '🟥'} {c.player} ({c.team})
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {editingArticle.aiContext.previousMatchesCount > 0 && (
                        <details className="border-t pt-2">
                          <summary className="font-medium cursor-pointer">
                            Partidos anteriores ({editingArticle.aiContext.previousMatchesCount})
                          </summary>
                          <div className="mt-1 pl-3 space-y-0.5">
                            {editingArticle.aiContext.previousMatches.map((m, i) => (
                              <div key={i} className="text-gray-500">
                                {m.date}: {m.match}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {editingArticle.aiContext.upcomingMatchesCount > 0 && (
                        <details className="border-t pt-2">
                          <summary className="font-medium cursor-pointer">
                            Próximos partidos ({editingArticle.aiContext.upcomingMatchesCount})
                          </summary>
                          <div className="mt-1 pl-3 space-y-0.5">
                            {editingArticle.aiContext.upcomingMatches.map((m, i) => (
                              <div key={i} className="text-gray-500">
                                {m.date}: {m.match}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {editingArticle.aiContext.standingsCount > 0 && (
                        <details className="border-t pt-2">
                          <summary className="font-medium cursor-pointer">
                            Tabla de posiciones ({editingArticle.aiContext.standingsCount})
                          </summary>
                          <div className="mt-1 pl-3 space-y-0.5">
                            {editingArticle.aiContext.standings.map((s, i) => (
                              <div key={i} className="text-gray-500">{s}</div>
                            ))}
                          </div>
                        </details>
                      )}

                      {editingArticle.aiContext.otherResultsCount > 0 && (
                        <details className="border-t pt-2">
                          <summary className="font-medium cursor-pointer">
                            Otros resultados ({editingArticle.aiContext.otherResultsCount})
                          </summary>
                          <div className="mt-1 pl-3 space-y-0.5">
                            {editingArticle.aiContext.otherResults.map((r, i) => (
                              <div key={i} className="text-gray-500">{r}</div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setEditingArticle(null)}
                disabled={editSaving}
                className="text-xs px-4 py-2 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving || editLoading}
                className="text-xs px-4 py-2 rounded bg-navy text-cream hover:bg-navy-light disabled:opacity-40"
              >
                {uploadingImage ? 'Subiendo imagen…' : editSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'

interface Article {
  id: number
  title: string
  slug: string
  published: boolean
  featured: boolean
  generatedAt: string
  aiProvider: string
}

interface ArticleDetail {
  id: number
  title: string
  content: string
}

export default function AdminNewsPage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<number | null>(null)

  const [editingArticle, setEditingArticle] = useState<ArticleDetail | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)

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

  async function openEdit(id: number) {
    setEditLoading(true)
    setEditingArticle({ id, title: '', content: '' })
    const res = await fetch(`/api/news/${id}`)
    const data: ArticleDetail = await res.json()
    setEditTitle(data.title)
    setEditContent(data.content)
    setEditingArticle(data)
    setEditLoading(false)
  }

  async function saveEdit() {
    if (!editingArticle) return
    setEditSaving(true)
    await fetch(`/api/news/${editingArticle.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle, content: editContent }),
    })
    setEditingArticle(null)
    setEditSaving(false)
    await fetchArticles()
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-navy mb-8">Noticias</h1>

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
                    <div className="flex justify-end gap-2">
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
                  <label className="block text-sm font-semibold text-navy mb-1">Contenido</label>
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    rows={14}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-navy/30"
                  />
                </div>
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
                {editSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { Fragment, useEffect, useState, use } from 'react'
import Link from 'next/link'

interface ClickEvent {
  id: number
  clickedAt: string
  ip: string | null
  userAgent: string | null
}

interface SendRow {
  id: number
  email: string
  sentAt: string
  firstOpenedAt: string | null
  openCount: number
  firstClickedAt: string | null
  clickCount: number
  clicks: ClickEvent[]
}

interface StatsResponse {
  article: { id: number; title: string; slug: string; emailSentAt: string | null }
  summary: {
    sentTo: number
    openedBy: number
    totalOpens: number
    clickedBy: number
    totalClicks: number
  }
  sends: SendRow[]
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function pct(num: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((num / total) * 100)}%`
}

export default function NewsletterStatsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [data, setData] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/news/${id}/stats`)
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  if (loading) return <p className="p-8 text-gray-400">Cargando…</p>
  if (!data?.article) return <p className="p-8 text-gray-400">No encontrado</p>

  const { article, summary, sends } = data
  const openRate = pct(summary.openedBy, summary.sentTo)
  const clickRate = pct(summary.clickedBy, summary.sentTo)
  const ctor = pct(summary.clickedBy, Math.max(summary.openedBy, 1))

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <Link href="/admin/news" className="text-sm text-gray-500 hover:text-navy">
        ← Volver
      </Link>

      <h1 className="text-2xl font-extrabold text-navy mt-2 mb-1">{article.title}</h1>
      <p className="text-sm text-gray-500 mb-6">
        Enviado: {formatDateTime(article.emailSentAt)}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-gray-100 p-3">
          <p className="text-2xl font-bold text-navy">{summary.sentTo}</p>
          <p className="text-xs text-gray-500">Enviados</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-3">
          <p className="text-2xl font-bold text-navy">{summary.openedBy}</p>
          <p className="text-xs text-gray-500">Abrieron ({openRate})</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-3">
          <p className="text-2xl font-bold text-navy">{summary.totalOpens}</p>
          <p className="text-xs text-gray-500">Opens totales</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-3">
          <p className="text-2xl font-bold text-navy">{summary.clickedBy}</p>
          <p className="text-xs text-gray-500">Clickearon ({clickRate})</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-3">
          <p className="text-2xl font-bold text-navy">{summary.totalClicks}</p>
          <p className="text-xs text-gray-500">Clicks totales (CTOR {ctor})</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-xs sm:text-sm min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-left">
              <th className="px-3 py-2 text-gray-500 font-medium">Suscriptor</th>
              <th className="px-3 py-2 text-gray-500 font-medium">Primer open</th>
              <th className="px-3 py-2 text-gray-500 font-medium text-center">Opens</th>
              <th className="px-3 py-2 text-gray-500 font-medium">Primer click</th>
              <th className="px-3 py-2 text-gray-500 font-medium text-center">Clicks</th>
              <th className="px-3 py-2 text-gray-500 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sends.map((s) => {
              const isOpen = expanded === s.id
              return (
                <Fragment key={s.id}>
                  <tr className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-navy">{s.email}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {formatDateTime(s.firstOpenedAt)}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold">{s.openCount}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {formatDateTime(s.firstClickedAt)}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold">{s.clickCount}</td>
                    <td className="px-3 py-2 text-right">
                      {s.clicks.length > 0 ? (
                        <button
                          onClick={() => setExpanded(isOpen ? null : s.id)}
                          className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                        >
                          {isOpen ? 'Ocultar' : 'Ver clicks'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-gray-50">
                      <td colSpan={6} className="px-3 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="text-left py-1 pr-3">Hora</th>
                              <th className="text-left py-1 pr-3">IP</th>
                              <th className="text-left py-1">User-Agent</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.clicks.map((c) => (
                              <tr key={c.id} className="border-t border-gray-200">
                                <td className="py-1 pr-3 whitespace-nowrap">
                                  {formatDateTime(c.clickedAt)}
                                </td>
                                <td className="py-1 pr-3 font-mono text-gray-600">
                                  {c.ip ?? '—'}
                                </td>
                                <td className="py-1 text-gray-500 break-all">
                                  {c.userAgent ?? '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

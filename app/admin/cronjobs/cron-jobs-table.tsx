'use client'

import { useState, useTransition } from 'react'

type SerializedJob = {
  id: number
  key: string
  name: string
  schedule: string
  timezone: string
  enabled: boolean
  lastRunAt: string | null
  lastStatus: string | null
  lastMessage: string | null
  retryUntil: string | null
  nextRetryAt: string | null
  createdAt: string
  updatedAt: string
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
}

function statusClass(status: string | null) {
  switch (status) {
    case 'success': return 'bg-green-100 text-green-700'
    case 'noop': return 'bg-gray-100 text-gray-600'
    case 'error': return 'bg-red-100 text-red-700'
    default: return 'bg-gray-50 text-gray-400'
  }
}

export function CronJobsTable({ initialJobs }: { initialJobs: SerializedJob[] }) {
  const [jobs, setJobs] = useState(initialJobs)
  const [drafts, setDrafts] = useState<Record<string, { schedule: string; name: string }>>(() =>
    Object.fromEntries(initialJobs.map(j => [j.key, { schedule: j.schedule, name: j.name }]))
  )
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  const save = (job: SerializedJob, patch: { schedule?: string; enabled?: boolean; name?: string }) => {
    setErrors(e => ({ ...e, [job.key]: null }))
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/cron-jobs/${job.key}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const updated = await res.json()
        setJobs(js => js.map(j => j.key === job.key ? { ...j, ...updated } : j))
      } catch (err) {
        setErrors(e => ({ ...e, [job.key]: err instanceof Error ? err.message : 'error' }))
      }
    })
  }

  const runNow = (job: SerializedJob) => {
    setErrors(e => ({ ...e, [job.key]: null }))
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/cron-jobs/${job.key}/run`, { method: 'POST' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        // Poll once after a short delay so the user sees lastRunAt update
        setTimeout(refresh, 2500)
      } catch (err) {
        setErrors(e => ({ ...e, [job.key]: err instanceof Error ? err.message : 'error' }))
      }
    })
  }

  const refresh = async () => {
    try {
      const res = await fetch('/api/admin/cron-jobs', { cache: 'no-store' })
      if (!res.ok) return
      const fresh: SerializedJob[] = await res.json()
      setJobs(fresh)
    } catch {}
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr className="text-xs uppercase text-gray-500">
            <th className="px-4 py-3">Job</th>
            <th className="px-4 py-3">Schedule</th>
            <th className="px-4 py-3">TZ</th>
            <th className="px-4 py-3">Activo</th>
            <th className="px-4 py-3">Última corrida</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map(job => {
            const draft = drafts[job.key] ?? { schedule: job.schedule, name: job.name }
            const dirty = draft.schedule !== job.schedule || draft.name !== job.name
            const err = errors[job.key]
            return (
              <tr key={job.key} className="border-t border-gray-100 align-top">
                <td className="px-4 py-3">
                  <input
                    className="font-medium text-navy bg-transparent border-b border-transparent focus:border-navy outline-none w-full"
                    value={draft.name}
                    onChange={e => setDrafts(d => ({ ...d, [job.key]: { ...draft, name: e.target.value } }))}
                  />
                  <div className="text-xs text-gray-400 mt-1 font-mono">{job.key}</div>
                </td>
                <td className="px-4 py-3">
                  <input
                    className="font-mono text-xs px-2 py-1 border border-gray-200 rounded w-36"
                    value={draft.schedule}
                    onChange={e => setDrafts(d => ({ ...d, [job.key]: { ...draft, schedule: e.target.value } }))}
                  />
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{job.timezone}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => save(job, { enabled: !job.enabled })}
                    disabled={pending}
                    aria-pressed={job.enabled}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      job.enabled ? 'bg-navy' : 'bg-gray-300'
                    } ${pending ? 'opacity-60' : ''}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        job.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                  {formatDate(job.lastRunAt)}
                  {job.nextRetryAt && (
                    <div className="text-amber-600 mt-1">retry: {formatDate(job.nextRetryAt)}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded ${statusClass(job.lastStatus)}`}>
                    {job.lastStatus ?? '—'}
                  </span>
                  {job.lastMessage && (
                    <div className="text-xs text-gray-500 mt-1 max-w-xs truncate" title={job.lastMessage}>
                      {job.lastMessage}
                    </div>
                  )}
                  {err && <div className="text-xs text-red-500 mt-1">{err}</div>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => save(job, { schedule: draft.schedule, name: draft.name })}
                    disabled={!dirty || pending}
                    className="text-xs px-3 py-1.5 rounded bg-navy text-cream disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => runNow(job)}
                    disabled={pending}
                    className="ml-2 text-xs px-3 py-1.5 rounded bg-wheat text-navy disabled:opacity-40"
                  >
                    Run now
                  </button>
                </td>
              </tr>
            )
          })}
          {jobs.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                No hay jobs registrados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

'use client'

import { useEffect, useState, useTransition } from 'react'

type SerializedConfig = {
  id: number
  channel: string
  provider: string
  model: string
  maxTokens: number
  temperature: number
  systemPromptOverride: string | null
  maxSteps: number | null
  enabledTools: string[]
  createdAt: string
  updatedAt: string
}

type ToolDef = { key: string; description: string }

type ModelsResponse = {
  provider: string
  source: 'live' | 'live-cached' | 'static' | 'fallback'
  models: string[]
}

export function ChannelCard({
  initialConfig,
  label,
  availableTools,
}: {
  initialConfig: SerializedConfig
  label: { title: string; subtitle: string }
  availableTools: ToolDef[] | null
}) {
  const [cfg, setCfg] = useState<SerializedConfig>(initialConfig)
  const [draft, setDraft] = useState<SerializedConfig>(initialConfig)
  const [models, setModels] = useState<string[]>([])
  const [modelSource, setModelSource] = useState<ModelsResponse['source'] | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  // Load models when provider changes
  useEffect(() => {
    let cancelled = false
    async function load() {
      setModels([])
      setModelSource(null)
      try {
        const res = await fetch(`/api/admin/ai-models?provider=${draft.provider}`, { cache: 'no-store' })
        if (!res.ok) return
        const body: ModelsResponse = await res.json()
        if (cancelled) return
        setModels(body.models)
        setModelSource(body.source)
      } catch {}
    }
    load()
    return () => { cancelled = true }
  }, [draft.provider])

  const dirty = JSON.stringify(cfg) !== JSON.stringify(draft)

  const save = () => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/ai-config/${cfg.channel}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: draft.provider,
            model: draft.model,
            maxTokens: draft.maxTokens,
            temperature: draft.temperature,
            systemPromptOverride: draft.systemPromptOverride,
            maxSteps: draft.maxSteps,
            enabledTools: draft.enabledTools,
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const updated = await res.json()
        const serialized: SerializedConfig = {
          ...updated,
          createdAt: typeof updated.createdAt === 'string' ? updated.createdAt : new Date(updated.createdAt).toISOString(),
          updatedAt: typeof updated.updatedAt === 'string' ? updated.updatedAt : new Date(updated.updatedAt).toISOString(),
        }
        setCfg(serialized)
        setDraft(serialized)
        setSavedAt(new Date().toLocaleTimeString('es-CL'))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'error')
      }
    })
  }

  const toggleTool = (key: string) => {
    const set = new Set(draft.enabledTools)
    if (set.has(key)) set.delete(key)
    else set.add(key)
    setDraft({ ...draft, enabledTools: Array.from(set) })
  }

  const allTools = availableTools?.map(t => t.key) ?? []
  const allToolsOn = availableTools !== null && draft.enabledTools.length === allTools.length
  const toggleAllTools = () => {
    setDraft({ ...draft, enabledTools: allToolsOn ? [] : [...allTools] })
  }

  const isAgentic = cfg.channel === 'whatsapp'

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="font-bold text-navy text-lg">{label.title}</h2>
          <p className="text-xs text-gray-400 mt-0.5">channel: <code>{cfg.channel}</code></p>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">{label.subtitle}</p>
        </div>
        <div className="text-right text-xs text-gray-400">
          <div>actualizado: {new Date(cfg.updatedAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</div>
          {savedAt && <div className="text-green-600 mt-0.5">guardado {savedAt}</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Provider</label>
          <div className="flex gap-2 flex-wrap">
            {(['openai', 'anthropic', 'deepseek', 'minimax'] as const).map(p => (
              <label key={p} className={`px-3 py-1.5 text-sm rounded border cursor-pointer ${draft.provider === p ? 'bg-navy text-cream border-navy' : 'bg-white text-gray-600 border-gray-200'}`}>
                <input
                  type="radio"
                  name={`provider-${cfg.channel}`}
                  className="hidden"
                  checked={draft.provider === p}
                  onChange={() => setDraft({ ...draft, provider: p })}
                />
                {p}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Modelo
            {modelSource && <span className="ml-2 text-gray-400 font-normal">({modelSource})</span>}
          </label>
          <select
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded font-mono"
            value={draft.model}
            onChange={e => setDraft({ ...draft, model: e.target.value })}
          >
            {!models.includes(draft.model) && <option value={draft.model}>{draft.model} (custom)</option>}
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Max tokens</label>
          <input
            type="number"
            min={1}
            max={32768}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded"
            value={draft.maxTokens}
            onChange={e => setDraft({ ...draft, maxTokens: parseInt(e.target.value) || 0 })}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Temperature: <span className="font-mono">{draft.temperature.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            className="w-full"
            value={draft.temperature}
            onChange={e => setDraft({ ...draft, temperature: parseFloat(e.target.value) })}
          />
        </div>

        {isAgentic && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Max steps (tool loop)</label>
            <input
              type="number"
              min={1}
              max={50}
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded"
              value={draft.maxSteps ?? ''}
              onChange={e => setDraft({ ...draft, maxSteps: e.target.value === '' ? null : (parseInt(e.target.value) || 1) })}
            />
          </div>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowPrompt(s => !s)}
          className="text-xs text-navy underline"
        >
          {showPrompt ? 'Ocultar' : 'Mostrar'} system prompt override
        </button>
        {showPrompt && (
          <textarea
            className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded font-mono"
            rows={6}
            placeholder="(vacío = usar el default del código)"
            value={draft.systemPromptOverride ?? ''}
            onChange={e => setDraft({ ...draft, systemPromptOverride: e.target.value })}
          />
        )}
      </div>

      {isAgentic && availableTools && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-600">
              Tools habilitadas ({draft.enabledTools.length}/{allTools.length})
            </label>
            <button
              type="button"
              onClick={toggleAllTools}
              className="text-xs text-navy underline"
            >
              {allToolsOn ? 'Desmarcar todas' : 'Marcar todas'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {availableTools.map(t => (
              <label key={t.key} className="flex items-start gap-2 text-xs p-2 rounded hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={draft.enabledTools.includes(t.key)}
                  onChange={() => toggleTool(t.key)}
                />
                <span>
                  <span className="font-mono text-navy">{t.key}</span>
                  <span className="text-gray-500"> — {t.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="px-4 py-1.5 text-sm rounded bg-navy text-cream disabled:opacity-40"
        >
          {pending ? 'Guardando...' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={() => setDraft(cfg)}
          disabled={!dirty || pending}
          className="px-4 py-1.5 text-sm rounded border border-gray-200 disabled:opacity-40"
        >
          Descartar
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  )
}

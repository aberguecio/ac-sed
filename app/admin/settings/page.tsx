import { getBotConfig } from '@/lib/bot-config'
import { BotDmToggle } from './bot-dm-toggle'

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage() {
  const provider = process.env.AI_PROVIDER ?? 'openai'
  const model = process.env.AI_MODEL ?? '(default)'
  const hasKey = !!(process.env.AI_API_KEY?.length)
  const botConfig = await getBotConfig()

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-navy mb-2">Configuración</h1>
        <p className="text-gray-500 text-sm">
          Variables de IA: editá <code className="bg-gray-100 px-1 rounded">.env</code> y reiniciá el contenedor.
          Los toggles de abajo se guardan en la DB y se aplican al instante.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 max-w-lg">
        <h2 className="font-bold text-navy mb-4">Bot de WhatsApp</h2>
        <BotDmToggle initial={botConfig.aiAllowDms} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 max-w-lg space-y-4">
        <h2 className="font-bold text-navy mb-2">Proveedor de IA</h2>

        <dl className="space-y-3 text-sm">
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <dt className="text-gray-500">AI_PROVIDER</dt>
            <dd className="font-semibold text-navy bg-navy/10 px-3 py-1 rounded">{provider}</dd>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <dt className="text-gray-500">AI_MODEL</dt>
            <dd className="font-semibold text-navy">{model}</dd>
          </div>
          <div className="flex justify-between items-center py-2">
            <dt className="text-gray-500">API Key configurada</dt>
            <dd>
              {hasKey ? (
                <span className="text-green-600 font-semibold">✓ Sí</span>
              ) : (
                <span className="text-red-500 font-semibold">✗ No</span>
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-4 bg-cream rounded-lg p-4 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-700 mb-2">Variables de entorno disponibles:</p>
          <p><code>AI_PROVIDER</code> → <code>openai</code> | <code>anthropic</code></p>
          <p><code>AI_MODEL</code> → ej: <code>gpt-4o-mini</code>, <code>claude-haiku-4-5-20251001</code></p>
          <p><code>AI_API_KEY</code> → tu API key del proveedor elegido</p>
        </div>
      </div>
    </div>
  )
}

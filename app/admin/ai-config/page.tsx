import { prisma } from '@/lib/db'
import { CHANNEL_KEYS } from '@/lib/ai-config'
import { WHATSAPP_TOOL_KEYS, WHATSAPP_TOOL_DESCRIPTIONS } from '@/lib/ai-whatsapp-tools'
import { ChannelCard } from './channel-card'

export const dynamic = 'force-dynamic'

const CHANNEL_LABELS: Record<string, { title: string; subtitle: string }> = {
  newsletter: {
    title: 'Newsletter / Noticias',
    subtitle: 'Genera el título y la crónica de cada partido (formato JSON, ~800 tokens).',
  },
  instagram: {
    title: 'Instagram',
    subtitle: 'Captions de posts de resultado y promo (texto plano, corto).',
  },
  whatsapp: {
    title: 'WhatsApp (agente)',
    subtitle: 'Bot del grupo. Responde preguntas usando tools sobre la base de datos.',
  },
}

export default async function AdminAiConfigPage() {
  const rows = await prisma.aiChannelConfig.findMany()
  const ordered = CHANNEL_KEYS
    .map(k => rows.find(r => r.channel === k))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)

  const tools = WHATSAPP_TOOL_KEYS.map(key => ({
    key,
    description: WHATSAPP_TOOL_DESCRIPTIONS[key],
  }))

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-navy mb-2">Configuración de IA</h1>
        <p className="text-gray-500 text-sm max-w-2xl">
          Cada canal usa su propio modelo, parámetros de generación y (en el caso del agente)
          su propio set de tools. Las API keys se siguen leyendo del <code>.env</code> y no son
          editables desde acá. Los cambios se aplican al instante en la siguiente generación.
        </p>
      </div>

      <div className="space-y-6">
        {ordered.map(cfg => (
          <ChannelCard
            key={cfg.channel}
            initialConfig={{
              ...cfg,
              createdAt: cfg.createdAt.toISOString(),
              updatedAt: cfg.updatedAt.toISOString(),
            }}
            label={CHANNEL_LABELS[cfg.channel] ?? { title: cfg.channel, subtitle: '' }}
            availableTools={cfg.channel === 'whatsapp' ? tools : null}
          />
        ))}
      </div>
    </div>
  )
}

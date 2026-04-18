import { prisma } from '@/lib/db'
import { sendAttendanceSummaryToGroup } from '@/lib/whatsapp'

// Debounce in-memory para los resúmenes de asistencia al grupo. Convive con la
// columna persistida `Match.notifyGroupAt`, que es el source of truth para
// rehidratar timers si el contenedor reinicia. Diseñado para un único proceso
// Node (ver docker-compose.yml): NO usar con múltiples réplicas sin coordinación.
const timers = new Map<number, NodeJS.Timeout>()

export function scheduleGroupSummary(matchId: number, delayMs: number): void {
  const existing = timers.get(matchId)
  if (existing) clearTimeout(existing)

  const fireAt = new Date(Date.now() + delayMs)
  console.log('[attendance-notifier] scheduled', { matchId, fireAt: fireAt.toISOString() })

  const t = setTimeout(() => {
    timers.delete(matchId)
    fire(matchId).catch(err => {
      console.error('[attendance-notifier] unhandled error', { matchId, err })
    })
  }, delayMs)
  timers.set(matchId, t)
}

async function fire(matchId: number): Promise<void> {
  const result = await sendAttendanceSummaryToGroup(matchId)
  if (result.ok) {
    console.log('[attendance-notifier] sent', { matchId, providerMessageId: result.providerMessageId })
    await prisma.match.update({ where: { id: matchId }, data: { notifyGroupAt: null } })
    return
  }

  // Si falta la config del grupo, limpiar el marcador para evitar loops; ya loggeamos el motivo.
  if (result.reason === 'no group jid') {
    console.warn('[attendance-notifier] skipped (no group jid)', { matchId })
    await prisma.match.update({ where: { id: matchId }, data: { notifyGroupAt: null } })
    return
  }

  // Error transitorio: dejar notifyGroupAt seteado para que el próximo voto o
  // un reinicio + hydrateFromDb() reintente.
  console.error('[attendance-notifier] send failed', { matchId, reason: result.reason })
}

export async function hydrateFromDb(): Promise<void> {
  const now = new Date()
  const pending = await prisma.match.findMany({
    where: { date: { gt: now }, notifyGroupAt: { not: null } },
    select: { id: true, notifyGroupAt: true },
  })
  for (const m of pending) {
    if (!m.notifyGroupAt) continue
    const delayMs = Math.max(0, m.notifyGroupAt.getTime() - now.getTime())
    scheduleGroupSummary(m.id, delayMs)
  }
  console.log('[attendance-notifier] hydrated', { count: pending.length })
}

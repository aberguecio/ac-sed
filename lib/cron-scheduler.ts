import cron, { type ScheduledTask } from 'node-cron'
import { prisma } from '@/lib/db'
import { JOB_REGISTRY, type JobResult } from '@/lib/cron-jobs'

const tasks = new Map<string, ScheduledTask>()
let retryTicker: NodeJS.Timeout | null = null
let started = false

async function runJob(key: string, source: 'cron' | 'retry' | 'manual') {
  const handler = JOB_REGISTRY[key]
  if (!handler) {
    console.warn(`[cron-scheduler] no handler registered for "${key}"`)
    return
  }
  const job = await prisma.cronJob.findUnique({ where: { key } })
  if (!job) return
  if (source === 'cron' && !job.enabled) return

  console.log(`[cron-scheduler] running "${key}" (source=${source})`)
  let result: JobResult
  try {
    result = await handler(job)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cron-scheduler] job "${key}" threw`, err)
    await prisma.cronJob.update({
      where: { key },
      data: { lastRunAt: new Date(), lastStatus: 'error', lastMessage: message.slice(0, 1000) },
    })
    return
  }

  const update: Parameters<typeof prisma.cronJob.update>[0]['data'] = {
    lastRunAt: new Date(),
    lastStatus: result.status,
    lastMessage: result.message.slice(0, 1000),
  }
  if (result.scheduleRetry) {
    update.retryUntil = result.scheduleRetry.until
    update.nextRetryAt = result.scheduleRetry.nextAt
  } else if (result.clearRetry) {
    update.retryUntil = null
    update.nextRetryAt = null
  }
  await prisma.cronJob.update({ where: { key }, data: update })
  console.log(`[cron-scheduler] "${key}" → ${result.status}: ${result.message}`)
}

function scheduleTask(key: string, schedule: string, timezone: string) {
  if (!cron.validate(schedule)) {
    console.error(`[cron-scheduler] invalid schedule "${schedule}" for job "${key}"`)
    return
  }
  const task = cron.schedule(
    schedule,
    () => {
      runJob(key, 'cron').catch(err => console.error(`[cron-scheduler] ${key} run failed`, err))
    },
    { timezone },
  )
  tasks.set(key, task)
}

function unscheduleTask(key: string) {
  const existing = tasks.get(key)
  if (existing) {
    existing.stop()
    tasks.delete(key)
  }
}

/**
 * (Re)load a single job's schedule from DB. Called after admin updates the
 * schedule or enabled flag.
 */
export async function reloadJob(key: string) {
  if (!started) return
  unscheduleTask(key)
  const job = await prisma.cronJob.findUnique({ where: { key } })
  if (!job || !job.enabled) return
  scheduleTask(job.key, job.schedule, job.timezone)
}

/**
 * Trigger a job immediately, ignoring schedule/enabled. Used by the admin
 * "Run now" action and the manual /api/cron endpoint.
 */
export async function triggerJob(key: string) {
  await runJob(key, 'manual')
}

async function tickRetries() {
  const now = new Date()
  const due = await prisma.cronJob.findMany({
    where: {
      enabled: true,
      nextRetryAt: { not: null, lte: now },
      retryUntil: { not: null, gte: now },
    },
  })
  for (const job of due) {
    await runJob(job.key, 'retry').catch(err =>
      console.error(`[cron-scheduler] retry ${job.key} failed`, err),
    )
  }
  // Clear stale retry windows that expired without success
  await prisma.cronJob.updateMany({
    where: { retryUntil: { not: null, lt: now } },
    data: { retryUntil: null, nextRetryAt: null },
  })
}

/**
 * Start the in-process scheduler. Idempotent. Should be called once from
 * `instrumentation.ts` after `seedDefaultJobs()`.
 */
export async function startScheduler() {
  if (started) return
  started = true

  const jobs = await prisma.cronJob.findMany()
  for (const job of jobs) {
    if (!job.enabled) continue
    scheduleTask(job.key, job.schedule, job.timezone)
  }

  retryTicker = setInterval(() => {
    tickRetries().catch(err => console.error('[cron-scheduler] retry tick failed', err))
  }, 60 * 1000)

  console.log(`[cron-scheduler] started (${tasks.size} active jobs)`)
}

/** Test/teardown helper (currently unused in production). */
export function stopScheduler() {
  for (const task of tasks.values()) task.stop()
  tasks.clear()
  if (retryTicker) {
    clearInterval(retryTicker)
    retryTicker = null
  }
  started = false
}

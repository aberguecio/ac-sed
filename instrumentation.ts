export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { hydrateFromDb } = await import('@/lib/attendance-notifier')
  await hydrateFromDb()

  const { seedAiChannelDefaults } = await import('@/lib/ai-config')
  await seedAiChannelDefaults()

  const { seedDefaultJobs } = await import('@/lib/cron-jobs')
  const { startScheduler } = await import('@/lib/cron-scheduler')
  await seedDefaultJobs()
  await startScheduler()
}

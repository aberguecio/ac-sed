// Runtime-specific bootstrap. Imported only by instrumentation.ts when
// NEXT_RUNTIME === 'nodejs'. Keeping the heavy imports (sharp, fs, node-cron,
// etc.) out of the top-level instrumentation file avoids Next bundling them
// for the edge runtime.
import { hydrateFromDb } from '@/lib/attendance-notifier'
import { seedAiChannelDefaults } from '@/lib/ai-config'
import { seedDefaultJobs } from '@/lib/cron-jobs'
import { startScheduler } from '@/lib/cron-scheduler'

export async function bootstrap() {
  await hydrateFromDb()
  await seedAiChannelDefaults()
  await seedDefaultJobs()
  await startScheduler()
}

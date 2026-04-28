// Runtime-specific bootstrap. Imported only by instrumentation.ts when
// NEXT_RUNTIME === 'nodejs'. The body runs as a side effect on import to
// match the canonical Next.js pattern that lets the bundler skip this file
// in edge bundles.
import { hydrateFromDb } from '@/lib/attendance-notifier'
import { seedAiChannelDefaults } from '@/lib/ai-config'
import { seedDefaultJobs } from '@/lib/cron-jobs'
import { startScheduler } from '@/lib/cron-scheduler'

await hydrateFromDb()
await seedAiChannelDefaults()
await seedDefaultJobs()
await startScheduler()

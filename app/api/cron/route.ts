import { NextRequest, NextResponse } from 'next/server'
import { triggerJob } from '@/lib/cron-scheduler'

// Manual trigger kept for backwards compatibility (external curl with secret).
// Real scheduling lives in lib/cron-scheduler.ts (started from instrumentation.ts)
// and is configurable from /admin/cronjobs.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await triggerJob('weekly-result')
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

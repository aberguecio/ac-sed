import { NextRequest, NextResponse } from 'next/server'
import { triggerJob } from '@/lib/cron-scheduler'
import { JOB_REGISTRY } from '@/lib/cron-jobs'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params
  if (!JOB_REGISTRY[key]) {
    return NextResponse.json({ error: 'Unknown job' }, { status: 404 })
  }
  // Fire-and-forget so the request returns quickly. Errors are logged inside
  // the scheduler and surfaced via lastStatus/lastMessage on the row.
  triggerJob(key).catch(err => console.error(`run-now ${key} failed`, err))
  return NextResponse.json({ ok: true })
}

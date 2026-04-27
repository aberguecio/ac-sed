import { NextRequest, NextResponse } from 'next/server'
import cron from 'node-cron'
import { prisma } from '@/lib/db'
import { reloadJob } from '@/lib/cron-scheduler'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params
  const body = await req.json().catch(() => ({}))
  const { schedule, enabled, name, timezone } = body as {
    schedule?: string
    enabled?: boolean
    name?: string
    timezone?: string
  }

  if (schedule !== undefined && !cron.validate(schedule)) {
    return NextResponse.json({ error: 'Invalid cron expression' }, { status: 400 })
  }

  const existing = await prisma.cronJob.findUnique({ where: { key } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.cronJob.update({
    where: { key },
    data: {
      ...(schedule !== undefined ? { schedule } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(timezone !== undefined ? { timezone } : {}),
    },
  })

  await reloadJob(key)
  return NextResponse.json(updated)
}

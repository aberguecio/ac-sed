import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const logs = await prisma.scrapeLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 20,
  })
  return NextResponse.json(logs)
}

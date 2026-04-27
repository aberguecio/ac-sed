import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const jobs = await prisma.cronJob.findMany({ orderBy: { key: 'asc' } })
  return NextResponse.json(jobs)
}

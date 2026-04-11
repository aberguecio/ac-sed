import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const [standings, scorers, matches] = await Promise.all([
    prisma.standing.findMany({ orderBy: { position: 'asc' }, take: 10 }),
    prisma.leagueScorer.findMany({ orderBy: { goals: 'desc' }, take: 10 }),
    prisma.match.findMany({ orderBy: { date: 'desc' }, take: 10 }),
  ])

  return NextResponse.json({ standings, scorers, matches })
}

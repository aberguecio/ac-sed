import { chromium } from 'playwright'
import { prisma } from './db'
import type { Match } from '@prisma/client'

const ACSED_TEAM = 'ACSED'
const LIGAB_URL = 'https://ligab.cl'

interface RawStanding {
  team?: string
  nombre?: string
  position?: number
  pos?: number
  played?: number
  pj?: number
  won?: number
  pg?: number
  drawn?: number
  pe?: number
  lost?: number
  pp?: number
  goalsFor?: number
  gf?: number
  goalsAgainst?: number
  gc?: number
  points?: number
  pts?: number
}

interface RawResult {
  home?: string
  local?: string
  away?: string
  visita?: string
  homeScore?: number
  golesLocal?: number
  awayScore?: number
  golesVisita?: number
  date?: string
  fecha?: string
  round?: string
  jornada?: string
  id?: string | number
}

interface RawScorer {
  player?: string
  jugador?: string
  team?: string
  equipo?: string
  goals?: number
  goles?: number
}

function normalizeStanding(raw: RawStanding) {
  return {
    teamName: (raw.team ?? raw.nombre ?? '').trim(),
    position: raw.position ?? raw.pos ?? 0,
    played: raw.played ?? raw.pj ?? 0,
    won: raw.won ?? raw.pg ?? 0,
    drawn: raw.drawn ?? raw.pe ?? 0,
    lost: raw.lost ?? raw.pp ?? 0,
    goalsFor: raw.goalsFor ?? raw.gf ?? 0,
    goalsAgainst: raw.goalsAgainst ?? raw.gc ?? 0,
    points: raw.points ?? raw.pts ?? 0,
  }
}

function normalizeResult(raw: RawResult) {
  return {
    homeTeam: (raw.home ?? raw.local ?? '').trim(),
    awayTeam: (raw.away ?? raw.visita ?? '').trim(),
    homeScore: raw.homeScore ?? raw.golesLocal ?? null,
    awayScore: raw.awayScore ?? raw.golesVisita ?? null,
    date: raw.date ?? raw.fecha ? new Date(raw.date ?? raw.fecha ?? '') : new Date(),
    roundName: raw.round ?? raw.jornada ?? null,
    leagueMatchId: raw.id ? String(raw.id) : null,
  }
}

function normalizeScorer(raw: RawScorer) {
  return {
    playerName: (raw.player ?? raw.jugador ?? '').trim(),
    teamName: (raw.team ?? raw.equipo ?? '').trim(),
    goals: raw.goals ?? raw.goles ?? 0,
  }
}

function detectDataType(url: string, body: unknown): 'standings' | 'results' | 'scorers' | 'upcoming' | null {
  const lowerUrl = url.toLowerCase()
  if (lowerUrl.includes('posici') || lowerUrl.includes('standing') || lowerUrl.includes('tabla')) return 'standings'
  if (lowerUrl.includes('resultado') || lowerUrl.includes('result') || lowerUrl.includes('partido')) return 'results'
  if (lowerUrl.includes('goleador') || lowerUrl.includes('scorer')) return 'scorers'
  if (lowerUrl.includes('proximo') || lowerUrl.includes('upcoming') || lowerUrl.includes('fixture')) return 'upcoming'

  if (Array.isArray(body) && body.length > 0) {
    const first = body[0] as Record<string, unknown>
    if ('pts' in first || 'points' in first || 'pj' in first) return 'standings'
    if ('golesLocal' in first || 'homeScore' in first || 'local' in first) return 'results'
    if ('goles' in first || 'goals' in first) return 'scorers'
  }
  return null
}

export async function runScraper(triggeredBy: 'manual' | 'scheduler'): Promise<{
  newMatches: Match[]
  logId: number
}> {
  const log = await prisma.scrapeLog.create({
    data: { status: 'running', triggeredBy },
  })

  const capturedData: { type: string; data: unknown[] }[] = []

  try {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()

    page.on('response', async (response) => {
      const url = response.url()
      if (!url.includes('api') && !url.includes('.json')) return
      try {
        const body = await response.json()
        const dataArray = Array.isArray(body) ? body : body?.data ?? body?.items ?? null
        if (!dataArray) return
        const type = detectDataType(url, dataArray)
        if (type) capturedData.push({ type, data: dataArray })
      } catch {
        // not JSON
      }
    })

    await page.goto(LIGAB_URL, { waitUntil: 'networkidle', timeout: 60000 })

    // Click through tabs to trigger API calls
    const tabSelectors = [
      '[data-tab="posiciones"], [href*="posiciones"], button:has-text("Posiciones")',
      '[data-tab="resultados"], [href*="resultados"], button:has-text("Resultados")',
      '[data-tab="goleadores"], [href*="goleadores"], button:has-text("Goleadores")',
      '[data-tab="proximos"], [href*="proximos"], button:has-text("Próximos")',
    ]

    for (const selector of tabSelectors) {
      try {
        const el = page.locator(selector).first()
        if (await el.isVisible({ timeout: 3000 })) {
          await el.click()
          await page.waitForTimeout(2000)
        }
      } catch {
        // tab not found, continue
      }
    }

    await browser.close()

    // Process standings
    const standingsData = capturedData.find((d) => d.type === 'standings')
    if (standingsData) {
      await prisma.standing.deleteMany()
      await prisma.standing.createMany({
        data: (standingsData.data as RawStanding[]).map(normalizeStanding),
      })
    }

    // Process scorers
    const scorersData = capturedData.find((d) => d.type === 'scorers')
    if (scorersData) {
      await prisma.leagueScorer.deleteMany()
      await prisma.leagueScorer.createMany({
        data: (scorersData.data as RawScorer[]).map(normalizeScorer),
      })
    }

    // Process results — upsert by leagueMatchId
    const resultsData = capturedData.find((d) => d.type === 'results')
    const newMatches: Match[] = []
    if (resultsData) {
      for (const raw of resultsData.data as RawResult[]) {
        const normalized = normalizeResult(raw)
        if (!normalized.leagueMatchId) continue

        const existing = await prisma.match.findUnique({
          where: { leagueMatchId: normalized.leagueMatchId },
        })
        if (!existing) {
          const created = await prisma.match.create({ data: normalized })
          // Only consider ACSED matches as "new" for news generation
          if (
            created.homeTeam.toUpperCase().includes(ACSED_TEAM) ||
            created.awayTeam.toUpperCase().includes(ACSED_TEAM)
          ) {
            newMatches.push(created)
          }
        }
      }
    }

    await prisma.scrapeLog.update({
      where: { id: log.id },
      data: {
        status: 'success',
        finishedAt: new Date(),
        matchesFound: newMatches.length,
      },
    })

    return { newMatches, logId: log.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.scrapeLog.update({
      where: { id: log.id },
      data: { status: 'error', finishedAt: new Date(), errorMessage: message },
    })
    throw err
  }
}

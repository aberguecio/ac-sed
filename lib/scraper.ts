import { prisma } from './db'
import type { Match } from '@prisma/client'

const ACSED_TEAM_ID = 2836 // AC SED team ID
const ACSED_TEAM_NAME = 'AC Sed'
const LIGAB_API = 'https://api.ligab.cl/v1'
const LEAGUE_ID = 24 // Liga B ID

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

async function fetchAPI(endpoint: string) {
  const res = await fetch(`${LIGAB_API}${endpoint}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function runScraper(
  triggeredBy: 'manual' | 'scheduler',
  options?: { tournamentId?: number; stageId?: number }
): Promise<{
  newMatches: Match[]
  logId: number
}> {
  const log = await prisma.scrapeLog.create({
    data: { status: 'running', triggeredBy },
  })

  try {
    console.log('🔍 Starting scraper...')
    let tournamentId: number
    let stageId: number

    // Si se proveen opciones, usar esos valores
    if (options?.tournamentId && options?.stageId) {
      console.log(`📋 Using provided tournament ${options.tournamentId} and stage ${options.stageId}`)
      tournamentId = options.tournamentId
      stageId = options.stageId
    } else {
      // Get active tournament and stages
      console.log('🔍 Fetching tournaments...')
      const tournamentsRes = await fetchAPI(`/leagues/${LEAGUE_ID}/tournaments?filter={"include":[{"relation":"stages"}]}`)
      const tournaments = Array.isArray(tournamentsRes) ? tournamentsRes : []
      console.log(`✓ Found ${tournaments.length} tournaments`)
      const activeTournament = tournaments.find((t: any) => t.isActive) || tournaments[tournaments.length - 1]

      if (!activeTournament) throw new Error('No tournaments found')
      console.log(`✓ Active tournament: ${activeTournament.name || activeTournament.id} (ID: ${activeTournament.id})`)

      const activeStage = activeTournament.stages?.find((s: any) => s.isActive) || activeTournament.stages?.[0]
      if (!activeStage) throw new Error('No active stage found')
      console.log(`✓ Active stage: ${activeStage.name || activeStage.id} (ID: ${activeStage.id})`)

      tournamentId = activeTournament.id
      stageId = activeStage.id
    }

    // Get groups for this stage
    console.log(`🔍 Fetching groups for stage ${stageId}...`)
    const groups = await fetchAPI(`/stages/${stageId}/groups`)
    const allGroupIds = Array.isArray(groups) ? groups.map((g: any) => g.id) : []
    console.log(`✓ Found ${allGroupIds.length} groups`)

    // Find AC SED's group
    console.log('🔍 Searching for AC SED in groups...')
    let acsedGroupId: number | null = null
    let acsedGroupName: string = ''
    for (const groupId of allGroupIds) {
      console.log(`  Checking group ${groupId}...`)
      const groupInfo = groups.find((g: any) => g.id === groupId)
      const standings = await fetchAPI(`/groups/${groupId}/standings`).catch(() => [])
      const hasAcSed = standings.some((s: any) => s.team?.id === ACSED_TEAM_ID)
      if (hasAcSed) {
        acsedGroupId = groupId
        acsedGroupName = groupInfo?.name || `Grupo ${groupId}`
        console.log(`✓ AC SED found in group ${acsedGroupId} (${acsedGroupName})`)
        break
      }
    }

    if (!acsedGroupId) {
      throw new Error('AC SED not found in any group for this stage')
    }

    // Only fetch data for AC SED's group
    const [standings, matchDays, topScorers] = await Promise.all([
      fetchAPI(`/groups/${acsedGroupId}/standings`).catch(() => []),
      fetchAPI(`/stages/${stageId}/match-days?filter={"include":[{"relation":"matches","scope":{"include":[{"relation":"homeTeam"},{"relation":"awayTeam"},{"relation":"matchSchedule"},{"relation":"group"}],"where":{"groupId":${acsedGroupId}}}}]}`).catch(() => []),
      fetchAPI(`/tournaments/${tournamentId}/top-scorers`).catch(() => []),
    ])

    // Process standings from AC SED's group only
    if (Array.isArray(standings) && standings.length > 0) {
      console.log(`💾 Saving ${standings.length} standings...`)
      // Delete only standings for this specific tournament/stage/group
      await prisma.standing.deleteMany({
        where: {
          tournamentId,
          stageId,
          groupId: acsedGroupId
        }
      })
      const standingsData = standings.map((s: any) => ({
        tournamentId,
        stageId,
        groupId: acsedGroupId,
        groupName: acsedGroupName,
        teamName: s.team?.name || 'Unknown',
        position: s.team?.id === ACSED_TEAM_ID ? 1 : 99, // Priorizar AC SED
        played: s.played || 0,
        won: s.won || 0,
        drawn: s.drawn || 0,
        lost: s.lost || 0,
        goalsFor: s.goalsFor || 0,
        goalsAgainst: s.goalsAgainst || 0,
        points: s.points || 0,
      }))
      // Ordenar por puntos
      standingsData.sort((a, b) => b.points - a.points)
      // Asignar posiciones correctas
      standingsData.forEach((s, i) => (s.position = i + 1))
      await prisma.standing.createMany({ data: standingsData })
      console.log('✓ Standings saved')
    }

    // Process top scorers
    if (Array.isArray(topScorers) && topScorers.length > 0) {
      console.log(`💾 Saving ${topScorers.length} scorers...`)
      // Delete only scorers for this tournament
      await prisma.leagueScorer.deleteMany({
        where: { tournamentId }
      })
      const scorersData = topScorers.map((s: any) => ({
        tournamentId,
        playerName: s.player
          ? `${s.player.firstName} ${s.player.lastName}`.trim()
          : s.playerName || 'Unknown',
        teamName: s.team?.name || s.teamName || 'Unknown',
        goals: s.goals || 0,
      }))
      await prisma.leagueScorer.createMany({ data: scorersData })
      console.log('✓ Scorers saved')
    }

    // Process matches from all match days
    console.log('💾 Processing matches...')
    const newMatches: Match[] = []
    const allMatches = Array.isArray(matchDays)
      ? matchDays.flatMap((md: any) => md.matches || [])
      : []
    console.log(`  Found ${allMatches.length} total matches`)

    for (const match of allMatches) {
      const matchId = String(match.id)
      const homeTeam = match.homeTeam?.name || 'Unknown'
      const awayTeam = match.awayTeam?.name || 'Unknown'

      const matchData = {
        tournamentId,
        stageId,
        groupId: match.groupId || acsedGroupId,
        homeTeam,
        awayTeam,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        date: match.matchSchedule?.schedule ? new Date() : new Date(),
        roundName: match.group?.name || null,
        leagueMatchId: matchId,
      }

      const existing = await prisma.match.findUnique({
        where: { leagueMatchId: matchId },
      })

      if (!existing) {
        const created = await prisma.match.create({ data: matchData })
        if (
          homeTeam.includes('AC Sed') ||
          awayTeam.includes('AC Sed')
        ) {
          newMatches.push(created)
        }
      } else if (
        existing.homeScore !== match.homeScore ||
        existing.awayScore !== match.awayScore
      ) {
        // Update if scores changed
        await prisma.match.update({
          where: { leagueMatchId: matchId },
          data: { homeScore: match.homeScore, awayScore: match.awayScore },
        })
      }
    }

    console.log(`✅ Scraper completed! Found ${newMatches.length} new AC SED matches`)

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

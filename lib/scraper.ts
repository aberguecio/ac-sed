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

async function saveMatchEvents(matchId: number, leagueMatchId: number) {
  try {
    // Fetch events (goals and cards) from API
    const events = await fetchAPI(`/matches/${leagueMatchId}/events?filter={"include":["player","team"]}`)

    if (!Array.isArray(events) || events.length === 0) {
      return
    }

    console.log(`  📝 Processing ${events.length} events for match ${leagueMatchId}`)

    // Delete existing events for this match to avoid duplicates when re-scraping
    await prisma.matchGoal.deleteMany({ where: { matchId } })
    await prisma.matchCard.deleteMany({ where: { matchId } })

    for (const event of events) {
      const playerId = event.playerId
      const teamName = event.team?.name || 'Unknown'

      if (!playerId) continue

      // Save or update player in ScrapedPlayer table
      const playerData = event.player || {}
      await prisma.scrapedPlayer.upsert({
        where: { id: playerId },
        create: {
          id: playerId,
          firstName: playerData.firstName || '',
          lastName: playerData.lastName || '',
          email: playerData.email,
          run: playerData.run,
          teamId: event.teamId,
          teamName,
        },
        update: {
          firstName: playerData.firstName || '',
          lastName: playerData.lastName || '',
          email: playerData.email,
          run: playerData.run,
          teamId: event.teamId,
          teamName,
          updatedAt: new Date(),
        }
      })

      // Save event based on type
      if (event.type === 'g') {
        // Goal - create every time (same player can score multiple goals)
        await prisma.matchGoal.create({
          data: {
            matchId,
            leaguePlayerId: playerId,
            teamName,
            minute: null, // API doesn't provide minute
          }
        })
      } else if (event.type === 'yc' || event.type === 'rc') {
        // Yellow or Red card
        const cardType = event.type === 'yc' ? 'yellow' : 'red'

        await prisma.matchCard.create({
          data: {
            matchId,
            leaguePlayerId: playerId,
            cardType,
            teamName,
            minute: null,
            reason: null,
          }
        })
      }
    }

    console.log(`  ✓ Saved events for match ${leagueMatchId}`)
  } catch (err) {
    console.error(`Error saving events for match ${leagueMatchId}:`, err)
  }
}

// Helper to extract logo URL from full URL
function extractLogoUrl(fullUrl: string | null | undefined): string | null {
  if (!fullUrl) return null

  // URLs come in two formats:
  // 1. Without size: https://liga-b.nyc3.digitaloceanspaces.com/team/{teamId}/{uuid}.jpeg
  // 2. With size: https://liga-b.nyc3.digitaloceanspaces.com/team/{teamId}/{size}_{uuid}.jpeg

  // Try to match format with size prefix first
  let match = fullUrl.match(/\/team\/(\d+)\/\d+x\d+_(.+\.(?:jpeg|jpg|png))$/i)
  if (match) {
    return match[2] // Return UUID part without size prefix
  }

  // Try to match format without size prefix
  match = fullUrl.match(/\/team\/(\d+)\/([a-f0-9-]+\.(?:jpeg|jpg|png))$/i)
  if (match) {
    return match[2] // Return the UUID filename
  }

  return null
}

// Helper to save or update team
async function saveTeam(teamId: number, teamName: string, logoUrl: string | null) {
  await prisma.team.upsert({
    where: { id: teamId },
    create: {
      id: teamId,
      name: teamName,
      logoUrl: extractLogoUrl(logoUrl),
    },
    update: {
      name: teamName,
      logoUrl: extractLogoUrl(logoUrl) || undefined,
      updatedAt: new Date(),
    }
  })
}

// Helper to save or update tournament
async function saveTournament(tournamentId: number, tournamentName: string, isActive: boolean) {
  await prisma.tournament.upsert({
    where: { id: tournamentId },
    create: {
      id: tournamentId,
      name: tournamentName,
      isActive,
    },
    update: {
      name: tournamentName,
      isActive,
      updatedAt: new Date(),
    }
  })
}

// Helper to save or update stage
async function saveStage(stageId: number, tournamentId: number, stageName: string | null, orderIndex: number) {
  await prisma.stage.upsert({
    where: { id: stageId },
    create: {
      id: stageId,
      tournamentId,
      name: stageName,
      orderIndex,
    },
    update: {
      name: stageName,
      orderIndex,
      updatedAt: new Date(),
    }
  })
}

// Helper to save or update group
async function saveGroup(groupId: number, stageId: number, groupName: string) {
  await prisma.group.upsert({
    where: { id: groupId },
    create: {
      id: groupId,
      stageId,
      name: groupName,
    },
    update: {
      name: groupName,
      updatedAt: new Date(),
    }
  })
}

interface StageStats {
  groupsFound: number
  teamsProcessed: number
  standingsSaved: number
  newMatches: number
  updatedMatches: number
}

async function processSingleStage(tournamentId: number, stageId: number): Promise<{ matches: Match[], stats: StageStats }> {
  const stats: StageStats = {
    groupsFound: 0,
    teamsProcessed: 0,
    standingsSaved: 0,
    newMatches: 0,
    updatedMatches: 0
  }

  // Get groups for this stage
  console.log(`🔍 Fetching groups for stage ${stageId}...`)
  const groups = await fetchAPI(`/stages/${stageId}/groups`)
  const allGroupIds = Array.isArray(groups) ? groups.map((g: any) => g.id) : []
  stats.groupsFound = allGroupIds.length
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
    console.log(`⚠️  AC SED not found in any group for stage ${stageId}, skipping...`)
    return { matches: [], stats }
  }

  // Save the group
  await saveGroup(acsedGroupId, stageId, acsedGroupName)

  // Only fetch data for AC SED's group
  console.log('📊 Fetching standings, matches, and scorers...')
  const [standings, matchDays, topScorers] = await Promise.all([
    fetchAPI(`/groups/${acsedGroupId}/standings`).catch(() => []),
    fetchAPI(`/stages/${stageId}/match-days?filter={"include":[{"relation":"matches","scope":{"include":[{"relation":"homeTeam"},{"relation":"awayTeam"},{"relation":"matchSchedule"},{"relation":"group"}],"where":{"groupId":${acsedGroupId}}}}]}`).catch(() => []),
    fetchAPI(`/tournaments/${tournamentId}/top-scorers`).catch(() => []),
  ])
  console.log(`✓ Fetched ${standings.length} standings, ${matchDays.length} match days, ${topScorers.length} scorers`)

  // Process standings from AC SED's group only
  if (Array.isArray(standings) && standings.length > 0) {
    console.log(`💾 Saving ${standings.length} teams and standings...`)

    // First, save all teams
    for (const s of standings) {
      if (s.team?.id && s.team?.name) {
        await saveTeam(s.team.id, s.team.name, s.team.teamLogoUrl)
        stats.teamsProcessed++
      }
    }

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
      teamId: s.team?.id!,
      position: s.team?.id === ACSED_TEAM_ID ? 1 : 99, // Priorizar AC SED
      played: s.played || 0,
      won: s.won || 0,
      drawn: s.drawn || 0,
      lost: s.lost || 0,
      goalsFor: s.goalsFor || 0,
      goalsAgainst: s.goalsAgainst || 0,
      points: s.points || 0,
    })).filter(s => s.teamId) // Filter out any without teamId
    // Ordenar por puntos
    standingsData.sort((a, b) => b.points - a.points)
    // Asignar posiciones correctas
    standingsData.forEach((s, i) => (s.position = i + 1))
    await prisma.standing.createMany({ data: standingsData })
    stats.standingsSaved = standingsData.length
    console.log('✓ Teams and standings saved')
  }

  // Process top scorers
  if (Array.isArray(topScorers) && topScorers.length > 0) {
    console.log(`💾 Saving ${topScorers.length} scorers...`)

    // First, save all teams from scorers
    for (const scorer of topScorers) {
      if (scorer.team?.id && scorer.team?.name) {
        await saveTeam(scorer.team.id, scorer.team.name, scorer.team.teamLogoUrl)
      }
    }

    // Delete only scorers for this tournament
    await prisma.leagueScorer.deleteMany({
      where: { tournamentId }
    })
    const scorersData = topScorers.map((s: any) => ({
      tournamentId,
      playerName: s.player
        ? `${s.player.firstName} ${s.player.lastName}`.trim()
        : s.playerName || 'Unknown',
      teamId: s.team?.id!,
      goals: s.goals || 0,
    })).filter(s => s.teamId) // Filter out any without teamId
    await prisma.leagueScorer.createMany({ data: scorersData })
    console.log('✓ Scorers saved')
  }

  // Process matches from all match days
  console.log('💾 Processing matches...')
  const newMatches: Match[] = []

  if (!Array.isArray(matchDays)) {
    console.log('  No match days found')
    return { matches: newMatches, stats }
  }

  let totalMatches = 0
  for (const matchDay of matchDays) {
    const matches = matchDay.matches || []
    totalMatches += matches.length

    for (const match of matches) {
      const matchId = String(match.id)
      const homeTeamId = match.homeTeam?.id || null
      const awayTeamId = match.awayTeam?.id || null

      // Save teams if they have valid IDs
      if (homeTeamId && match.homeTeam?.name) {
        await saveTeam(homeTeamId, match.homeTeam.name, match.homeTeam.teamLogoUrl)
      }
      if (awayTeamId && match.awayTeam?.name) {
        await saveTeam(awayTeamId, match.awayTeam.name, match.awayTeam.teamLogoUrl)
      }

      // Combine matchDay.date with matchSchedule.schedule to get full datetime
      let matchDate = new Date()
      if (matchDay.date) {
        const dayDate = new Date(matchDay.date)
        if (match.matchSchedule?.schedule) {
          // schedule is in format "HH:MM" (e.g., "20:00")
          const [hours, minutes] = match.matchSchedule.schedule.split(':').map(Number)
          dayDate.setHours(hours, minutes, 0, 0)
        }
        matchDate = dayDate
      }

      const matchData = {
        tournamentId,
        stageId,
        groupId: match.groupId || acsedGroupId,
        homeTeamId,
        awayTeamId,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        date: matchDate,
        roundName: match.group?.name || null,
        leagueMatchId: matchId,
      }

    const existing = await prisma.match.findUnique({
      where: { leagueMatchId: matchId },
    })

    let savedMatch: any

    if (!existing) {
      savedMatch = await prisma.match.create({ data: matchData })
      stats.newMatches++
      if (homeTeamId === ACSED_TEAM_ID || awayTeamId === ACSED_TEAM_ID) {
        newMatches.push(savedMatch)
      }
    } else {
      savedMatch = existing
      stats.updatedMatches++
      if (
        existing.homeScore !== match.homeScore ||
        existing.awayScore !== match.awayScore ||
        existing.homeTeamId !== homeTeamId ||
        existing.awayTeamId !== awayTeamId
      ) {
        // Update if scores or team IDs changed
        savedMatch = await prisma.match.update({
          where: { leagueMatchId: matchId },
          data: {
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            homeTeamId: homeTeamId,
            awayTeamId: awayTeamId
          },
        })
      }
    }

      // Fetch and save events (goals and cards) for played matches
      if (match.homeScore !== null && match.awayScore !== null) {
        await saveMatchEvents(savedMatch.id, Number(matchId))
      }
    }
  }

  console.log(`  Found ${totalMatches} total matches`)
  console.log(`  Stats: ${stats.newMatches} new, ${stats.updatedMatches} updated`)

  return { matches: newMatches, stats }
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
    let stagesToProcess: number[]

    // Handle different option combinations
    if (options?.tournamentId && options?.stageId) {
      // Case 1: Both tournament and stage provided → process only that stage
      console.log(`📋 Using provided tournament ${options.tournamentId} and stage ${options.stageId}`)
      tournamentId = options.tournamentId
      stagesToProcess = [options.stageId]
    } else if (options?.tournamentId) {
      // Case 2: Only tournament provided → process ALL stages of that tournament
      console.log(`📋 Using provided tournament ${options.tournamentId}, fetching all stages...`)
      const tournamentRes = await fetchAPI(`/tournaments/${options.tournamentId}?filter={"include":[{"relation":"stages"}]}`)

      if (!tournamentRes) throw new Error(`Tournament ${options.tournamentId} not found`)

      // Save tournament
      await saveTournament(tournamentRes.id, tournamentRes.name || `Torneo ${tournamentRes.id}`, tournamentRes.isActive || false)

      const stages = tournamentRes.stages || []
      if (stages.length === 0) throw new Error('No stages found in tournament')

      // Save all stages with order index
      for (let i = 0; i < stages.length; i++) {
        await saveStage(stages[i].id, tournamentRes.id, stages[i].name || null, i)
      }

      stagesToProcess = stages.map((s: any) => s.id)
      console.log(`✓ Will process ${stagesToProcess.length} stages of tournament ${options.tournamentId}: ${stagesToProcess.join(', ')}`)

      tournamentId = options.tournamentId
    } else {
      // Case 3: No options → process ALL stages of active tournament
      console.log('🔍 Fetching tournaments...')
      const tournamentsRes = await fetchAPI(`/leagues/${LEAGUE_ID}/tournaments?filter={"include":[{"relation":"stages"}]}`)
      const tournaments = Array.isArray(tournamentsRes) ? tournamentsRes : []
      console.log(`✓ Found ${tournaments.length} tournaments`)
      const activeTournament = tournaments.find((t: any) => t.isActive) || tournaments[tournaments.length - 1]

      if (!activeTournament) throw new Error('No tournaments found')
      console.log(`✓ Active tournament: ${activeTournament.name || activeTournament.id} (ID: ${activeTournament.id})`)

      // Save tournament
      await saveTournament(activeTournament.id, activeTournament.name || `Torneo ${activeTournament.id}`, activeTournament.isActive || false)

      // Process ALL stages of this tournament
      const stages = activeTournament.stages || []
      if (stages.length === 0) throw new Error('No stages found in tournament')

      // Save all stages with order index
      for (let i = 0; i < stages.length; i++) {
        await saveStage(stages[i].id, activeTournament.id, stages[i].name || null, i)
      }

      stagesToProcess = stages.map((s: any) => s.id)
      console.log(`✓ Will process ${stagesToProcess.length} stages: ${stagesToProcess.join(', ')}`)

      tournamentId = activeTournament.id
    }

    const allNewMatches: Match[] = []
    let totalNewMatches = 0
    let totalUpdatedMatches = 0
    let totalTeamsProcessed = 0
    let totalStandingsSaved = 0
    let totalGroupsFound = 0

    // Get tournament name for logging
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } })
    const tournamentName = tournament?.name || `Torneo ${tournamentId}`

    // Process each stage
    for (const stageId of stagesToProcess) {
      console.log(`\n🔄 Processing stage ${stageId}...`)
      const result = await processSingleStage(tournamentId, stageId)
      allNewMatches.push(...result.matches)
      totalNewMatches += result.stats.newMatches
      totalUpdatedMatches += result.stats.updatedMatches
      totalTeamsProcessed += result.stats.teamsProcessed
      totalStandingsSaved += result.stats.standingsSaved
      totalGroupsFound += result.stats.groupsFound
    }

    console.log(`✅ Scraper completed! Found ${allNewMatches.length} new AC SED matches across all stages`)

    await prisma.scrapeLog.update({
      where: { id: log.id },
      data: {
        status: 'success',
        finishedAt: new Date(),
        tournamentId,
        tournamentName,
        stageIds: JSON.stringify(stagesToProcess),
        matchesFound: allNewMatches.length,
        newMatches: totalNewMatches,
        updatedMatches: totalUpdatedMatches,
        teamsProcessed: totalTeamsProcessed,
        standingsSaved: totalStandingsSaved,
        groupsFound: totalGroupsFound,
      },
    })

    return { newMatches: allNewMatches, logId: log.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.scrapeLog.update({
      where: { id: log.id },
      data: { status: 'error', finishedAt: new Date(), errorMessage: message },
    })
    throw err
  }
}

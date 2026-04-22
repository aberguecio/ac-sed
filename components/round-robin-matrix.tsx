'use client'

import { TeamLogo } from '@/components/team-logo'
import { isACSED } from '@/lib/team-utils'

interface TeamEntry {
  id: number
  name: string
  logoUrl: string | null
}

interface MatchResult {
  homeScore: number | null
  awayScore: number | null
  date: Date
}

interface CellData {
  bgClass: string
  content: React.ReactNode
  title: string
}

interface Props {
  standings: any[]
  allFixtures: any[]
}

function abbr(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => w.length > 0)
  if (words.length === 1) return words[0].substring(0, 3).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function shortDate(date: Date): string {
  return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

function shortName(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).join(' ')
}

function getCellData(
  rowTeam: TeamEntry,
  colTeam: TeamEntry,
  matchMap: Map<string, MatchResult>
): CellData {
  if (rowTeam.id === colTeam.id) {
    return { bgClass: 'bg-gray-200', content: <span className="text-gray-400 text-sm">—</span>, title: '' }
  }

  const directKey = `${rowTeam.id}-${colTeam.id}`
  const reverseKey = `${colTeam.id}-${rowTeam.id}`
  const directMatch = matchMap.get(directKey)
  const reverseMatch = matchMap.get(reverseKey)

  const match = directMatch ?? reverseMatch
  const isHome = directMatch !== undefined

  if (!match) {
    return {
      bgClass: 'bg-gray-50',
      content: <span className="text-gray-300 text-lg leading-none">·</span>,
      title: 'Sin programar',
    }
  }

  if (match.homeScore === null || match.awayScore === null) {
    return {
      bgClass: 'bg-gray-50',
      content: <span className="text-[10px] text-gray-400 leading-tight block text-center px-1">{shortDate(match.date)}</span>,
      title: `Pendiente: ${shortDate(match.date)}`,
    }
  }

  const rowScore = isHome ? match.homeScore : match.awayScore
  const colScore = isHome ? match.awayScore : match.homeScore
  const scoreStr = `${rowScore}–${colScore}`

  if (rowScore > colScore) {
    return {
      bgClass: 'bg-green-100',
      content: <span className="text-green-800 font-bold text-xs">{scoreStr}</span>,
      title: `Victoria ${scoreStr}`,
    }
  } else if (rowScore < colScore) {
    return {
      bgClass: 'bg-red-100',
      content: <span className="text-red-800 font-bold text-xs">{scoreStr}</span>,
      title: `Derrota ${scoreStr}`,
    }
  } else {
    return {
      bgClass: 'bg-amber-100',
      content: <span className="text-amber-800 font-bold text-xs">{scoreStr}</span>,
      title: `Empate ${scoreStr}`,
    }
  }
}

export function RoundRobinMatrix({ standings, allFixtures }: Props) {
  const teams: TeamEntry[] = standings
    .filter((s: any) => s.team)
    .sort((a: any, b: any) => a.position - b.position)
    .map((s: any) => ({
      id: s.team.id,
      name: s.team.name,
      logoUrl: s.team.logoUrl,
    }))

  const matchMap = new Map<string, MatchResult>()
  for (const f of allFixtures) {
    if (f.homeTeamId && f.awayTeamId) {
      matchMap.set(`${f.homeTeamId}-${f.awayTeamId}`, {
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        date: new Date(f.date),
      })
    }
  }

  if (teams.length === 0) return null

  const cellSize = 56
  const rowHeaderWidth = 120
  const tableMinWidth = rowHeaderWidth + teams.length * cellSize

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
      <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">Todos Contra Todos</h2>
      <div className="overflow-x-auto p-4">
        <table className="border-collapse" style={{ minWidth: `${tableMinWidth}px` }}>
          <thead>
            <tr>
              {/* Corner cell */}
              <th style={{ width: `${rowHeaderWidth}px` }} className="p-0 pb-1" />
              {/* Column headers */}
              {teams.map((team) => (
                <th
                  key={team.id}
                  style={{ width: `${cellSize}px` }}
                  className={`p-1 text-center align-bottom${isACSED(team.name) ? ' bg-navy rounded-t-lg' : ''}`}
                >
                  <div className="flex flex-col items-center gap-0.5 pb-0.5">
                    <TeamLogo
                      teamId={team.id}
                      teamName={team.name}
                      logoUrl={team.logoUrl}
                      size="sm"
                    />
                    <span
                      className={`text-[9px] font-semibold leading-tight${isACSED(team.name) ? ' text-white' : ' text-gray-500'}`}
                    >
                      {abbr(team.name)}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((rowTeam) => (
              <tr key={rowTeam.id}>
                {/* Row header */}
                <td
                  style={{ width: `${rowHeaderWidth}px` }}
                  className={`py-1 pr-2 pl-1${isACSED(rowTeam.name) ? ' bg-navy rounded-l-lg' : ''}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex-shrink-0">
                      <TeamLogo
                        teamId={rowTeam.id}
                        teamName={rowTeam.name}
                        logoUrl={rowTeam.logoUrl}
                        size="sm"
                      />
                    </div>
                    <span
                      className={`text-xs font-medium truncate${isACSED(rowTeam.name) ? ' text-white font-bold' : ' text-gray-700'}`}
                      style={{ maxWidth: '80px' }}
                    >
                      {shortName(rowTeam.name)}
                    </span>
                  </div>
                </td>
                {/* Data cells */}
                {teams.map((colTeam) => {
                  const cell = getCellData(rowTeam, colTeam, matchMap)
                  return (
                    <td
                      key={colTeam.id}
                      title={cell.title}
                      style={{ width: `${cellSize}px`, height: '48px' }}
                      className={`text-center align-middle border border-gray-100 ${cell.bgClass}`}
                    >
                      {cell.content}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Legend */}
        <div className="flex gap-4 mt-3 text-[10px] text-gray-500 flex-wrap items-center">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-green-200" />
            Victoria
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-amber-200" />
            Empate
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-red-200" />
            Derrota
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-gray-100 border border-gray-200" />
            Pendiente
          </span>
          <span className="text-gray-400 ml-auto hidden sm:inline">Fila = local · Columna = visita</span>
        </div>
      </div>
    </div>
  )
}

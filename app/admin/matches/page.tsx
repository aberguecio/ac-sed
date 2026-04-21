import Link from 'next/link'
import { prisma } from '@/lib/db'
import { TeamLogo } from '@/components/team-logo'
import { ACSED_TEAM_ID } from '@/lib/team-utils'
import { MatchesFilter } from './matches-filter'

interface PageProps {
  searchParams: Promise<{ showAll?: string }>
}

export default async function AdminMatchesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const showAll = params.showAll === 'true'

  const matches = await prisma.match.findMany({
    where: showAll ? undefined : {
      OR: [{ homeTeamId: ACSED_TEAM_ID }, { awayTeamId: ACSED_TEAM_ID }],
    },
    orderBy: { date: 'desc' },
    include: { homeTeam: true, awayTeam: true, stage: true },
    take: 200,
  })

  // Asistencia por partido: attended = CONFIRMED + LATE; initialized = cualquier fila PlayerMatch.
  const matchIds = matches.map(m => m.id)
  const attendance = matchIds.length
    ? await prisma.playerMatch.groupBy({
        by: ['matchId', 'attendanceStatus'],
        where: { matchId: { in: matchIds } },
        _count: { _all: true },
      })
    : []

  const attendanceByMatch = new Map<number, { attended: number; total: number }>()
  for (const row of attendance) {
    const s = attendanceByMatch.get(row.matchId) ?? { attended: 0, total: 0 }
    s.total += row._count._all
    if (row.attendanceStatus === 'CONFIRMED' || row.attendanceStatus === 'LATE') {
      s.attended += row._count._all
    }
    attendanceByMatch.set(row.matchId, s)
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-navy">Partidos</h1>
        <div className="flex items-center gap-4">
          <p className="text-sm text-gray-500">
            Total: {matches.length} partidos
          </p>
          <MatchesFilter showAll={showAll} />
        </div>
      </div>

      {matches.length === 0 ? (
        <p className="text-gray-400 text-sm">No hay partidos registrados.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-xs sm:text-sm min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-medium">
                <th className="px-2 py-2 sm:px-4 sm:py-3 text-left">Fecha</th>
                <th className="px-2 py-2 sm:px-4 sm:py-3 text-left">Partido</th>
                <th className="px-2 py-2 sm:px-4 sm:py-3 text-left">Marcador</th>
                <th className="px-2 py-2 sm:px-4 sm:py-3 text-left">Cancha</th>
                <th className="px-2 py-2 sm:px-4 sm:py-3 text-left">Asistencia</th>
                <th className="px-2 py-2 sm:px-4 sm:py-3"></th>
              </tr>
            </thead>
            <tbody>
              {matches.map(m => {
                const att = attendanceByMatch.get(m.id)
                const initialized = !!att && att.total > 0
                return (
                <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-2 py-2 sm:px-4 sm:py-3 text-gray-600">
                    {new Date(m.date).toLocaleString('es-CL', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-2 py-2 sm:px-4 sm:py-3">
                    <div className="flex items-center gap-2">
                      {m.homeTeam && (
                        <TeamLogo
                          teamId={m.homeTeam.id}
                          teamName={m.homeTeam.name}
                          logoUrl={m.homeTeam.logoUrl}
                          size="sm"
                        />
                      )}
                      <span className="font-medium text-navy">{m.homeTeam?.name ?? '—'}</span>
                      <span className="text-gray-400 mx-1">vs</span>
                      <span className="font-medium text-navy">{m.awayTeam?.name ?? '—'}</span>
                      {m.awayTeam && (
                        <TeamLogo
                          teamId={m.awayTeam.id}
                          teamName={m.awayTeam.name}
                          logoUrl={m.awayTeam.logoUrl}
                          size="sm"
                        />
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 sm:px-4 sm:py-3 text-gray-600">
                    {m.homeScore != null && m.awayScore != null
                      ? `${m.homeScore} - ${m.awayScore}`
                      : '—'}
                  </td>
                  <td className="px-2 py-2 sm:px-4 sm:py-3 text-gray-500">{m.venue ?? '—'}</td>
                  <td className="px-2 py-2 sm:px-4 sm:py-3">
                    {!initialized ? (
                      <span className="text-gray-300">—</span>
                    ) : (
                      <span
                        className="font-medium text-navy tabular-nums"
                        title={`${att!.attended} asistencias de ${att!.total} jugadores registrados`}
                      >
                        {att!.attended}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 sm:px-4 sm:py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <Link
                        href={`/admin/matches/${m.id}/attendance`}
                        className="text-xs px-3 py-1.5 rounded bg-navy text-cream hover:bg-navy-light"
                      >
                        Asistencia
                      </Link>
                      <Link
                        href={`/admin/matches/${m.id}/info`}
                        className="text-xs px-3 py-1.5 rounded border border-navy text-navy hover:bg-gray-50"
                      >
                        Más Info
                      </Link>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

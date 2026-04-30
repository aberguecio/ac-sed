'use client'

import { useEffect, useState } from 'react'
import { TeamLogo } from '@/components/team-logo'
import { isACSED } from '@/lib/team-utils'
import { FormulaTag } from './formula-tag'
import type {
  PendingMatchPrediction,
  PhaseProjectionResult,
  ProjectedStandingRow,
} from '@/lib/scouting/types'

interface Props {
  tournamentId: number
  stageId: number
  groupId: number
  asOfDate?: string
}

export function PhaseProjectionSection({ tournamentId, stageId, groupId, asOfDate }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingMatchPrediction[]>([])
  const [standings, setStandings] = useState<ProjectedStandingRow[]>([])
  const [baseline, setBaseline] = useState<ProjectedStandingRow[]>([])
  const [recomputing, setRecomputing] = useState(false)

  // Initial fetch.
  useEffect(() => {
    const params = new URLSearchParams({
      tournamentId: String(tournamentId),
      stageId: String(stageId),
      groupId: String(groupId),
    })
    if (asOfDate) params.set('asOfDate', asOfDate)

    setLoading(true)
    fetch(`/api/scouting/phase-projection?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? 'Error')
        return r.json() as Promise<PhaseProjectionResult>
      })
      .then((data) => {
        setPending(data.pendingMatches)
        setStandings(data.projectedStandings)
        setBaseline(data.baselineStandings)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [tournamentId, stageId, groupId, asOfDate])

  function updateScore(matchId: number, side: 'home' | 'away', value: number) {
    setPending((prev) =>
      prev.map((m) =>
        m.matchId === matchId
          ? { ...m, [side === 'home' ? 'predictedHome' : 'predictedAway']: Math.max(0, value) }
          : m
      )
    )
  }

  // Recompute standings whenever pending changes (debounced).
  useEffect(() => {
    if (pending.length === 0) return
    const handle = setTimeout(async () => {
      setRecomputing(true)
      try {
        const res = await fetch('/api/scouting/phase-projection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tournamentId, stageId, groupId, asOfDate, overrides: pending }),
        })
        if (!res.ok) throw new Error('recompute failed')
        const data = await res.json()
        setStandings(data.projectedStandings)
        setBaseline(data.baselineStandings)
      } catch (e) {
        // Soft-fail: keep last good standings.
        console.warn(e)
      } finally {
        setRecomputing(false)
      }
    }, 350)
    return () => clearTimeout(handle)
  }, [pending, tournamentId, stageId, groupId, asOfDate])

  if (loading) return <SectionWrapper><Loading /></SectionWrapper>
  if (error) return <SectionWrapper><p className="text-red-600 p-4">{error}</p></SectionWrapper>
  if (pending.length === 0) {
    return (
      <SectionWrapper>
        <p className="text-gray-500 p-4">No hay partidos pendientes en esta fase.</p>
      </SectionWrapper>
    )
  }

  return (
    <SectionWrapper>
      <p className="text-[12px] text-gray-500 px-4 pt-3">
        Resultados predichos para todos los partidos pendientes del grupo. Editá cualquier marcador para ver cómo cambia la tabla final.
      </p>

      <div className="grid md:grid-cols-2 gap-4 p-4">
        <PendingTable pending={pending} onChange={updateScore} />
        <ProjectedStandings standings={standings} recomputing={recomputing} />
      </div>
    </SectionWrapper>
  )
}

function SectionWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-6">
      <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50 flex items-center gap-2">
        Proyección de la fase
        <FormulaTag
          formula="λ_local = (gfLocal + gaVisita)/2 + residual/2  ;  λ_visita = (gfVisita + gaLocal)/2 − residual/2"
          explanation="Estilo Poisson: cada lado promedia su GF con el GA del rival (los goles que el otro suele recibir). 'residual' = GD del modelo − (λ_local − λ_visita) base, distribuido mitad y mitad. Luego se redondea. Cada partido tiene su propio ƒ con los números."
        />
      </h2>
      {children}
    </div>
  )
}

function Loading() {
  return (
    <div className="text-center py-8">
      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-navy"></div>
    </div>
  )
}

function PendingTable({
  pending,
  onChange,
}: {
  pending: PendingMatchPrediction[]
  onChange: (matchId: number, side: 'home' | 'away', value: number) => void
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-navy mb-2">Partidos pendientes</h3>
      <div className="space-y-2">
        {pending.map((m) => (
          <div key={m.matchId} className="border border-gray-100 rounded-lg p-2">
            <div className="text-[10px] text-gray-500 mb-1 flex items-center gap-2">
              <span>
                {new Date(m.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })} ·{' '}
                {(m.pHomeWin * 100).toFixed(0)}% / {(m.pDraw * 100).toFixed(0)}% / {(m.pAwayWin * 100).toFixed(0)}%
                {' '}· GD esp. {m.expectedGD >= 0 ? `+${m.expectedGD.toFixed(2)}` : m.expectedGD.toFixed(2)}
              </span>
              {m.scoreDerivation && (
                <FormulaTag
                  formula="λ_home = (gfHome + gaAway)/2 + residual/2  ;  λ_away = (gfAway + gaHome)/2 − residual/2  (residual = GD_modelo − GD_base)"
                  explanation={`Esperado pre-redondeo: ${m.scoreDerivation.expectedHomeGoals.toFixed(2)} − ${m.scoreDerivation.expectedAwayGoals.toFixed(2)}. Después se redondean.`}
                  values={[
                    { label: `GF ${m.homeTeam.name}/PJ`, value: m.scoreDerivation.homeGFperMatch.toFixed(2) },
                    { label: `GC ${m.homeTeam.name}/PJ`, value: m.scoreDerivation.homeGAperMatch.toFixed(2) },
                    { label: `GF ${m.awayTeam.name}/PJ`, value: m.scoreDerivation.awayGFperMatch.toFixed(2) },
                    { label: `GC ${m.awayTeam.name}/PJ`, value: m.scoreDerivation.awayGAperMatch.toFixed(2) },
                    { label: `λ ${m.homeTeam.name}`, value: m.scoreDerivation.expectedHomeGoals.toFixed(2) },
                    { label: `λ ${m.awayTeam.name}`, value: m.scoreDerivation.expectedAwayGoals.toFixed(2) },
                  ]}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <TeamLogo teamId={m.homeTeam.id} teamName={m.homeTeam.name} logoUrl={m.homeTeam.logoUrl} size="sm" />
                <span className="text-xs font-medium text-navy truncate">{m.homeTeam.name}</span>
              </div>
              <ScoreInput value={m.predictedHome} onChange={(v) => onChange(m.matchId, 'home', v)} />
              <span className="text-gray-400">-</span>
              <ScoreInput value={m.predictedAway} onChange={(v) => onChange(m.matchId, 'away', v)} />
              <div className="flex items-center gap-1 flex-1 min-w-0 justify-end">
                <span className="text-xs font-medium text-navy truncate">{m.awayTeam.name}</span>
                <TeamLogo teamId={m.awayTeam.id} teamName={m.awayTeam.name} logoUrl={m.awayTeam.logoUrl} size="sm" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ScoreInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      min={0}
      max={20}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="w-12 text-center font-bold text-navy border border-gray-300 rounded py-1 text-sm"
    />
  )
}

function ProjectedStandings({
  standings,
  recomputing,
}: {
  standings: ProjectedStandingRow[]
  recomputing: boolean
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-navy">Tabla final proyectada</h3>
        {recomputing && (
          <span className="text-[10px] text-gray-500 animate-pulse">recalculando…</span>
        )}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
            <th className="text-left py-2 px-1">#</th>
            <th className="text-left py-2 px-1">Equipo</th>
            <th className="text-center py-2 px-1">PJ</th>
            <th className="text-center py-2 px-1">G</th>
            <th className="text-center py-2 px-1">E</th>
            <th className="text-center py-2 px-1">P</th>
            <th className="text-center py-2 px-1">GD</th>
            <th className="text-center py-2 px-1">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((r) => {
            const moved = r.position - r.basePosition
            const isUs = isACSED(r.teamName)
            return (
              <tr
                key={r.teamName}
                className={`border-b last:border-0 border-gray-100 ${isUs ? 'bg-navy/5 font-semibold' : ''}`}
              >
                <td className="py-2 px-1">
                  <div className="flex items-center gap-1">
                    <span>{r.position}°</span>
                    {moved !== 0 && (
                      <span className={`text-[9px] ${moved < 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {moved < 0 ? `↑${Math.abs(moved)}` : `↓${moved}`}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 px-1">
                  <div className="flex items-center gap-1">
                    <TeamLogo teamId={r.teamId} teamName={r.teamName} logoUrl={r.logoUrl} size="sm" />
                    <span className="text-navy truncate max-w-[100px]">{r.teamName}</span>
                  </div>
                </td>
                <td className="text-center py-2 px-1">{r.played}</td>
                <td className="text-center py-2 px-1 text-green-600">{r.won}</td>
                <td className="text-center py-2 px-1 text-gray-600">{r.drawn}</td>
                <td className="text-center py-2 px-1 text-red-600">{r.lost}</td>
                <td className={`text-center py-2 px-1 font-mono ${r.goalDifference > 0 ? 'text-green-700' : r.goalDifference < 0 ? 'text-red-700' : ''}`}>
                  {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
                </td>
                <td className="text-center py-2 px-1 font-bold text-navy">
                  {r.points}
                  {r.points !== r.basePoints && (
                    <span className="text-[9px] text-gray-500 ml-1">(+{r.points - r.basePoints})</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

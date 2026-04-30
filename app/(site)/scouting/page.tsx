'use client'

import { useEffect, useState } from 'react'
import { TeamLogo } from '@/components/team-logo'
import { WinProbabilityCard } from '@/components/scouting/win-probability-card'
import { InsightsList } from '@/components/scouting/insights-list'
import { HeadToHeadCard } from '@/components/scouting/head-to-head-card'
import { CommonOpponentsTable } from '@/components/scouting/common-opponents-table'
import { PhaseProjectionSection } from '@/components/scouting/phase-projection-section'
import { FormulaTag as FormulaTagPage } from '@/components/scouting/formula-tag'
import { RecentFormCard } from '@/components/scouting/recent-form-card'
import { MetricCard } from '@/components/scouting/metric-card'
import type { ScoutingBundle } from '@/lib/scouting/types'

interface Rival {
  id: number
  name: string
  logoUrl: string | null
  position: number
  played: number
  points: number
}

interface Context {
  tournament: { id: number; name: string }
  stage: { id: number; name: string }
  group: { id: number; name: string | null }
  rivals: Rival[]
  nextMatch: { id: number; date: string; rivalId: number } | null
}

export default function ScoutingPage() {
  const [context, setContext] = useState<Context | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)
  const [selectedRivalId, setSelectedRivalId] = useState<number | null>(null)
  const [bundle, setBundle] = useState<ScoutingBundle | null>(null)
  const [loadingBundle, setLoadingBundle] = useState(false)
  const [bundleError, setBundleError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/scouting/context')
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? 'Error cargando contexto')
        }
        return res.json()
      })
      .then((data: Context) => {
        setContext(data)
        const initial = data.nextMatch?.rivalId ?? data.rivals[0]?.id ?? null
        setSelectedRivalId(initial)
      })
      .catch((err: Error) => setContextError(err.message))
  }, [])

  useEffect(() => {
    if (!selectedRivalId) return
    setLoadingBundle(true)
    setBundleError(null)
    fetch(`/api/scouting/${selectedRivalId}`)
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? 'Error cargando análisis')
        }
        return res.json()
      })
      .then((data: ScoutingBundle) => setBundle(data))
      .catch((err: Error) => setBundleError(err.message))
      .finally(() => setLoadingBundle(false))
  }, [selectedRivalId])

  if (contextError) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-extrabold text-navy mb-4">Scouting</h1>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-red-600">{contextError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-navy">Scouting del próximo rival</h1>
        {context && (
          <p className="text-sm text-gray-500 mt-1">
            {context.tournament.name} · {context.stage.name}
            {context.group.name ? ` · ${context.group.name}` : ''}
          </p>
        )}
      </div>

      {!context ? (
        <Loading />
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
            <label className="block text-xs uppercase tracking-wide text-gray-500 mb-2">Rival</label>
            <div className="flex flex-wrap gap-2">
              {context.rivals.map((r) => {
                const isSel = r.id === selectedRivalId
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRivalId(r.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition ${
                      isSel
                        ? 'bg-navy text-white border-navy'
                        : 'bg-white text-navy border-gray-300 hover:border-navy/40'
                    }`}
                  >
                    <TeamLogo teamId={r.id} teamName={r.name} logoUrl={r.logoUrl} size="sm" />
                    <span className="text-sm font-semibold">{r.name}</span>
                    <span className={`text-[10px] ${isSel ? 'text-white/70' : 'text-gray-500'}`}>{r.position}°</span>
                  </button>
                )
              })}
            </div>
          </div>

          {loadingBundle ? (
            <Loading />
          ) : bundleError ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <p className="text-red-600">{bundleError}</p>
            </div>
          ) : bundle ? (
            <ScoutingBody bundle={bundle} />
          ) : null}
        </>
      )}
    </div>
  )
}

function Loading() {
  return (
    <div className="text-center py-12">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-navy"></div>
    </div>
  )
}

function ScoutingBody({ bundle }: { bundle: ScoutingBundle }) {
  const {
    acsed,
    rival,
    prediction,
    insights,
    headToHead,
    commonOpponents,
    commonOpponentsL2,
    recentForm,
    pythagorean,
    strengthOfSchedule,
    volatility,
    discipline,
    scorers,
    currentStandings,
    context,
  } = bundle

  return (
    <>
      <WinProbabilityCard
        acsed={acsed}
        rival={rival}
        pWin={prediction.pWin}
        pDraw={prediction.pDraw}
        pLoss={prediction.pLoss}
        expectedGD={prediction.expectedGD}
        confidence={prediction.confidence}
        matchDate={context.nextMatch?.date ?? null}
        features={prediction.features}
        betas={prediction.betas}
      />

      <InsightsList insights={insights} />

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <HeadToHeadCard data={headToHead} rivalName={rival.name} />
        <CommonOpponentsTable data={commonOpponents} l2={commonOpponentsL2} rivalName={rival.name} />
        <RecentFormCard data={recentForm} acsedName={acsed.name} rivalName={rival.name} />
        <MetricCard
          title="Pythagorean (fase actual)"
          rows={[
            { label: 'Win% real', acsed: pct(pythagorean.acsed.actualWinPct), rival: pct(pythagorean.rival.actualWinPct) },
            { label: 'Win% esperado', acsed: pct(pythagorean.acsed.expectedWinPct), rival: pct(pythagorean.rival.expectedWinPct) },
            { label: 'Δ (real - esp.)', acsed: pctSigned(pythagorean.acsed.delta), rival: pctSigned(pythagorean.rival.delta) },
          ]}
          formula={{
            formula: 'expectedWin% = GF^1.83 / (GF^1.83 + GC^1.83)',
            explanation: 'Si Δ > 0 el equipo gana más de lo que sus goles sugieren (suerte/clutch); Δ < 0 indica que rinde por debajo y debería regresar a la media.',
          }}
          footer={null}
        />
        <MetricCard
          title="Standings al momento"
          rows={[
            { label: 'Posición', acsed: currentStandings.acsed ? `${currentStandings.acsed.position}°` : '—', rival: currentStandings.rival ? `${currentStandings.rival.position}°` : '—' },
            { label: 'Puntos', acsed: String(currentStandings.acsed?.points ?? 0), rival: String(currentStandings.rival?.points ?? 0) },
            { label: 'PPG', acsed: (currentStandings.acsed?.ppg ?? 0).toFixed(2), rival: (currentStandings.rival?.ppg ?? 0).toFixed(2) },
            { label: 'GD', acsed: signed(currentStandings.acsed?.goalDifference ?? 0), rival: signed(currentStandings.rival?.goalDifference ?? 0) },
          ]}
          formula={{
            formula: 'PPG = puntos / partidos jugados',
            explanation: 'Tabla recalculada al cierre del partido anterior al objetivo. Reusa calculateStandingsUpToDate() del módulo stats-calculator.',
          }}
          footer={null}
        />
        <MetricCard
          title="Calendario y volatilidad"
          rows={[
            { label: 'SoS (PPG rivales)', acsed: strengthOfSchedule.sosACSED.toFixed(2), rival: strengthOfSchedule.sosRival.toFixed(2) },
            { label: 'σ GD (últimos 10)', acsed: volatility.acsedStdDev.toFixed(2), rival: volatility.rivalStdDev.toFixed(2) },
          ]}
          formula={{
            formula: 'SoS = mean( PPG de los rivales enfrentados en esta fase )  ;  σ = stdDev( GD por partido en últimos 10 )',
            explanation: 'SoS alto = enfrentó rivales fuertes. σ alta = equipo errático (más empates extremos, menor confianza).',
          }}
          footer={null}
        />
        <MetricCard
          title="Disciplina (fase actual)"
          rows={[
            { label: 'Tarjetas/partido', acsed: discipline.acsedAvgCards.toFixed(2), rival: discipline.rivalAvgCards.toFixed(2) },
            { label: 'Rojas recientes', acsed: String(discipline.acsedRecentReds), rival: String(discipline.rivalRecentReds) },
          ]}
          formula={{
            formula: 'cards/match = totalCards / partidosJugados (en la fase)',
            explanation: 'Rojas recientes cuentan rojas en los últimos 3 partidos del equipo (cualquier torneo). Esta métrica es informativa, no entra al modelo.',
          }}
          footer={null}
        />
        <ScorersCard scorers={scorers} acsedName={acsed.name} rivalName={rival.name} />
      </div>

      <PhaseProjectionSection
        tournamentId={context.tournamentId}
        stageId={context.stageId}
        groupId={context.groupId}
        asOfDate={context.asOfDate}
      />
    </>
  )
}

function ScorersCard({
  scorers,
  acsedName,
  rivalName,
}: {
  scorers: ScoutingBundle['scorers']
  acsedName: string
  rivalName: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      <h3 className="text-md font-bold text-navy px-4 py-2 bg-gray-50 flex items-center gap-2">
        Goleadores y concentración
        <FormulaTagPage
          formula="HHI = Σ (goles_jugador / golesTotales)²"
          explanation="Herfindahl–Hirschman: 1 = un solo jugador hace todos los goles; 1/N = distribución pareja. HHI alto = vulnerable a la ausencia del goleador clave."
        />
      </h3>
      <div className="p-4 grid grid-cols-2 gap-4 flex-1">
        <ScorersColumn name={acsedName} scorers={scorers.acsedTop} hhi={scorers.acsedHHI} />
        <ScorersColumn name={rivalName} scorers={scorers.rivalTop} hhi={scorers.rivalHHI} />
      </div>
    </div>
  )
}

function ScorersColumn({
  name,
  scorers,
  hhi,
}: {
  name: string
  scorers: ScoutingBundle['scorers']['acsedTop']
  hhi: number
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-navy mb-2">{name}</div>
      {scorers.length === 0 ? (
        <p className="text-xs text-gray-400">Sin goles.</p>
      ) : (
        <ul className="space-y-1">
          {scorers.map((s) => (
            <li key={s.playerName} className="flex justify-between text-xs">
              <span className="text-gray-700 truncate pr-1">{s.playerName}</span>
              <span className="font-semibold text-navy">
                {s.goals} ({(s.share * 100).toFixed(0)}%)
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="text-[10px] text-gray-500 mt-2">HHI: {hhi.toFixed(2)}</div>
    </div>
  )
}

function pct(x: number) {
  return `${(x * 100).toFixed(0)}%`
}

function pctSigned(x: number) {
  const v = (x * 100).toFixed(0)
  return x > 0 ? `+${v}%` : `${v}%`
}

function signed(x: number) {
  return x > 0 ? `+${x}` : String(x)
}

'use client'

import { useState } from 'react'
import { TeamLogo } from '@/components/team-logo'
import { FormulaTag } from './formula-tag'

interface Props {
  acsed: { id: number; name: string; logoUrl: string | null }
  rival: { id: number; name: string; logoUrl: string | null }
  pWin: number
  pDraw: number
  pLoss: number
  expectedGD: number
  confidence: number
  matchDate: string | null
  features?: Record<string, number>
  betas?: Record<string, number>
}

const FEATURE_LABELS: Record<string, string> = {
  h2hWeightedScore: 'H2H ponderado',
  commonOppOutcomeDelta: 'Common opp. Δ resultado',
  commonOppGdDelta: 'Common opp. Δ GD',
  commonOppL2Delta: 'Common opp. L2 Δ',
  formDiff: 'Forma reciente Δ',
  pythDiff: 'Pythagorean Δ',
  sosDiff: 'SoS Δ',
  ppgDiff: 'PPG actual Δ',
  rivalVolatility: 'σ rival (centrado)',
}

const BETA_KEY: Record<string, string> = {
  h2hWeightedScore: 'h2hWeightedScore',
  commonOppOutcomeDelta: 'commonOppOutcomeDelta',
  commonOppGdDelta: 'commonOppGdDelta',
  commonOppL2Delta: 'commonOppL2Delta',
  formDiff: 'formDiff',
  pythDiff: 'pythDiff',
  sosDiff: 'sosDiff',
  ppgDiff: 'ppgDiff',
  rivalVolatility: 'rivalVolatilityPenalty',
}

export function WinProbabilityCard({ acsed, rival, pWin, pDraw, pLoss, expectedGD, confidence, matchDate, features, betas }: Props) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  const dateLabel = matchDate
    ? new Date(matchDate).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', weekday: 'long' })
    : null

  const winPct = (pWin * 100).toFixed(0)
  const drawPct = (pDraw * 100).toFixed(0)
  const lossPct = (pLoss * 100).toFixed(0)
  const expGD = expectedGD >= 0 ? `+${expectedGD.toFixed(1)}` : expectedGD.toFixed(1)
  const confPct = Math.round(confidence * 100)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
      <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50 flex items-center gap-2">
        Predicción
        <FormulaTag
          formula="P(Win) = σ(β·features) · (1 - pDraw)"
          explanation="Regresión logística sobre 8 features normalizadas, luego se reserva un slice central para empate (drawSpread = 0.18)."
        />
      </h2>
      <div className="p-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex flex-col items-center flex-1">
            <TeamLogo teamId={acsed.id} teamName={acsed.name} logoUrl={acsed.logoUrl} size="md" />
            <p className="text-sm font-semibold text-navy mt-2 text-center line-clamp-2">{acsed.name}</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-xl md:text-2xl font-bold text-gray-400">VS</div>
            {dateLabel && <div className="text-[11px] text-gray-500 mt-1">{dateLabel}</div>}
          </div>
          <div className="flex flex-col items-center flex-1">
            <TeamLogo teamId={rival.id} teamName={rival.name} logoUrl={rival.logoUrl} size="md" />
            <p className="text-sm font-semibold text-navy mt-2 text-center line-clamp-2">{rival.name}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <div className="rounded-lg bg-green-50 border border-green-200 py-3">
            <div className="text-2xl font-extrabold text-green-700">{winPct}%</div>
            <div className="text-[11px] uppercase tracking-wide text-green-700/70">Victoria</div>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 py-3">
            <div className="text-2xl font-extrabold text-gray-700">{drawPct}%</div>
            <div className="text-[11px] uppercase tracking-wide text-gray-700/70">Empate</div>
          </div>
          <div className="rounded-lg bg-red-50 border border-red-200 py-3">
            <div className="text-2xl font-extrabold text-red-700">{lossPct}%</div>
            <div className="text-[11px] uppercase tracking-wide text-red-700/70">Derrota</div>
          </div>
        </div>

        <div className="flex w-full h-2 rounded-full overflow-hidden mb-6 bg-gray-100">
          <div className="bg-green-500" style={{ width: `${pWin * 100}%` }} />
          <div className="bg-gray-400" style={{ width: `${pDraw * 100}%` }} />
          <div className="bg-red-500" style={{ width: `${pLoss * 100}%` }} />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
              GD esperado
              <FormulaTag
                formula="0.5·CommonOpp.Δ + 0.3·H2H.avgGD + 0.2·(GD_AC - GD_riv)/PJ"
                explanation="Mezcla la diferencia de gol observada en rivales en común, el histórico H2H y la diferencia de gol acumulada en la fase actual."
              />
            </div>
            <div className="text-2xl font-bold text-navy">{expGD}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
              Confianza
              <FormulaTag
                formula="clamp(samples / 8, 0, 1) - 0.05·max(0, σ̄ - 1.5)"
                explanation="Sube con muestra (H2H + common opponents L1 + 0.3·L2). Baja cuando los equipos son erráticos (alta σ del GD)."
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-navy" style={{ width: `${confPct}%` }} />
              </div>
              <span className="text-sm font-semibold text-navy">{confPct}%</span>
            </div>
          </div>
        </div>

        {features && betas && (
          <div className="border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => setShowBreakdown((v) => !v)}
              className="text-[11px] text-navy/70 hover:text-navy underline"
            >
              {showBreakdown ? 'Ocultar' : 'Ver'} desglose por feature
            </button>
            {showBreakdown && (
              <table className="w-full text-[11px] mt-2">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-gray-500">
                    <th className="text-left py-1 pr-2">Feature</th>
                    <th className="text-right py-1 px-2">Valor</th>
                    <th className="text-right py-1 px-2">β</th>
                    <th className="text-right py-1 pl-2">Aporta</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(features).map(([key, value]) => {
                    const beta = betas[BETA_KEY[key]] ?? 0
                    const contribution = key === 'rivalVolatility' ? beta * (value - 1.5) : beta * value
                    return (
                      <tr key={key} className="border-t border-gray-50">
                        <td className="py-1 pr-2 text-gray-700">{FEATURE_LABELS[key] ?? key}</td>
                        <td className="py-1 px-2 text-right font-mono">{value.toFixed(3)}</td>
                        <td className="py-1 px-2 text-right font-mono text-gray-500">{beta.toFixed(2)}</td>
                        <td
                          className={`py-1 pl-2 text-right font-mono font-semibold ${
                            contribution > 0 ? 'text-green-700' : contribution < 0 ? 'text-red-700' : 'text-gray-600'
                          }`}
                        >
                          {contribution >= 0 ? '+' : ''}{contribution.toFixed(3)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

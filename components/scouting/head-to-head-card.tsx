'use client'

import type { HeadToHeadResult } from '@/lib/scouting/types'
import { FormulaTag } from './formula-tag'

export function HeadToHeadCard({ data, rivalName }: { data: HeadToHeadResult; rivalName: string }) {
  if (data.sampleSize === 0) {
    return (
      <Wrapper>
        <p className="text-gray-400 text-center py-4">Sin partidos previos contra {rivalName}.</p>
      </Wrapper>
    )
  }

  const winPct = Math.round(data.winRate * 100)
  const drawPct = Math.round(data.drawRate * 100)
  const lossPct = Math.round(data.lossRate * 100)
  const avgGD = data.avgGD >= 0 ? `+${data.avgGD.toFixed(2)}` : data.avgGD.toFixed(2)

  return (
    <Wrapper>
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <Metric label="Victorias" value={`${winPct}%`} color="text-green-700" />
        <Metric label="Empates" value={`${drawPct}%`} color="text-gray-700" />
        <Metric label="Derrotas" value={`${lossPct}%`} color="text-red-700" />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3 text-center">
        <Metric label="Cruces" value={String(data.sampleSize)} color="text-navy" />
        <Metric label="GD prom." value={avgGD} color="text-navy" />
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
        {data.matches.slice(0, 8).map((m) => {
          const tag =
            m.result === 'W'
              ? 'bg-green-100 text-green-700'
              : m.result === 'L'
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-700'
          return (
            <div key={m.matchId} className="flex justify-between items-center text-xs py-1 border-b last:border-0 border-gray-100">
              <span className="text-gray-500">
                {new Date(m.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' })}
                {m.isCurrentPhase && <span className="ml-1 text-[9px] uppercase text-navy/70">(fase actual)</span>}
              </span>
              <span className="font-mono">{m.acsedScore} - {m.rivalScore}</span>
              <span className={`font-bold px-2 py-0.5 rounded ${tag}`}>{m.result}</span>
            </div>
          )
        })}
      </div>
    </Wrapper>
  )
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      <h3 className="text-md font-bold text-navy px-4 py-2 bg-gray-50 flex items-center gap-2">
        Historial directo
        <FormulaTag
          formula="weight = 0.5^(meses/12) × (1.5 si es fase actual)"
          explanation="Cada partido pesa según su antigüedad (half-life 12 meses). Los partidos de la fase activa pesan 1.5×. weightedScore mapea W=+1, D=0, L=-1 ponderado."
        />
      </h3>
      <div className="p-4 flex-1">{children}</div>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
    </div>
  )
}

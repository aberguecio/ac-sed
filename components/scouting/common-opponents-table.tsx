'use client'

import { useState } from 'react'
import type {
  CommonOpponentRow,
  CommonOpponentsL2Result,
  CommonOpponentsResult,
} from '@/lib/scouting/types'
import { FormulaTag } from './formula-tag'

export function CommonOpponentsTable({
  data,
  l2,
  rivalName,
}: {
  data: CommonOpponentsResult
  l2?: CommonOpponentsL2Result
  rivalName: string
}) {
  const [expanded, setExpanded] = useState<number | null>(null)

  if (data.opponents.length === 0) {
    return (
      <Wrapper>
        <p className="text-gray-400 text-center py-4">No hay rivales en común con {rivalName} todavía.</p>
      </Wrapper>
    )
  }

  const outcomeAvg = formatSigned(data.weightedMeanOutcomeDelta)
  const gdAvg = formatSigned(data.weightedMeanGdDelta)
  const l2Delta = l2 ? formatSigned(l2.weightedSecondaryDelta) : null

  const l2ByY = new Map<number, CommonOpponentsL2Result['rows'][number]>()
  if (l2) for (const row of l2.rows) l2ByY.set(row.yId, row)

  return (
    <Wrapper>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat
          label="Δ resultado"
          tag={
            <FormulaTag
              formula="Δout_Y = avg(out_AC vs Y) − avg(out_riv vs Y) ; out ∈ {+1, 0, -1}"
              explanation="Compara cualitativamente: qué tantos partidos ganamos/empatamos/perdimos vs Y comparado con cómo le fue al rival contra Y. Más confiable que la diferencia de gol pura porque distingue ganar de perder."
            />
          }
          value={outcomeAvg}
          color={data.weightedMeanOutcomeDelta >= 0 ? 'green' : 'red'}
          sub="rango [-2, +2]"
        />
        <Stat
          label="Δ GD"
          tag={
            <FormulaTag
              formula="Δgd_Y = avg_GD(AC vs Y) − avg_GD(riv vs Y)"
              explanation="Compara la magnitud: ganar 5-0 a Y aporta más que ganar 1-0. Combinado con Δ resultado, separa 'ganamos donde ellos perdieron' de 'ambos ganamos pero por distinto'."
            />
          }
          value={gdAvg}
          color={data.weightedMeanGdDelta >= 0 ? 'green' : 'red'}
          sub={`${data.totalCommonOpponents} rivales`}
        />
        {l2 && (
          <Stat
            label="Δ L2 (por fuerza)"
            tag={
              <FormulaTag
                formula="factor = clamp(1 + rating(Y)/10, 0.5, 1.5)  ·  pero =1 si Y flojo y alguien no le ganó"
                explanation="Ponderador continuo: por cada gol de rating(Y) sumamos/restamos 0.1 al factor (cap en 0.5–1.5). Asimetría: cuando Y es flojo (rating<0) Y alguien le perdió o empató, el factor queda en 1 — esa anomalía pesa full, no se descuenta."
              />
            }
            value={l2Delta!}
            color={l2.weightedSecondaryDelta >= 0 ? 'green' : 'red'}
            sub={`${l2.totalSecondaryOpponents} secundarios`}
          />
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-600">
              <th className="text-left py-2 px-1 font-semibold">Rival Y</th>
              <th className="text-center py-2 px-1 font-semibold">
                Out AC / Out riv
                <FormulaTag
                  formula="W=+1, D=0, L=-1 ponderado por recencia"
                  explanation="Promedio de resultados (no goles) de cada equipo contra Y."
                />
              </th>
              <th className="text-center py-2 px-1 font-semibold">Δ out</th>
              <th className="text-center py-2 px-1 font-semibold">GD AC / GD riv</th>
              <th className="text-center py-2 px-1 font-semibold">Δ GD</th>
              {l2 && <th className="text-center py-2 px-1 font-semibold">Rating Y</th>}
            </tr>
          </thead>
          <tbody>
            {data.opponents.slice(0, 10).map((o) => {
              const yRow = l2ByY.get(o.opponentId)
              const isOpen = expanded === o.opponentId
              return (
                <FragmentRow
                  key={o.opponentId}
                  o={o}
                  yRow={yRow}
                  isOpen={isOpen}
                  onToggle={() => setExpanded(isOpen ? null : o.opponentId)}
                  hasL2={!!l2}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </Wrapper>
  )
}

function FragmentRow({
  o,
  yRow,
  isOpen,
  onToggle,
  hasL2,
}: {
  o: CommonOpponentRow
  yRow: CommonOpponentsL2Result['rows'][number] | undefined
  isOpen: boolean
  onToggle: () => void
  hasL2: boolean
}) {
  const canExpand = !!yRow && yRow.secondaryOpponents.length > 0
  return (
    <>
      <tr
        className={`border-b last:border-0 border-gray-100 ${canExpand ? 'cursor-pointer hover:bg-gray-50' : ''}`}
        onClick={canExpand ? onToggle : undefined}
      >
        <td className="py-2 px-1 font-medium text-navy truncate max-w-[120px]">
          <span className="flex items-center gap-1">
            {canExpand && (
              <span className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
            )}
            {o.opponentName}
          </span>
        </td>
        <td className="py-2 px-1 text-center font-mono text-[11px]">
          {formatSigned(o.acsedOutcome)} / {formatSigned(o.rivalOutcome)}
        </td>
        <td
          className={`py-2 px-1 text-center font-bold ${
            o.outcomeDelta > 0 ? 'text-green-700' : o.outcomeDelta < 0 ? 'text-red-700' : 'text-gray-600'
          }`}
        >
          {formatSigned(o.outcomeDelta)}
        </td>
        <td className="py-2 px-1 text-center font-mono text-[11px]">
          {formatSigned(o.acsedGD)} / {formatSigned(o.rivalGD)}
        </td>
        <td
          className={`py-2 px-1 text-center font-bold ${
            o.gdDelta > 0 ? 'text-green-700' : o.gdDelta < 0 ? 'text-red-700' : 'text-gray-600'
          }`}
        >
          {formatSigned(o.gdDelta)}
        </td>
        {hasL2 && (
          <td className="py-2 px-1 text-center">
            {yRow ? (
              <span
                className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${
                  yRow.yImpliedRating > 0.5
                    ? 'bg-green-50 text-green-700'
                    : yRow.yImpliedRating < -0.5
                      ? 'bg-red-50 text-red-700'
                      : 'bg-gray-50 text-gray-600'
                }`}
              >
                {formatSigned(yRow.yImpliedRating)}
              </span>
            ) : (
              <span className="text-gray-300">—</span>
            )}
          </td>
        )}
      </tr>
      {isOpen && yRow && (
        <tr className="bg-gray-50 border-b border-gray-100">
          <td colSpan={hasL2 ? 6 : 5} className="px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
              Segunda derivada — rivales de {o.opponentName}
            </div>
            <ul className="text-[11px] grid grid-cols-2 gap-x-4 gap-y-1">
              {yRow.secondaryOpponents.map((s) => (
                <li key={s.opponentId} className="flex justify-between">
                  <span className="text-gray-700 truncate pr-2">{s.opponentName}</span>
                  <span
                    className={`font-mono ${
                      s.yGD > 0 ? 'text-green-700' : s.yGD < 0 ? 'text-red-700' : 'text-gray-600'
                    }`}
                  >
                    {formatSigned(s.yGD)}
                  </span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      <h3 className="text-md font-bold text-navy px-4 py-2 bg-gray-50">Rivales en común</h3>
      <div className="p-4 flex-1">{children}</div>
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  color,
  tag,
}: {
  label: string
  value: string
  sub: string
  color: 'green' | 'red'
  tag?: React.ReactNode
}) {
  return (
    <div className="text-center border border-gray-100 rounded-lg p-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 flex items-center justify-center gap-1">
        {label}
        {tag}
      </div>
      <div className={`text-xl font-extrabold ${color === 'green' ? 'text-green-700' : 'text-red-700'}`}>
        {value}
      </div>
      <div className="text-[10px] text-gray-500">{sub}</div>
    </div>
  )
}

function formatSigned(v: number) {
  return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)
}

'use client'

import type { ScoutingInsight } from '@/lib/scouting/types'

const CATEGORY_LABEL: Record<ScoutingInsight['category'], string> = {
  h2h: 'H2H',
  common: 'Rivales en común',
  commonL2: 'Segunda derivada',
  form: 'Forma',
  pyth: 'Pythagorean',
  sos: 'Calendario',
  standings: 'Tabla',
  volatility: 'Volatilidad',
  discipline: 'Disciplina',
  scorers: 'Goleadores',
}

export function InsightsList({ insights }: { insights: ScoutingInsight[] }) {
  if (insights.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">Claves del partido</h2>
        <div className="p-4">
          <p className="text-gray-400 text-center py-4">Muestra insuficiente para destacar claves.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
      <h2 className="text-lg font-bold text-navy px-4 py-3 bg-gray-50">Claves del partido</h2>
      <ul className="divide-y divide-gray-100">
        {insights.map((insight, i) => (
          <li key={i} className="p-4 flex items-start gap-3">
            <span className="text-[10px] uppercase tracking-wider font-bold text-navy bg-navy/10 px-2 py-1 rounded shrink-0 mt-0.5">
              {CATEGORY_LABEL[insight.category]}
            </span>
            <p className="text-sm text-gray-800 leading-snug">{insight.text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

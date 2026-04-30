'use client'

import { FormulaTag } from './formula-tag'

interface Row {
  label: string
  acsed: string
  rival: string
  highlight?: 'acsed' | 'rival' | null
}

export function MetricCard({
  title,
  rows,
  footer,
  formula,
}: {
  title: string
  rows: Row[]
  footer?: string | null
  formula?: { formula: string; explanation?: string }
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      <h3 className="text-md font-bold text-navy px-4 py-2 bg-gray-50 flex items-center gap-2">
        {title}
        {formula && <FormulaTag formula={formula.formula} explanation={formula.explanation} />}
      </h3>
      <div className="p-4 flex-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-gray-500">
              <th className="text-left font-medium pb-2">Métrica</th>
              <th className="text-center font-medium pb-2">AC SED</th>
              <th className="text-center font-medium pb-2">Rival</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-2 text-gray-700">{r.label}</td>
                <td className={`py-2 text-center font-semibold ${r.highlight === 'acsed' ? 'text-green-700' : 'text-navy'}`}>{r.acsed}</td>
                <td className={`py-2 text-center font-semibold ${r.highlight === 'rival' ? 'text-green-700' : 'text-navy'}`}>{r.rival}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {footer && <p className="text-[11px] text-gray-500 mt-3">{footer}</p>}
      </div>
    </div>
  )
}

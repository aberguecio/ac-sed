'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  formula: string
  explanation?: string
  values?: { label: string; value: string }[]
}

/**
 * Small clickable info pill that reveals the formula behind a metric.
 * Keeps the cards clean while making the math inspectable on demand.
 */
export function FormulaTag({ formula, explanation, values }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-block align-middle">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-navy/10 text-navy text-[10px] font-bold hover:bg-navy/20"
        aria-label="Ver fórmula"
      >
        ƒ
      </button>
      {open && (
        <span className="absolute z-20 left-1/2 -translate-x-1/2 mt-1 w-64 max-w-xs bg-white border border-navy/30 shadow-lg rounded-md p-2 text-[11px] text-gray-700 normal-case font-normal">
          <span className="block font-mono text-navy bg-navy/5 px-1.5 py-1 rounded mb-1 break-words">
            {formula}
          </span>
          {explanation && <span className="block text-gray-600 mb-1">{explanation}</span>}
          {values && values.length > 0 && (
            <span className="block divide-y divide-gray-100">
              {values.map((v, i) => (
                <span key={i} className="flex justify-between gap-2 py-0.5">
                  <span className="text-gray-500">{v.label}</span>
                  <span className="font-mono text-navy">{v.value}</span>
                </span>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  )
}

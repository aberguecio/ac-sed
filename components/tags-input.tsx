'use client'

import { useRef, useState, type KeyboardEvent, type ClipboardEvent } from 'react'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}

export function TagsInput({ value, onChange, placeholder }: Props) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function addTags(candidates: string[]) {
    const seen = new Set(value.map(v => v.toLowerCase()))
    const next = [...value]
    for (const raw of candidates) {
      const trimmed = raw.trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      next.push(trimmed)
      if (next.length >= 10) break
    }
    onChange(next)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (draft.trim()) {
        addTags([draft])
        setDraft('')
      }
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text')
    if (/[,\n]/.test(text)) {
      e.preventDefault()
      addTags(text.split(/[,\n]/))
      setDraft('')
    }
  }

  function removeTag(index: number) {
    const next = value.slice()
    next.splice(index, 1)
    onChange(next)
    inputRef.current?.focus()
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-navy flex flex-wrap gap-1 cursor-text min-h-[38px]"
    >
      {value.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-navy text-xs px-2.5 py-1"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeTag(i) }}
            className="text-gray-400 hover:text-red-500 leading-none"
            aria-label={`Quitar ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] outline-none bg-transparent text-sm py-1"
      />
    </div>
  )
}

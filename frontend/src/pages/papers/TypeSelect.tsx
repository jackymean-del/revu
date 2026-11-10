import { useState } from 'react'
import { QUESTION_TYPES } from './types'

const OTHER = '__other__'

/**
 * The question type: a plain dropdown of the usual kinds and any already
 * used here, with "Other" to type a new one. A dropdown always opens with
 * every choice, which a typed list with suggestions does not.
 */
export function TypeSelect({ value, onChange, label, also = [], options = QUESTION_TYPES, noun = 'type', className = '' }: {
  value: string
  onChange: (v: string) => void
  label: string
  also?: string[]
  options?: string[]
  noun?: string
  className?: string
}) {
  const known = [...new Set([...options, ...also.map((x) => x.trim()).filter(Boolean)])]
  const [typing, setTyping] = useState(() => value !== '' && !known.includes(value))
  if (typing)
    return (
      <span className={`flex gap-1 ${className}`}>
        <input autoFocus aria-label={label} placeholder={`Name the ${noun}`} className="min-w-0 flex-1 rounded border border-line px-2 py-1 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="rounded border border-line px-1.5 text-xs text-muted hover:bg-canvas" onClick={() => (setTyping(false), onChange(options[0] ?? ''))} aria-label={`${label}: choose from the list`}>
          List
        </button>
      </span>
    )
  return (
    <select
      aria-label={label}
      className={`rounded border border-line bg-white px-2 py-1 text-sm ${className}`}
      value={known.includes(value) ? value : ''}
      onChange={(e) => (e.target.value === OTHER ? (setTyping(true), onChange('')) : onChange(e.target.value))}
    >
      {!known.includes(value) && <option value="">Choose</option>}
      {known.map((q) => (
        <option key={q} value={q}>
          {q}
        </option>
      ))}
      <option value={OTHER}>Other, type a name</option>
    </select>
  )
}

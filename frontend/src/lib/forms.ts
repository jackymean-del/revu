/**
 * Turns what was typed into an editable row into the body the API expects,
 * catching what the browser can (empty required fields, numbers that are not
 * whole numbers) before a request is made. The server checks everything
 * again; this only saves a round trip.
 */

export type FieldKind = 'text' | 'date' | 'number' | 'select' | 'checkbox'

export type FieldSpec = { key: string; kind: FieldKind; required?: boolean }

/** What an editable row holds: strings for inputs, booleans for checkboxes. */
export type Draft = Record<string, string | boolean>

export type Converted = { ok: true; body: Record<string, unknown> } | { ok: false; errors: Record<string, string> }

export function toBody(fields: FieldSpec[], draft: Draft): Converted {
  const body: Record<string, unknown> = {}
  const errors: Record<string, string> = {}
  for (const f of fields) {
    const raw = draft[f.key]
    if (f.kind === 'checkbox') {
      body[f.key] = raw === true
      continue
    }
    const s = typeof raw === 'string' ? raw.trim() : ''
    if (s === '') {
      if (f.required) errors[f.key] = 'Fill this in.'
      continue // optional and blank: left out, never sent as zero
    }
    if (f.kind === 'number') {
      if (!/^\d+$/.test(s)) errors[f.key] = 'Use a whole number.'
      else body[f.key] = Number(s)
      continue
    }
    if (f.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      errors[f.key] = 'Use a date like 2026-04-01.'
      continue
    }
    body[f.key] = s
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, body }
}

/** The editable form of a stored item: every field as the input shows it. */
export function toDraft(fields: FieldSpec[], item: Record<string, unknown>): Draft {
  const d: Draft = {}
  for (const f of fields) {
    const v = item[f.key]
    d[f.key] = f.kind === 'checkbox' ? v === true : v === undefined || v === null ? '' : String(v)
  }
  return d
}

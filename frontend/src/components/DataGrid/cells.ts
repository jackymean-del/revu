/**
 * Marks cells, independent of any grid library (blueprint 59.3 and 59.8).
 * Marks stay decimal strings end to end: never floats, and a blank is never
 * zero. Value states follow decision D16.
 */

export type ValueState = 'scored' | 'absent' | 'exempt' | 'not_applicable' | 'pending' | 'not_assessed'

/** What a cell holds: a state, and a decimal string only when scored. */
export type CellValue = { state: ValueState; value?: string }

/** Codes a teacher can type or upload instead of a mark (Part 74). */
const CODES: Record<string, ValueState> = { AB: 'absent', EX: 'exempt', NA: 'not_applicable' }

const LABELS: Partial<Record<ValueState, string>> = { absent: 'AB', exempt: 'EX', not_applicable: 'NA' }

export type Parsed = { ok: true; cell: CellValue } | { ok: false; reason: string }

const DECIMAL = /^\d{1,6}(\.\d{1,2})?$/

/** Hundredths as an integer, so comparisons are exact. */
const hundredths = (s: string) => {
  const [whole, frac = ''] = s.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

/** Reads what a teacher typed or uploaded for a cell out of max (a decimal string). */
export function parseCell(raw: string, max: string): Parsed {
  const s = raw.trim().toUpperCase()
  if (s === '') return { ok: true, cell: { state: 'pending' } }
  const code = CODES[s]
  if (code) return { ok: true, cell: { state: code } }
  if (!DECIMAL.test(s)) return { ok: false, reason: 'Use a number with up to 2 decimals, AB, EX or NA' }
  if (hundredths(s) > hundredths(max)) return { ok: false, reason: `Above the maximum of ${max}` }
  const whole = s.split('.')[0].replace(/^0+(?=\d)/, '')
  const frac = s.split('.')[1]
  return { ok: true, cell: { state: 'scored', value: frac === undefined ? whole : `${whole}.${frac}` } }
}

/** How a cell reads in the grid: the mark, a code, or nothing while pending. */
export const showCell = (c: CellValue | undefined) => (!c ? '' : c.state === 'scored' ? (c.value ?? '') : (LABELS[c.state] ?? ''))

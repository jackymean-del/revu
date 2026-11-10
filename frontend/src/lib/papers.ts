/**
 * Helpers for Create question paper (P0.9). The server works out every
 * total exactly and is the one that decides; these only keep the totals
 * live while a blueprint is typed, in hundredths so 0.1 + 0.2 is 0.3.
 */
import type { components } from '../api/schema.gen'

type Row = components['schemas']['BlueprintRow']
type Cell = components['schemas']['BlueprintCell']

/** Marks as whole hundredths; anything not a mark is 0. */
export function hundredths(s: string): number {
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(s.trim())) return 0
  const [whole, frac = ''] = s.trim().split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

/** Hundredths back to marks as a person writes them: 4.5, not 4.50. */
export function marks(h: number): string {
  const sign = h < 0 ? '-' : ''
  const a = Math.abs(h)
  const frac = a % 100
  return sign + String(Math.floor(a / 100)) + (frac ? '.' + String(frac).padStart(2, '0').replace(/0$/, '') : '')
}

/** A cell is blank when it asks for no question. */
export const blank = (c: Cell | undefined) => !c || (c.questions === 0 && hundredths(c.marks) === 0)

/** A cell that has questions without marks, or marks without questions. */
export const inconsistent = (c: Cell | undefined) => !!c && (c.questions > 0) !== (hundredths(c.marks) > 0)

export interface Totals {
  rows: { questions: number; marks: number }[]
  byLevel: Record<string, { questions: number; marks: number }>
  questions: number
  marks: number
}

/** Every total of a blueprint being typed, in hundredths. */
export function totals(rows: Row[], levels: string[]): Totals {
  const out: Totals = { rows: [], byLevel: Object.fromEntries(levels.map((l) => [l, { questions: 0, marks: 0 }])), questions: 0, marks: 0 }
  for (const r of rows) {
    const t = { questions: 0, marks: 0 }
    for (const l of levels) {
      const c = r.cells[l]
      if (!c) continue
      const m = hundredths(c.marks)
      t.questions += c.questions
      t.marks += m
      out.byLevel[l].questions += c.questions
      out.byLevel[l].marks += m
    }
    out.rows.push(t)
    out.questions += t.questions
    out.marks += t.marks
  }
  return out
}

/** What is left to allocate, as the person should read it. */
export function remaining(max: string, allocated: number): { text: string; tone: 'ok' | 'short' | 'over' } {
  const left = hundredths(max) - allocated
  if (left === 0) return { text: 'Every mark allocated', tone: 'ok' }
  if (left > 0) return { text: `${marks(left)} marks still to allocate`, tone: 'short' }
  return { text: `${marks(-left)} marks over the maximum`, tone: 'over' }
}

/** The rows to send: blank cells left out, words trimmed. */
export function toInput(rows: Row[]): Row[] {
  return rows.map((r) => ({
    lessonId: r.lessonId || undefined,
    chapter: r.chapter.trim(),
    qtype: r.qtype.trim(),
    cells: Object.fromEntries(Object.entries(r.cells).filter(([, c]) => !blank(c))),
  }))
}

export interface Need {
  key: string
  lessonId?: string
  chapter: string
  qtype: string
  bloom: string
  marks: string
  count: number
  have: number
}

/**
 * The questions a blueprint asks for, grouped as the bank must hold them,
 * and how many approved questions of the bank fit each. Slot marks are the
 * cell's marks shared across its questions, any remainder on the last, as
 * the server lays the paper out.
 */
export function needs(rows: Row[], bank: components['schemas']['Question'][]): Need[] {
  const out = new Map<string, Need>()
  for (const r of rows) {
    for (const [bloom, c] of Object.entries(r.cells)) {
      if (blank(c) || c.questions <= 0) continue
      const total = hundredths(c.marks)
      const each = Math.round(total / c.questions)
      const parts = [...Array<number>(c.questions - 1).fill(each), total - each * (c.questions - 1)]
      for (const h of parts) {
        const key = [r.lessonId || r.chapter.trim().toLowerCase(), r.qtype.trim().toLowerCase(), bloom, h].join('|')
        const n = out.get(key) ?? { key, lessonId: r.lessonId || undefined, chapter: r.chapter.trim(), qtype: r.qtype.trim(), bloom, marks: marks(h), count: 0, have: 0 }
        n.count++
        out.set(key, n)
      }
    }
  }
  for (const n of out.values()) {
    n.have = bank.filter(
      (q) =>
        q.status === 'approved' &&
        q.qtype.toLowerCase() === n.qtype.toLowerCase() &&
        hundredths(q.marks) === hundredths(n.marks) &&
        (!n.lessonId || q.lessonId === n.lessonId) &&
        (!n.bloom || q.bloom === n.bloom),
    ).length
  }
  return [...out.values()]
}

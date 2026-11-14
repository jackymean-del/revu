/**
 * Helpers for Create question paper (P0.9). The server works out every
 * total exactly and is the one that decides; these only keep the totals
 * live while a blueprint is typed, in hundredths so 0.1 + 0.2 is 0.3. A
 * cell's marks are marks for each question: 2 questions of 2 marks is 4.
 */
import type { components } from '../api/schema.gen'
import { questionLevel, type Taxonomy } from './taxonomy'

type Row = components['schemas']['BlueprintRow']
type Cell = components['schemas']['BlueprintCell']
type Question = components['schemas']['Question']

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

/** Every total of a blueprint being typed, in hundredths: questions times marks each. */
export function totals(rows: Row[], levels: string[]): Totals {
  const out: Totals = { rows: [], byLevel: Object.fromEntries(levels.map((l) => [l, { questions: 0, marks: 0 }])), questions: 0, marks: 0 }
  for (const r of rows) {
    const t = { questions: 0, marks: 0 }
    for (const l of levels) {
      const c = r.cells[l]
      if (!c) continue
      const m = c.questions * hundredths(c.marks)
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
  level: string
  marks: string
  count: number
  have: number
}

/**
 * The questions a blueprint asks for, grouped as the bank must hold them,
 * and how many approved questions of the bank fit each: same type and
 * marks, the row's lesson, and the cell's level in the blueprint's taxonomy.
 */
export function needs(rows: Row[], bank: Question[], taxonomy: Taxonomy): Need[] {
  const out = new Map<string, Need>()
  for (const r of rows) {
    for (const [level, c] of Object.entries(r.cells)) {
      if (blank(c) || c.questions <= 0) continue
      const key = [r.lessonId || r.chapter.trim().toLowerCase(), r.qtype.trim().toLowerCase(), level, hundredths(c.marks)].join('|')
      const n = out.get(key) ?? { key, lessonId: r.lessonId || undefined, chapter: r.chapter.trim(), qtype: r.qtype.trim(), level, marks: marks(hundredths(c.marks)), count: 0, have: 0 }
      n.count += c.questions
      out.set(key, n)
    }
  }
  for (const n of out.values()) {
    n.have = bank.filter(
      (q) =>
        q.status === 'approved' &&
        q.qtype.toLowerCase() === n.qtype.toLowerCase() &&
        hundredths(q.marks) === hundredths(n.marks) &&
        (!n.lessonId || q.lessonId === n.lessonId) &&
        (!n.level || questionLevel(q, taxonomy) === n.level),
    ).length
  }
  return [...out.values()]
}

export interface Sitter {
  id: string
  name: string
  admissionNo: string
  rollNo?: string
}

export type ShareBy = 'roll' | 'name' | 'admission'

/** Students in order of roll number, name or admission number, numbers read as numbers. */
export function inOrder<T extends Sitter>(students: T[], by: ShareBy): T[] {
  const key = (s: Sitter) => (by === 'roll' ? (s.rollNo ?? '') : by === 'name' ? s.name : s.admissionNo)
  return [...students].sort((a, b) => {
    const x = key(a)
    const y = key(b)
    if (!x !== !y) return x ? -1 : 1 // without a roll number, last
    return x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' }) || a.name.localeCompare(b.name)
  })
}

/**
 * Shares sets out among a group's students: in the order chosen (roll
 * number, name or admission number, numbers read as numbers), either
 * alternately (A, B, A, B) or in equal blocks (the first half A, the rest B).
 */
export function share(students: Sitter[], sets: string[], by: ShareBy, how: 'alternate' | 'blocks'): Record<string, string> {
  if (sets.length === 0) return {}
  const order = inOrder(students, by)
  return Object.fromEntries(order.map((s, i) => [s.id, sets[how === 'alternate' ? i % sets.length : Math.floor((i * sets.length) / order.length)]]))
}

type Paper = components['schemas']['Paper']
export type Order = components['schemas']['PaperOrder']

/** The order of a paper as it stands: its sections, and the questions in each. */
export function orderOf(p: Paper): Order {
  return { sections: p.sections.map((s) => ({ id: s.id, itemIds: p.items.filter((i) => i.sectionId === s.id).map((i) => i.id) })) }
}

/**
 * Whether a question's bits, two or more, all carry the same marks. They
 * then show no marks of their own: the question says it once.
 */
export const bitsAlike = (bits: { marks: string }[]) => bits.length > 1 && bits.every((b) => hundredths(b.marks) === hundredths(bits[0].marks))

/** Each sub-section's own section, by id. */
export type Parents = Record<string, string | undefined>
export const parentsOf = (p: Paper): Parents => Object.fromEntries(p.sections.map((s) => [s.id, s.parentId || undefined]))

/**
 * A section moved to where another stands. A section takes its sub-sections
 * with it; a sub-section moves among those of its own section only.
 */
export function moveSection(o: Order, parents: Parents, id: string, onto: string): Order {
  const at = (x: string) => o.sections.findIndex((s) => s.id === x)
  if (id === onto || at(id) < 0 || at(onto) < 0) return o
  if (parents[id]) {
    if (parents[onto] !== parents[id]) return o
    const sections = [...o.sections]
    const to = at(onto)
    const [moved] = sections.splice(at(id), 1)
    sections.splice(to, 0, moved)
    return { sections }
  }
  const top = parents[onto] ?? onto
  if (top === id) return o
  const blocks: Order['sections'][] = []
  for (const s of o.sections) {
    if (parents[s.id]) blocks.at(-1)?.push(s)
    else blocks.push([s])
  }
  const from = blocks.findIndex((b) => b[0].id === id)
  const to = blocks.findIndex((b) => b[0].id === top)
  const [moved] = blocks.splice(from, 1)
  blocks.splice(to, 0, moved)
  return { sections: blocks.flat() }
}

/** A question moved to a place in a section, its own or another. */
export function moveItem(o: Order, itemId: string, toSection: string, toIndex: number): Order {
  const home = o.sections.find((s) => s.itemIds.includes(itemId))
  if (!home || !o.sections.some((s) => s.id === toSection)) return o
  const at = home.itemIds.indexOf(itemId)
  // Taking it out first shifts the places after it in its own section.
  const index = home.id === toSection && toIndex > at ? toIndex - 1 : toIndex
  return {
    sections: o.sections.map((s) => {
      const ids = s.itemIds.filter((x) => x !== itemId)
      if (s.id === toSection) ids.splice(Math.max(0, Math.min(index, ids.length)), 0, itemId)
      return { id: s.id, itemIds: ids }
    }),
  }
}

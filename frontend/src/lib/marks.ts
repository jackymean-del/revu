/**
 * The rules of the marks screen that are not about drawing it: how students
 * sort, how a person's layout arranges the columns, the counts in the grid
 * header, and which blanks "mark the rest not applicable" would touch. Order
 * and layout change what is shown, never a calculation (Part 73).
 */
import type { CellValue, ValueState } from '../components/DataGrid/cells'

export type MarksStudent = { id: string; admissionNo: string; name: string; rollNo: string; applicable: boolean; status?: RowStatus }
export type RowStatus = 'not_applicable' | 'absent' | 'exempt' | 'left'
export type MarksColumn = { id: string; label: string; max: string }
export type SortRule = { field: 'roll_no' | 'admission_no' | 'name'; direction: 'asc' | 'desc' }
export type LayoutItem = { itemId: string; position: number; visible: boolean; pinned: boolean }

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** A roll number as a number when it is one, so 2 comes before 10; blanks last. */
const roll = (s: string) => {
  const digits = s.replace(/\D/g, '')
  return digits ? Number(digits) : Number.POSITIVE_INFINITY
}

const compare: Record<SortRule['field'], (a: MarksStudent, b: MarksStudent) => number> = {
  roll_no: (a, b) => roll(a.rollNo) - roll(b.rollNo) || collator.compare(a.rollNo, b.rollNo),
  admission_no: (a, b) => collator.compare(a.admissionNo, b.admissionNo),
  name: (a, b) => collator.compare(a.name, b.name),
}

/** Sorts by the rules in turn, then by admission number, so ties never shuffle. */
export function sortStudents(list: MarksStudent[], rules: SortRule[]): MarksStudent[] {
  const all = [...rules, { field: 'admission_no', direction: 'asc' } as SortRule]
  return [...list].sort((a, b) => {
    for (const r of all) {
      const d = compare[r.field](a, b) * (r.direction === 'desc' ? -1 : 1)
      if (d) return d
    }
    return 0
  })
}

export type Arrangement = { order: string[]; hidden: string[]; pinned: string[] }

/**
 * Applies a saved layout to the columns: saved positions first, any column
 * added since in paper order after them, and nothing the layout names that
 * no longer exists.
 */
export function arrange(columns: MarksColumn[], items: LayoutItem[]): Arrangement {
  const ids = new Set(columns.map((c) => c.id))
  const saved = items.filter((i) => ids.has(i.itemId)).sort((a, b) => a.position - b.position)
  const known = new Set(saved.map((i) => i.itemId))
  return {
    order: [...saved.map((i) => i.itemId), ...columns.filter((c) => !known.has(c.id)).map((c) => c.id)],
    hidden: saved.filter((i) => !i.visible).map((i) => i.itemId),
    pinned: saved.filter((i) => i.pinned).map((i) => i.itemId),
  }
}

/** The layout to save for an arrangement. */
export const toItems = (a: Arrangement): LayoutItem[] =>
  a.order.map((id, i) => ({ itemId: id, position: i + 1, visible: !a.hidden.includes(id), pinned: a.pinned.includes(id) }))

/** Moves a column one place earlier (-1) or later (+1). */
export function move(a: Arrangement, id: string, by: -1 | 1): Arrangement {
  const order = [...a.order]
  const i = order.indexOf(id)
  const j = i + by
  if (i < 0 || j < 0 || j >= order.length) return a
  ;[order[i], order[j]] = [order[j], order[i]]
  return { ...a, order }
}

export type Counts = Record<ValueState, number> & { rows: Record<RowStatus, number> }

/**
 * What the grid header shows (Part 74.2): cells by state for students who
 * take the subject and have no row status, and rows by status.
 */
export function counts(students: MarksStudent[], columns: MarksColumn[], cell: (s: string, c: string) => CellValue | undefined): Counts {
  const out: Counts = { scored: 0, absent: 0, exempt: 0, not_applicable: 0, pending: 0, not_assessed: 0, rows: { not_applicable: 0, absent: 0, exempt: 0, left: 0 } }
  for (const s of students) {
    if (!s.applicable) continue
    if (s.status) {
      out.rows[s.status]++
      continue
    }
    for (const c of columns) out[cell(s.id, c.id)?.state ?? 'pending']++
  }
  return out
}

/** The cells "mark the remaining blanks as not applicable" would change. */
export function blanks(
  students: MarksStudent[],
  columns: MarksColumn[],
  cell: (s: string, c: string) => CellValue | undefined,
): { studentId: string; columnId: string }[] {
  const out: { studentId: string; columnId: string }[] = []
  for (const s of students) {
    if (!s.applicable || s.status) continue
    for (const c of columns) if ((cell(s.id, c.id)?.state ?? 'pending') === 'pending') out.push({ studentId: s.id, columnId: c.id })
  }
  return out
}

/**
 * Bulk writes (upload and paste) planned before anything is applied
 * (blueprint 59.7, AT-GR-01 to 03 and 07). The plan shows every change with
 * the student and column beside it, and lists what could not be matched.
 * Library-independent: every grid candidate uses the same rules.
 */
import { parseCell, type CellValue } from './cells'

export type GridStudent = { id: string; admissionNo: string; name: string }
export type GridColumn = { id: string; label: string; max: string }

export type Change = { student: GridStudent; column: GridColumn; from?: CellValue; to: CellValue }
export type Problem = { admissionNo: string; student?: GridStudent; column?: string; raw?: string; reason: string }

export type BulkPlan = {
  changes: Change[]
  /** Admission numbers in the file that are not in this class. */
  unknown: string[]
  /** Students of this class the file does not mention. */
  missing: GridStudent[]
  /** Values that will not be applied, with the reason. */
  problems: Problem[]
  /** Column headings in the file that match no entry column. */
  unknownColumns: string[]
}

export type Current = (studentId: string, columnId: string) => CellValue | undefined
export type CanEdit = (studentId: string, columnId: string) => boolean

const same = (a: CellValue | undefined, b: CellValue) => (a?.state ?? 'pending') === b.state && a?.value === b.value

/**
 * Plans an upload. Rows match students by admission number, so row order in
 * the file never matters. A blank cell changes nothing: it never becomes
 * zero and never erases a mark already entered.
 */
export function planUpload(
  header: string[],
  rows: string[][],
  students: GridStudent[],
  columns: GridColumn[],
  current: Current,
  canEdit: CanEdit = () => true,
): BulkPlan {
  const norm = (s: string) => s.trim().toLowerCase()
  const admissionAt = header.findIndex((h) => ['admission number', 'admission no', 'admission_no'].includes(norm(h)))
  const byLabel = new Map(columns.map((c) => [norm(c.label), c]))
  const colAt = header.map((h) => byLabel.get(norm(h)))
  const known = new Set(['admission number', 'admission no', 'admission_no', 'name', 'student', 'roll', 'roll number'])
  const unknownColumns = header.filter((h, i) => h.trim() && !colAt[i] && !known.has(norm(h)))

  const byAdmission = new Map(students.map((s) => [norm(s.admissionNo), s]))
  const plan: BulkPlan = { changes: [], unknown: [], missing: [], problems: [], unknownColumns }
  const seen = new Set<string>()

  for (const row of rows) {
    const adm = (row[admissionAt] ?? '').trim()
    if (!adm && row.every((v) => !v.trim())) continue
    const student = byAdmission.get(norm(adm))
    if (!student) {
      plan.unknown.push(adm || '(blank)')
      continue
    }
    if (seen.has(student.id)) {
      plan.problems.push({ admissionNo: adm, student, reason: 'This admission number appears more than once; only the first row is used' })
      continue
    }
    seen.add(student.id)
    colAt.forEach((column, i) => {
      if (!column) return
      const raw = row[i] ?? ''
      if (!raw.trim()) return
      const parsed = parseCell(raw, column.max)
      if (!parsed.ok) return plan.problems.push({ admissionNo: adm, student, column: column.label, raw, reason: parsed.reason })
      if (!canEdit(student.id, column.id)) return plan.problems.push({ admissionNo: adm, student, column: column.label, raw, reason: 'You cannot change this cell' })
      const from = current(student.id, column.id)
      if (!same(from, parsed.cell)) plan.changes.push({ student, column, from, to: parsed.cell })
    })
  }
  plan.missing = students.filter((s) => !seen.has(s.id))
  return plan
}

/**
 * Plans a paste of one column, filling downwards from a student. The same
 * rules as upload apply; a blank line leaves its cell as it is.
 */
export function planPaste(
  text: string,
  students: GridStudent[],
  column: GridColumn,
  fromStudentId: string,
  current: Current,
  canEdit: CanEdit = () => true,
): BulkPlan & { overflow: number } {
  const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t')[0])
  const start = Math.max(0, students.findIndex((s) => s.id === fromStudentId))
  const target = students.slice(start, start + lines.length)
  const plan = planUpload(
    ['Admission number', column.label],
    target.map((s, i) => [s.admissionNo, lines[i]]),
    students,
    [column],
    current,
    canEdit,
  )
  return { ...plan, missing: [], overflow: Math.max(0, lines.length - target.length) }
}

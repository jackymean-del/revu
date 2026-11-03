/**
 * The marks screen's rules apart from drawing it (P0.3, Parts 73 and 74).
 * Run: npx tsx marks-verify.mts
 *
 * Students sort with stable tie-breaks; a saved layout survives columns
 * being added or removed; the header counts leave out students who do not
 * take the subject and rows with a status; "mark the blanks not
 * applicable" touches pending cells only.
 */
import type { CellValue } from './src/components/DataGrid/cells.ts'
import { arrange, blanks, counts, move, sortStudents, toItems, type MarksColumn, type MarksStudent } from './src/lib/marks.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

const st = (id: string, rollNo: string, name: string, admissionNo = id, extra: Partial<MarksStudent> = {}): MarksStudent => ({ id, rollNo, name, admissionNo, applicable: true, ...extra })
const people = [st('a', '10', 'Zara', 'A-3'), st('b', '2', 'Aarav', 'A-1'), st('c', '', 'Meera', 'A-2'), st('d', '2', 'Dev', 'A-0')]
const ids = (l: MarksStudent[]) => l.map((s) => s.id).join('')

ok(ids(sortStudents(people, [{ field: 'roll_no', direction: 'asc' }])) === 'dbac', 'roll numbers sort as numbers, blanks last, ties by admission number')
ok(ids(sortStudents(people, [{ field: 'name', direction: 'asc' }])) === 'bdca', 'by name')
ok(ids(sortStudents(people, [{ field: 'name', direction: 'desc' }])) === 'acdb', 'by name, descending')
ok(ids(sortStudents(people, [{ field: 'admission_no', direction: 'asc' }])) === 'dbca', 'by admission number')
ok(ids(sortStudents([...people].reverse(), [{ field: 'roll_no', direction: 'asc' }])) === 'dbac', 'the input order never changes the result')

const cols: MarksColumn[] = [
  { id: 'p1', label: 'Part A', max: '20' },
  { id: 'p2', label: 'Part B', max: '20' },
  { id: 'p3', label: 'Practical', max: '10' },
]
const saved = arrange(cols, [
  { itemId: 'p3', position: 1, visible: true, pinned: true },
  { itemId: 'p1', position: 2, visible: false, pinned: false },
  { itemId: 'gone', position: 3, visible: true, pinned: false },
])
ok(saved.order.join() === 'p3,p1,p2' && saved.hidden.join() === 'p1' && saved.pinned.join() === 'p3', 'a saved layout applies; a new column joins at the end; a removed one is dropped')
ok(arrange(cols, []).order.join() === 'p1,p2,p3', 'no layout keeps paper order')
const moved = move(saved, 'p2', -1)
ok(moved.order.join() === 'p3,p2,p1' && move(saved, 'p3', -1) === saved, 'columns move one place, never past an end')
ok(JSON.stringify(arrange(cols, toItems(moved))) === JSON.stringify(moved), 'a layout saved and read back is the same layout')

const cells: Record<string, CellValue> = {
  'a|p1': { state: 'scored', value: '12' },
  'a|p2': { state: 'absent' },
  'b|p1': { state: 'not_applicable' },
  'c|p1': { state: 'scored', value: '0' },
}
const value = (s: string, c: string) => cells[`${s}|${c}`]
const two = cols.slice(0, 2)
const group = [st('a', '1', 'A'), st('b', '2', 'B'), st('c', '3', 'C'), st('x', '4', 'X', 'X', { applicable: false }), st('y', '5', 'Y', 'Y', { status: 'exempt' })]
const n = counts(group, two, value)
ok(n.scored === 2 && n.absent === 1 && n.not_applicable === 1 && n.pending === 2 && n.exempt === 0, 'cells count by state, a scored zero is scored', JSON.stringify(n))
ok(n.rows.exempt === 1 && n.scored + n.absent + n.not_applicable + n.pending === 6, 'a row with a status and a non-taker are left out of the cells')
const left = blanks(group, two, value)
ok(left.map((b) => b.studentId + b.columnId).join() === 'bp2,cp2', 'blanks to mark are pending cells of takers without a status only')

if (fail) {
  console.log(`\n${fail} failed`)
  process.exit(1)
}
console.log('\nall marks rules hold')

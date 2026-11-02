/**
 * DataGrid wrapper rules that hold whatever grid library sits behind it
 * (blueprint 59.7 and 59.9). Run: npx tsx datagrid-verify.mts
 *
 * AT-GR-01: shuffled upload rows land on the right students.
 * AT-GR-02: the plan lists unknown admission numbers, missing students and
 *           invalid values before anything is applied.
 * AT-GR-03: a blank is never zero; AB, EX and NA are states, not marks.
 * AT-GR-07: paste follows the same rules as upload.
 */
import { parseCell, showCell, type CellValue } from './src/components/DataGrid/cells.ts'
import { planPaste, planUpload, type GridColumn, type GridStudent } from './src/components/DataGrid/bulk.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

// Cells.
const cell = (raw: string, max = '10') => {
  const p = parseCell(raw, max)
  return p.ok ? `${p.cell.state}${p.cell.value ? ':' + p.cell.value : ''}` : `error:${p.reason}`
}
ok(cell('7') === 'scored:7' && cell('07.5') === 'scored:7.5' && cell('9.25') === 'scored:9.25', 'marks are kept as exact decimal strings')
ok(cell('10') === 'scored:10' && cell('10.01').startsWith('error:Above'), 'the maximum is compared exactly, to the hundredth')
ok(cell('0.1', '0.1') === 'scored:0.1' && cell('0.2', '0.1').startsWith('error'), 'no floating-point drift at small maxima')
ok(cell('') === 'pending' && cell('   ') === 'pending', 'a blank is pending, never zero')
ok(cell('ab') === 'absent' && cell('EX') === 'exempt' && cell('na') === 'not_applicable', 'AB, EX and NA are states (D16, Part 74)')
ok(cell('7.555').startsWith('error') && cell('-1').startsWith('error') && cell('seven').startsWith('error'), 'other input is refused with a reason')
ok(showCell({ state: 'absent' }) === 'AB' && showCell({ state: 'pending' }) === '' && showCell({ state: 'scored', value: '8.5' }) === '8.5', 'cells read as a mark, a code or nothing')

// A class of five and two entry columns.
const students: GridStudent[] = ['Aarav Rao', 'Diya Sharma', 'Ishaan Iyer', 'Meera Khan', 'Kabir Das'].map((name, i) => ({
  id: `s${i + 1}`,
  admissionNo: `A-${1001 + i}`,
  name,
}))
const columns: GridColumn[] = [
  { id: 'q1', label: 'Q1', max: '10' },
  { id: 'q2', label: 'Q2', max: '5' },
]
const existing: Record<string, CellValue> = { 's2:q1': { state: 'scored', value: '6' } }
const current = (s: string, c: string) => existing[`${s}:${c}`]

// AT-GR-01: rows in any order land on the matching student.
const header = ['Admission number', 'Name', 'Q2', 'Q1']
const rows = [
  ['A-1003', 'Ishaan Iyer', '4', '9'],
  ['A-1001', 'Aarav Rao', 'AB', '7.5'],
  ['A-1002', 'Diya Sharma', '', ''], // blank: Diya keeps her 6
  ['A-1004', 'Meera Khan', '6', 'NA'], // 6 is above the Q2 maximum of 5
  ['A-9999', 'Someone else', '1', '1'],
  ['A-1001', 'Aarav again', '1', '1'],
]
const plan = planUpload(header, rows, students, columns, current)
const got = Object.fromEntries(plan.changes.map((c) => [`${c.student.name}/${c.column.label}`, showCell(c.to)]))
ok(
  got['Ishaan Iyer/Q1'] === '9' && got['Ishaan Iyer/Q2'] === '4' && got['Aarav Rao/Q1'] === '7.5' && got['Aarav Rao/Q2'] === 'AB' && got['Meera Khan/Q1'] === 'NA',
  'shuffled rows and columns land on the matching student and column (AT-GR-01)',
  JSON.stringify(got),
)
ok(!('Diya Sharma/Q1' in got) && !('Diya Sharma/Q2' in got), 'a blank cell changes nothing and never erases a mark (AT-GR-03)')

// AT-GR-02: what could not be matched is listed before anything applies.
ok(plan.unknown.length === 1 && plan.unknown[0] === 'A-9999', 'unknown admission numbers are listed (AT-GR-02)')
ok(plan.missing.length === 1 && plan.missing[0].name === 'Kabir Das', 'students missing from the file are listed')
ok(plan.problems.some((p) => p.student?.name === 'Meera Khan' && p.column === 'Q2' && p.reason.includes('maximum')), 'invalid values are listed with a reason')
ok(plan.problems.some((p) => p.reason.includes('more than once')), 'a repeated admission number is flagged, not applied twice')
ok(planUpload(['Admission number', 'Q9'], [], students, columns, current).unknownColumns[0] === 'Q9', 'an unknown column heading is listed')

// Only cells the person may edit change.
const locked = planUpload(['Admission number', 'Q1'], [['A-1001', '5']], students, columns, current, (_s, c) => c !== 'q1')
ok(locked.changes.length === 0 && locked.problems[0]?.reason === 'You cannot change this cell', 'cells the person may not edit are refused')

// AT-GR-07: paste follows the same rules, filling down from the active student.
const pasted = planPaste('4\n\nAB\n11\n2\n3', students, columns[0], 's2', current)
const p = Object.fromEntries(pasted.changes.map((c) => [c.student.name, showCell(c.to)]))
ok(p['Diya Sharma'] === '4' && !('Ishaan Iyer' in p) && p['Meera Khan'] === 'AB' && p['Aarav Rao'] === undefined, 'paste fills down from the active student and skips blanks', JSON.stringify(p))
ok(pasted.problems.some((x) => x.student?.name === 'Kabir Das' && x.reason.includes('maximum')), 'paste refuses invalid values like upload does')
ok(pasted.overflow === 2, 'lines beyond the last student are counted, not dropped silently')

if (fail) process.exit(1)

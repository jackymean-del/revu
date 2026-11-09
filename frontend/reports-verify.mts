/**
 * The report design helpers (P0.5). Run: npx tsx reports-verify.mts
 *
 * Subjects order the way the server orders them (template order, then by
 * name), so the designer's list matches what prints; moving an item never
 * loses or duplicates one; every section the server knows has a label.
 */
import { readFileSync } from 'node:fs'
import { moveItem, orderSubjects, SECTION_LABEL } from './src/lib/reports.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

const subjects = [
  { id: 'm', name: 'Mathematics' },
  { id: 'e', name: 'English' },
  { id: 'h', name: 'Hindi' },
  { id: 's', name: 'Science' },
]
const ids = (l: { id: string }[]) => l.map((s) => s.id).join('')
ok(ids(orderSubjects(subjects, [])) === 'ehms', 'with no order, subjects go by name')
ok(ids(orderSubjects(subjects, ['s', 'm'])) === 'smeh', 'listed subjects first, in order; the rest by name')
ok(ids(orderSubjects(subjects, ['gone', 'h'])) === 'hems', 'an id no longer taught is ignored')

const moved = moveItem(subjects, 1, -1)
ok(ids(moved) === 'emhs' && moved !== subjects, 'an item moves one place')
ok(moveItem(subjects, 0, -1) === subjects && moveItem(subjects, 3, 1) === subjects, 'never past an end')
ok(ids(moveItem(moveItem(subjects, 2, 1), 3, -1)) === ids(subjects), 'down then up restores the order')

// Guard the pattern: the server's sections all have a label here.
const config = readFileSync('../backend/internal/reports/config.go', 'utf8')
const keys = /SectionKeys = \[\]string\{([^}]*)\}/.exec(config)?.[1].match(/"(\w+)"/g)?.map((k) => k.slice(1, -1)) ?? []
ok(keys.length === 6, 'the server section keys were read', keys.join(','))
ok(
  keys.every((k) => k in SECTION_LABEL) && Object.keys(SECTION_LABEL).length === keys.length,
  'every section has a label and no label is left over',
)
// And the server orders subjects the same way.
const facts = readFileSync('../backend/internal/reports/facts.go', 'utf8')
ok(/ORDER BY s\.name/.test(facts) && /slices\.Index\(cfg\.SubjectOrder/.test(facts), 'the server orders by the template, then by name')

if (fail) {
  console.log(`\n${fail} failed`)
  process.exit(1)
}
console.log('\nreport design helpers hold')

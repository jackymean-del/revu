/**
 * The analysis helpers (P0.6). Run: npx tsx analysis-verify.mts
 *
 * Percentages compare in hundredths, never as floats; every percentage
 * lands in exactly one range and 100 is in the top one; sorting by total
 * puts results with no number last; the settings check matches the
 * server's rules; every server action and status has a label.
 */
import { readFileSync } from 'node:fs'
import { ACTION, below, checkSettings, describeRule, hundredths, rangeIndex, ranges, RETEACH_STATUS, sortRows, type Settings, type StudentRow } from './src/lib/analysis.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

ok(hundredths('39.99') === 399900 && hundredths('100') === 1000000 && hundredths('AB') === null && hundredths('') === null, 'percentages read exactly')
ok(below('59.99', '60') && !below('60', '60') && !below('60.00', '60') && !below(undefined, '60'), 'below is strict and ignores no number')

const rs = ranges(['40', '50', '60', '70', '80', '90'])
ok(rs.length === 7 && rs[0].label === 'Below 40%' && rs[6].label === '90% and above', 'seven ranges from six boundaries', rs.map((r) => r.label).join(' | '))
ok(rangeIndex('39.99', rs) === 0 && rangeIndex('40', rs) === 1 && rangeIndex('89.99', rs) === 5 && rangeIndex('100', rs) === 6 && rangeIndex('0', rs) === 0, 'edges fall in the right range')
ok(rangeIndex('', rs) === -1 && rangeIndex('Withheld', rs) === -1, 'no number is in no range')
// Every hundredth from 0 to 100 lands in exactly one range.
let gaps = 0
for (let i = 0; i <= 10000; i++) {
  const p = (i / 100).toFixed(2)
  const hits = rs.filter((_, k) => rangeIndex(p, rs) === k).length
  if (hits !== 1) gaps++
}
ok(gaps === 0, 'ranges cover 0 to 100 with no gap or overlap')

const row = (name: string, roll: string, pct?: string): StudentRow => ({ id: name, name, rollNo: roll, subjects: {}, total: pct ? { state: 'complete', pct } : { state: 'blocked' } })
const rows = [row('a', '2', '70.5'), row('b', '10', '91'), row('c', '1'), row('d', '3', '91')]
ok(sortRows(rows, 'roll').map((r) => r.name).join('') === 'cadb', 'roll order is numeric')
ok(sortRows(rows, 'total').map((r) => r.name).join('') === 'dbac', 'by total: highest first, ties by roll, no number last')

// The pilot school's own two lists read as staff say them.
const noun = { one: 'subject', many: 'subjects' }
const undertaking = { name: 'Undertaking', action: 'undertaking', on: 'subjects', belowPct: '60', atLeast: 3, showBelowPct: '70' } as const
const warning = { name: 'Verbal warning', action: 'warning', on: 'subjects', belowPct: '70', atLeast: 1, showBelowPct: '70' } as const
ok(describeRule(undertaking, noun) === 'At least 3 subjects below 60%. Shows subjects below 70%.', 'undertaking rule in words', describeRule(undertaking, noun))
ok(describeRule(warning, noun) === 'Any one subject below 70%. Shows subjects below 70%.', 'warning rule in words', describeRule(warning, noun))

const good: Settings = { masteryPct: '40', reteachSharePct: '30', minEvidence: 5, ranges: ['40', '50'], lists: [undertaking, warning], signoff: [] }
ok(checkSettings(good) === '', 'the defaults pass')
ok(checkSettings({ ...good, ranges: ['50', '40'] }) !== '', 'falling boundaries fail')
ok(checkSettings({ ...good, masteryPct: '101' }) !== '', 'over 100 fails')
ok(checkSettings({ ...good, lists: [{ ...warning, atLeast: 0 }] }) !== '', 'a count of 0 fails')

// Guard the pattern: every action and status the server accepts has a label.
const go = readFileSync('../backend/internal/analysis/analysis.go', 'utf8')
const actions = /"undertaking", "warning", "retest", "support"/.test(go)
ok(actions && Object.keys(ACTION).join() === 'undertaking,warning,retest,support', 'every list action has a label')
ok(/"", "planned", "done", "not_needed"/.test(go) && Object.keys(RETEACH_STATUS).join() === 'planned,done,not_needed', 'every reteach status has a label')

console.log(fail ? `\n${fail} failed` : '\nall passed')
process.exit(fail ? 1 : 0)

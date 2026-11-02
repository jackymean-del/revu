/**
 * Setup suggestions are right before anyone sees them.
 * Run: npx tsx setup-verify.mts   (from frontend/)
 *
 * The suggested year is the one under way; terms cover it exactly, with no
 * gap or overlap, for one to four terms; level runs and section lists come
 * out as a person would type them.
 */
import { defaultYear, levelRun, sectionNames, splitTerms } from './src/lib/setup.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

const nov = defaultYear(new Date(Date.UTC(2026, 10, 2)))
ok(nov.label === '2026-27' && nov.startsOn === '2026-04-01' && nov.endsOn === '2027-03-31', 'in November the year under way is April to March', JSON.stringify(nov))
const feb = defaultYear(new Date(Date.UTC(2027, 1, 10)))
ok(feb.startsOn === '2026-04-01', 'in February it is still the year that began last April')
const jan = defaultYear(new Date(Date.UTC(2026, 5, 1)), 1)
ok(jan.label === '2026' && jan.endsOn === '2026-12-31', 'a calendar-year institution gets a calendar year', JSON.stringify(jan))
const leap = defaultYear(new Date(Date.UTC(2027, 5, 1)))
ok(leap.endsOn === '2028-03-31', 'the year still ends on the last day across a leap year')

const day = 86_400_000
for (const n of [1, 2, 3, 4]) {
  const terms = splitTerms('2026-04-01', '2027-03-31', n, 'Term')
  const joined = terms.every((t, i) => i === 0 || new Date(t.startsOn).getTime() - new Date(terms[i - 1].endsOn).getTime() === day)
  const covers = terms[0].startsOn === '2026-04-01' && terms[n - 1].endsOn === '2027-03-31'
  ok(terms.length === n && joined && covers && terms.every((t) => t.startsOn <= t.endsOn), `${n} terms cover the year with no gap or overlap`, terms.map((t) => `${t.startsOn}..${t.endsOn}`).join(' '))
}
const two = splitTerms('2026-04-01', '2027-03-31', 2, 'Semester')
ok(two[0].name === 'Semester 1' && two[0].endsOn === '2026-09-30' && two[1].startsOn === '2026-10-01', 'two halves split at the end of September')

const run = levelRun('Grade', 1, 12)
ok(run.length === 12 && run[0].name === 'Grade 1' && run[11].name === 'Grade 12' && run[11].seq === 12, 'a run of levels with their order')
ok(levelRun('Grade', 5, 3).length === 0 && levelRun('Grade', 1, 99).length === 0, 'a backwards or huge run gives nothing')

ok(JSON.stringify(sectionNames('a, B ,c,,b')) === '["A","B","C"]', 'section names are trimmed, single letters upper-cased, repeats dropped')
ok(JSON.stringify(sectionNames('Rose; Lily\nRose')) === '["Rose","Lily"]', 'names can be separated by commas, semicolons or lines')

if (fail) process.exit(1)

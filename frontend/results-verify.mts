/**
 * The words of results and schemes (P0.4). Run: npx tsx results-verify.mts
 *
 * Every reason the scheme engine records has words a person can read, so
 * no code such as component_blocked reaches a screen; field errors from the
 * server land beside the line they name; and the editor's starting points
 * are schemes the engine accepts in shape.
 */
import { readFileSync } from 'node:fs'
import { aggregateText, blankScheme, errorsByPath, errorsUnder, eventText, newComponent, nextCode, reasonText, type EventUse } from './src/lib/results.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

// Guard the pattern: read the reasons out of the engine itself.
const engine = readFileSync('../backend/internal/scheme/engine.go', 'utf8')
const subject = [...engine.matchAll(/res\.State, res\.Reason = "\w+", "(\w+)(:)?/g)].map((m) => m[1] + (m[2] ? ':TE' : ''))
const component = [...engine.matchAll(/out\.State, out\.Reason = "\w+", "(\w+)"/g), ...engine.matchAll(/^\s+out\.Reason = "(\w+)"/gm)].map((m) => m[1])
const events = [...engine.matchAll(/u\.Use, u\.Reason(?:, u\.CarriedFrom)? = "(\w+)", "(\w+)"/g)].map((m) => [m[1], m[2]] as [EventUse, string])
const eventReasons = [...engine.matchAll(/^\s+u\.Reason = "(\w+)"/gm)].map((m) => m[1])
ok(subject.length >= 6 && events.length >= 5 && eventReasons.length >= 2, 'the engine reasons were found', `${subject.length} subject, ${events.length} event`)

const names = { TE: 'Term exam', PT: 'Periodic tests' }
for (const r of new Set(subject)) {
  const words = reasonText(r, names)
  ok(words !== r && words.length > 10 && !/_/.test(words), `subject reason ${r} has words`, words)
}
ok(reasonText('component_blocked:TE', names).includes('Term exam'), 'a withheld result names the component, not its code')
ok(reasonText('pending:PT,TE', names) === 'Still to come: Periodic tests, Term exam.', 'every component still to come is named')
ok(reasonText('left_out', names) !== 'left_out', 'a component left out has words')
for (const r of new Set(component)) {
  if (['no_assessment', 'absent_wait_makeup', 'nothing_to_carry', 'pending', 'all_left_out'].includes(r)) continue
  ok(false, `component reason ${r} is new; give it words in lib/results.ts and list it here`)
}
for (const [use, reason] of events) {
  const words = eventText(use, reason)
  ok(!words.includes('_') && words.length > 5, `event ${use}/${reason} has words`, words)
}
for (const reason of new Set(eventReasons)) {
  // Set on an assessment that counted, or on one left out.
  const specific = eventText('used', reason) !== 'Counted' || eventText('left_out', reason) !== 'Left out'
  ok(specific, `${reason} has its own words`, `${eventText('used', reason)} / ${eventText('left_out', reason)}`)
}
for (const reason of ['not_in_best', 'not_highest', 'not_lowest']) {
  ok(eventText('dropped', reason) !== 'Not counted', `dropped as ${reason} says why`)
  ok(engine.includes(`"${reason}"`), `the engine still records ${reason}`)
}
ok(eventText('carried', 'absent_carried', 'Periodic test 1').includes('Periodic test 1'), 'a carried mark names where it came from')

ok(aggregateText('best_n:2') === 'Average the best 2' && aggregateText('avg') === 'Average the percentages', 'how a component combines reads plainly')

const errs = errorsByPath([
  { field: 'definition.components[1].scale_to', message: 'a' },
  { field: 'definition.components[10].code', message: 'b' },
  { field: 'definition', message: 'c' },
  { field: 'definition.subject.expr', message: 'd' },
])
ok(errs['components[1].scale_to']?.[0] === 'a' && errs['']?.[0] === 'c', 'field errors are keyed by the line they name')
ok(errorsUnder(errs, 'components[1]').join() === 'a', 'errors under one component do not include another with a longer number')
ok(errorsUnder(errs, 'subject').join() === 'd', 'errors under the result line')

const blank = blankScheme()
const code = /^[A-Z][A-Z0-9_]{0,15}$/
ok(blank.components.every((c) => code.test(c.code)) && blank.subject.expr === blank.components[0].code && blank.subject.max === blank.components[0].scale_to, 'a blank scheme is one component worth the whole result')
const two = { ...blank, components: [...blank.components, newComponent('C1', 'x')] }
ok(nextCode(two) === 'C2' && code.test(nextCode(two)), 'a new component gets a free code')

if (fail) {
  console.log(`\n${fail} failed`)
  process.exit(1)
}
console.log('\nresults words hold')

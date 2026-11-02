/**
 * Editable rows turn into API bodies without inventing values.
 * Run: npx tsx forms-verify.mts   (from frontend/)
 *
 * A blank optional field is left out (never sent as zero or an empty
 * string), required fields are caught before a request, whole numbers are
 * numbers, and a stored item reads back into the same draft it came from.
 */
import { toBody, toDraft, type FieldSpec } from './src/lib/forms.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

const period: FieldSpec[] = [
  { key: 'seq', kind: 'number', required: true },
  { key: 'name', kind: 'text', required: true },
  { key: 'kind', kind: 'text' },
  { key: 'startsOn', kind: 'date', required: true },
  { key: 'optional', kind: 'checkbox' },
]

const good = toBody(period, { seq: ' 2 ', name: '  Term 2 ', kind: '', startsOn: '2026-10-01', optional: false })
ok(good.ok, 'a filled row converts')
if (good.ok) {
  ok(good.body.seq === 2 && good.body.name === 'Term 2', 'numbers become numbers and text is trimmed', JSON.stringify(good.body))
  ok(!('kind' in good.body), 'a blank optional field is left out, not sent as empty or zero')
  ok(good.body.optional === false, 'a checkbox is always true or false')
}

const missing = toBody(period, { seq: '', name: ' ', kind: 'x', startsOn: '', optional: true })
ok(!missing.ok && Object.keys(missing.errors).sort().join() === 'name,seq,startsOn', 'every required blank is caught before a request', missing.ok ? '' : Object.keys(missing.errors).join())

const wrong = toBody(period, { seq: '2.5', name: 'A', startsOn: '1/10/2026', optional: false })
ok(!wrong.ok && wrong.errors.seq === 'Use a whole number.' && wrong.errors.startsOn?.startsWith('Use a date'), 'fractions and other date shapes are refused')

const stored = { id: 'x', seq: 3, name: 'Term 3', startsOn: '2027-01-01', optional: true }
const draft = toDraft(period, stored)
ok(draft.seq === '3' && draft.kind === '' && draft.optional === true, 'a stored item reads into the inputs', JSON.stringify(draft))
const back = toBody(period, draft)
ok(back.ok && back.body.seq === 3 && back.body.name === 'Term 3' && !('kind' in back.body), 'and converts back unchanged')

if (fail) process.exit(1)

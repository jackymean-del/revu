/**
 * Audit entries read as plain changes. Run: npx tsx audit-verify.mts
 *
 * An edit lists only the fields that changed, from what to what; an add
 * lists what was set; a removal what there was. Ids and bookkeeping never
 * appear, and a list such as the words' overrides is compared as a whole.
 */
import { changes, fieldLabel, recordName } from './src/lib/audit.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

const before = { id: 'x', name: 'Ravi Kumar', admissionNo: 'A-001', dob: '', status: 'active', removedAt: '' }
const after = { id: 'x', name: 'Ravi K. Kumar', admissionNo: 'A-001', dob: '2014-06-21', status: 'active', removedAt: '' }
const edit = changes(before, after)
ok(edit.length === 2 && edit[0].field === 'dob' && edit[1].field === 'name', 'an edit lists only what changed', JSON.stringify(edit))
ok(edit[1].from === 'Ravi Kumar' && edit[1].to === 'Ravi K. Kumar' && edit[0].from === '', 'from what to what, a blank shown as blank')

const added = changes(undefined, { id: 'y', name: 'Grade 8', seq: 8, stage: '' })
ok(added.length === 2 && added.every((c) => c.from === ''), 'an add lists what was set and leaves blanks out', JSON.stringify(added))
ok(changes({ id: 'z', label: '2026-27' }, undefined)[0]?.from === '2026-27', 'a removal lists what there was')

const words = changes({ preset: 'school', overrides: [] }, { preset: 'school', overrides: [{ key: 'group.section', one: 'House' }] })
ok(words.length === 1 && words[0].field === 'overrides', 'a list is compared as a whole')
ok(changes({ optional: false }, { optional: true })[0]?.to === 'Yes', 'yes and no for true and false')

ok(fieldLabel('admissionNo') === 'Admission no' && fieldLabel('sectionId') === 'Section' && fieldLabel('name') === 'Name' && fieldLabel('dob') === 'Date of birth', 'field names read as words')
ok(recordName(before, after) === 'Ravi K. Kumar' && recordName({ label: '2026-27' }, undefined) === '2026-27' && recordName(undefined, { created: 3 }) === '', 'the record is named from its name or label')

if (fail) process.exit(1)

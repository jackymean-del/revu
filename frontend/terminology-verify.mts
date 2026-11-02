/**
 * Terminology: every institution word comes from t(), in the institution's
 * own words. Run: npx tsx terminology-verify.mts   (from frontend/)
 *
 * Proves the lookup order (branch, organisation, preset, school), that a
 * preset switch changes the words people see (AT-v1-03), and that the lint
 * rule fails on a literal institution word in a component (AT-v1-04).
 */
import { ESLint } from 'eslint'
import { PRESETS, TERM_KEYS, makeT, presets, resolve, withArticle, type Terminology } from './src/lib/terminology/terminology.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

// Every preset names every key, with both forms.
const gaps = PRESETS.flatMap((p) => TERM_KEYS.filter((k) => !presets[p][k]?.one || !presets[p][k]?.other).map((k) => `${p}:${k}`))
ok(gaps.length === 0, `every preset names all ${TERM_KEYS.length} keys`, gaps.join(', '))

// Lookup order.
const src: Terminology = {
  preset: 'school',
  overrides: [
    { key: 'group.section', one: 'House', other: 'Houses' },
    { key: 'group.section', branchId: 'north', one: 'Stream', other: 'Streams' },
  ],
}
ok(resolve(src, 'period.term').one === 'Term', 'the preset word is used when nothing overrides it')
ok(resolve(src, 'group.section').one === 'House', 'an organisation word beats the preset')
ok(resolve(src, 'group.section', 'north').other === 'Streams', 'a branch word beats the organisation')
ok(resolve(src, 'group.section', 'south').one === 'House', 'another branch falls back to the organisation')
ok(resolve({ preset: 'kindergarten', overrides: [] }, 'group.level').one === 'Grade', 'an unknown preset falls back to school')

// t(): plurals and words inside sentences.
const t = makeT(src)
ok(t('person.student') === 'Student' && t('person.student', { count: 3 }) === 'Students' && t('person.student', { count: 0 }) === 'Students', 'count picks one or many')
ok(t('report.report_card', { lower: true }) === 'report card', 'lower case for use inside a sentence')
ok(makeT({ preset: 'school', overrides: [{ key: 'group.level', one: 'MYP Year', other: 'MYP Years' }] })('group.level', { lower: true }) === 'MYP year', 'lower case keeps acronyms')

ok(withArticle('academic year') === 'an academic year' && withArticle('section') === 'a section' && withArticle('Enrolment number') === 'an Enrolment number', 'the article follows the word')

// AT-v1-03: switching preset changes the visible words, with no code change.
const school = makeT({ preset: 'school', overrides: [] })
const university = makeT({ preset: 'university', overrides: [] })
const changed = (['group.section', 'period.term', 'person.student'] as const).filter((k) => school(k) !== university(k))
ok(changed.length === 3, 'school to university changes section, term and student', changed.map((k) => `${school(k)} > ${university(k)}`).join(', '))

// AT-v1-04: the lint rule. Planted components, linted with the real config.
const eslint = new ESLint()
const lint = async (code: string) => (await eslint.lintText(code, { filePath: 'src/__planted__.tsx' }))[0].messages.filter((m) => m.ruleId === 'revu/institution-words')
const header = `import { useT } from './lib/terminology/terms-context'\n`
const bad = [
  `export const A = () => <p>Add a student</p>`,
  `export const B = () => <input placeholder="Search sections" />`,
  `export const C = ({ n }: { n: number }) => <p>{n === 1 ? 'Semester' : 'Semesters'}</p>`,
  'export const D = ({ n }: { n: number }) => <p>{`${n} learners`}</p>',
  `export const E = () => <h1>Report card</h1>`,
  `export const E2 = () => <List empty="No sections yet" />`,
  `export const E3 = ({ n }: { n: number }) => <List noun={n > 1 ? 'terms' : 'term'} />`,
]
for (const code of bad) {
  const found = await lint(header + code)
  ok(found.length >= 1, 'a literal institution word fails lint', code.slice(13, 70))
}
const good = [
  `export const F = () => { const t = useT(); return <p>Add a {t('person.student', { lower: true })}</p> }`,
  `export const G = () => <p className="grade-6 section">Saved</p>`,
  `export const H = () => <p>Check again</p>`,
  `export const I = ({ tab }: { tab: string }) => <div>{tab === 'years' && <List path="years" />}</div>`,
  `export const J = () => <option value="sections" key="subjects">Add</option>`,
]
for (const code of good) {
  const found = await lint(header + code)
  ok(found.length === 0, 'words from t() and plain copy pass', code.slice(13, 70))
}

if (fail) process.exit(1)

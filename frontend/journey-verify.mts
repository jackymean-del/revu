/**
 * The exam year as eight steps. Run: npx tsx journey-verify.mts
 *
 * The cards keep the order of the institution's notes; the next step is
 * always the first unfinished step this role can act on; a step revU does
 * not do yet is never suggested; every page a step names is a real route.
 */
import { readFileSync } from 'node:fs'
import { moduleOf, modules, nextStep, statuses, visiblePages, type Setup } from './src/lib/journey.ts'
import { makeT } from './src/lib/terminology/terminology.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

const school = makeT({ preset: 'school', overrides: [] })
const uni = makeT({ preset: 'university', overrides: [] })
const ms = modules(school)

ok(
  ms.map((m) => m.title).join(' | ') === 'Resources | Configuration | Create exam | Assign exam | Evaluate exam | Scheme | Re-exam | Reports and analysis',
  'the eight steps keep the order of the notes',
)
ok(ms.every((m, i) => m.n === i + 1), 'numbered 1 to 8')
ok(ms.filter((m) => m.group === 'master').map((m) => m.title).join() === 'Resources,Configuration', 'Resources and Configuration are master data, the rest exam steps')
ok(ms.filter((m) => !m.built).map((m) => m.key).join() === 'assign,reexam', 'assign and re-exam are marked as coming')

const empty: Setup = { years: 0, periods: 0, levels: 0, sections: 0, subjects: 0, levelSubjects: 0, staff: 1, students: 0, invitations: 0, done: false, assessments: 0, marks: 0, schemes: 0, results: 0, reports: 0 }
const admin = ['admin']
const say = (s: Setup, roles = admin) => nextStep(ms, s, roles, school)

ok(say(empty)?.to === '/setup' && say(empty)?.text === 'Set up your school in five short steps', 'a new institution starts with the guided setup', say(empty)?.text)
const finished = { ...empty, done: true }
ok(say(finished)?.text === 'Add the academic year and its terms' && say(finished)?.to === '/settings/years', 'after the guided setup, what it left out, starting with the year', say(finished)?.text)
let s: Setup = { ...empty, done: true, years: 1, periods: 2 }
ok(say(s)?.text === 'Add grades and sections', 'then grades and sections', say(s)?.text)
s = { ...s, levels: 3, sections: 6 }
ok(say(s)?.to === '/people' && say(s)?.text === 'Add your students', 'then students')
s = { ...s, students: 120 }
ok(say(s)?.text === 'Invite your staff', 'then staff')
s = { ...s, invitations: 4 }
ok(say(s)?.module === 'configuration' && say(s)?.to === '/settings/subjects', 'then subjects, in Configuration')
s = { ...s, subjects: 6, levelSubjects: 18 }
ok(say(s)?.module === 'create' && say(s)?.to === '/exams', 'then the first exam')
s = { ...s, assessments: 2 }
ok(say(s)?.module === 'evaluate', 'then marks; assign exam, not built, is skipped')
s = { ...s, marks: 40 }
ok(say(s)?.to === '/schemes', 'then a scheme')
s = { ...s, schemes: 1 }
ok(say(s)?.to === '/results', 'then results')
s = { ...s, results: 40 }
ok(say(s)?.to === '/reports', 'then report cards; re-exam, not built, is skipped')
s = { ...s, reports: 1 }
ok(say(s)?.to === '/analysis', 'with everything done, the analysis')

// A teacher is never sent to a screen only administrators open.
const teacher = ['teacher']
ok(say(empty, teacher)?.to === '/exams', 'a teacher in a new institution starts at creating an exam', say(empty, teacher)?.to)
ok(say({ ...s, schemes: 0, results: 0 }, teacher)?.to !== '/schemes', 'a teacher is never sent to schemes')
ok(say({ ...s, results: 0 }, teacher)?.to === '/results', 'a teacher is sent to results once a scheme is published')
ok(say({ ...s, reports: 0 }, teacher)?.to === '/analysis', 'a teacher is not sent to report cards')
ok(nextStep(ms, undefined, admin, school) === undefined, 'nothing is suggested before the counts arrive')

const st = statuses(ms, { ...s, marks: 0 }, admin, school)
ok(st.resources === 'done' && st.evaluate === 'next' && st.reports === 'done' && st.assign === 'later' && st.scheme === 'done', 'card states', JSON.stringify(st))

// Pages by role, and paths back to their step.
ok(visiblePages(ms[0], teacher).length === 0, 'a teacher has no Resources pages')
ok(visiblePages(ms[7], ['class_teacher']).map((p) => p.to).join() === '/analysis,/reports', 'a class teacher sees analysis and report cards')
ok(moduleOf(ms, '/schemes/abc')?.module.key === 'scheme', 'a scheme editor page belongs to Scheme')
ok(moduleOf(ms, '/settings/subjects')?.module.key === 'configuration' && moduleOf(ms, '/settings/structure')?.module.key === 'resources', 'subjects and structure belong to their steps')

// A university reads its own words.
const u = nextStep(modules(uni), { ...empty, done: true, years: 1, periods: 2 }, admin, uni)?.text ?? ''
ok(!/grade|section/i.test(u), 'a university is not told about grades or sections', u)

// Guard the pattern: every page a step names is a route.
const router = readFileSync('src/router.tsx', 'utf8')
const missing = ms.flatMap((m) => m.pages).filter((p) => !router.includes(`path: '${p.to}'`))
ok(missing.length === 0, 'every step page is a route', missing.map((p) => p.to).join(','))

console.log(fail ? `\n${fail} failed` : '\njourney rules hold')
process.exit(fail ? 1 : 0)

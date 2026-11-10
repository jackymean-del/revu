/**
 * The exam year as eight steps, in the order of the institution's own notes
 * (Resources, Configuration, Create exam, Assign exam, Evaluate exam,
 * Scheme, Re-exam, Reports and analysis). The menu, the home cards and the
 * "next step" every screen shows all come from here, so they never
 * disagree. The server decides what anyone may do; this only decides what
 * to show and what to suggest.
 */
import type { components } from '../api/schema.gen'
import type { IconName } from '../components/icon-paths'
import type { T, TermKey } from './terminology/terminology'

export type Setup = components['schemas']['SetupStatus']
export type ModuleKey = 'resources' | 'configuration' | 'create' | 'paper' | 'assign' | 'evaluate' | 'scheme' | 'reexam' | 'reports'

type Role = 'admin' | 'coordinator' | 'principal' | 'teacher' | 'class_teacher' | 'viewer'

export interface PageLink {
  to: string
  label: string
  roles: Role[]
}

export interface Module {
  key: ModuleKey
  /** Master is set up once, by administrators; the exam steps repeat each term. Each group is numbered from 1. */
  group: 'master' | 'exams'
  n: number
  title: string
  blurb: string
  icon: IconName
  /** False for a step revU does not do yet: shown on the home page, not in the menu. */
  built: boolean
  pages: PageLink[]
}

const ALL: Role[] = ['admin', 'coordinator', 'principal', 'teacher', 'class_teacher']
const MARKS: Role[] = ['admin', 'coordinator', 'teacher', 'class_teacher']

/**
 * The steps, worded in the institution's own words: three of master, six of
 * each exam. Re-exam comes last and works both ways with Reports and analysis:
 * the reports pick out who needs one, and its marks flow back into them.
 */
export function modules(t: T): Module[] {
  const lower = (k: TermKey, count = 2) => t(k, { count, lower: true })
  return [
    {
      key: 'resources',
      group: 'master',
      n: 1,
      title: 'Resources',
      blurb: `${t('person.student', { count: 2 })}, staff, ${lower('group.level')}, ${lower('group.section')} and ${lower('period.term')}`,
      icon: 'resources',
      built: true,
      pages: [
        { to: '/people', label: `${t('person.student', { count: 2 })} and staff`, roles: ['admin'] },
        { to: '/settings/structure', label: `${t('group.level', { count: 2 })} and ${lower('group.section')}`, roles: ['admin'] },
        { to: '/settings/years', label: `${t('period.year', { count: 2 })} and ${lower('period.term')}`, roles: ['admin'] },
        { to: '/settings/teaching', label: 'Who teaches what', roles: ['admin'] },
        { to: '/settings/branches', label: t('org.branch', { count: 2 }), roles: ['admin'] },
        { to: '/choices', label: `${t('course.subject')} choices`, roles: ['admin', 'coordinator', 'class_teacher'] },
      ],
    },
    {
      key: 'configuration',
      group: 'master',
      n: 2,
      title: 'Configuration',
      blurb: `${t('course.subject', { count: 2 })}, the syllabus with competencies and learning outcomes, and the words your ${lower('org.institution', 1)} uses`,
      icon: 'configuration',
      built: true,
      pages: [
        { to: '/settings/subjects', label: t('course.subject', { count: 2 }), roles: ['admin'] },
        { to: '/settings/syllabus', label: 'Syllabus', roles: ['admin', 'coordinator'] },
        { to: '/settings/words', label: 'Words', roles: ['admin'] },
      ],
    },
    {
      key: 'create',
      group: 'master',
      n: 3,
      title: 'Create exam',
      blurb: 'Name each exam and test, with its parts and maximum marks, for the classes that sit it',
      icon: 'create',
      built: true,
      pages: [{ to: '/exams', label: 'Exams', roles: ['admin'] }],
    },
    {
      key: 'paper',
      group: 'exams',
      n: 1,
      title: 'Create question paper',
      blurb: 'Blueprint, questions and papers with sets, from the syllabus',
      icon: 'configuration',
      built: false,
      pages: [],
    },
    {
      key: 'assign',
      group: 'exams',
      n: 2,
      title: 'Assign paper',
      blurb: `Give each ${lower('group.section', 1)} or ${lower('person.student', 1)} its paper, set and date`,
      icon: 'assign',
      built: false,
      pages: [],
    },
    {
      key: 'evaluate',
      group: 'exams',
      n: 3,
      title: 'Evaluate exam',
      blurb: 'Marks on a grid that saves as you type; absent is never zero',
      icon: 'evaluate',
      built: true,
      pages: [{ to: '/marks', label: 'Enter marks', roles: MARKS }],
    },
    {
      key: 'scheme',
      group: 'exams',
      n: 4,
      title: 'Scheme',
      blurb: 'How marks become results, and every result explained',
      icon: 'scheme',
      built: true,
      pages: [
        { to: '/results', label: 'Results', roles: ALL },
        { to: '/schemes', label: 'Schemes', roles: ['admin', 'coordinator'] },
      ],
    },
    {
      key: 'reports',
      group: 'exams',
      n: 5,
      title: 'Reports and analysis',
      blurb: `${t('report.report_card', { count: 2 })}, the aggregate, warnings, undertakings and what to teach again`,
      icon: 'reports',
      built: true,
      pages: [
        { to: '/analysis', label: 'Analysis', roles: ALL },
        { to: '/reports', label: t('report.report_card', { count: 2 }), roles: ['admin', 'class_teacher'] },
      ],
    },
    {
      key: 'reexam',
      group: 'exams',
      n: 6,
      title: 'Re-exam',
      blurb: 'Retests for those the reports pick out; their marks flow back into results and reports',
      icon: 'reexam',
      built: false,
      pages: [],
    },
  ]
}

/** The pages of a module this person may open, in order. */
export function visiblePages(m: Module, roles: readonly string[]): PageLink[] {
  return m.pages.filter((p) => p.roles.some((r) => roles.includes(r)))
}

/** The module a path belongs to, and the page within it. */
export function moduleOf(ms: Module[], path: string): { module: Module; page: PageLink } | undefined {
  for (const m of ms) for (const p of m.pages) if (path === p.to || path.startsWith(p.to + '/')) return { module: m, page: p }
  return undefined
}

export type Status = 'done' | 'next' | 'todo' | 'later'

export interface Step {
  module: ModuleKey
  text: string
  to: string
}

/** What is still to do in a module, as one step, or undefined when it is done. */
function pending(key: ModuleKey, s: Setup, t: T): Step | undefined {
  const lower = (k: TermKey, count = 2) => t(k, { count, lower: true })
  switch (key) {
    case 'resources':
      if (s.years === 0 || s.periods === 0) return { module: key, text: `Add the ${lower('period.year', 1)} and its ${lower('period.term')}`, to: '/settings/years' }
      if (s.levels === 0 || s.sections === 0) return { module: key, text: `Add ${lower('group.level')} and ${lower('group.section')}`, to: '/settings/structure' }
      if (s.students === 0) return { module: key, text: `Add your ${lower('person.student')}`, to: '/people' }
      if (s.staff <= 1 && s.invitations === 0) return { module: key, text: 'Invite your staff', to: '/people' }
      return undefined
    case 'configuration':
      if (s.subjects === 0) return { module: key, text: `Add your ${lower('course.subject')}`, to: '/settings/subjects' }
      if (s.levelSubjects === 0) return { module: key, text: `Choose the ${lower('course.subject')} each ${lower('group.level', 1)} takes`, to: '/settings/subjects' }
      return undefined
    case 'create':
      return s.assessments === 0 ? { module: key, text: 'Create your first exam', to: '/exams' } : undefined
    case 'evaluate':
      return s.marks === 0 ? { module: key, text: 'Enter marks', to: '/marks' } : undefined
    case 'scheme':
      if (s.schemes === 0) return { module: key, text: 'Publish a scheme so results can be worked out', to: '/schemes' }
      if (s.results === 0) return { module: key, text: 'Work out results', to: '/results' }
      return undefined
    case 'reports':
      return s.reports === 0 ? { module: key, text: `Make ${lower('report.report_card')}`, to: '/reports' } : undefined
    default:
      return undefined
  }
}

/** True when the person may open the page a step leads to. */
function canOpen(ms: Module[], step: Step, roles: readonly string[]): boolean {
  const hit = moduleOf(ms, step.to)
  return !!hit && hit.page.roles.some((r) => roles.includes(r))
}

/**
 * The one thing to do next: the first unfinished step this person can act
 * on, in the order of the year. With everything done, the analysis.
 */
export function nextStep(ms: Module[], s: Setup | undefined, roles: readonly string[], t: T): Step | undefined {
  if (!s) return undefined
  // A new institution is set up fastest with the guided setup, which does
  // the year, classes, subjects, staff and students in five short steps.
  if (roles.includes('admin') && !s.done && (pending('resources', s, t) || pending('configuration', s, t)))
    return { module: 'resources', text: `Set up your ${t('org.institution', { lower: true })} in five short steps`, to: '/setup' }
  for (const m of ms) {
    if (!m.built) continue
    const step = pending(m.key, s, t)
    if (step && canOpen(ms, step, roles)) return step
  }
  const done: Step = { module: 'reports', text: 'See how each class did', to: '/analysis' }
  return canOpen(ms, done, roles) ? done : undefined
}

/** Where each module stands, for the home cards. */
export function statuses(ms: Module[], s: Setup | undefined, roles: readonly string[], t: T): Record<ModuleKey, Status> {
  const next = nextStep(ms, s, roles, t)
  const out = {} as Record<ModuleKey, Status>
  for (const m of ms) {
    if (!m.built) out[m.key] = 'later'
    else if (s && !pending(m.key, s, t)) out[m.key] = 'done'
    else if (next?.module === m.key) out[m.key] = 'next'
    else out[m.key] = 'todo'
  }
  return out
}

/** A count to show on a home card, or empty. */
export function cardFact(key: ModuleKey, s: Setup | undefined, t: T): string {
  if (!s) return ''
  const plural = (n: number, k: TermKey) => `${n} ${t(k, { count: n, lower: true })}`
  switch (key) {
    case 'resources':
      return `${plural(s.students, 'person.student')}, ${plural(s.sections, 'group.section')}`
    case 'configuration':
      return plural(s.subjects, 'course.subject')
    case 'create':
      return `${s.assessments} ${s.assessments === 1 ? 'assessment' : 'assessments'}`
    case 'evaluate':
      return s.marks >= 10000 ? '10000+ marks in' : `${s.marks} ${s.marks === 1 ? 'mark' : 'marks'} in`
    case 'scheme':
      return `${s.schemes} published, ${s.results >= 10000 ? '10000+' : s.results} final`
    case 'reports':
      return `${s.reports} ${s.reports === 1 ? 'run' : 'runs'} made`
    default:
      return ''
  }
}

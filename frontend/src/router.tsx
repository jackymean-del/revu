import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router'
import { Shell } from './components/Shell'
import { Home } from './pages/Home'

const root = createRootRoute({ component: Shell })

const home = createRoute({ getParentRoute: () => root, path: '/', component: Home })

// Screens other than Home load when opened, to keep the first load small.
const system = createRoute({
  getParentRoute: () => root,
  path: '/system',
  component: lazyRouteComponent(() => import('./pages/SystemCheck'), 'SystemCheck'),
})
// Sign-in and sign-up are revU's own pages on Clerk; Google and single
// sign-on return through /sso-callback.
const signIn = createRoute({
  getParentRoute: () => root,
  path: '/sign-in',
  component: lazyRouteComponent(() => import('./pages/SignIn'), 'SignIn'),
})
const signUp = createRoute({
  getParentRoute: () => root,
  path: '/sign-up',
  component: lazyRouteComponent(() => import('./pages/SignUp'), 'SignUp'),
})
const ssoCallback = createRoute({
  getParentRoute: () => root,
  path: '/sso-callback',
  component: lazyRouteComponent(() => import('./pages/SsoCallback'), 'SsoCallback'),
})
const owner = createRoute({
  getParentRoute: () => root,
  path: '/owner',
  component: lazyRouteComponent(() => import('./pages/Owner'), 'Owner'),
})
const groups = createRoute({
  getParentRoute: () => root,
  path: '/groups',
  component: lazyRouteComponent(() => import('./pages/Groups'), 'Groups'),
})
const setup = createRoute({
  getParentRoute: () => root,
  path: '/setup',
  component: lazyRouteComponent(() => import('./pages/Setup'), 'Setup'),
})
const people = createRoute({
  getParentRoute: () => root,
  path: '/people',
  component: lazyRouteComponent(() => import('./pages/People'), 'People'),
})
const choices = createRoute({
  getParentRoute: () => root,
  path: '/choices',
  component: lazyRouteComponent(() => import('./pages/Choices'), 'Choices'),
})
const marks = createRoute({
  getParentRoute: () => root,
  path: '/marks',
  // ?a=assessment/section opens that assessment straight away.
  validateSearch: (s: Record<string, unknown>): { a?: string } => (typeof s.a === 'string' ? { a: s.a } : {}),
  component: lazyRouteComponent(() => import('./pages/Marks'), 'Marks'),
})
type PaperTab = 'blueprint' | 'questions' | 'sets'
const papersPage = createRoute({
  getParentRoute: () => root,
  path: '/papers',
  // ?a=assessment&tab=blueprint|questions|sets opens that step.
  validateSearch: (s: Record<string, unknown>): { a?: string; tab?: PaperTab } => ({
    ...(typeof s.a === 'string' ? { a: s.a } : {}),
    ...(s.tab === 'blueprint' || s.tab === 'questions' || s.tab === 'sets' ? { tab: s.tab } : {}),
  }),
  component: lazyRouteComponent(() => import('./pages/Papers'), 'Papers'),
})
const assignPage = createRoute({
  getParentRoute: () => root,
  path: '/assign',
  validateSearch: (s: Record<string, unknown>): { a?: string } => (typeof s.a === 'string' ? { a: s.a } : {}),
  component: lazyRouteComponent(() => import('./pages/Assign'), 'Assign'),
})
const exams = createRoute({
  getParentRoute: () => root,
  path: '/exams',
  component: lazyRouteComponent(() => import('./pages/Exams'), 'Exams'),
})
const results = createRoute({
  getParentRoute: () => root,
  path: '/results',
  component: lazyRouteComponent(() => import('./pages/Results'), 'Results'),
})
const reports = createRoute({
  getParentRoute: () => root,
  path: '/reports',
  component: lazyRouteComponent(() => import('./pages/Reports'), 'Reports'),
})
const analysis = createRoute({
  getParentRoute: () => root,
  path: '/analysis',
  component: lazyRouteComponent(() => import('./pages/Analysis'), 'Analysis'),
})
const reportView = createRoute({
  getParentRoute: () => root,
  path: '/report/$itemId',
  component: lazyRouteComponent(() => import('./pages/ReportView'), 'ReportView'),
})
const schemes = createRoute({
  getParentRoute: () => root,
  path: '/schemes',
  component: lazyRouteComponent(() => import('./pages/Schemes'), 'Schemes'),
})
const schemeEditor = createRoute({
  getParentRoute: () => root,
  path: '/schemes/$schemeId',
  component: lazyRouteComponent(() => import('./pages/SchemeEditor'), 'SchemeEditor'),
})
const structure = createRoute({
  getParentRoute: () => root,
  path: '/settings/structure',
  component: lazyRouteComponent(() => import('./pages/Structure'), 'Structure'),
})
const yearsPage = createRoute({
  getParentRoute: () => root,
  path: '/settings/years',
  component: lazyRouteComponent(() => import('./pages/Structure'), 'Structure'),
})
const teachingPage = createRoute({
  getParentRoute: () => root,
  path: '/settings/teaching',
  component: lazyRouteComponent(() => import('./pages/Structure'), 'Structure'),
})
const branchesPage = createRoute({
  getParentRoute: () => root,
  path: '/settings/branches',
  component: lazyRouteComponent(() => import('./pages/Structure'), 'Structure'),
})
const subjectsPage = createRoute({
  getParentRoute: () => root,
  path: '/settings/subjects',
  component: lazyRouteComponent(() => import('./pages/Structure'), 'Structure'),
})
const paperSettingsPage = createRoute({
  getParentRoute: () => root,
  path: '/settings/papers',
  component: lazyRouteComponent(() => import('./pages/PaperSettings'), 'PaperSettings'),
})
const syllabusPage = createRoute({
  getParentRoute: () => root,
  path: '/settings/syllabus',
  component: lazyRouteComponent(() => import('./pages/Syllabus'), 'Syllabus'),
})
const words = createRoute({
  getParentRoute: () => root,
  path: '/settings/words',
  component: lazyRouteComponent(() => import('./pages/Words'), 'Words'),
})
const history = createRoute({
  getParentRoute: () => root,
  path: '/settings/history',
  component: lazyRouteComponent(() => import('./pages/Audit'), 'Audit'),
})

const routeTree = root.addChildren([home, system, signIn, signUp, ssoCallback, owner, groups, setup, people, exams, papersPage, assignPage, marks, results, analysis, reports, reportView, schemes, schemeEditor, choices, structure, yearsPage, teachingPage, branchesPage, subjectsPage, syllabusPage, paperSettingsPage, words, history])

// Hovering or focusing a link loads that screen and its code before the
// click, so moving around feels instant.
export const router = createRouter({ routeTree, defaultPreload: 'intent', defaultPreloadDelay: 40 })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

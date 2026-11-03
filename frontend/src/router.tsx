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
  component: lazyRouteComponent(() => import('./pages/Marks'), 'Marks'),
})
const structure = createRoute({
  getParentRoute: () => root,
  path: '/settings/structure',
  component: lazyRouteComponent(() => import('./pages/Structure'), 'Structure'),
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

const routeTree = root.addChildren([home, system, signIn, signUp, ssoCallback, setup, people, marks, choices, structure, words, history])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

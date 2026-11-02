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

const routeTree = root.addChildren([home, system, setup, people, structure, words, history])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

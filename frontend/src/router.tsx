import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router'
import { Shell } from './components/Shell'
import { SystemCheck } from './pages/SystemCheck'

const root = createRootRoute({ component: Shell })

const home = createRoute({ getParentRoute: () => root, path: '/', component: SystemCheck })

// Screens other than the first load when opened, to keep the first load small.
const words = createRoute({
  getParentRoute: () => root,
  path: '/settings/words',
  component: lazyRouteComponent(() => import('./pages/Words'), 'Words'),
})

const structure = createRoute({
  getParentRoute: () => root,
  path: '/settings/structure',
  component: lazyRouteComponent(() => import('./pages/Structure'), 'Structure'),
})

const people = createRoute({
  getParentRoute: () => root,
  path: '/people',
  component: lazyRouteComponent(() => import('./pages/People'), 'People'),
})

export const router = createRouter({ routeTree: root.addChildren([home, words, structure, people]) })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

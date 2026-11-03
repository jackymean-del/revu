import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useOrg } from '../lib/org-context'
import { Account } from './Account'
import { BrandLockup } from './BrandLockup'
import { PreviewBanner, Switcher } from './Switcher'

const link = 'rounded-lg px-3 py-1.5 text-sm font-semibold'
const active = { className: 'bg-mist text-brand' }
const inactive = { className: 'text-muted hover:text-ink' }

function OrgPicker() {
  const { orgs, current, choose, loading } = useOrg()
  if (loading || !current) return null
  if (orgs.length === 1) return <span className="truncate text-sm font-semibold text-muted">{current.name}</span>
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Working in</span>
      <select
        value={current.id}
        onChange={(e) => choose(e.target.value)}
        className="max-w-56 truncate rounded-lg border border-line bg-white px-2 py-1.5 font-semibold"
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Which areas a person sees, by role. The server decides what they may do; this only keeps the menu short. */
function useNav() {
  const { current, platformOwner, groups } = useOrg()
  const roles = current?.roles ?? []
  const admin = roles.includes('admin')
  const items: { to: string; label: string; exact?: boolean }[] = [{ to: '/', label: 'Home', exact: true }]
  if (admin || roles.some((r) => ['coordinator', 'teacher', 'class_teacher'].includes(r))) items.push({ to: '/marks', label: 'Marks' })
  if (admin) items.push({ to: '/people', label: 'People' })
  if (admin || roles.includes('coordinator') || roles.includes('class_teacher')) items.push({ to: '/choices', label: 'Choices' })
  if (admin) items.push({ to: '/settings/structure', label: 'Structure' }, { to: '/settings/words', label: 'Words' })
  if (admin || roles.includes('principal')) items.push({ to: '/settings/history', label: 'History' })
  if (groups.length > 0) items.push({ to: '/groups', label: 'Groups' })
  if (platformOwner) items.push({ to: '/owner', label: 'Owner' })
  return items
}

const AUTH_PAGES = ['/sign-in', '/sign-up', '/sso-callback']

/** The frame every screen sits in: brand, navigation by role, the organisation picker and the account. */
export function Shell() {
  const nav = useNav()
  // Sign-in and sign-up draw their own page, with no menu around them.
  const path = useRouterState({ select: (s) => s.location.pathname })
  if (AUTH_PAGES.includes(path)) return <Outlet />
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 rounded-md print:hidden bg-ink px-3 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <header className="flex min-h-14 print:hidden flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-white px-4 py-2 sm:px-6">
        <BrandLockup />
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: !!n.exact }} className={link} activeProps={active} inactiveProps={inactive}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <OrgPicker />
          <Switcher />
          <Account />
        </div>
      </header>
      <PreviewBanner />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
      <footer className="px-6 py-4 print:hidden text-center text-xs text-subtle">
        by <b className="font-extrabold text-ink">bhusku</b> &middot; Heavy on craft. Full of energy. &middot;{' '}
        <Link to="/system" className="underline hover:text-ink">
          System status
        </Link>
      </footer>
    </div>
  )
}

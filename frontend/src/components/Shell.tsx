import { Link, Outlet } from '@tanstack/react-router'
import { useOrg } from '../lib/org-context'
import { BrandLockup } from './BrandLockup'

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

/** The frame every screen sits in: brand, navigation and the organisation picker. */
export function Shell() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center gap-4 border-b border-line bg-white px-4 sm:px-6">
        <BrandLockup />
        <nav aria-label="Main" className="flex items-center gap-1">
          <Link to="/" activeOptions={{ exact: true }} className={link} activeProps={active} inactiveProps={inactive}>
            System
          </Link>
          <Link to="/settings/words" className={link} activeProps={active} inactiveProps={inactive}>
            Words
          </Link>
        </nav>
        <div className="ml-auto min-w-0">
          <OrgPicker />
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="px-6 py-4 text-center text-xs text-subtle">
        by <b className="font-extrabold text-ink">bhusku</b> &middot; Heavy on craft. Full of energy.
      </footer>
    </div>
  )
}

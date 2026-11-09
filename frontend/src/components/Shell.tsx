import { useEffect, useState } from 'react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { moduleOf, modules, nextStep, visiblePages, type Module } from '../lib/journey'
import { useOrg } from '../lib/org-context'
import { useSetup } from '../lib/progress'
import { useT } from '../lib/terminology/terms-context'
import { Account } from './Account'
import { BrandLockup } from './BrandLockup'
import { Icon } from './Icon'
import type { IconName } from './icon-paths'
import { PreviewBanner, Switcher } from './Switcher'

const AUTH_PAGES = ['/sign-in', '/sign-up', '/sso-callback']
const COLLAPSE_KEY = 'revu-sidebar-collapsed'
/** Below this the menu is an overlay with a slim top bar, as in schedU. */
const OVERLAY_BELOW = 900

interface Item {
  to: string
  label: string
  icon: IconName
  n?: number
  exact?: boolean
}
interface Section {
  heading: string
  items: Item[]
}

/**
 * The menu, by role: Home, the steps of the exam year this person can work
 * in (numbered as on the home cards), then administration and help. A step
 * is one entry however many pages it has; its pages are tabs on the bar.
 */
function useSections(ms: Module[]): Section[] {
  const { current, platformOwner, groups } = useOrg()
  const roles = current?.roles ?? []
  const admin = roles.includes('admin')
  const out: Section[] = [{ heading: '', items: [{ to: '/', label: 'Home', icon: 'home', exact: true }] }]
  if (current) {
    const steps = (group: Module['group']) =>
      ms
        .filter((m) => m.built && m.group === group)
        .map((m) => ({ m, pages: visiblePages(m, roles) }))
        .filter((x) => x.pages.length > 0)
        .map(({ m, pages }) => ({ to: pages[0].to, label: m.title, icon: m.icon, n: m.n }))
    const master = steps('master')
    const exams = steps('exams')
    if (master.length) out.push({ heading: 'Master', items: master })
    if (exams.length) out.push({ heading: 'Exam steps', items: exams })
  }
  const adminItems: Item[] = []
  if (admin || roles.includes('principal')) adminItems.push({ to: '/settings/history', label: 'History', icon: 'history' })
  if (groups.length > 0) adminItems.push({ to: '/groups', label: 'Groups', icon: 'groups' })
  if (platformOwner) adminItems.push({ to: '/owner', label: 'Owner console', icon: 'owner' })
  if (adminItems.length) out.push({ heading: 'Administration', items: adminItems })
  const help: Item[] = []
  if (admin) help.push({ to: '/setup', label: 'Getting started', icon: 'guide' })
  help.push({ to: '/system', label: 'System status', icon: 'status' })
  out.push({ heading: 'Help', items: help })
  return out
}

function OrgPicker({ open }: { open: boolean }) {
  const { orgs, current, choose, loading } = useOrg()
  if (loading || !current || !open) return null
  if (orgs.length === 1) return <p className="truncate text-sm font-bold text-ink" title={current.name}>{current.name}</p>
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.08em] text-subtle">Working in</span>
      <select
        value={current.id}
        onChange={(e) => choose(e.target.value)}
        className="w-full truncate rounded-lg border border-line bg-canvas px-2 py-1.5 text-sm font-semibold"
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

/**
 * The bar over every page of a step: which step this is, its pages as tabs,
 * and the one thing to do next, so nobody has to guess where to go.
 */
function StepBar({ ms, path }: { ms: Module[]; path: string }) {
  const { current } = useOrg()
  const t = useT()
  const roles = current?.roles ?? []
  const setup = useSetup()
  const hit = moduleOf(ms, path)
  const next = nextStep(ms, setup.data, roles, t)
  // Home shows the next step large; the bar would only repeat it.
  if (path === '/') return null
  const showNext = next && next.to !== path && !(hit && next.module === hit.module.key && hit.page.to === next.to)
  if (!hit && !showNext) return null
  const pages = hit ? visiblePages(hit.module, roles) : []
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur print:hidden">
      <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 px-4 sm:px-6">
        {hit && (
          <p className="flex items-center gap-2 py-2 text-sm">
            <span className="grid size-6 place-items-center rounded-md bg-brand text-xs font-extrabold text-white">{hit.module.n}</span>
            <span className="font-bold text-ink">{hit.module.title}</span>
          </p>
        )}
        {pages.length > 1 && (
          <nav aria-label={hit!.module.title} className="flex flex-wrap gap-1">
            {pages.map((p) => (
              <Link
                key={p.to}
                to={p.to}
                className="rounded-md px-2.5 py-1.5 text-sm font-semibold"
                activeProps={{ className: 'bg-mist text-brand', 'aria-current': 'page' }}
                inactiveProps={{ className: 'text-muted hover:bg-canvas hover:text-ink' }}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        )}
        {showNext && (
          <Link to={next.to} className="ml-auto flex items-center gap-2 rounded-full border border-brand/30 bg-mist px-3 py-1 text-sm font-semibold text-brand hover:border-brand">
            <span className="text-xs font-bold uppercase tracking-wide text-brand/70">Next</span>
            {next.text}
            <Icon name="arrow" size={15} />
          </Link>
        )}
      </div>
    </div>
  )
}

/** The frame every screen sits in: a menu on the left, as in schedU, and the page beside it. */
export function Shell() {
  const t = useT()
  const ms = modules(t)
  const sections = useSections(ms)
  const path = useRouterState({ select: (s) => s.location.pathname })
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < OVERLAY_BELOW)
  const [open, setOpen] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.innerWidth < OVERLAY_BELOW) return false
      return localStorage.getItem(COLLAPSE_KEY) !== '1'
    } catch {
      return true
    }
  })
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < OVERLAY_BELOW)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // Following a link on a phone puts the menu away again.
  useEffect(() => {
    if (narrow) setOpen(false)
  }, [path, narrow])
  // Work done on one screen can change the next step: check again, in the
  // background, whenever the screen changes.
  const qc = useQueryClient()
  useEffect(() => {
    void qc.invalidateQueries({ queryKey: ['setup'] })
  }, [path, qc])

  // Sign-in and sign-up draw their own page, with no menu around them.
  if (AUTH_PAGES.includes(path)) return <Outlet />

  const toggle = () =>
    setOpen((o) => {
      if (!narrow) {
        try {
          localStorage.setItem(COLLAPSE_KEY, o ? '1' : '0')
        } catch {
          /* private window: the choice is not kept */
        }
      }
      return !o
    })
  const wide = open || narrow

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <a href="#main" className="sr-only z-[60] rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3 print:hidden">
        Skip to content
      </a>

      {narrow && open && <div aria-hidden="true" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-ink/45 print:hidden" />}

      <aside
        aria-label="Menu"
        className={`flex shrink-0 flex-col overflow-hidden border-r border-line bg-white transition-[width,transform] duration-200 print:hidden ${
          narrow ? `fixed inset-y-0 left-0 z-50 w-60 ${open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}` : open ? 'w-60' : 'w-16'
        }`}
      >
        <div className={`flex h-14 shrink-0 items-center border-b border-line ${wide ? 'justify-between pl-3.5 pr-2' : 'justify-center'}`}>
          {wide && <BrandLockup />}
          <button
            type="button"
            onClick={narrow ? () => setOpen(false) : toggle}
            aria-label={wide ? 'Collapse menu' : 'Expand menu'}
            aria-expanded={wide}
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-mist"
          >
            <Icon name={wide ? 'left' : 'right'} size={16} />
          </button>
        </div>

        {wide && (
          <div className="shrink-0 space-y-2 border-b border-line px-3.5 py-3">
            <OrgPicker open={wide} />
            <Switcher align="left" />
          </div>
        )}

        <nav aria-label="Main" className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 pt-2">
          {sections.map((s, si) => (
            <div key={s.heading || 'top'} className={si > 0 ? 'mt-2' : ''}>
              {s.heading &&
                (wide ? (
                  <p className="select-none px-2.5 pb-1 pt-2.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-subtle">{s.heading}</p>
                ) : (
                  <div className="mx-2.5 my-2 h-px bg-line" />
                ))}
              {s.items.map((item) => {
                const here =
                  item.n !== undefined ? moduleOf(ms, path)?.module.n === item.n : item.exact ? path === item.to : path === item.to || path.startsWith(item.to + '/')
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    title={wide ? undefined : item.label}
                    aria-current={here ? 'page' : undefined}
                    className={`mb-0.5 flex items-center rounded-lg text-sm transition-colors ${wide ? 'gap-2.5 px-2.5 py-2' : 'justify-center py-2.5'} ${
                      here ? 'bg-mist font-bold text-brand' : 'font-medium text-muted hover:bg-canvas hover:text-ink'
                    }`}
                  >
                    <Icon name={item.icon} className="shrink-0" />
                    {wide && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                    {wide && item.n !== undefined && (
                      <span aria-hidden="true" className="text-[11px] font-bold tabular-nums text-subtle">
                        {item.n}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className={`flex shrink-0 items-center border-t border-line py-2.5 ${wide ? 'gap-2 px-3' : 'justify-center'}`}>
          <Account />
          {wide && <span className="truncate text-xs text-subtle">by bhusku</span>}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {narrow && (
          <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line bg-white px-2.5 print:hidden">
            <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="grid size-10 place-items-center rounded-lg border border-line text-muted">
              <Icon name="menu" size={19} />
            </button>
            <BrandLockup />
          </div>
        )}
        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
          <PreviewBanner />
          <StepBar ms={ms} path={path} />
          <Outlet />
        </main>
      </div>
    </div>
  )
}

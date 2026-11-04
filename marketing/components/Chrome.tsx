import type { ReactNode } from 'react'
import Link from 'next/link'
import { CONTACT, appHref, demoHref } from '@/lib/site'

const NAV = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Privacy and security', href: '/security' },
  { label: 'Contact', href: '/contact' },
]

const FOOTER = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Privacy and security', href: '/security' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Contact', href: '/contact' },
]

/** The revU lockup: the bhusku Fader U on its tile, then "rev" and the U in lavender. */
export function Lockup() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-[9px] bg-brand">
        <svg viewBox="0 0 52 52" width="19" height="19">
          <path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22" stroke="#fff" strokeWidth="8" fill="none" strokeLinecap="round" />
          <circle cx="36" cy="12.5" r="4.5" fill="#D4920E" />
        </svg>
      </span>
      <span className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">
        rev<span className="text-brand">U</span>
      </span>
    </span>
  )
}

/** The header and footer every page of the site shares. */
export function Chrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="revU home">
            <Lockup />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:bg-mist hover:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <a href={appHref('/sign-in')} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist">
              Sign in
            </a>
            <a href={demoHref} className="rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white hover:bg-ink/85">
              Book a demo
            </a>
          </div>
        </div>
        <nav aria-label="Pages" className="flex gap-1 overflow-x-auto border-t border-line px-4 py-1.5 md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="shrink-0 rounded-lg px-2.5 py-1 text-[13px] font-semibold text-muted">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-line bg-paper">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Lockup />
            <p className="mt-3 max-w-sm text-sm text-muted">Assessment, results and holistic progress, for every institution, in its own words.</p>
            <p className="mt-3 text-sm">
              <a href={`mailto:${CONTACT}`} className="font-semibold text-brand hover:text-brand-700">
                {CONTACT}
              </a>
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-col gap-2 text-sm">
            {FOOTER.map((n) => (
              <Link key={n.href} href={n.href} className="text-muted hover:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-2 text-sm">
            <a href={appHref('/sign-in')} className="text-muted hover:text-ink">
              Sign in
            </a>
            <a href={appHref('/sign-up')} className="text-muted hover:text-ink">
              Create an account
            </a>
            <a href="https://schedu.bhusku.com" className="text-muted hover:text-ink">
              schedU, timetables by bhusku
            </a>
          </div>
        </div>
        <p className="border-t border-line px-4 py-4 text-center text-xs text-subtle">
          by <b className="font-extrabold text-ink">bhusku</b> &middot; Heavy on craft. Full of energy.
        </p>
      </footer>
    </div>
  )
}

export function StatusTag({ status }: { status: 'live' | 'pilot' }) {
  return status === 'live' ? (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">Live</span>
  ) : (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">In the pilot</span>
  )
}

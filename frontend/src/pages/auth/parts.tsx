import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { BrandLockup } from '../../components/BrandLockup'

/** A turning ring for buttons that are waiting. */
export function Spinner() {
  return <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
}

export function Problem({ text }: { text: string }) {
  if (!text) return null
  return (
    <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
      {text}
    </p>
  )
}

export function Or() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs font-medium text-subtle" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908C16.658 14.233 17.64 11.925 17.64 9.2z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
      <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  )
}

/** The page around the sign-in and sign-up cards: the lockup links home, the bhusku line at the foot. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">{children}</main>
      <footer className="px-6 py-4 text-center text-xs text-subtle">
        by <b className="font-extrabold text-ink">bhusku</b> &middot; Heavy on craft. Full of energy.
      </footer>
    </div>
  )
}

export function Lockup() {
  return (
    <Link to="/" aria-label="revU home" className="inline-block">
      <BrandLockup />
    </Link>
  )
}

/** Shown where Clerk is not configured (tests, or local work with DEV_USER_ID on the server). */
export function NotConfigured() {
  return (
    <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
      Sign-in is not set up on this copy of revU. Set VITE_CLERK_PUBLISHABLE_KEY to use it; until then the server decides who is signed in.
    </p>
  )
}

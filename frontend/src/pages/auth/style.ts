/** Shared by the sign-in and sign-up pages: error wording, a light email check and the class lists. */

/** What Clerk says went wrong, in its own words, or ours when it says nothing. */
export function authErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string }
  return e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || e?.message || fallback
}

export const looksLikeEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim())

export const input =
  'w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/15'
export const label = 'mb-1.5 block text-[13px] font-medium text-muted'
export const primary =
  'flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-2.5 text-[15px] font-semibold text-white transition hover:bg-ink/85 disabled:opacity-60'
export const outline =
  'flex w-full items-center justify-center gap-2.5 rounded-md border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition hover:border-subtle hover:bg-paper disabled:opacity-60'
export const linkButton = 'text-[13px] font-semibold text-brand hover:text-brand-700'

import { useEffect, useState } from 'react'
import { BrandLockup } from '../components/BrandLockup'

const BASE = import.meta.env.VITE_API_URL ?? ''
const KEY = 'revu.family'
const input = 'w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base focus:border-brand focus:outline-none'
const primary = 'w-full rounded-lg bg-brand px-4 py-2.5 text-base font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

interface Session {
  token?: string
  mustChange: boolean
  student: string
  placement: string
  school: string
}

/** The family's sign-in, kept for this browser tab only. */
const remembered = (): { org: string; token: string } | null => {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
    return v && typeof v.org === 'string' && typeof v.token === 'string' ? v : null
  } catch {
    return null
  }
}
const remember = (v: { org: string; token: string } | null) => {
  try {
    if (v) sessionStorage.setItem(KEY, JSON.stringify(v))
    else sessionStorage.removeItem(KEY)
  } catch {
    // Not kept: the family signs in again after a reload.
  }
}

/** One request as the family: its own token, never a staff sign-in. */
async function ask<T>(path: string, body: unknown, auth?: { org: string; token: string }): Promise<T> {
  const res = await fetch(`${BASE}/v1/family/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth.token}`, 'X-Org-Id': auth.org } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.errors?.[0]?.message ?? data?.detail ?? 'That did not work. Try again.')
  return data as T
}

/**
 * Where a family signs in for its child: the user name and the temporary
 * password from its message, then a password of its own the first time.
 * It is a page of its own, with none of the staff menus.
 */
export function Family() {
  const org = new URLSearchParams(window.location.search).get('org') ?? remembered()?.org ?? ''
  const [auth, setAuth] = useState(remembered)
  const [me, setMe] = useState<Session | null>(null)
  const [form, setForm] = useState({ username: '', password: '', next: '', again: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // A reload keeps the family signed in for this tab.
  useEffect(() => {
    if (!auth || me) return
    ask<Session>('me', undefined, auth)
      .then(setMe)
      .catch(() => (remember(null), setAuth(null)))
  }, [auth, me])

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.')
    } finally {
      setBusy(false)
    }
  }
  const signIn = () =>
    run(async () => {
      const s = await ask<Session>('sign-in', { orgId: org, username: form.username, password: form.password })
      const a = { org, token: s.token ?? '' }
      remember(a)
      setAuth(a)
      setMe(s)
      setForm({ username: '', password: '', next: '', again: '' })
    })
  const change = () =>
    run(async () => {
      if (form.next !== form.again) throw new Error('The two passwords are not the same.')
      setMe(await ask<Session>('password', { password: form.next }, auth!))
      setForm({ username: '', password: '', next: '', again: '' })
    })
  const signOut = () =>
    run(async () => {
      await ask('sign-out', {}, auth!).catch(() => undefined)
      remember(null)
      setAuth(null)
      setMe(null)
    })

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 px-4 py-10">
      <BrandLockup />
      {!org ? (
        <section className="rounded-2xl border border-line bg-white p-5">
          <h1 className="text-xl font-extrabold">Family sign-in</h1>
          <p className="mt-2 text-muted">Open the link in the message you were sent, so we know which institution your child is in.</p>
        </section>
      ) : !me ? (
        <form
          className="space-y-4 rounded-2xl border border-line bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault()
            void signIn()
          }}
        >
          <h1 className="text-xl font-extrabold">Family sign-in</h1>
          <p className="text-sm text-muted">Use the user name and password from the message or slip you were given.</p>
          <label className="block text-sm font-semibold">
            User name
            <input required autoComplete="username" autoCapitalize="none" className={`${input} mt-1`} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <label className="block text-sm font-semibold">
            Password
            <input required type="password" autoComplete="current-password" className={`${input} mt-1`} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          {error && (
            <p role="alert" className="text-sm font-semibold text-red-700">
              {error}
            </p>
          )}
          <button type="submit" className={primary} disabled={busy}>
            Sign in
          </button>
        </form>
      ) : me.mustChange ? (
        <form
          className="space-y-4 rounded-2xl border border-line bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault()
            void change()
          }}
        >
          <h1 className="text-xl font-extrabold">Choose your own password</h1>
          <p className="text-sm text-muted">The password you were sent was temporary. Choose one only you know, of at least 8 characters. You will use it from now on.</p>
          <label className="block text-sm font-semibold">
            New password
            <input required type="password" minLength={8} maxLength={72} autoComplete="new-password" className={`${input} mt-1`} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
          </label>
          <label className="block text-sm font-semibold">
            The same again
            <input required type="password" minLength={8} maxLength={72} autoComplete="new-password" className={`${input} mt-1`} value={form.again} onChange={(e) => setForm({ ...form, again: e.target.value })} />
          </label>
          {error && (
            <p role="alert" className="text-sm font-semibold text-red-700">
              {error}
            </p>
          )}
          <button type="submit" className={primary} disabled={busy}>
            Save my password
          </button>
        </form>
      ) : (
        <section className="space-y-3 rounded-2xl border border-line bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-subtle">{me.school}</p>
          <h1 className="text-xl font-extrabold">{me.student}</h1>
          {me.placement && <p className="text-muted">{me.placement}</p>}
          <p className="rounded-xl bg-mist px-3 py-2.5 text-sm">You are signed in. Results and reports will appear here once they are published.</p>
          <button type="button" className="text-sm font-semibold text-brand" disabled={busy} onClick={() => void signOut()}>
            Sign out
          </button>
        </section>
      )}
    </main>
  )
}

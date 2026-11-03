/**
 * Sign-up: revU's own page on Clerk, laid out like schedU's. In revU nobody
 * creates an institution by signing up: an administrator invites people by
 * email, and an account made with the invited address joins that institution
 * the first time it opens revU (Part 56.5). So this page makes the account
 * only, and says which address to use.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useAuth } from '@clerk/react'
import { useSignUp } from '@clerk/react/legacy'
import { useAuthState } from '../lib/auth-context'
import { useT } from '../lib/terminology/terms-context'
import { AuthFrame, GoogleMark, Lockup, NotConfigured, Or, Problem, Spinner } from './auth/parts'
import { authErrorMessage, input, label, looksLikeEmail, outline, primary } from './auth/style'

type Fields = { firstName: string; lastName: string; email: string; password: string }

type Handlers = {
  onCreate: (f: Fields) => Promise<'verify' | 'done'>
  onVerify: (code: string) => Promise<void>
  onResend: () => Promise<void>
  onGoogle: () => Promise<void>
}

function SignUpCard({ handlers }: { handlers?: Handlers }) {
  const t = useT()
  const [f, setF] = useState<Fields>({ firstName: '', lastName: '', email: '', password: '' })
  const [phase, setPhase] = useState<'form' | 'verify'>('form')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'' | 'form' | 'google'>('')
  const off = !handlers
  const set = (k: keyof Fields) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function run(kind: 'form' | 'google', work: () => Promise<void>, fallback: string) {
    setError('')
    setBusy(kind)
    try {
      await work()
    } catch (err) {
      setError(authErrorMessage(err, fallback))
    }
    setBusy('')
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!handlers) return
    if (!f.firstName.trim() || !looksLikeEmail(f.email)) return setError('Enter your first name and your work email.')
    if (f.password.length < 8) return setError('Choose a password of at least 8 characters.')
    void run('form', async () => {
      if ((await handlers.onCreate({ ...f, email: f.email.trim() })) === 'verify') setPhase('verify')
    }, 'Could not create the account. Try again.')
  }

  const verify = (e: FormEvent) => {
    e.preventDefault()
    if (!handlers) return
    if (code.trim().length < 4) return setError('Enter the code from the email.')
    void run('form', () => handlers.onVerify(code.trim()), 'That code did not work. Check it and try again.')
  }

  const points = [
    { title: 'Marks, entered once', text: 'Type them, upload a spreadsheet, or enter one at a time on a phone. A blank is never zero.' },
    {
      title: 'In your own words',
      text: `Every screen says ${t('person.student', { count: 2, lower: true })}, ${t('group.section', { count: 2, lower: true })} and ${t('period.term', { count: 2, lower: true })} the way your ${t('org.institution', { lower: true })} does.`,
    },
    {
      title: `Each ${t('person.teacher', { lower: true })}, their own classes`,
      text: `Marks and remarks stay with the ${t('person.teacher', { count: 2, lower: true })} and leaders who work with them.`,
    },
  ]

  return (
    <div className="flex w-full max-w-4xl overflow-hidden rounded-[14px] border border-line bg-white shadow-[0_4px_24px_rgba(19,17,30,0.07)]">
      <aside className="hidden w-[42%] flex-col justify-between bg-canvas p-9 md:flex">
        <div>
          <Lockup />
          <ul className="mt-10 space-y-6">
            {points.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-gold" />
                <span>
                  <span className="block text-sm font-bold">{p.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-8 text-xs leading-relaxed text-subtle">{t('person.teacher', { count: 2 })} review and approve everything revU drafts.</p>
      </aside>

      <div className="flex-1 px-6 py-9 sm:px-10">
        <div className="mb-6 md:hidden">
          <Lockup />
        </div>
        {off && <NotConfigured />}
        {phase === 'verify' ? (
          <form onSubmit={verify} className="flex flex-col gap-4">
            <div>
              <h1 className="text-[26px] font-bold tracking-tight">Verify your email</h1>
              <p className="mt-1.5 text-sm text-muted">
                Enter the 6-digit code we sent to <b className="text-ink">{f.email}</b>.
              </p>
            </div>
            <div>
              <label htmlFor="code" className={label}>
                Verification code
              </label>
              <input id="code" className={`${input} text-center text-lg tracking-[0.3em]`} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="123456" />
            </div>
            <Problem text={error} />
            {note && (
              <p role="status" className="text-[13px] text-brand-700">
                {note}
              </p>
            )}
            <button type="submit" disabled={!!busy} className={primary}>
              {busy ? <><Spinner /> Verifying</> : 'Verify and continue'}
            </button>
            <p className="text-center text-[13px] text-subtle">
              Did not get it?{' '}
              <button
                type="button"
                className="font-semibold text-brand hover:text-brand-700"
                onClick={() => handlers && void handlers.onResend().then(() => setNote('A new code is on its way.'), (err) => setError(authErrorMessage(err)))}
              >
                Send a new code
              </button>
            </p>
          </form>
        ) : (
          <>
            <h1 className="text-[26px] font-bold tracking-tight">Create your account</h1>
            <p className="mt-1.5 text-sm text-muted">
              Invited by your {t('org.institution', { lower: true })}? Use the email address the invitation went to, and you join it as soon as you are in.
            </p>
            <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="first" className={label}>
                    First name
                  </label>
                  <input id="first" className={input} value={f.firstName} onChange={set('firstName')} autoComplete="given-name" autoFocus disabled={off} />
                </div>
                <div>
                  <label htmlFor="last" className={label}>
                    Last name
                  </label>
                  <input id="last" className={input} value={f.lastName} onChange={set('lastName')} autoComplete="family-name" disabled={off} />
                </div>
              </div>
              <div>
                <label htmlFor="email" className={label}>
                  Work email
                </label>
                <input id="email" className={input} type="email" value={f.email} onChange={set('email')} placeholder="you@example.org" autoComplete="email" disabled={off} />
              </div>
              <div>
                <label htmlFor="password" className={label}>
                  Password
                </label>
                <input id="password" className={input} type="password" value={f.password} onChange={set('password')} placeholder="At least 8 characters" autoComplete="new-password" disabled={off} />
              </div>
              {/* Clerk's bot protection draws its check here; a custom form without it fails when bot protection is on. */}
              <div id="clerk-captcha" />
              <Problem text={error} />
              <button type="submit" disabled={off || !!busy} className={primary}>
                {busy === 'form' ? <><Spinner /> Creating your account</> : 'Create account'}
              </button>
            </form>
            <Or />
            <button type="button" disabled={off || !!busy} className={outline} onClick={() => handlers && void run('google', handlers.onGoogle, 'Google sign-up did not work. Try again.')}>
              {busy === 'google' ? <><Spinner /> Connecting</> : <><GoogleMark /> Continue with Google</>}
            </button>
            <p className="mt-5 text-center text-[13px] text-subtle">
              Already have an account?{' '}
              <Link to="/sign-in" className="font-semibold text-brand hover:text-brand-700">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/** Clerk's calls behind the card (the same flow as schedU's sign-up). */
function ClerkSignUp() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  const { isLoaded, signUp, setActive } = useSignUp()

  useEffect(() => {
    if (authLoaded && isSignedIn) window.location.replace('/')
  }, [authLoaded, isSignedIn])

  if (!authLoaded || isSignedIn || !isLoaded || !signUp) return <p className="text-sm text-muted">Loading</p>

  const enter = async (sessionId: string | null) => {
    if (!sessionId) throw new Error('The account was made, but signing in did not finish. Sign in with your new password.')
    await setActive({ session: sessionId })
    window.location.assign('/')
  }

  const handlers: Handlers = {
    onCreate: async (f) => {
      const res = await signUp.create({
        emailAddress: f.email,
        password: f.password,
        unsafeMetadata: { name: [f.firstName.trim(), f.lastName.trim()].filter(Boolean).join(' ') },
      })
      if (res.status === 'complete') {
        await enter(res.createdSessionId)
        return 'done'
      }
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      return 'verify'
    },
    onVerify: async (code) => {
      const res = await signUp.attemptEmailAddressVerification({ code })
      if (res.status !== 'complete') throw new Error('The code was right, but the account needs a step this page cannot show. Try Continue with Google.')
      await enter(res.createdSessionId)
    },
    onResend: async () => {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
    },
    onGoogle: () =>
      signUp.authenticateWithRedirect({ strategy: 'oauth_google', redirectUrl: `${window.location.origin}/sso-callback`, redirectUrlComplete: `${window.location.origin}/` }),
  }
  return <SignUpCard handlers={handlers} />
}

export function SignUp() {
  const { enabled } = useAuthState()
  return <AuthFrame>{enabled ? <ClerkSignUp /> : <SignUpCard />}</AuthFrame>
}

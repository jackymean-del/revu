/**
 * Sign-in: revU's own page on Clerk, the same flows as schedU's (one Clerk
 * instance for bhusku). The card is presentational; a controller supplies
 * Clerk's calls. Email and password, a code when Clerk asks for one (a new
 * browser, two-step verification), a password reset by emailed code, Google,
 * and an institution's own single sign-on found from the email's domain.
 *
 * Nobody is signed in here, so no institution's words are known yet: the
 * copy uses neutral words that fit every institution, never a preset's.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useAuth } from '@clerk/react'
import { useSignIn } from '@clerk/react/legacy'
import { useAuthState } from '../lib/auth-context'
import { AuthFrame, GoogleMark, Lockup, NotConfigured, Or, Problem, Spinner } from './auth/parts'
import { authErrorMessage, input, label, linkButton, looksLikeEmail, outline, primary } from './auth/style'

/** What a sign-in still needs after the password: a code, and where it went. */
type CodeChallenge = { sentTo: string; verify: (code: string) => Promise<void> }
/** A password reset under way: the code went to `sentTo`; `reset` sets the new password and signs in. */
type ResetChallenge = { sentTo: string; reset: (code: string, newPassword: string) => Promise<void | CodeChallenge> }

type Handlers = {
  onPassword: (email: string, password: string) => Promise<void | CodeChallenge>
  onGoogle: () => Promise<void>
  onForgot: (email: string) => Promise<ResetChallenge>
  onSSO: (email: string) => Promise<void>
}

function SignInCard({ handlers }: { handlers?: Handlers }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'' | 'password' | 'google' | 'sso'>('')
  const [challenge, setChallenge] = useState<CodeChallenge | null>(null)
  const [forgot, setForgot] = useState(false)
  const [reset, setReset] = useState<ResetChallenge | null>(null)
  const [ssoOpen, setSsoOpen] = useState(false)
  const off = !handlers

  const back = () => {
    setForgot(false)
    setReset(null)
    setChallenge(null)
    setCode('')
    setNewPassword('')
    setError('')
  }

  async function run(kind: 'password' | 'google' | 'sso', work: () => Promise<void>, fallback: string) {
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
    if (!email || !password) return setError('Enter your email and password.')
    void run('password', async () => {
      const next = await handlers.onPassword(email.trim(), password)
      if (next) setChallenge(next)
    }, 'That email and password did not match. Try again.')
  }

  const verify = (e: FormEvent) => {
    e.preventDefault()
    if (!challenge) return
    if (code.trim().length < 4) return setError('Enter the code.')
    void run('password', () => challenge.verify(code.trim()), 'That code did not work. Check it and try again.')
  }

  const sendReset = (e: FormEvent) => {
    e.preventDefault()
    if (!handlers) return
    if (!looksLikeEmail(email)) return setError('Enter the email you signed up with.')
    void run('password', async () => {
      setReset(await handlers.onForgot(email.trim()))
      setForgot(false)
    }, 'Could not send a reset code. Check the email and try again.')
  }

  const doReset = (e: FormEvent) => {
    e.preventDefault()
    if (!reset) return
    if (code.trim().length < 4) return setError('Enter the code from the email.')
    if (newPassword.length < 8) return setError('Choose a new password of at least 8 characters.')
    void run('password', async () => {
      const next = await reset.reset(code.trim(), newPassword)
      if (next) {
        setReset(null)
        setCode('')
        setChallenge(next)
      }
    }, 'That did not work. Check the code and try again.')
  }

  const codeField = (name: string) => (
    <div>
      <label htmlFor="code" className={label}>
        {name}
      </label>
      <input id="code" className={`${input} text-center tracking-[0.3em]`} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="6-digit code" />
    </div>
  )

  return (
    <div className="w-full max-w-[400px] rounded-[14px] border border-line bg-white px-8 pb-7 pt-9 shadow-[0_4px_24px_rgba(19,17,30,0.07)]">
      <div className="mb-7 text-center">
        <Lockup />
        <p className="mt-2 text-[13px] text-subtle">Assessment, results and holistic progress, for every institution</p>
      </div>
      {off && <NotConfigured />}
      <h1 className="mb-5 text-[22px] font-bold tracking-tight">{forgot || reset ? 'Reset your password' : 'Welcome back'}</h1>

      {forgot && (
        <form onSubmit={sendReset} className="flex flex-col gap-3.5">
          <p className="text-[13.5px] leading-relaxed text-muted">We will email you a code. Enter it with a new password and you are signed in.</p>
          <div>
            <label htmlFor="email" className={label}>
              Work email
            </label>
            <input id="email" className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.org" autoComplete="email" autoFocus />
          </div>
          <Problem text={error} />
          <button type="submit" disabled={!!busy} className={primary}>
            {busy ? <><Spinner /> Sending</> : 'Email me a code'}
          </button>
          <button type="button" onClick={back} className={linkButton}>
            Back to sign in
          </button>
        </form>
      )}

      {reset && (
        <form onSubmit={doReset} className="flex flex-col gap-3.5">
          <p className="text-[13.5px] leading-relaxed text-muted">Enter the code from {reset.sentTo}, and choose a new password.</p>
          {codeField('Code')}
          <div>
            <label htmlFor="new-password" className={label}>
              New password
            </label>
            <input id="new-password" className={input} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
          </div>
          <Problem text={error} />
          <button type="submit" disabled={!!busy} className={primary}>
            {busy ? <><Spinner /> Resetting</> : 'Reset password and sign in'}
          </button>
          <button type="button" onClick={back} className={linkButton}>
            Back to sign in
          </button>
        </form>
      )}

      {challenge && (
        <form onSubmit={verify} className="flex flex-col gap-3.5">
          <p className="text-[13.5px] leading-relaxed text-muted">One more step. Enter the code from {challenge.sentTo}.</p>
          {codeField('Verification code')}
          <Problem text={error} />
          <button type="submit" disabled={!!busy} className={primary}>
            {busy ? <><Spinner /> Verifying</> : 'Verify and sign in'}
          </button>
          <button type="button" onClick={back} className={linkButton}>
            Use a different account
          </button>
        </form>
      )}

      {!challenge && !forgot && !reset && (
        <>
          <form onSubmit={submit} className="flex flex-col gap-3.5">
            <div>
              <label htmlFor="email" className={label}>
                Work email
              </label>
              <input id="email" className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.org" autoComplete="email" autoFocus disabled={off} />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="password" className={label}>
                  Password
                </label>
                <button type="button" disabled={off} onClick={() => (setError(''), setForgot(true))} className={`${linkButton} font-medium`}>
                  Forgot password?
                </button>
              </div>
              <input id="password" className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" disabled={off} />
            </div>
            <Problem text={error} />
            <button type="submit" disabled={off || !!busy} className={primary}>
              {busy === 'password' ? <><Spinner /> Signing in</> : 'Sign in'}
            </button>
          </form>
          <Or />
          <button type="button" disabled={off || !!busy} className={outline} onClick={() => handlers && void run('google', handlers.onGoogle, 'Google sign-in did not work. Try again.')}>
            {busy === 'google' ? <><Spinner /> Connecting</> : <><GoogleMark /> Sign in with Google</>}
          </button>
          <p className="mt-5 text-center text-[13px] text-subtle">
            No account yet?{' '}
            <Link to="/sign-up" className="font-semibold text-brand hover:text-brand-700">
              Create one
            </Link>
          </p>
          <div className="mt-4 rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-xs text-muted">
            {!ssoOpen ? (
              <p>
                Your institution signs in with Microsoft, Google or Okta?{' '}
                <button type="button" disabled={off} onClick={() => setSsoOpen(true)} className="font-semibold text-brand hover:text-brand-700">
                  Sign in with SSO
                </button>
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <label htmlFor="sso-email" className="font-semibold text-ink">
                  Sign in with your institution's account
                </label>
                <input id="sso-email" className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.org" autoComplete="email" />
                <button
                  type="button"
                  disabled={!!busy}
                  className={`${outline} border-brand font-semibold text-brand`}
                  onClick={() => {
                    if (!handlers) return
                    if (!looksLikeEmail(email)) return setError('Enter your work email.')
                    void run('sso', () => handlers.onSSO(email.trim()), `Single sign-on is not set up for @${email.split('@')[1]} yet. Sign in with your password, or ask your administrator.`)
                  }}
                >
                  {busy === 'sso' ? <><Spinner /> Connecting</> : 'Continue with SSO'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Clerk's calls behind the card (the same flows as schedU, on @clerk/react's legacy hooks). */
function ClerkSignIn() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  const { isLoaded, signIn, setActive } = useSignIn()

  // Already signed in, or back from Google: go to the app.
  useEffect(() => {
    if (authLoaded && isSignedIn) window.location.replace('/')
  }, [authLoaded, isSignedIn])

  if (!authLoaded || isSignedIn || !isLoaded || !signIn) return <p className="text-sm text-muted">Loading</p>

  const finish = async (res: { status: string | null; createdSessionId: string | null }) => {
    if (res.status !== 'complete' || !res.createdSessionId) throw new Error('That did not finish signing you in. Try again.')
    await setActive({ session: res.createdSessionId })
    window.location.assign('/')
  }

  // A second factor, when Clerk asks for one after the password.
  type Attempt = Awaited<ReturnType<typeof signIn.create>>
  const second = async (res: Attempt, email: string): Promise<CodeChallenge | null> => {
    if (res.status !== 'needs_second_factor') return null
    const factors = res.supportedSecondFactors ?? []
    const byEmail = factors.find((f) => f.strategy === 'email_code')
    if (byEmail && 'emailAddressId' in byEmail) {
      await res.prepareSecondFactor({ strategy: 'email_code', emailAddressId: byEmail.emailAddressId })
      return { sentTo: `the email sent to ${byEmail.safeIdentifier ?? email}`, verify: async (code) => finish(await res.attemptSecondFactor({ strategy: 'email_code', code })) }
    }
    if (factors.some((f) => f.strategy === 'totp')) {
      return { sentTo: 'your authenticator app', verify: async (code) => finish(await res.attemptSecondFactor({ strategy: 'totp', code })) }
    }
    const byPhone = factors.find((f) => f.strategy === 'phone_code')
    if (byPhone && 'phoneNumberId' in byPhone) {
      await res.prepareSecondFactor({ strategy: 'phone_code', phoneNumberId: byPhone.phoneNumberId })
      return { sentTo: `the text sent to ${byPhone.safeIdentifier ?? 'your phone'}`, verify: async (code) => finish(await res.attemptSecondFactor({ strategy: 'phone_code', code })) }
    }
    return null
  }

  const handlers: Handlers = {
    onPassword: async (email, password) => {
      const res = await signIn.create({ identifier: email, password })
      if (res.status === 'complete') return finish(res)
      const more = await second(res, email)
      if (more) return more
      if (res.status === 'needs_first_factor') {
        const byEmail = (res.supportedFirstFactors ?? []).find((f) => f.strategy === 'email_code')
        if (byEmail && 'emailAddressId' in byEmail) {
          await res.prepareFirstFactor({ strategy: 'email_code', emailAddressId: byEmail.emailAddressId })
          return { sentTo: `the email sent to ${byEmail.safeIdentifier ?? email}`, verify: async (code) => finish(await res.attemptFirstFactor({ strategy: 'email_code', code })) }
        }
      }
      throw new Error('This account needs a sign-in step this page cannot show yet. Try Sign in with Google.')
    },
    onForgot: async (email) => {
      const res = await signIn.create({ strategy: 'reset_password_email_code', identifier: email })
      const factor = (res.supportedFirstFactors ?? []).find((f) => f.strategy === 'reset_password_email_code')
      return {
        sentTo: `the email sent to ${factor?.safeIdentifier ?? email}`,
        reset: async (code, password) => {
          const done = await res.attemptFirstFactor({ strategy: 'reset_password_email_code', code, password })
          if (done.status === 'complete') return finish(done)
          const more = await second(done, email)
          if (more) return more
          throw new Error('Your password was changed, but signing in needs a step this page cannot show. Sign in with the new password.')
        },
      }
    },
    onGoogle: () =>
      signIn.authenticateWithRedirect({ strategy: 'oauth_google', redirectUrl: `${window.location.origin}/sso-callback`, redirectUrlComplete: `${window.location.origin}/` }),
    onSSO: (email) =>
      signIn.authenticateWithRedirect({
        strategy: 'enterprise_sso', identifier: email, redirectUrl: `${window.location.origin}/sso-callback`, redirectUrlComplete: `${window.location.origin}/`,
      }),
  }
  return <SignInCard handlers={handlers} />
}

export function SignIn() {
  const { enabled } = useAuthState()
  return <AuthFrame>{enabled ? <ClerkSignIn /> : <SignInCard />}</AuthFrame>
}

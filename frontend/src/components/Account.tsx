import { Link } from '@tanstack/react-router'
import { Show, UserButton } from '@clerk/react'
import { useAuthState } from '../lib/auth-context'

const signInClass = 'rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600'

/** Sign in, or the signed-in person's menu. Nothing when Clerk is off. */
export function Account() {
  const { enabled } = useAuthState()
  if (!enabled) return null
  return (
    <>
      <Show when="signed-in">
        <UserButton />
      </Show>
      <Show when="signed-out">
        <Link to="/sign-in" className={signInClass}>
          Sign in
        </Link>
      </Show>
    </>
  )
}

/** A sign-in button for screens that need one; nothing when Clerk is off. */
export function SignInPrompt() {
  const { enabled } = useAuthState()
  if (!enabled) return null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Link to="/sign-in" className={signInClass}>
        Sign in
      </Link>
      <Link to="/sign-up" className="text-sm font-semibold text-brand hover:text-brand-700">
        Create an account
      </Link>
    </div>
  )
}

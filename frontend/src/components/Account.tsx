import { Show, SignInButton, UserButton } from '@clerk/react'
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
        <SignInButton mode="modal">
          <button type="button" className={signInClass}>
            Sign in
          </button>
        </SignInButton>
      </Show>
    </>
  )
}

/** A sign-in button for screens that need one; nothing when Clerk is off. */
export function SignInPrompt() {
  const { enabled } = useAuthState()
  if (!enabled) return null
  return (
    <SignInButton mode="modal">
      <button type="button" className={`mt-3 ${signInClass}`}>
        Sign in
      </button>
    </SignInButton>
  )
}

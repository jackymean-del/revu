import { AuthenticateWithRedirectCallback } from '@clerk/react'
import { useAuthState } from '../lib/auth-context'
import { AuthFrame } from './auth/parts'

/** Where Google and single sign-on send people back; Clerk finishes the sign-in here and moves on to Home. */
export function SsoCallback() {
  const { enabled } = useAuthState()
  return (
    <AuthFrame>
      <p className="text-sm text-muted">Signing you in</p>
      {enabled && <AuthenticateWithRedirectCallback signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" signInUrl="/sign-in" signUpUrl="/sign-up" />}
    </AuthFrame>
  )
}

import { useEffect, useMemo, type ReactNode } from 'react'
import { ClerkProvider, useAuth } from '@clerk/react'
import { setTokenGetter } from '../api/client'
import { AuthContext } from './auth-context'
import { OUTBOX_DB } from './outbox-name'

const KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

/** Passes Clerk's session token to every API call and shares the sign-in state. */
function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()
  useEffect(() => {
    setTokenGetter(() => getToken())
    return () => setTokenGetter(null)
  }, [getToken])
  // Signed out: nothing of the person's stays in this browser.
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      try {
        indexedDB.deleteDatabase(OUTBOX_DB)
      } catch {
        // storage blocked: there is nothing to clear
      }
    }
  }, [isLoaded, isSignedIn])
  const value = useMemo(
    () => ({ enabled: true, loaded: isLoaded, signedIn: !!isSignedIn, userKey: userId ?? 'signed-out' }),
    [isLoaded, isSignedIn, userId],
  )
  return <AuthContext value={value}>{children}</AuthContext>
}

/**
 * Sign-in through the Clerk instance shared with schedU. Without a
 * publishable key (tests, or local work with DEV_USER_ID on the server) the
 * app runs without Clerk and the server decides who is signed in.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!KEY) return children
  return (
    <ClerkProvider publishableKey={KEY} afterSignOutUrl="/">
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  )
}

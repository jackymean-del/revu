import { createContext, useContext } from 'react'

export type AuthState = {
  /** Clerk sign-in is configured (a publishable key is set). */
  enabled: boolean
  /** Sign-in state is known. */
  loaded: boolean
  /** Someone is signed in. Without Clerk the server decides, so this is true. */
  signedIn: boolean
  /** Changes when a different person signs in, so their data is fetched afresh. */
  userKey: string
}

export const AuthContext = createContext<AuthState>({ enabled: false, loaded: true, signedIn: true, userKey: 'server' })

export const useAuthState = () => useContext(AuthContext)

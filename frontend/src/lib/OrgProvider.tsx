import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMe } from '../api/client'
import { ApiError } from '../api/problem'
import { useAuthState } from './auth-context'
import { OrgContext } from './org-context'

const KEY = 'revu.org'

// The chosen organisation is a per-browser convenience; the server checks
// membership on every request, whatever is stored here.
const remembered = (): string | null => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const auth = useAuthState()
  const mine = useQuery({
    queryKey: ['me', auth.userKey],
    queryFn: ({ signal }) => getMe(signal),
    enabled: auth.loaded && auth.signedIn,
    retry: false,
  })
  const [chosen, setChosen] = useState<string | null>(remembered)

  const value = useMemo(() => {
    const orgs = mine.data?.orgs ?? []
    const current = orgs.find((o) => o.id === chosen) ?? orgs[0] ?? null
    const choose = (id: string) => {
      setChosen(id)
      try {
        localStorage.setItem(KEY, id)
      } catch {
        // storage blocked: the choice lasts until the page reloads
      }
    }
    const error = mine.error instanceof ApiError ? mine.error : null
    // Anything but a refused sign-in means we do not know yet, never that they belong nowhere.
    const unreachable = !!mine.error && error?.status !== 401
    return { orgs, current, choose, loading: auth.signedIn && mine.isPending, error, unreachable, userId: mine.data?.userId ?? null }
  }, [mine.data, mine.error, mine.isPending, chosen, auth.signedIn])

  return <OrgContext value={value}>{children}</OrgContext>
}

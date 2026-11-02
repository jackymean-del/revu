import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listMyOrgs } from '../api/client'
import { ApiError } from '../api/problem'
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
  const mine = useQuery({ queryKey: ['me', 'orgs'], queryFn: ({ signal }) => listMyOrgs(signal), retry: false })
  const [chosen, setChosen] = useState<string | null>(remembered)

  const value = useMemo(() => {
    const orgs = mine.data ?? []
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
    return { orgs, current, choose, loading: mine.isPending, error }
  }, [mine.data, mine.error, mine.isPending, chosen])

  return <OrgContext value={value}>{children}</OrgContext>
}

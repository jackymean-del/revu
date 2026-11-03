import { useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMe, setPreviewRole, type MyOrg } from '../api/client'
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

const PREVIEW = 'revu.preview'

// A preview lasts for the browser tab and the institution it began in.
const rememberedPreview = (): { org: string; role: string } | null => {
  try {
    const v = JSON.parse(sessionStorage.getItem(PREVIEW) ?? 'null')
    return v && typeof v.org === 'string' && typeof v.role === 'string' ? v : null
  } catch {
    return null
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const auth = useAuthState()
  const qc = useQueryClient()
  const [previewState, setPreviewState] = useState(rememberedPreview)
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
    const ownRoles: MyOrg['roles'] = current?.roles ?? []
    // Only an administrator of this institution can preview, and only here.
    const previewing = previewState && current && previewState.org === current.id && ownRoles.includes('admin') ? previewState.role : null
    setPreviewRole(previewing)
    const preview = (role: string | null) => {
      const next = role && current ? { org: current.id, role } : null
      setPreviewState(next)
      setPreviewRole(next?.role ?? null)
      try {
        if (next) sessionStorage.setItem(PREVIEW, JSON.stringify(next))
        else sessionStorage.removeItem(PREVIEW)
      } catch {
        // storage blocked: the preview lasts until the page reloads
      }
      // Everything inside the institution is fetched again, as the new role.
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
    }
    const shown = current && previewing ? { ...current, roles: [previewing as MyOrg['roles'][number]] } : current
    return {
      orgs, current: shown, choose, loading: auth.signedIn && mine.isPending, error, unreachable, userId: mine.data?.userId ?? null,
      platformOwner: !!mine.data?.platformOwner, groups: mine.data?.groups ?? [], previewing, preview, ownRoles,
    }
  }, [mine.data, mine.error, mine.isPending, chosen, auth.signedIn, previewState, qc])

  return <OrgContext value={value}>{children}</OrgContext>
}

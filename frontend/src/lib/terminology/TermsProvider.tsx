import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTerminology } from '../../api/client'
import { useOrg } from '../org-context'
import { makeT } from './terminology'
import { SCHOOL, TermsContext } from './terms-context'

/** Loads the current organisation's words. Until they arrive, the preset the
 * organisation chose (or the school preset) keeps every screen readable. */
export function TermsProvider({ children }: { children: ReactNode }) {
  const { current } = useOrg()
  const orgId = current?.id
  const q = useQuery({
    queryKey: ['terminology', orgId],
    queryFn: ({ signal }) => getTerminology(orgId!, signal),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })
  const value = useMemo(() => {
    const terminology = q.data ?? (current ? { preset: current.preset, overrides: [] } : SCHOOL)
    return { t: makeT(terminology), terminology }
  }, [q.data, current])
  return <TermsContext value={value}>{children}</TermsContext>
}

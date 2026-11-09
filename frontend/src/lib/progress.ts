import { useQuery } from '@tanstack/react-query'
import { getSetup } from '../api/client'
import { useOrg } from './org-context'

/** Where the current institution's year stands; shared by the menu, the step bar and Home. */
export function useSetup() {
  const { current } = useOrg()
  const orgId = current?.id ?? ''
  return useQuery({ queryKey: ['setup', orgId], queryFn: ({ signal }) => getSetup(orgId, signal), enabled: !!orgId })
}

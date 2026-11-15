import { useQuery } from '@tanstack/react-query'
import { listWaiting } from '../api/client'
import { useOrg } from './org-context'

/** What waits on the person signed in: things to approve, or sent back to them. Checked every minute;
 * a failed check waits for the next one rather than retrying. */
export function useWaiting() {
  const orgId = useOrg().current?.id ?? ''
  return useQuery({ queryKey: ['waiting', orgId], queryFn: ({ signal }) => listWaiting(orgId, signal), enabled: !!orgId, refetchInterval: 60_000, retry: false }).data ?? []
}

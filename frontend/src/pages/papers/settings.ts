import { useQuery } from '@tanstack/react-query'
import { getPaperSettings } from '../../api/client'

/** The institution's set names and own taxonomy. */
export function usePaperSettings(orgId: string) {
  return useQuery({ queryKey: ['paper-settings', orgId], queryFn: ({ signal }) => getPaperSettings(orgId, signal), enabled: !!orgId }).data
}

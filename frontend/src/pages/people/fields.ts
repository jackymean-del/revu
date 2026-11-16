import { useQuery } from '@tanstack/react-query'
import { getStudentFields } from '../../api/client'

/** The institution's own list of student fields, and which one families sign in with. */
export function useStudentFields(orgId: string) {
  return useQuery({ queryKey: ['student-fields', orgId], queryFn: ({ signal }) => getStudentFields(orgId, signal), enabled: !!orgId }).data
}

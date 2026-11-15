import { useQuery } from '@tanstack/react-query'
import { getExamFocus, type ExamFocus } from '../api/client'

const none: ExamFocus = { hiddenPeriods: [], hiddenAssessments: [], defaultPeriodId: '', defaultAssessmentId: '' }

/** Which terms and exams teachers see now, and which ones every picker opens on. */
export function useExamFocus(orgId: string): ExamFocus {
  return useQuery({ queryKey: ['exam-focus', orgId], queryFn: ({ signal }) => getExamFocus(orgId, signal), enabled: !!orgId, retry: false }).data ?? none
}

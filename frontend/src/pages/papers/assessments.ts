import { useQuery } from '@tanstack/react-query'
import { listAssessments, listStructure, type Assessment, type Period, type Subject, type TeachingAssignment, type Year } from '../../api/client'
import { useExamFocus } from '../../lib/focus'
import { useOrg } from '../../lib/org-context'
import { useSectionNames } from '../people/sections'

export interface Choice {
  a: Assessment
  label: string
  subject: string
  sections: string
  level: string
  seq: number
  year: string // the academic year's label
  yearStart: string
  term: string // the term or semester's name
  termSeq: number
  hidden: boolean // hidden from teachers for now; only those who lead see it
}

/**
 * The assessments this person works on papers for: all of them for those
 * who lead, otherwise those of the subjects they teach, in the classes they
 * teach them. Each carries its year, term, class and subject by name.
 */
export function usePaperAssessments() {
  const { current, loading } = useOrg()
  const orgId = current?.id ?? ''
  const roles = current?.roles ?? []
  const leads = roles.some((r) => r === 'admin' || r === 'coordinator' || r === 'principal')
  const approves = leads
  const names = useSectionNames(orgId)
  const assessments = useQuery({ queryKey: ['assessments', orgId], queryFn: ({ signal }) => listAssessments(orgId, {}, signal), enabled: !!orgId })
  const years = useQuery({ queryKey: ['structure', orgId, 'years', {}], queryFn: ({ signal }) => listStructure<Year>(orgId, 'years', {}, signal), enabled: !!orgId }).data ?? []
  const periods = useQuery({ queryKey: ['structure', orgId, 'periods', {}], queryFn: ({ signal }) => listStructure<Period>(orgId, 'periods', {}, signal), enabled: !!orgId }).data ?? []
  const focus = useExamFocus(orgId)
  const subjects = useQuery({ queryKey: ['structure', orgId, 'subjects', {}], queryFn: ({ signal }) => listStructure<Subject>(orgId, 'subjects', {}, signal), enabled: !!orgId }).data ?? []
  const mine = useQuery({
    queryKey: ['structure', orgId, 'teaching-assignments', { staffId: current?.staffId }],
    queryFn: ({ signal }) => listStructure<TeachingAssignment>(orgId, 'teaching-assignments', { staffId: current!.staffId! }, signal),
    enabled: !!orgId && !leads && !!current?.staffId,
  }).data
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? ''
  const sectionName = (id: string) => {
    const s = names.byId(id)
    return s ? names.name(s) : ''
  }
  const teaches = (a: Assessment) => leads || a.sectionIds.some((s) => mine?.some((m) => m.sectionId === s && (!m.subjectId || m.subjectId === a.subjectId)))
  const choices: Choice[] = (assessments.data ?? [])
    // Only the year chosen at the top of the app.
    .filter((a) => !names.chosenYear || a.yearId === names.chosenYear)
    .filter(teaches)
    .map((a) => {
      const subject = subjectName(a.subjectId)
      const sections = a.sectionIds.map(sectionName).join(', ')
      const lv = names.levels.find((l) => l.id === a.levelId)
      const yr = years.find((y) => y.id === a.yearId)
      const pd = periods.find((x) => x.id === a.periodId)
      return {
        a,
        subject,
        sections,
        label: `${subject}, ${a.title} · ${sections}`,
        level: lv?.name ?? '',
        seq: lv?.seq ?? 0,
        year: yr?.label ?? '',
        yearStart: yr?.startsOn ?? '',
        term: pd?.name ?? '',
        termSeq: pd?.seq ?? 0,
        hidden: focus.hiddenAssessments.includes(a.id) || focus.hiddenPeriods.includes(a.periodId),
      }
    })
    // Newest year first, then term, class, subject and title, so a long list reads in groups.
    .sort((x, y) => y.yearStart.localeCompare(x.yearStart) || x.termSeq - y.termSeq || x.seq - y.seq || x.subject.localeCompare(y.subject) || x.a.title.localeCompare(y.a.title))
  // Where every picker opens: the administrator's default exam, or else the
  // first in the default term, or else the first.
  const preferred = (choices.find((c) => c.a.id === focus.defaultAssessmentId) ?? choices.find((c) => c.a.periodId === focus.defaultPeriodId) ?? choices[0])?.a.id ?? ''
  return { orgId, loading, pending: assessments.isPending, choices, preferred, approves, sectionName, levelName: (id: string) => names.levels.find((l) => l.id === id)?.name ?? '' }
}

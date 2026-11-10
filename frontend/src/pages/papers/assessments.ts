import { useQuery } from '@tanstack/react-query'
import { listAssessments, listStructure, type Assessment, type Subject, type TeachingAssignment } from '../../api/client'
import { useOrg } from '../../lib/org-context'
import { useSectionNames } from '../people/sections'

export interface Choice {
  a: Assessment
  label: string
  subject: string
  sections: string
  level: string
  seq: number
}

/**
 * The assessments this person works on papers for: all of them for those
 * who lead, otherwise those of the subjects they teach. Named as a person
 * reads them, the subject first.
 */
export function usePaperAssessments() {
  const { current, loading } = useOrg()
  const orgId = current?.id ?? ''
  const roles = current?.roles ?? []
  const leads = roles.some((r) => r === 'admin' || r === 'coordinator' || r === 'principal')
  const approves = leads
  const names = useSectionNames(orgId)
  const assessments = useQuery({ queryKey: ['assessments', orgId], queryFn: ({ signal }) => listAssessments(orgId, {}, signal), enabled: !!orgId })
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
    .filter(teaches)
    .map((a) => {
      const subject = subjectName(a.subjectId)
      const sections = a.sectionIds.map(sectionName).join(', ')
      const lv = names.levels.find((l) => l.id === a.levelId)
      return { a, subject, sections, label: `${subject}, ${a.title} · ${sections}`, level: lv?.name ?? '', seq: lv?.seq ?? 0 }
    })
    // By class in its order, then subject and title, so a long list reads in groups.
    .sort((x, y) => x.seq - y.seq || x.subject.localeCompare(y.subject) || x.a.title.localeCompare(y.a.title))
  return { orgId, loading, pending: assessments.isPending, choices, approves, sectionName, levelName: (id: string) => names.levels.find((l) => l.id === id)?.name ?? '' }
}

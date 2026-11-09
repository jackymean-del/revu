import { useState } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { listAssessments, listStructure, type Subject, type TeachingAssignment } from '../api/client'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'
import { EntryGrid } from './marks/EntryGrid'
import { useSectionNames } from './people/sections'

/** Marks: choose an assessment and a section, then enter marks on the grid. */
export function Marks() {
  const t = useT()
  const search = useSearch({ from: '/marks' })
  const { current, loading } = useOrg()
  const orgId = current?.id ?? ''
  const roles = current?.roles ?? []
  const leads = roles.some((r) => r === 'admin' || r === 'coordinator' || r === 'principal')
  const names = useSectionNames(orgId)
  const assessments = useQuery({ queryKey: ['assessments', orgId], queryFn: ({ signal }) => listAssessments(orgId, {}, signal), enabled: !!orgId })
  const subjects = useQuery({ queryKey: ['structure', orgId, 'subjects', {}], queryFn: ({ signal }) => listStructure<Subject>(orgId, 'subjects', {}, signal), enabled: !!orgId }).data ?? []
  const mine = useQuery({
    queryKey: ['structure', orgId, 'teaching-assignments', { staffId: current?.staffId }],
    queryFn: ({ signal }) => listStructure<TeachingAssignment>(orgId, 'teaching-assignments', { staffId: current!.staffId! }, signal),
    enabled: !!orgId && !leads && !!current?.staffId,
  }).data
  const [picked, setPicked] = useState(search.a ?? '')

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!orgId) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })}.</p>

  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? ''
  const sectionName = (id: string) => {
    const s = names.byId(id)
    return s ? names.name(s) : ''
  }
  // Each assessment once per section the person works with.
  const entries = (assessments.data ?? []).flatMap((a) =>
    a.sectionIds
      .filter((s) => leads || mine?.some((m) => m.sectionId === s && (!m.subjectId || m.subjectId === a.subjectId)))
      .map((s) => ({ key: `${a.id}/${s}`, a, sectionId: s })),
  )
  const entry = entries.find((e) => e.key === picked) ?? entries[0]

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Marks</h1>
          <p className="mt-1 max-w-2xl text-muted">A blank is pending and never zero. Type AB, EX or NA, or press A, E or N, for absent, exempt or not applicable.</p>
        </div>
      </div>

      {assessments.isPending ? (
        <p className="text-sm text-muted">Loading</p>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center">
          <p className="font-bold">No assessments for your {t('group.section', { count: 2, lower: true })} yet</p>
          <p className="mt-1 text-sm text-muted">Create one first; then its marks are entered here.</p>
          <Link to="/exams" className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            Create an assessment
          </Link>
        </div>
      ) : (
        <>
          <label className="flex max-w-xl flex-col gap-1 text-sm font-semibold">
            Assessment
            <select className="rounded-md border border-line bg-white px-2 py-1.5 font-normal" value={entry?.key} onChange={(e) => setPicked(e.target.value)}>
              {entries.map((e) => (
                <option key={e.key} value={e.key}>
                  {subjectName(e.a.subjectId)}, {e.a.title}, {sectionName(e.sectionId)}
                  {e.a.status === 'locked' ? ' (locked)' : ''}
                </option>
              ))}
            </select>
          </label>
          {entry && (
            <EntryGrid
              key={entry.key}
              orgId={orgId}
              assessmentId={entry.a.id}
              sectionId={entry.sectionId}
              sectionName={sectionName(entry.sectionId)}
              subjectName={subjectName(entry.a.subjectId)}
            />
          )}
        </>
      )}
    </div>
  )
}

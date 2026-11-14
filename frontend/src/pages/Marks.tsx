import { useState } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMarksBy, listAssessments, listStructure, putMarksBy, type Subject, type TeachingAssignment } from '../api/client'
import { ApiError } from '../api/problem'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'
import { EntryGrid } from './marks/EntryGrid'
import { PAPER } from './papers/types'
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
  const [by, setBy] = useState('')

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
          {roles.includes('admin') ? (
            <>
              <p className="mt-1 text-sm text-muted">Create one first; then its marks are entered here.</p>
              <Link to="/exams" className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
                Create an assessment
              </Link>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">Your administrator creates them; they appear here as soon as they do.</p>
          )}
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
          {entry && <MarksByChoice orgId={orgId} assessmentId={entry.a.id} onChange={setBy} />}
          {entry && (
            <EntryGrid
              key={`${entry.key}/${by}`}
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

const BY: Record<string, string> = { questions: 'question by question', bits: 'bit by bit, where a question has bits', sections: `${PAPER.section} by ${PAPER.section}`, total: 'as one total' }

/**
 * How marks are entered for an assessment with a final paper: a mark for
 * each question, for each bit of a question, for each section of the
 * paper, or the total only. An
 * administrator chooses, and only until the first mark is entered; the
 * holistic report is as detailed as this.
 */
type By = Parameters<typeof putMarksBy>[2]

function MarksByChoice({ orgId, assessmentId, onChange }: { orgId: string; assessmentId: string; onChange: (marksBy: string) => void }) {
  const qc = useQueryClient()
  const by = useQuery({ queryKey: ['marks-by', orgId, assessmentId], queryFn: ({ signal }) => getMarksBy(orgId, assessmentId, signal), retry: false })
  const change = useMutation({
    mutationFn: (v: By) => putMarksBy(orgId, assessmentId, v),
    onSuccess: (v) => {
      qc.setQueryData(['marks-by', orgId, assessmentId], v)
      void qc.invalidateQueries({ queryKey: ['assessments', orgId] })
      void qc.invalidateQueries({ queryKey: ['marks', orgId, assessmentId] })
      void qc.invalidateQueries({ queryKey: ['layout', orgId, assessmentId] })
      onChange(v.marksBy) // the grid is laid out afresh
    },
  })
  const v = by.data
  if (!v?.marksBy) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm">
      {v.mayChange ? (
        <label className="flex items-center gap-2 font-semibold">
          Marks are entered
          <select className="rounded-md border border-line bg-white px-2 py-1 font-normal" value={v.marksBy} disabled={change.isPending} onChange={(e) => change.mutate(e.target.value as By)}>
            {Object.entries(BY).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span>
          Marks are entered <strong>{BY[v.marksBy]}</strong>.
        </span>
      )}
      <span className="text-xs text-muted">
        {v.mayChange
          ? 'Your choice as administrator, until the first mark is entered. The holistic report is as detailed as this.'
          : v.marked
            ? 'Fixed, since marks have been entered.'
            : 'An administrator sets this before marks are entered.'}
      </span>
      {change.error && (
        <span role="alert" className="font-semibold text-red-700">
          {change.error instanceof ApiError ? change.error.message : 'That did not work. Try again.'}
        </span>
      )}
    </div>
  )
}

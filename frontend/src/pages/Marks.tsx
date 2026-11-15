import { useState } from 'react'
import { Loading } from '../components/Loading'
import { Link, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMarksBy, listStructure, putMarksBy, type Subject, type TeachingAssignment } from '../api/client'
import { ApiError } from '../api/problem'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'
import { EntryGrid } from './marks/EntryGrid'
import { AssessmentSelect } from './papers/AssessmentSelect'
import { usePaperAssessments } from './papers/assessments'
import { PAPER } from './papers/types'
import { useSectionNames } from './people/sections'

/**
 * Marks: choose the exam by year, term, class and subject, then the
 * section, and enter marks on the grid. A teacher sees only the sections
 * and subjects they teach.
 */
export function Marks() {
  const t = useT()
  const search = useSearch({ from: '/marks' })
  const { current, loading } = useOrg()
  const orgId = current?.id ?? ''
  const roles = current?.roles ?? []
  const leads = roles.some((r) => r === 'admin' || r === 'coordinator' || r === 'principal')
  const names = useSectionNames(orgId)
  const { choices, pending, preferred } = usePaperAssessments()
  const subjects = useQuery({ queryKey: ['structure', orgId, 'subjects', {}], queryFn: ({ signal }) => listStructure<Subject>(orgId, 'subjects', {}, signal), enabled: !!orgId }).data ?? []
  const mine = useQuery({
    queryKey: ['structure', orgId, 'teaching-assignments', { staffId: current?.staffId }],
    queryFn: ({ signal }) => listStructure<TeachingAssignment>(orgId, 'teaching-assignments', { staffId: current!.staffId! }, signal),
    enabled: !!orgId && !leads && !!current?.staffId,
  }).data
  const [picked, setPicked] = useState(search.a ?? '')
  const [by, setBy] = useState('')

  if (loading) return <Loading page />
  if (!orgId) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })}.</p>

  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? ''
  const sectionName = (id: string) => {
    const s = names.byId(id)
    return s ? names.name(s) : ''
  }
  // Each assessment once per section the person works with, in the order
  // the exam lists put them: year, term, class, subject, exam.
  const entries = choices.flatMap(({ a }) =>
    a.sectionIds
      .filter((s) => leads || mine?.some((m) => m.sectionId === s && (!m.subjectId || m.subjectId === a.subjectId)))
      .map((s) => ({ key: `${a.id}/${s}`, a, sectionId: s })),
  )
  const entry = entries.find((e) => e.key === picked) ?? entries.find((e) => e.a.id === (picked.split('/')[0] || preferred)) ?? entries[0]
  const here = entries.filter((e) => e.a.id === entry?.a.id)
  // Another exam keeps the same section when it has it.
  const choose = (assessmentId: string) =>
    setPicked((entries.find((e) => e.a.id === assessmentId && e.sectionId === entry?.sectionId) ?? entries.find((e) => e.a.id === assessmentId))?.key ?? '')

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Marks</h1>
          <p className="mt-1 max-w-2xl text-muted">A blank is pending and never zero. Type AB, EX or NA, or press A, E or N, for absent, exempt or not applicable.</p>
        </div>
      </div>

      {pending ? (
        <Loading />
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
          <AssessmentSelect choices={choices.filter((c) => entries.some((e) => e.a.id === c.a.id))} value={entry?.a.id ?? ''} onChange={choose}>
            <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold">
              {t('group.section')}
              <select
                aria-label={t('group.section')}
                className="w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm font-normal disabled:bg-canvas disabled:text-muted"
                value={entry?.key}
                disabled={here.length < 2}
                onChange={(e) => setPicked(e.target.value)}
              >
                {here.map((e) => (
                  <option key={e.key} value={e.key}>
                    {sectionName(e.sectionId)}
                  </option>
                ))}
              </select>
            </label>
          </AssessmentSelect>
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

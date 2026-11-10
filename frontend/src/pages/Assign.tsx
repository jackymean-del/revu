import { useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { getPaper, listPapers, listStudents, putPaperAssignments, type Paper, type PaperAssignment } from '../api/client'
import { ApiError } from '../api/problem'
import { Icon } from '../components/Icon'
import { useT } from '../lib/terminology/terms-context'
import { AssessmentSelect } from './papers/AssessmentSelect'
import { usePaperAssessments } from './papers/assessments'

const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const field = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'

interface Plan {
  paper: string
  sitOn: string
  /** Students who sit another set than their group's, by student id. */
  others: Record<string, string>
}

/** Where things stand now, read from every set's assignments. */
function current(papers: Paper[], sectionIds: string[]): Record<string, Plan> {
  const out: Record<string, Plan> = Object.fromEntries(sectionIds.map((s) => [s, { paper: '', sitOn: '', others: {} }]))
  for (const p of papers)
    for (const x of p.assignments) {
      const plan = out[x.sectionId]
      if (!plan) continue
      if (x.studentId) plan.others[x.studentId] = p.id
      else Object.assign(plan, { paper: p.id, sitOn: x.sitOn ?? '' })
    }
  return out
}

/**
 * Assign paper (exam step 2, B4.1): which set each group sits and on what
 * date; a few students may sit another set. Only final sets are given out.
 */
export function Assign() {
  const t = useT()
  const search = useSearch({ from: '/assign' })
  const navigate = useNavigate({ from: '/assign' })
  const { orgId, loading, pending, choices, sectionName } = usePaperAssessments()
  const choice = choices.find((c) => c.a.id === search.a) ?? choices[0]
  const a = choice?.a
  const id = a?.id ?? ''
  const papers = useQuery({ queryKey: ['papers', orgId, id], queryFn: ({ signal }) => listPapers(orgId, id, signal), enabled: !!(orgId && id) })
  const finals = (papers.data ?? []).filter((p) => p.status === 'final')
  const full = useQueries({ queries: finals.map((p) => ({ queryKey: ['paper', orgId, p.id], queryFn: ({ signal }: { signal: AbortSignal }) => getPaper(orgId, p.id, signal) })) })
  const loaded = full.every((q) => q.data) ? full.map((q) => q.data!) : null

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!orgId) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })}.</p>

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Assign paper</h1>
        <p className="mt-1 max-w-3xl text-muted">
          Give each {t('group.section', { lower: true })} its set and date. With two or more sets, a few {t('person.student', { count: 2, lower: true })} can sit another one, for example
          alternate seats.
        </p>
      </div>
      {pending ? (
        <p className="text-sm text-muted">Loading</p>
      ) : !a ? (
        <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-muted">No assessments yet.</p>
      ) : (
        <>
          <AssessmentSelect choices={choices} value={id} onChange={(id) => void navigate({ search: { a: id } })} />
          {papers.isPending ? (
            <p className="text-sm text-muted">Loading</p>
          ) : finals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center">
              <p className="font-bold">No final set yet</p>
              <p className="mt-1 text-sm text-muted">Make the paper and finalise a set first.</p>
              <Link to="/papers" search={{ a: id, tab: 'sets' }} className={`${primary} mt-4 inline-flex items-center gap-2`}>
                Create question paper
                <Icon name="arrow" size={16} />
              </Link>
            </div>
          ) : !loaded ? (
            <p className="text-sm text-muted">Loading</p>
          ) : (
            <AssignTable key={id} orgId={orgId} assessmentId={id} sectionIds={a.sectionIds} papers={loaded} sectionName={sectionName} />
          )}
        </>
      )}
    </div>
  )
}

function AssignTable({ orgId, assessmentId, sectionIds, papers, sectionName }: { orgId: string; assessmentId: string; sectionIds: string[]; papers: Paper[]; sectionName: (id: string) => string }) {
  const t = useT()
  const qc = useQueryClient()
  const [plan, setPlan] = useState(() => {
    const now = current(papers, sectionIds)
    // With one set, every group sits it unless already decided.
    if (papers.length === 1) for (const s of sectionIds) now[s].paper ||= papers[0].id
    return now
  })
  const [open, setOpen] = useState('')
  const [saved, setSaved] = useState(false)
  const set = (s: string, change: Partial<Plan>) => (setPlan((p) => ({ ...p, [s]: { ...p[s], ...change } })), setSaved(false))
  const save = useMutation({
    mutationFn: async () => {
      for (const p of papers) {
        const list: PaperAssignment[] = []
        for (const s of sectionIds) {
          const x = plan[s]
          if (x.paper === p.id) list.push({ sectionId: s, sitOn: x.sitOn || undefined })
          for (const [student, paper] of Object.entries(x.others)) if (paper === p.id && paper !== x.paper) list.push({ sectionId: s, studentId: student, sitOn: x.sitOn || undefined })
        }
        await putPaperAssignments(orgId, p.id, list)
      }
    },
    onSuccess: () => {
      setSaved(true)
      for (const p of papers) void qc.invalidateQueries({ queryKey: ['paper', orgId, p.id] })
      void qc.invalidateQueries({ queryKey: ['setup', orgId] })
    },
  })
  const setName = (id: string) => `Set ${papers.find((p) => p.id === id)?.set ?? ''}`

  return (
    <section aria-label="Who sits which set" className="space-y-3">
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
        {sectionIds.map((s) => {
          const x = plan[s]
          const others = Object.values(x.others).filter((p) => p && p !== x.paper).length
          return (
            <li key={s} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-32 flex-1 font-bold">{sectionName(s)}</p>
                <select aria-label={`${sectionName(s)} set`} className={field} value={x.paper} onChange={(e) => set(s, { paper: e.target.value })}>
                  <option value="">Not yet</option>
                  {papers.map((p) => (
                    <option key={p.id} value={p.id}>
                      Set {p.set}
                    </option>
                  ))}
                </select>
                <input type="date" aria-label={`${sectionName(s)} date`} className={field} value={x.sitOn} onChange={(e) => set(s, { sitOn: e.target.value })} />
                {papers.length > 1 && (
                  <button type="button" aria-expanded={open === s} className="text-sm font-semibold text-brand" onClick={() => setOpen(open === s ? '' : s)}>
                    {others ? `${others} on another set` : 'Some on another set'}
                  </button>
                )}
              </div>
              {open === s && <Students orgId={orgId} sectionId={s} papers={papers} base={x.paper} others={x.others} onChange={(o) => set(s, { others: o })} setName={setName} />}
            </li>
          )
        })}
      </ul>
      {save.error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {save.error instanceof ApiError ? save.error.message : 'That did not save.'}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="button" className={primary} disabled={save.isPending} onClick={() => save.mutate()}>
          Save
        </button>
        {saved && (
          <>
            <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
              <Icon name="check" size={16} />
              Saved
            </p>
            <Link to="/marks" search={{ a: `${assessmentId}/${sectionIds[0]}` }} className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-brand">
              Next: enter marks for its {t('group.section', { count: 2, lower: true })}
              <Icon name="arrow" size={15} />
            </Link>
          </>
        )}
      </div>
    </section>
  )
}

function Students({ orgId, sectionId, papers, base, others, onChange, setName }: {
  orgId: string
  sectionId: string
  papers: Paper[]
  base: string
  others: Record<string, string>
  onChange: (o: Record<string, string>) => void
  setName: (id: string) => string
}) {
  const t = useT()
  const students = useQuery({ queryKey: ['students', orgId, { sectionId }], queryFn: ({ signal }) => listStudents(orgId, { sectionId, limit: '200' }, signal) })
  if (!students.data) return <p className="text-sm text-muted">Loading</p>
  const list = students.data.items
  // Alternate seats: every second one on the next set.
  const alternate = () => {
    const i = papers.findIndex((p) => p.id === base)
    const next = papers[(i + 1) % papers.length].id
    onChange(Object.fromEntries(list.map((s, j) => [s.id, j % 2 ? next : base])))
  }
  return (
    <div className="rounded-xl bg-canvas p-3">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="flex-1 text-muted">
          {list.length} {t('person.student', { count: list.length, lower: true })}; each sits {base ? setName(base) : 'the set chosen above'} unless changed here.
        </span>
        {base && (
          <button type="button" className="font-semibold text-brand" onClick={alternate}>
            Alternate seats
          </button>
        )}
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => (
          <li key={s.id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 text-sm">
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <select aria-label={`${s.name} set`} className="rounded border border-line px-1 py-0.5 text-sm" value={others[s.id] || base} onChange={(e) => onChange({ ...others, [s.id]: e.target.value })}>
              {papers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.set}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  )
}

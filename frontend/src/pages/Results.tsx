import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSectionResults, listStructure, recomputeResults, type Period, type StudentResult, type Subject, type TeachingAssignment } from '../api/client'
import { ApiError } from '../api/problem'
import { STATE, reasonText, type ResultState } from '../lib/results'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'
import { useSectionNames } from './people/sections'
import { Explain } from './results/Explain'

const select = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const TONE = { ok: 'bg-emerald-50 text-emerald-800', warn: 'bg-amber-50 text-amber-900', stop: 'bg-red-50 text-red-800', quiet: 'bg-mist text-muted' }

export function StateBadge({ state }: { state: ResultState }) {
  const s = STATE[state]
  return (
    <span title={s.help} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[s.tone]}`}>
      {s.label}
    </span>
  )
}

/** Results: a section's results in one subject, each opening to how it was worked out. */
export function Results() {
  const t = useT()
  const qc = useQueryClient()
  const { current, loading } = useOrg()
  const orgId = current?.id ?? ''
  const roles = current?.roles ?? []
  const leads = roles.some((r) => r === 'admin' || r === 'coordinator' || r === 'principal')
  const names = useSectionNames(orgId)
  const periods = useQuery({ queryKey: ['structure', orgId, 'periods', {}], queryFn: ({ signal }) => listStructure<Period>(orgId, 'periods', {}, signal), enabled: !!orgId }).data ?? []
  const subjects = useQuery({ queryKey: ['structure', orgId, 'subjects', {}], queryFn: ({ signal }) => listStructure<Subject>(orgId, 'subjects', {}, signal), enabled: !!orgId }).data ?? []
  const mine = useQuery({
    queryKey: ['structure', orgId, 'teaching-assignments', { staffId: current?.staffId }],
    queryFn: ({ signal }) => listStructure<TeachingAssignment>(orgId, 'teaching-assignments', { staffId: current!.staffId! }, signal),
    enabled: !!orgId && !leads && !!current?.staffId,
  }).data
  const [pick, setPick] = useState({ sectionId: '', periodId: '', subjectId: '' })
  const [open, setOpen] = useState<StudentResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const latestYear = [...names.years].sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0]?.id ?? ''
  const sections = names.sections.filter((s) => s.yearId === latestYear && (leads || mine?.some((m) => m.sectionId === s.id)))
  const sectionId = pick.sectionId || sections[0]?.id || ''
  const yearOf = names.byId(sectionId)?.yearId ?? latestYear
  const yearPeriods = periods.filter((p) => p.yearId === yearOf).sort((a, b) => a.seq - b.seq)
  const periodId = pick.periodId || yearPeriods[0]?.id || ''
  const taught = leads || mine?.some((m) => m.sectionId === sectionId && !m.subjectId) ? subjects : subjects.filter((s) => mine?.some((m) => m.sectionId === sectionId && m.subjectId === s.id))
  const subjectId = pick.subjectId || taught[0]?.id || ''
  const q = { sectionId, periodId, subjectId }
  const ready = !!(orgId && sectionId && periodId && subjectId)

  const results = useQuery({
    queryKey: ['results', orgId, q],
    queryFn: ({ signal }) => getSectionResults(orgId, q, signal),
    enabled: ready,
    // A stale result is replaced within seconds; look again until it is.
    refetchInterval: (query) => (query.state.data?.counts.stale ? 2000 : false),
  })

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!orgId) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })}.</p>

  const data = results.data
  const names_ = Object.fromEntries((data?.components ?? []).map((c) => [c.code, c.name]))
  const subjectName = subjects.find((s) => s.id === subjectId)?.name ?? ''

  async function recompute() {
    setBusy(true)
    setNote('')
    try {
      const done = await recomputeResults(orgId, q)
      setNote(`Worked out ${done.computed} ${done.computed === 1 ? 'result' : 'results'} again.`)
      await qc.invalidateQueries({ queryKey: ['results', orgId] })
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : 'Not done. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Results</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Worked out by your published scheme. Absent is never zero, and every number opens to the marks and rules behind it.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('group.section')}
          <select className={select} value={sectionId} onChange={(e) => setPick({ sectionId: e.target.value, periodId: '', subjectId: '' })}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {names.name(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('period.term')}
          <select className={select} value={periodId} onChange={(e) => setPick({ ...pick, sectionId, periodId: e.target.value })}>
            {yearPeriods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('course.subject')}
          <select className={select} value={subjectId} onChange={(e) => setPick({ ...pick, sectionId, periodId, subjectId: e.target.value })}>
            {taught.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {data?.access === 'full' && (
          <button type="button" disabled={busy} onClick={() => void recompute()} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50">
            Work out again now
          </button>
        )}
        {note && (
          <p role="status" className="text-sm text-muted">
            {note}
          </p>
        )}
      </div>

      {!ready ? (
        <p className="text-sm text-muted">
          Choose a {t('group.section', { lower: true })}, {t('period.term', { lower: true })} and {t('course.subject', { lower: true })} you work with.
        </p>
      ) : results.isPending ? (
        <p className="text-sm text-muted">Loading</p>
      ) : results.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {results.error instanceof ApiError ? results.error.message : 'These results could not be loaded.'}
        </p>
      ) : data && !data.scheme ? (
        <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted">
          No published scheme applies to this {t('course.subject', { lower: true })} yet. An administrator sets one under Schemes.
        </p>
      ) : (
        data && (
          <>
            <ul aria-label="Counts" className="flex flex-wrap gap-2 text-sm">
              {(
                [
                  ['complete', data.counts.complete],
                  ['provisional', data.counts.provisional],
                  ['blocked', data.counts.blocked],
                  ['not_assessed', data.counts.notAssessed],
                ] as [ResultState, number][]
              ).map(([s, n]) => (
                <li key={s} className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5">
                  <StateBadge state={s} /> <b>{n}</b>
                </li>
              ))}
              {data.counts.stale > 0 && (
                <li role="status" className="rounded-lg border border-line bg-white px-3 py-1.5 text-muted">
                  Updating {data.counts.stale}
                </li>
              )}
            </ul>
            {data.access === 'counts' ? (
              <p className="text-sm text-muted">Your role shows how many results are in each state. The marks stay with the staff who teach them (confidential by default).</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-line bg-white">
                <table className="w-full min-w-max text-sm">
                  <caption className="sr-only">
                    {subjectName} results, {data.scheme?.name} version {data.scheme?.version}
                  </caption>
                  <thead className="bg-mist text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2">
                        {t('person.roll_no')}
                      </th>
                      <th scope="col" className="px-3 py-2">
                        {t('person.student')}
                      </th>
                      {data.components.map((c) => (
                        <th key={c.code} scope="col" className="px-3 py-2 text-right" title={c.name}>
                          {c.name} <span className="font-normal normal-case">/{c.max}</span>
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-2 text-right">
                        Total
                      </th>
                      <th scope="col" className="px-3 py-2 text-right">
                        %
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Band
                      </th>
                      <th scope="col" className="px-3 py-2">
                        State
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.studentId} className="border-t border-line">
                        <td className="px-3 py-2 tabular-nums text-muted">{r.rollNo}</td>
                        <th scope="row" className="px-3 py-2 text-left font-semibold">
                          {r.result ? (
                            <button type="button" className="text-left text-brand underline-offset-2 hover:underline" onClick={() => setOpen(r)}>
                              {r.name}
                            </button>
                          ) : (
                            r.name
                          )}
                        </th>
                        {data.components.map((c) => {
                          const cell = r.components.find((x) => x.code === c.code)
                          return (
                            <td key={c.code} className="px-3 py-2 text-right tabular-nums" title={cell && cell.state !== 'complete' ? STATE[cell.state].label : undefined}>
                              {cell?.value ?? <span className="text-subtle">-</span>}
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {r.result?.value ? (
                            <button type="button" className="text-brand underline-offset-2 hover:underline" onClick={() => setOpen(r)} aria-label={`How ${r.name}'s ${r.result.value} was worked out`}>
                              {r.result.value}
                              <span className="font-normal text-muted">/{r.result.max}</span>
                            </button>
                          ) : (
                            <span className="text-subtle">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.result?.pct ?? ''}</td>
                        <td className="px-3 py-2 font-semibold">{r.result?.grade ?? ''}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StateBadge state={r.result?.state ?? 'not_assessed'} />
                            {r.stale && <span className="text-xs text-muted">updating</span>}
                          </div>
                          {r.result?.reason && r.result.state !== 'complete' && <p className="mt-1 max-w-xs text-xs text-muted">{reasonText(r.result.reason, names_)}</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )
      )}
      {open && <Explain orgId={orgId} student={open} periodId={periodId} subjectId={subjectId} subjectName={subjectName} onClose={() => setOpen(null)} />}
    </div>
  )
}

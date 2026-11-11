import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createReexam, previewReexam, type ReexamCriteria } from '../../api/client'
import { ApiError } from '../../api/problem'
import { useT } from '../../lib/terminology/terms-context'
import { AssessmentSelect } from '../papers/AssessmentSelect'
import type { Choice } from '../papers/assessments'
import { ABSENT_RULES, POLICIES } from './status'

const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const field = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? undefined : Number(s))

/**
 * Plan a re-exam on one page: the assessment, the rules that suggest who
 * sits it (any one is enough), the students ticked with their reasons, and
 * how the new mark counts.
 */
export function ReexamPlan({ orgId, sourceId, choices, onSource, onMade, onCancel }: {
  orgId: string
  sourceId: string
  choices: Choice[]
  onSource: (id: string) => void
  onMade: (id: string) => void
  onCancel: () => void
}) {
  const t = useT()
  const qc = useQueryClient()
  const id = choices.some((c) => c.a.id === sourceId) ? sourceId : (choices[0]?.a.id ?? '')
  const [rule, setRule] = useState({ below: '40', useBelow: true, from: '40', to: '50', useRange: false, absent: true, incomplete: false })
  const criteria: ReexamCriteria = {
    below: rule.useBelow ? num(rule.below) : undefined,
    from: rule.useRange ? num(rule.from) : undefined,
    to: rule.useRange ? num(rule.to) : undefined,
    absent: rule.absent,
    incomplete: rule.incomplete,
  }
  const preview = useQuery({
    queryKey: ['reexam-preview', orgId, id, criteria],
    queryFn: ({ signal }) => previewReexam(orgId, { sourceId: id, criteria }, signal),
    enabled: !!(orgId && id),
    placeholderData: keepPreviousData,
  })
  // Ticks and reasons the person changed; the rules decide the rest.
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [details, setDetails] = useState({ title: '', heldOn: '', policy: 'higher', absentRule: 'keep' })
  const sitters = preview.data?.sitters ?? []
  const isTicked = (s: (typeof sitters)[number]) => ticked[s.studentId] ?? s.suggested
  const chosen = sitters.filter(isTicked)
  const missingReason = chosen.filter((s) => !s.suggested && !(reasons[s.studentId] ?? '').trim())
  const make = useMutation({
    mutationFn: () =>
      createReexam(orgId, {
        sourceId: id,
        criteria,
        title: details.title,
        heldOn: details.heldOn,
        policy: details.policy as 'higher',
        absentRule: details.absentRule as 'keep',
        students: chosen.map((s) => ({ studentId: s.studentId, reason: s.suggested ? s.reason : (reasons[s.studentId] ?? '').trim(), byHand: !s.suggested })),
      }),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['reexams', orgId] })
      void qc.invalidateQueries({ queryKey: ['assessments', orgId] })
      onMade(d.id)
    },
  })
  const [tried, setTried] = useState(false)
  const reset = () => (setTicked({}), setReasons({}))

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Plan a re-exam</h1>
          <p className="mt-1 max-w-3xl text-muted">Choose the assessment, set the rules, check who is ticked, and choose how the new mark counts.</p>
        </div>
        <button type="button" className={button} onClick={onCancel}>
          Back to re-exams
        </button>
      </div>

      <section aria-label="Who sits it" className="space-y-3 rounded-2xl border border-line bg-white p-4">
        <AssessmentSelect choices={choices} value={id} onChange={(v) => (reset(), onSource(v))} />
        <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <legend className="mb-1 font-semibold">Suggest those who are (any one is enough)</legend>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={rule.useBelow} onChange={(e) => (setRule({ ...rule, useBelow: e.target.checked }), reset())} />
            below
            <input aria-label="Below percentage" inputMode="decimal" className={`${field} w-16 text-right`} value={rule.below} onChange={(e) => (setRule({ ...rule, below: e.target.value }), reset())} />%
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={rule.useRange} onChange={(e) => (setRule({ ...rule, useRange: e.target.checked }), reset())} />
            between
            <input aria-label="Range from" inputMode="decimal" className={`${field} w-16 text-right`} value={rule.from} onChange={(e) => (setRule({ ...rule, from: e.target.value }), reset())} />
            and
            <input aria-label="Range to" inputMode="decimal" className={`${field} w-16 text-right`} value={rule.to} onChange={(e) => (setRule({ ...rule, to: e.target.value }), reset())} />%
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={rule.absent} onChange={(e) => (setRule({ ...rule, absent: e.target.checked }), reset())} />
            absent
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={rule.incomplete} onChange={(e) => (setRule({ ...rule, incomplete: e.target.checked }), reset())} />
            with parts unmarked
          </label>
        </fieldset>
        {preview.isError ? (
          <p role="alert" className="text-sm font-semibold text-red-700">
            {preview.error instanceof ApiError ? preview.error.message : 'The list could not be loaded.'}
          </p>
        ) : !preview.data ? (
          <p className="text-sm text-muted">Loading</p>
        ) : (
          <>
            <p role="status" className="text-sm">
              <b>{chosen.length}</b> of {sitters.length} ticked. Tick anyone else and say why; untick anyone the rules suggest.
            </p>
            <div className="relative max-h-[50vh] overflow-auto rounded-xl border border-line">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-3 py-2 font-semibold">Sits it</th>
                    <th className="px-2 py-2 font-semibold">{t('person.student')}</th>
                    <th className="px-2 py-2 font-semibold">{t('group.section')}</th>
                    <th className="px-2 py-2 text-right font-semibold">Result</th>
                    <th className="px-2 py-2 font-semibold">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {sitters.map((s) => {
                    const on = isTicked(s)
                    const need = on && !s.suggested
                    return (
                      <tr key={s.studentId} className={`border-b border-line/60 ${on ? 'bg-mist/40' : ''}`}>
                        <td className="px-3 py-1.5">
                          <input type="checkbox" aria-label={`${s.name} sits it`} checked={on} onChange={(e) => setTicked({ ...ticked, [s.studentId]: e.target.checked })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="mr-1.5 text-xs tabular-nums text-muted">{s.rollNo}</span>
                          {s.name}
                        </td>
                        <td className="px-2 py-1.5 text-muted">{s.section}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {s.state === 'absent' ? 'absent' : s.state === 'excused' ? 'excused' : s.state === 'none' ? 'no marks' : s.pct !== undefined ? `${s.pct}%` : ''}
                          {s.state === 'incomplete' && <span className="text-xs text-muted"> so far</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          {s.suggested ? (
                            <span className="text-sm">{s.reason}</span>
                          ) : need ? (
                            <input
                              aria-label={`Why ${s.name} sits it`}
                              placeholder="Say why"
                              maxLength={200}
                              className={`${field} w-full ${tried && !(reasons[s.studentId] ?? '').trim() ? 'ring-2 ring-red-300' : ''}`}
                              value={reasons[s.studentId] ?? ''}
                              onChange={(e) => setReasons({ ...reasons, [s.studentId]: e.target.value })}
                            />
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section aria-label="Details" className="space-y-3 rounded-2xl border border-line bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Title
            <input className={field} maxLength={120} placeholder={`${preview.data?.title ?? ''}, re-exam`} value={details.title} onChange={(e) => setDetails({ ...details, title: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Date
            <input type="date" className={field} value={details.heldOn} onChange={(e) => setDetails({ ...details, heldOn: e.target.value })} />
          </label>
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-semibold">How the new mark counts</legend>
          {POLICIES.map((p) => (
            <label key={p.key} className="flex items-start gap-2 text-sm">
              <input type="radio" name="policy" className="mt-1" checked={details.policy === p.key} onChange={() => setDetails({ ...details, policy: p.key })} />
              <span>
                <b>{p.label}</b> <span className="text-muted">{p.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap items-center gap-4 text-sm">
          <legend className="mb-1 font-semibold">Absent from the re-exam (never zero)</legend>
          {ABSENT_RULES.map((r) => (
            <label key={r.key} className="flex items-center gap-1.5">
              <input type="radio" name="absent" checked={details.absentRule === r.key} onChange={() => setDetails({ ...details, absentRule: r.key })} />
              {r.label}
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-muted">Nothing counts in results until the policy is approved and applied, after the marks are in.</p>
      </section>

      {tried && (chosen.length === 0 || missingReason.length > 0) && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {chosen.length === 0 ? 'Tick at least one name.' : `Say why for ${missingReason.map((s) => s.name).join(', ')}.`}
        </p>
      )}
      {make.error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {make.error instanceof ApiError ? make.error.message : 'The re-exam was not made. Try again.'}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className={primary}
          disabled={make.isPending || !id}
          onClick={() => {
            setTried(true)
            if (chosen.length > 0 && missingReason.length === 0) make.mutate()
          }}
        >
          {make.isPending ? 'Making the re-exam' : `Make the re-exam for ${chosen.length}`}
        </button>
        <button type="button" className={button} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

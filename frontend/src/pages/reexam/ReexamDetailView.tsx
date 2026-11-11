import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getReexam, putReexamRule, stepReexam, type ReexamDetail } from '../../api/client'
import { ApiError } from '../../api/problem'
import { Icon } from '../../components/Icon'
import { useT } from '../../lib/terminology/terms-context'
import { ABSENT_RULES, POLICIES, STATUS } from './status'

const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const field = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'

const shown = (o: { state: string; pct: string; grade: string }) =>
  o.state === 'complete' ? `${o.pct}%${o.grade ? ` ${o.grade}` : ''}` : o.state === 'blocked' ? 'withheld' : o.state === 'provisional' ? `${o.pct}% so far` : 'pending'

/**
 * One re-exam: the next thing to do, who sits it with the original and the
 * re-exam marks, and each result before and after under the policy, worked
 * out live; approving and applying are the last two steps.
 */
export function ReexamDetailView({ orgId, id, sectionName, onBack }: { orgId: string; id: string; sectionName: (id: string) => string; onBack: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['reexam', orgId, id], queryFn: ({ signal }) => getReexam(orgId, id, signal) })
  const done = (d: ReexamDetail) => {
    qc.setQueryData(['reexam', orgId, id], d)
    void qc.invalidateQueries({ queryKey: ['reexams', orgId] })
    void qc.invalidateQueries({ queryKey: ['setup', orgId] })
  }
  const rule = useMutation({ mutationFn: (r: { policy: string; absentRule: string }) => putReexamRule(orgId, id, r as { policy: 'higher'; absentRule: 'keep' }), onSuccess: done })
  const step = useMutation({ mutationFn: (s: 'approve' | 'apply') => stepReexam(orgId, id, s), onSuccess: done })
  const [note, setNote] = useState('')
  const d = q.data
  if (q.isError)
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p role="alert" className="text-sm font-semibold text-red-700">
          {q.error instanceof ApiError ? q.error.message : 'This re-exam could not be loaded.'}
        </p>
      </div>
    )
  if (!d) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>

  const firstSection = d.sectionIds[0]
  const unmarked = d.sitting - d.marked
  const next =
    unmarked > 0
      ? `Enter the re-exam marks: ${unmarked} of ${d.sitting} still to enter.`
      : d.status === 'draft'
        ? d.canApprove
          ? 'Check the preview below, then approve the policy.'
          : 'The marks are in; an administrator or coordinator approves the policy.'
        : d.status === 'approved'
          ? d.canApprove
            ? 'Apply it: results are worked out again with the re-exam counted.'
            : 'Approved; an administrator or coordinator applies it.'
          : 'Applied: results now count the re-exam under this policy.'
  const err = (rule.error ?? step.error) as Error | null

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {d.subject}, {d.title}
          </h1>
          <p className="mt-1 text-muted">
            Attempt {d.attempt} of {d.sourceTitle} · {d.sectionIds.map(sectionName).join(', ')}
            {d.heldOn ? ` · ${d.heldOn}` : ''}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS[d.status].className}`}>{STATUS[d.status].text}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-mist px-4 py-3 text-sm">
        <span className="flex-1 font-semibold text-brand">Next: {next}</span>
        {firstSection && (
          <Link to="/marks" search={{ a: `${d.id}/${firstSection}` }} className={`${button} flex items-center gap-1.5`}>
            Enter marks
            <Icon name="arrow" size={14} />
          </Link>
        )}
        <Link to="/papers" search={{ a: d.id }} className={button}>
          Make its question paper
        </Link>
      </div>

      <section aria-label="How it counts" className="space-y-3 rounded-2xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            How the new mark counts
            <select aria-label="How the new mark counts" className={field} value={d.policy} disabled={rule.isPending} onChange={(e) => rule.mutate({ policy: e.target.value, absentRule: d.absentRule })}>
              {POLICIES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Absent from the re-exam
            <select aria-label="Absent from the re-exam" className={field} value={d.absentRule} disabled={rule.isPending} onChange={(e) => rule.mutate({ policy: d.policy, absentRule: e.target.value })}>
              {ABSENT_RULES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <p className="flex-1 text-xs text-muted">{POLICIES.find((p) => p.key === d.policy)?.hint} Changing it after approval sends it back for approval.</p>
        </div>
        <p role="status" className="text-sm">
          Under this policy: <b>{d.changes.up}</b> up, <b>{d.changes.down}</b> down, <b>{d.changes.same}</b> the same, <b>{d.changes.pending}</b> pending or withheld.
        </p>
        <div className="relative overflow-x-auto rounded-xl border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-3 py-2 font-semibold">{t('person.student')}</th>
                <th className="px-2 py-2 font-semibold">Why</th>
                <th className="px-2 py-2 text-right font-semibold">Original</th>
                <th className="px-2 py-2 text-right font-semibold">Re-exam</th>
                <th className="px-2 py-2 text-right font-semibold">Result before</th>
                <th className="px-2 py-2 text-right font-semibold">After</th>
              </tr>
            </thead>
            <tbody>
              {d.candidates.map((c) => {
                const up = c.after.state === 'complete' && (c.before.state !== 'complete' || Number(c.after.pct) > Number(c.before.pct))
                const down = c.after.state === 'complete' && c.before.state === 'complete' && Number(c.after.pct) < Number(c.before.pct)
                return (
                  <tr key={c.studentId} className="border-b border-line/60">
                    <td className="px-3 py-1.5">
                      <span className="mr-1.5 text-xs tabular-nums text-muted">{c.rollNo}</span>
                      {c.name}
                      <span className="ml-1.5 text-xs text-muted">{c.section}</span>
                    </td>
                    <td className="px-2 py-1.5 text-muted">
                      {c.reason}
                      {c.byHand && <span className="ml-1 rounded bg-canvas px-1 text-xs">by hand</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{c.state === 'absent' ? 'absent' : c.pct !== undefined ? `${c.pct}%` : ''}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {c.retake.state === 'absent' ? 'absent' : c.retake.pct !== undefined ? `${c.retake.pct}%` : <span className="text-amber-700">to enter</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted">{shown(c.before)}</td>
                    <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${up ? 'text-emerald-700' : down ? 'text-red-700' : ''}`}>{shown(c.after)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {err && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {err instanceof ApiError ? err.message : 'That did not work. Try again.'}
        </p>
      )}
      {note && (
        <p role="status" className="text-sm font-semibold text-emerald-700">
          {note}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} onClick={onBack}>
          Back to re-exams
        </button>
        {d.canApprove && d.status === 'draft' && (
          <button type="button" className={primary} disabled={step.isPending} onClick={() => step.mutate('approve', { onSuccess: () => setNote('The policy is approved.') })}>
            Approve the policy
          </button>
        )}
        {d.canApprove && d.status === 'approved' && (
          <button
            type="button"
            className={primary}
            disabled={step.isPending || unmarked > 0}
            title={unmarked > 0 ? 'Enter every re-exam mark first' : undefined}
            onClick={() => step.mutate('apply', { onSuccess: () => setNote('Applied. Results are being worked out again with the re-exam counted.') })}
          >
            Apply to results
          </button>
        )}
        {d.canApprove && d.status === 'approved' && unmarked > 0 && <span className="text-xs text-amber-800">Enter every re-exam mark or absence first.</span>}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { draftHolisticInsights, putHolisticStudent, type HolisticReport } from '../../api/client'
import { ApiError } from '../../api/problem'
import { WritingCheck } from '../../components/WritingCheck'
import { useT } from '../../lib/terminology/terms-context'

const primary = 'rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const field = 'w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm'

type Insight = HolisticReport['insights'][number]

/**
 * Each subject's insight for this child: a line for the card's first page
 * and a fuller one for the subject's own part, drafted from the term's marks
 * (with AI when it is set up), then read, changed and approved. Only
 * approved ones print.
 */
export function SubjectInsights({ orgId, report, onSaved }: { orgId: string; report: HolisticReport; onSaved: (r: HolisticReport) => void }) {
  const t = useT()
  const subject = t('course.subject')
  const base = { studentId: report.student.id, periodId: report.periodId }
  const draft = useMutation({ mutationFn: () => draftHolisticInsights(orgId, base), onSuccess: () => onSaved(report) })
  const list = report.insights ?? []
  if (list.length === 0)
    return (
      <fieldset className="space-y-1">
        <legend className="font-bold">{subject} insights</legend>
        <p className="text-sm text-muted">No marks for this child yet; insights come once assessments are marked.</p>
      </fieldset>
    )
  const drafted = list.some((x) => x.status)
  return (
    <fieldset className="space-y-3">
      <legend className="flex w-full items-center justify-between font-bold">
        {subject} insights
        <button type="button" className={button} disabled={draft.isPending} onClick={() => draft.mutate()} title="From every assessment so far; approved insights are kept as they are">
          {draft.isPending ? 'Drafting' : drafted ? 'Draft the rest again' : 'Draft insights'}
        </button>
      </legend>
      <p className="text-xs text-muted">One line each for the first page, and a fuller insight for each one's own part. Only approved insights print.</p>
      {draft.error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {draft.error instanceof ApiError ? draft.error.message : 'That did not work. Try again.'}
        </p>
      )}
      {list.map((x) => (
        <One key={`${x.subjectId}-${x.status}-${x.summary.length}-${x.detail.length}`} orgId={orgId} base={base} insight={x} onSaved={onSaved} mask={[report.student.name, ...report.student.name.split(/\s+/)]} />
      ))}
    </fieldset>
  )
}

function One({ orgId, base, insight, onSaved, mask }: { orgId: string; base: { studentId: string; periodId: string }; insight: Insight; onSaved: (r: HolisticReport) => void; mask: string[] }) {
  const [summary, setSummary] = useState(insight.summary)
  const [detail, setDetail] = useState(insight.detail)
  const save = useMutation({
    mutationFn: (approve: boolean) => putHolisticStudent(orgId, { ...base, insights: [{ subjectId: insight.subjectId, summary, detail, approve }] }),
    onSuccess: onSaved,
  })
  const dirty = summary !== insight.summary || detail !== insight.detail
  return (
    <div className="space-y-1.5 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-semibold">{insight.subject}</span>
        {insight.grade && <span className="rounded border border-brand/40 px-1.5 text-xs font-bold text-brand">{insight.grade}</span>}
        {insight.pct !== undefined && <span className="text-xs text-muted">{insight.pct}%</span>}
        <span className="flex-1" />
        {insight.status && !dirty && (
          <span className={`rounded-full px-2 py-0.5 text-xs ${insight.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {insight.status === 'approved' ? 'Approved' : insight.fromAi ? 'Drafted with AI' : 'Draft'}
          </span>
        )}
      </div>
      <label className="block text-xs font-semibold">
        First page
        <textarea aria-label={`${insight.subject} first page`} spellCheck rows={2} maxLength={400} className={`${field} mt-0.5 font-normal`} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>
      <WritingCheck text={summary} onUse={setSummary} mask={mask} />
      <label className="block text-xs font-semibold">
        {insight.subject}'s own part
        <textarea aria-label={`${insight.subject} insight`} spellCheck rows={3} maxLength={1500} className={`${field} mt-0.5 font-normal`} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </label>
      <WritingCheck text={detail} onUse={setDetail} mask={mask} />
      {save.error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {save.error instanceof ApiError ? save.error.message : 'That did not save.'}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={save.isPending || !dirty} onClick={() => save.mutate(false)}>
          Save
        </button>
        <button type="button" className={primary} disabled={save.isPending || (!summary.trim() && !detail.trim())} onClick={() => save.mutate(true)}>
          {insight.status === 'approved' && !dirty ? 'Approved' : 'Approve'}
        </button>
      </div>
    </div>
  )
}

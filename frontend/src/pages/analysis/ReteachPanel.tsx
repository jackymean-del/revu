import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAssessmentAnalysis, listAssessments, putReteach } from '../../api/client'
import { ApiError } from '../../api/problem'
import { RETEACH_STATUS, TREND, type AssessmentView, type ReteachStatus } from '../../lib/analysis'
import { useT } from '../../lib/terminology/terms-context'

const select = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'

/** The reteach list of one assessment for the section (B8.7), with each part of the paper's share below mastery and the teacher's decision. */
export function ReteachPanel({ orgId, sections, periodId }: { orgId: string; sections: { id: string; name: string }[]; periodId: string }) {
  const t = useT()
  const qc = useQueryClient()
  // A reteach list is for one section: the first chosen, or the one picked here.
  const [sectionPick, setSectionPick] = useState('')
  const sectionId = sections.some((x) => x.id === sectionPick) ? sectionPick : (sections[0]?.id ?? '')
  const assessments = useQuery({
    queryKey: ['assessments', orgId, { sectionId, periodId }],
    queryFn: ({ signal }) => listAssessments(orgId, { sectionId, periodId }, signal),
  })
  const [picked, setPicked] = useState('')
  const list = (assessments.data ?? []).filter((a) => a.status !== 'draft')
  const assessmentId = list.some((a) => a.id === picked) ? picked : (list[0]?.id ?? '')
  const key = ['analysis-assessment', orgId, assessmentId, sectionId]
  const view = useQuery({ queryKey: key, queryFn: ({ signal }) => getAssessmentAnalysis(orgId, { assessmentId, sectionId }, signal), enabled: !!assessmentId })
  const mark = useMutation({
    mutationFn: (v: { partId: string; status: ReteachStatus | '' }) => putReteach(orgId, { assessmentId, sectionId, ...v }),
    onSuccess: (_, v) =>
      qc.setQueryData<AssessmentView>(key, (old) =>
        old ? { ...old, reteach: { ...old.reteach, items: old.reteach.items.map((i) => (i.partId === v.partId ? { ...i, status: v.status || undefined } : i)) } } : old,
      ),
  })

  if (assessments.isPending) return <p className="text-sm text-muted">Loading</p>
  if (list.length === 0) return <p className="text-sm text-muted">No assessment for this {t('group.section', { lower: true })} in this {t('period.term', { lower: true })} yet.</p>
  const d = view.data
  const scores = d?.students ?? []
  const complete = scores.filter((s) => s.score.state === 'complete').length

  return (
    <section aria-label="Reteach" className="space-y-4">
      {sections.length > 1 && (
        <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {t('group.section')}
          <select className={select} value={sectionId} onChange={(e) => setSectionPick(e.target.value)}>
            {sections.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        Assessment
        <select className={select} value={assessmentId} onChange={(e) => setPicked(e.target.value)}>
          {list.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </label>
      {view.isPending ? (
        <p className="text-sm text-muted">Loading</p>
      ) : view.isError ? (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {view.error instanceof ApiError ? view.error.message : 'This assessment could not be loaded.'}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">
            {complete} of {scores.length} have a full score. Mastery is {d!.settings.masteryPct}% of the marks for a part of the paper; a part is listed when {d!.settings.reteachSharePct}% or
            more are below it, with at least {d!.settings.minEvidence} marks.
          </p>
          {!d!.reteach.available ? (
            <p className="rounded-lg bg-mist px-3 py-2 text-sm">
              {d!.reteach.reason === 'total_marks'
                ? 'This assessment takes one total mark, so it cannot show which parts of the paper went badly. Enter marks part by part next time to get a reteach list.'
                : 'This assessment has one part, so there is nothing to compare. Split the paper into parts next time to get a reteach list.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {d!.reteach.items.map((i) => (
                <li key={i.partId} className={`rounded-xl border bg-white px-4 py-3 ${i.mastery.flagged ? 'border-amber-300' : 'border-line'}`}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="font-bold">{i.name}</h3>
                    <span className="text-xs text-muted">out of {i.max}</span>
                    {i.mastery.flagged && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Teach again</span>}
                    <span className="ml-auto text-sm tabular-nums">
                      {i.mastery.sharePct ? (
                        <>
                          <strong>{i.mastery.below}</strong> of {i.mastery.scored} below mastery ({i.mastery.sharePct}%)
                        </>
                      ) : (
                        'No marks yet'
                      )}
                    </span>
                  </div>
                  {!i.mastery.enough && i.mastery.scored > 0 && <p className="mt-1 text-xs text-muted">Too few marks to judge: {i.mastery.scored} of the {d!.settings.minEvidence} needed.</p>}
                  {i.students.length > 0 && <p className="mt-1 text-sm text-muted">{i.students.join(', ')}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div role="group" aria-label={`Decision for ${i.name}`} className="flex gap-1">
                      {(Object.keys(RETEACH_STATUS) as ReteachStatus[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={i.status === s}
                          disabled={mark.isPending}
                          onClick={() => mark.mutate({ partId: i.partId, status: i.status === s ? '' : s })}
                          className={`rounded-md border px-2 py-1 text-xs font-semibold ${i.status === s ? 'border-brand bg-brand text-white' : 'border-line bg-white text-brand hover:bg-mist'}`}
                        >
                          {RETEACH_STATUS[s]}
                        </button>
                      ))}
                    </div>
                    {i.followUp && (
                      <span className="text-xs text-muted">
                        Next: {i.followUp.title}
                        {i.followUp.sharePct && `, ${i.followUp.sharePct}% below`}
                        {i.followUp.trend && <strong className="ml-1 text-ink">{TREND[i.followUp.trend]}</strong>}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {mark.isError && (
            <p role="alert" className="text-sm font-semibold text-red-700">
              {mark.error instanceof ApiError ? mark.error.message : 'Not saved. Try again.'}
            </p>
          )}
          <p className="text-xs text-muted">The next assessment with a part of the same name shows whether fewer are below mastery. It says what changed, not why.</p>
        </>
      )}
    </section>
  )
}

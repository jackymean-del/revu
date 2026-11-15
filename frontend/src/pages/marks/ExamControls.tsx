import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listStructure, lockAssessment, putExamFocus, unlockAssessment, type Assessment, type ExamFocus, type Period } from '../../api/client'
import { ApiError } from '../../api/problem'
import { useExamFocus } from '../../lib/focus'
import { useT } from '../../lib/terminology/terms-context'

const chip = 'rounded-full border px-2.5 py-1 text-xs font-semibold disabled:opacity-50'
const on = 'border-emerald-300 bg-emerald-50 text-emerald-800'
const off = 'border-line bg-canvas text-muted'

/** Saving the focus, shared by the term bar and each exam's buttons. */
function useSaveFocus(orgId: string) {
  const qc = useQueryClient()
  const focus = useExamFocus(orgId)
  const save = useMutation({
    mutationFn: (f: ExamFocus) => putExamFocus(orgId, f),
    onSuccess: (f) => {
      qc.setQueryData(['exam-focus', orgId], f)
      void qc.invalidateQueries({ queryKey: ['assessments', orgId] })
    },
  })
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  return { focus, save, toggle }
}

/**
 * The terms of the year, each shown to teachers or hidden, one of them the
 * default every picker opens on. Only an administrator changes them.
 */
export function TermFocus({ orgId, yearId }: { orgId: string; yearId: string }) {
  const t = useT()
  const { focus, save, toggle } = useSaveFocus(orgId)
  const terms = (useQuery({ queryKey: ['structure', orgId, 'periods', { yearId }], queryFn: ({ signal }) => listStructure<Period>(orgId, 'periods', { yearId }, signal), enabled: !!yearId }).data ?? []).sort(
    (a, b) => a.seq - b.seq,
  )
  if (terms.length === 0) return null
  return (
    <section aria-label="Open now" className="space-y-2 rounded-2xl border border-line bg-white p-4">
      <div>
        <h2 className="font-bold">Open for {t('person.teacher', { count: 2, lower: true })} now</h2>
        <p className="text-sm text-muted">
          {t('person.teacher', { count: 2 })} see only what is shown here, so no question is written and no mark entered under the wrong {t('period.term', { lower: true })} or exam. Every
          exam list opens on the default, for everyone.
        </p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {terms.map((p) => {
          const shown = !focus.hiddenPeriods.includes(p.id)
          const isDefault = focus.defaultPeriodId === p.id
          return (
            <li key={p.id} className="flex items-center gap-1.5 rounded-xl border border-line px-2.5 py-1.5">
              <span className="text-sm font-semibold">{p.name}</span>
              <button
                type="button"
                className={`${chip} ${shown ? on : off}`}
                aria-pressed={shown}
                aria-label={`${p.name} shown`}
                disabled={save.isPending}
                onClick={() => save.mutate({ ...focus, hiddenPeriods: toggle(focus.hiddenPeriods, p.id) })}
              >
                {shown ? 'Shown' : 'Hidden'}
              </button>
              <button
                type="button"
                className={`${chip} ${isDefault ? 'border-brand bg-mist text-brand' : off}`}
                aria-pressed={isDefault}
                aria-label={`${p.name} is the default`}
                disabled={save.isPending}
                onClick={() => save.mutate({ ...focus, defaultPeriodId: isDefault ? '' : p.id })}
              >
                {isDefault ? '★ Default' : '☆ Default'}
              </button>
            </li>
          )
        })}
      </ul>
      {save.error && <Problem error={save.error} />}
    </section>
  )
}

/**
 * One exam's controls: shown to teachers or hidden, the default or not
 * (an administrator's), and locked or open (an administrator's or a
 * coordinator's). Locking keeps its papers and marks as they are; opening
 * it again takes a reason.
 */
export function ExamButtons({ orgId, exam, admin, canLock, onChange }: { orgId: string; exam: Assessment; admin: boolean; canLock: boolean; onChange: () => void }) {
  const t = useT()
  const { focus, save, toggle } = useSaveFocus(orgId)
  const [why, setWhy] = useState<string | null>(null)
  const lock = useMutation({ mutationFn: () => lockAssessment(orgId, exam.id), onSuccess: onChange })
  const unlock = useMutation({ mutationFn: () => unlockAssessment(orgId, exam.id, why ?? ''), onSuccess: () => (setWhy(null), onChange()) })
  const hiddenHere = focus.hiddenAssessments.includes(exam.id)
  const termHidden = focus.hiddenPeriods.includes(exam.periodId)
  const isDefault = focus.defaultAssessmentId === exam.id
  const locked = exam.status === 'locked'
  const error = (save.error ?? lock.error ?? unlock.error) as Error | null
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {admin && (
        <>
          <button
            type="button"
            className={`${chip} ${!hiddenHere && !termHidden ? on : off}`}
            aria-pressed={!hiddenHere}
            disabled={save.isPending}
            title={termHidden ? `Its ${t('period.term', { lower: true })} is hidden, so it is not shown either way` : undefined}
            onClick={() => save.mutate({ ...focus, hiddenAssessments: toggle(focus.hiddenAssessments, exam.id) })}
          >
            {termHidden ? `${t('period.term')} hidden` : hiddenHere ? 'Hidden' : 'Shown'}
          </button>
          <button
            type="button"
            className={`${chip} ${isDefault ? 'border-brand bg-mist text-brand' : off}`}
            aria-pressed={isDefault}
            aria-label={`${exam.title} is the default`}
            disabled={save.isPending}
            onClick={() => save.mutate({ ...focus, defaultAssessmentId: isDefault ? '' : exam.id })}
          >
            {isDefault ? '★ Default' : '☆'}
          </button>
        </>
      )}
      {canLock &&
        (locked ? (
          why === null ? (
            <button type="button" className={`${chip} border-amber-300 bg-amber-50 text-amber-800`} onClick={() => setWhy('')} title="Locked: its papers and marks stay as they are">
              🔒 Locked
            </button>
          ) : (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault()
                unlock.mutate()
              }}
            >
              <input autoFocus aria-label="Why it opens again" placeholder="Why it opens again" className="w-40 rounded-md border border-line px-2 py-1 text-xs" value={why} onChange={(e) => setWhy(e.target.value)} />
              <button type="submit" className={`${chip} ${off}`} disabled={!why.trim() || unlock.isPending}>
                Unlock
              </button>
              <button type="button" className="px-1 text-xs text-muted" onClick={() => setWhy(null)}>
                Cancel
              </button>
            </form>
          )
        ) : (
          <button type="button" className={`${chip} ${off}`} disabled={lock.isPending} onClick={() => lock.mutate()} title="When the exam is over and its marks are in and checked: its papers and marks then stay as they are">
            Lock
          </button>
        ))}
      {error && <Problem error={error} />}
    </span>
  )
}

function Problem({ error }: { error: Error }) {
  return (
    <span role="alert" className="text-xs font-semibold text-red-700">
      {error instanceof ApiError ? error.message : 'That did not save.'}
    </span>
  )
}

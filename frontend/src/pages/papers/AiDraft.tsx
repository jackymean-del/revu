import { useMutation } from '@tanstack/react-query'
import { draftQuestions, type Syllabus } from '../../api/client'
import { ApiError } from '../../api/problem'
import type { Need } from '../../lib/papers'
import type { Taxonomy } from '../../lib/taxonomy'

const button = 'rounded-lg border border-brand/40 bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'

/**
 * Drafts the questions one need of the blueprint asks for: with AI when it
 * is switched on, from the syllabus only; otherwise from the bank's own
 * questions and stems for the level. They join the bank as drafts until a
 * teacher approves them; nothing about any learner is sent.
 */
export function AiDraft({ orgId, place, need, taxonomy, syllabus, onDone }: {
  orgId: string
  place: { levelId: string; subjectId: string }
  need: Need
  taxonomy: Taxonomy
  syllabus: Syllabus
  onDone: () => void
}) {
  const lesson = syllabus.lessons.find((l) => l.id === need.lessonId)
  const draft = useMutation({
    mutationFn: () =>
      draftQuestions(orgId, { ...place, lessonId: lesson?.id, chapter: need.chapter || undefined, qtype: need.qtype,
        bloom: taxonomy === 'bloom' ? need.level || undefined : undefined,
        ...(taxonomy === 'solo' || taxonomy === 'custom' ? { taxonomy, level: need.level } : {}),
        marks: need.marks, count: Math.min(5, Math.max(1, need.count - need.have)) }),
    onSuccess: onDone,
  })
  return (
    <span className="flex items-center gap-2">
      {draft.isError && (
        <span role="alert" className="text-xs font-semibold text-red-700">
          {draft.error instanceof ApiError ? draft.error.message : 'Try again.'}
        </span>
      )}
      {draft.isSuccess && <span className="text-xs font-semibold text-emerald-700">{draft.data.length} drafted below, to approve</span>}
      <button type="button" className={button} disabled={draft.isPending} onClick={() => draft.mutate()} title="Drafts from your syllabus and question bank, with AI when it is switched on; you approve each one">
        {draft.isPending ? 'Drafting' : 'Draft questions'}
      </button>
    </span>
  )
}

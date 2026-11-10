import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createQuestion, updateQuestion, type Blueprint, type Question, type QuestionInput, type Syllabus } from '../../api/client'
import { ApiError } from '../../api/problem'
import { needs, type Need } from '../../lib/papers'
import { BLOOMS } from '../../lib/syllabus'
import { levelLabel, SOLO, type Taxonomy } from '../../lib/taxonomy'
import { AiDraft } from './AiDraft'
import { usePaperSettings } from './settings'
import { TypeSelect } from './TypeSelect'
import { hasOptions } from './types'

const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const field = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const bloomLabel = (b: string) => BLOOMS.find((x) => x.key === b)?.label ?? b

type Draft = Omit<QuestionInput, 'levelId' | 'subjectId'> & { id?: string }

const toInput = (q: Question): Draft => ({
  id: q.id,
  lessonId: q.lessonId,
  outcomeId: q.outcomeId,
  bloom: q.bloom,
  solo: q.solo,
  customLevel: q.customLevel,
  qtype: q.qtype,
  marks: q.marks,
  difficulty: q.difficulty,
  text: q.text,
  options: q.options,
  answer: q.answer,
  source: q.source,
  status: q.status,
})

/**
 * The question bank of a class and subject (B3.4): what the blueprint
 * still needs first, each one a click from a prefilled form, then every
 * question with its lesson, outcome and Bloom level.
 */
export function QuestionBank({ orgId, place, blueprint, syllabus, bank }: { orgId: string; place: { levelId: string; subjectId: string }; blueprint: Blueprint; syllabus: Syllabus; bank: Question[] }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [filter, setFilter] = useState({ lessonId: '', bloom: '', status: 'approved' })
  const settings = usePaperSettings(orgId)
  const tax = blueprint.taxonomy as Taxonomy
  const want = needs(blueprint.rows, bank, tax).filter((n) => n.count > n.have)
  const lessonName = (id?: string) => syllabus.lessons.find((l) => l.id === id)?.name ?? ''
  const outcomeText = (id?: string) => syllabus.lessons.flatMap((l) => l.outcomes).find((o) => o.id === id)?.text ?? ''
  const refresh = () => qc.invalidateQueries({ queryKey: ['questions', orgId, place] })
  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body: QuestionInput = { ...d, ...place, options: hasOptions(d.qtype) ? (d.options ?? []).filter((o) => o.trim()) : [] }
      return d.id ? updateQuestion(orgId, d.id, body) : createQuestion(orgId, body)
    },
    onSuccess: () => (setDraft(null), refresh()),
  })
  const quick = useMutation({ mutationFn: (v: { q: Question; status: 'approved' | 'retired' }) => updateQuestion(orgId, v.q.id, { ...toInput(v.q), ...place, status: v.status }), onSuccess: refresh })
  const fromNeed = (n: Need): Draft => ({
    lessonId: n.lessonId,
    qtype: n.qtype,
    bloom: tax === 'bloom' ? n.level || undefined : undefined,
    solo: tax === 'solo' ? n.level : undefined,
    customLevel: tax === 'custom' ? n.level : undefined,
    marks: n.marks,
    text: '',
    options: [],
    answer: '',
  })
  const shown = bank.filter((q) => (!filter.lessonId || q.lessonId === filter.lessonId) && (!filter.bloom || q.bloom === filter.bloom) && q.status === filter.status)
  const drafts = bank.filter((q) => q.status === 'draft').length

  return (
    <div className="space-y-4">
      {want.length > 0 && (
        <section aria-label="Still needed" className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <h2 className="font-bold">The blueprint still needs</h2>
          <ul className="mt-2 divide-y divide-amber-100">
            {want.map((n) => (
              <li key={n.key} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <b>{n.count - n.have}</b> × {n.qtype}, {n.marks} {n.marks === '1' ? 'mark' : 'marks'}
                  {n.level && <>, {levelLabel(tax, n.level, settings)}</>} <span className="text-muted">· {n.chapter}</span>
                </span>
                <AiDraft orgId={orgId} place={place} need={n} taxonomy={tax} syllabus={syllabus} onDone={refresh} />
                <button type="button" className={button} onClick={() => setDraft(fromNeed(n))}>
                  Write one
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {draft ? (
        <QuestionForm draft={draft} syllabus={syllabus} custom={settings?.custom} pending={save.isPending} error={save.error} onCancel={() => (setDraft(null), save.reset())} onSave={(d) => save.mutate(d)} />
      ) : (
        <button type="button" className={primary} onClick={() => setDraft({ qtype: 'Short answer', marks: '', text: '', options: [], answer: '' })}>
          New question
        </button>
      )}

      <section aria-label="Question bank" className="rounded-2xl border border-line bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <h2 className="mr-auto font-bold">Bank</h2>
          <select aria-label="Lesson" className={field} value={filter.lessonId} onChange={(e) => setFilter({ ...filter, lessonId: e.target.value })}>
            <option value="">Every lesson</option>
            {syllabus.lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <select aria-label="Bloom level" className={field} value={filter.bloom} onChange={(e) => setFilter({ ...filter, bloom: e.target.value })}>
            <option value="">Every level</option>
            {BLOOMS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
          <div role="group" aria-label="Status" className="flex gap-1">
            {(['approved', 'draft'] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={filter.status === s}
                onClick={() => setFilter({ ...filter, status: s })}
                className={`rounded-lg border px-2.5 py-1 text-sm ${filter.status === s ? 'border-brand bg-mist font-bold text-brand' : 'border-line'}`}
              >
                {s === 'approved' ? 'Approved' : `Drafts to check${drafts ? ` (${drafts})` : ''}`}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="p-4 text-sm text-muted">{filter.status === 'draft' ? 'No drafts waiting.' : 'No questions here yet.'}</p>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((q) => (
              <li key={q.id} className="space-y-1.5 px-4 py-3">
                <p className="whitespace-pre-wrap text-sm">{q.text}</p>
                {q.options.length > 0 && (
                  <ol className="ml-5 list-[lower-alpha] text-sm text-muted">
                    {q.options.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ol>
                )}
                <p className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded bg-canvas px-1.5 py-0.5 font-semibold">{q.qtype}</span>
                  <span className="rounded bg-canvas px-1.5 py-0.5 font-semibold tabular-nums">{q.marks} m</span>
                  <span className="rounded bg-mist px-1.5 py-0.5 font-semibold text-brand">{bloomLabel(q.bloom)}</span>
                  {q.solo && <span className="rounded bg-mist px-1.5 py-0.5 font-semibold text-brand">SOLO: {levelLabel('solo', q.solo)}</span>}
                  {q.customLevel && <span className="rounded bg-mist px-1.5 py-0.5 font-semibold text-brand">{q.customLevel}</span>}
                  {q.lessonId && <span className="text-muted">{lessonName(q.lessonId)}</span>}
                  {q.outcomeId && <span className="truncate text-muted">· {outcomeText(q.outcomeId)}</span>}
                  {q.source === 'ai' && <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">AI draft</span>}
                  {q.used > 0 && <span className="text-muted">· in {q.used} {q.used === 1 ? 'paper' : 'papers'}</span>}
                  <span className="ml-auto flex gap-1.5">
                    {q.status === 'draft' && (
                      <button type="button" className={button} disabled={quick.isPending} onClick={() => quick.mutate({ q, status: 'approved' })}>
                        Approve
                      </button>
                    )}
                    <button type="button" className={button} onClick={() => setDraft(toInput(q))}>
                      Edit
                    </button>
                    <button type="button" className={button} disabled={quick.isPending} onClick={() => quick.mutate({ q, status: 'retired' })}>
                      Retire
                    </button>
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
        {quick.error && (
          <p role="alert" className="px-4 pb-3 text-sm font-semibold text-red-700">
            {quick.error instanceof ApiError ? quick.error.message : 'That did not save.'}
          </p>
        )}
      </section>
    </div>
  )
}

function QuestionForm({ draft, syllabus, custom, pending, error, onCancel, onSave }: {
  draft: Draft
  syllabus: Syllabus
  custom?: { name: string; levels: string[] }
  pending: boolean
  error: Error | null
  onCancel: () => void
  onSave: (d: Draft) => void
}) {
  const [d, setD] = useState(draft)
  const lesson = syllabus.lessons.find((l) => l.id === d.lessonId)
  const options = d.options ?? []
  return (
    <form
      aria-label={d.id ? 'Change question' : 'New question'}
      className="space-y-3 rounded-2xl border border-brand/30 bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(d)
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Question
        <textarea required rows={3} maxLength={5000} className={field} value={d.text} onChange={(e) => setD({ ...d, text: e.target.value })} />
      </label>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Type
          <TypeSelect label="Type" className="py-1.5" value={d.qtype} onChange={(v) => setD({ ...d, qtype: v })} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Marks
          <input required inputMode="decimal" pattern="\d{1,4}(\.\d{1,2})?" className={field} value={d.marks} onChange={(e) => setD({ ...d, marks: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Bloom level
          <select className={field} value={d.bloom ?? ''} onChange={(e) => setD({ ...d, bloom: e.target.value || undefined })}>
            <option value="">Suggest from the wording</option>
            {BLOOMS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Difficulty
          <select className={field} value={d.difficulty ?? 'medium'} onChange={(e) => setD({ ...d, difficulty: e.target.value })}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          SOLO level
          <select className={field} value={d.solo ?? ''} onChange={(e) => setD({ ...d, solo: e.target.value || undefined })}>
            <option value="">None</option>
            {SOLO.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        {custom && custom.levels.length > 0 && (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {custom.name}
            <select className={field} value={d.customLevel ?? ''} onChange={(e) => setD({ ...d, customLevel: e.target.value || undefined })}>
              <option value="">None</option>
              {custom.levels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Lesson
          <select className={field} value={d.lessonId ?? ''} onChange={(e) => setD({ ...d, lessonId: e.target.value || undefined, outcomeId: undefined })}>
            <option value="">None</option>
            {syllabus.lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Learning outcome
          <select className={field} value={d.outcomeId ?? ''} disabled={!lesson} onChange={(e) => setD({ ...d, outcomeId: e.target.value || undefined })}>
            <option value="">{lesson ? 'None' : 'Choose a lesson first'}</option>
            {lesson?.outcomes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.text}
              </option>
            ))}
          </select>
        </label>
      </div>
      {hasOptions(d.qtype) && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-semibold">Options, in order</legend>
          {[...options, ''].slice(0, 8).map((o, i) => (
            <input
              key={i}
              aria-label={`Option ${i + 1}`}
              className={`${field} w-full`}
              value={o}
              onChange={(e) => {
                const next = [...options]
                next[i] = e.target.value
                setD({ ...d, options: next.filter((x, j) => x.trim() || j < next.length - 1) })
              }}
            />
          ))}
        </fieldset>
      )}
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Answer or marking guide
        <textarea rows={2} className={field} value={d.answer ?? ''} onChange={(e) => setD({ ...d, answer: e.target.value })} />
      </label>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {error instanceof ApiError ? error.message : 'That did not save.'}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={primary} disabled={pending}>
          {d.id ? 'Save' : 'Add to the bank'}
        </button>
        <button type="button" className={button} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

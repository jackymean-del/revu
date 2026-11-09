import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createAssessment, listStructure, type Assessment, type Level, type Period, type Section, type Subject } from '../../api/client'
import { ApiError } from '../../api/problem'
import { useT } from '../../lib/terminology/terms-context'

/** The kinds a scheme reads marks by (Part 4.1). */
const KINDS = ['periodic_test', 'midterm', 'term_end'] as const
type Kind = (typeof KINDS)[number]

type Part = { name: string; maxMarks: string; kind: 'main' | 'additional'; componentCode: string; countsInTotal: boolean }

function useList<T>(orgId: string, path: 'periods' | 'levels' | 'subjects' | 'sections', params: Record<string, string> = {}) {
  return useQuery({ queryKey: ['structure', orgId, path, params], queryFn: ({ signal }) => listStructure<T>(orgId, path, params, signal) }).data ?? []
}

const input = 'w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'

/**
 * A new assessment: its period, subject and sections, and its entry
 * columns, either one total or one per paper section (Part 20.2).
 */
export function NewAssessment({ orgId, yearId, onMade, onCancel }: { orgId: string; yearId: string; onMade: (a: Assessment) => void; onCancel: () => void }) {
  const t = useT()
  const periods = useList<Period>(orgId, 'periods', { yearId })
  const levels = useList<Level>(orgId, 'levels')
  const subjects = useList<Subject>(orgId, 'subjects')
  const sections = useList<Section>(orgId, 'sections', { yearId })
  const [form, setForm] = useState({
    title: '', kind: 'periodic_test' as Kind, heldOn: '', periodId: '', levelId: '', subjectId: '', mode: 'total' as 'total' | 'sections', sectionIds: [] as string[],
  })
  const [parts, setParts] = useState<Part[]>([{ name: 'Total', maxMarks: '40', kind: 'main', componentCode: '', countsInTotal: true }])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const levelSections = sections.filter((s) => s.levelId === form.levelId)

  function setMode(mode: 'total' | 'sections') {
    setForm({ ...form, mode })
    setParts(
      mode === 'total'
        ? [{ name: 'Total', maxMarks: parts[0]?.maxMarks || '40', kind: 'main', componentCode: '', countsInTotal: true }]
        : [
            { name: 'Part A', maxMarks: '20', kind: 'main', componentCode: '', countsInTotal: true },
            { name: 'Part B', maxMarks: '20', kind: 'main', componentCode: '', countsInTotal: true },
          ],
    )
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      onMade(
        await createAssessment(orgId, {
          title: form.title, kind: form.kind, ...(form.heldOn ? { heldOn: form.heldOn } : {}), periodId: form.periodId, levelId: form.levelId, subjectId: form.subjectId, entryMode: form.mode, sectionIds: form.sectionIds,
          parts: parts.map((p) => ({ name: p.name, maxMarks: p.maxMarks.trim(), kind: p.kind, countsInTotal: p.countsInTotal, ...(p.kind === 'additional' ? { componentCode: p.componentCode } : {}) })),
        }),
      )
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields?.[0]?.message ?? e.message) : 'Not saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const field = 'flex flex-col gap-1 text-sm font-semibold'
  return (
    <section aria-labelledby="new-heading" className="space-y-4 rounded-xl border border-line bg-white p-4">
      <h2 id="new-heading" className="font-extrabold">
        New assessment
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field}>
          Title
          <input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Unit test 1" />
        </label>
        <label className={field}>
          Kind
          <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`assessment.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          Held on
          <input type="date" className={input} value={form.heldOn} onChange={(e) => setForm({ ...form, heldOn: e.target.value })} />
        </label>
        <label className={field}>
          {t('period.term')}
          <select className={input} value={form.periodId} onChange={(e) => setForm({ ...form, periodId: e.target.value })}>
            <option value="">Choose</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          {t('group.level')}
          <select className={input} value={form.levelId} onChange={(e) => setForm({ ...form, levelId: e.target.value, sectionIds: [] })}>
            <option value="">Choose</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          {t('course.subject')}
          <select className={input} value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
            <option value="">Choose</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {form.levelId && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold">{t('group.section', { count: 2 })}</legend>
          <div className="flex flex-wrap gap-3">
            {levelSections.map((s) => (
              <label key={s.id} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-brand"
                  checked={form.sectionIds.includes(s.id)}
                  onChange={(e) => setForm({ ...form, sectionIds: e.target.checked ? [...form.sectionIds, s.id] : form.sectionIds.filter((x) => x !== s.id) })}
                />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">How marks are entered</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input type="radio" name="mode" className="accent-brand" checked={form.mode === 'total'} onChange={() => setMode('total')} />
            One total per {t('person.student', { lower: true })}
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="mode" className="accent-brand" checked={form.mode === 'sections'} onChange={() => setMode('sections')} />
            One mark per part of the paper
          </label>
        </div>
        {parts.map((p, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            {form.mode === 'sections' && (
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                Name
                <input className={input} value={p.name} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              </label>
            )}
            <label className="flex w-24 flex-col gap-1 text-xs font-semibold text-muted">
              Out of
              <input inputMode="decimal" className={input} value={p.maxMarks} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, maxMarks: e.target.value } : x)))} />
            </label>
            {form.mode === 'sections' && (
              <>
                <label className="flex items-center gap-1 pb-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand"
                    checked={p.kind === 'additional'}
                    onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, kind: e.target.checked ? 'additional' : 'main', countsInTotal: !e.target.checked } : x)))}
                  />
                  A separate component
                </label>
                {p.kind === 'additional' && (
                  <label className="flex w-28 flex-col gap-1 text-xs font-semibold text-muted">
                    Code
                    <input className={input} spellCheck={false} value={p.componentCode} placeholder="PRAC" onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, componentCode: e.target.value } : x)))} />
                  </label>
                )}
                {parts.length > 1 && (
                  <button type="button" className={button} onClick={() => setParts(parts.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                )}
              </>
            )}
          </div>
        ))}
        {form.mode === 'sections' && (
          <button
            type="button"
            className={button}
            onClick={() => setParts([...parts, { name: `Part ${String.fromCharCode(65 + parts.length)}`, maxMarks: '10', kind: 'main', componentCode: '', countsInTotal: true }])}
          >
            Add a part
          </button>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => void save()}>
          Create
        </button>
        <button type="button" className={button} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  )
}

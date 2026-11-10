import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { putBlueprint, stepBlueprint, type Blueprint, type BlueprintRow, type Syllabus } from '../../api/client'
import { ApiError } from '../../api/problem'
import { BLOOMS } from '../../lib/syllabus'
import { inconsistent, marks, remaining, toInput, totals } from '../../lib/papers'
import { QUESTION_TYPES } from './types'

const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const cell = 'w-12 rounded border border-line px-1 py-0.5 text-right text-sm tabular-nums'
const TONE = { ok: 'text-emerald-700', short: 'text-amber-700', over: 'text-red-700' }

/**
 * The Blueprint Builder (B3.2): one row per chapter and question type, and
 * for each Bloom level how many questions and marks. Totals stay live while
 * typing; the server checks them exactly on save.
 */
export function BlueprintEditor({ orgId, assessmentId, blueprint, syllabus, approves }: { orgId: string; assessmentId: string; blueprint: Blueprint; syllabus: Syllabus; approves: boolean }) {
  const qc = useQueryClient()
  const [taxonomy, setTaxonomy] = useState(blueprint.taxonomy)
  const [rows, setRows] = useState<BlueprintRow[]>(blueprint.rows)
  const [dirty, setDirty] = useState(false)
  const [comment, setComment] = useState('')
  const levels = taxonomy === 'bloom' ? BLOOMS.map((b) => b.key as string) : ['']
  const t = totals(rows, levels)
  const left = remaining(blueprint.max, t.marks)
  const lessonByName = (name: string) => syllabus.lessons.find((l) => l.name.toLowerCase() === name.trim().toLowerCase())

  const edit = (i: number, change: Partial<BlueprintRow>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...change } : r)))
    setDirty(true)
  }
  const setCell = (i: number, level: string, field: 'questions' | 'marks', v: string) => {
    const r = rows[i]
    const c = r.cells[level] ?? { questions: 0, marks: '' }
    edit(i, { cells: { ...r.cells, [level]: field === 'questions' ? { ...c, questions: Math.max(0, Math.floor(Number(v) || 0)) } : { ...c, marks: v } } })
  }
  const refresh = () => qc.invalidateQueries({ queryKey: ['blueprint', orgId, assessmentId] })
  const save = useMutation({
    mutationFn: async (then?: 'submit') => {
      if (dirty || !blueprint.exists) await putBlueprint(orgId, assessmentId, { taxonomy, rows: toInput(rows) })
      if (then) await stepBlueprint(orgId, assessmentId, then)
    },
    onSuccess: () => (setDirty(false), refresh()),
  })
  const step = useMutation({ mutationFn: (s: 'approve' | 'return') => stepBlueprint(orgId, assessmentId, s, comment), onSuccess: refresh })
  const err = (save.error ?? step.error) as Error | null
  const fromSyllabus = () => {
    setRows(syllabus.lessons.map((l) => ({ lessonId: l.id, chapter: l.name, qtype: 'Short answer', cells: {} })))
    setDirty(true)
  }
  const badCell = rows.some((r) => Object.values(r.cells).some(inconsistent))
  const errors = blueprint.checks.filter((c) => c.level === 'error')

  return (
    <section aria-label="Blueprint" className="space-y-4 rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm">
          Maximum <b>{blueprint.max}</b> marks · version {blueprint.version}
          {blueprint.status === 'approved' && !dirty && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">Approved</span>}
          {blueprint.status === 'submitted' && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">Waiting for approval</span>}
          {blueprint.status === 'returned' && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">Returned: {blueprint.comment}</span>}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={taxonomy === 'bloom'}
            onChange={(e) => {
              setTaxonomy(e.target.checked ? 'bloom' : 'none')
              setRows((rs) => rs.map((r) => ({ ...r, cells: {} })))
              setDirty(true)
            }}
          />
          By Bloom level
        </label>
      </div>
      {blueprint.status === 'approved' && dirty && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Saving a change makes version {blueprint.version + 1}, which goes back for approval.</p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-6 text-center">
          <p className="font-bold">No rows yet</p>
          <p className="mt-1 text-sm text-muted">One row per chapter and question type. Start from the syllabus, one row per lesson, or add rows one by one.</p>
          <div className="mt-3 flex justify-center gap-2">
            {syllabus.lessons.length > 0 && (
              <button type="button" className={primary} onClick={fromSyllabus}>
                One row per lesson ({syllabus.lessons.length})
              </button>
            )}
            <button type="button" className={button} onClick={() => (setRows([{ chapter: '', qtype: 'Short answer', cells: {} }]), setDirty(true))}>
              Add a row
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <datalist id="bp-lessons">
            {syllabus.lessons.map((l) => (
              <option key={l.id} value={l.name} />
            ))}
          </datalist>
          <datalist id="bp-types">
            {QUESTION_TYPES.map((q) => (
              <option key={q} value={q} />
            ))}
          </datalist>
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-2 font-semibold">Chapter</th>
                <th className="py-2 pr-2 font-semibold">Question type</th>
                {levels.map((l) => (
                  <th key={l} className="px-1 py-2 text-center font-semibold" title={BLOOMS.find((b) => b.key === l)?.hint}>
                    {BLOOMS.find((b) => b.key === l)?.label ?? 'Questions and marks'}
                    <span className="block font-normal">qs · marks</span>
                  </th>
                ))}
                <th className="px-1 py-2 text-right font-semibold">Row</th>
                <th className="sr-only">Remove</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-line/60 align-top">
                  <td className="py-1.5 pr-2">
                    <input
                      aria-label={`Row ${i + 1} chapter`}
                      list="bp-lessons"
                      className="w-40 rounded border border-line px-2 py-1"
                      value={r.chapter}
                      onChange={(e) => edit(i, { chapter: e.target.value, lessonId: lessonByName(e.target.value)?.id })}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input aria-label={`Row ${i + 1} question type`} list="bp-types" className="w-36 rounded border border-line px-2 py-1" value={r.qtype} onChange={(e) => edit(i, { qtype: e.target.value })} />
                  </td>
                  {levels.map((l) => {
                    const c = r.cells[l]
                    const label = `Row ${i + 1} ${BLOOMS.find((b) => b.key === l)?.label ?? ''}`.trim()
                    return (
                      <td key={l} className={`px-1 py-1.5 text-center ${inconsistent(c) ? 'bg-red-50' : ''}`}>
                        <div className="flex justify-center gap-1">
                          <input aria-label={`${label} questions`} inputMode="numeric" className={cell} value={c?.questions || ''} onChange={(e) => setCell(i, l, 'questions', e.target.value)} />
                          <input aria-label={`${label} marks`} inputMode="decimal" className={cell} value={c?.marks ?? ''} onChange={(e) => setCell(i, l, 'marks', e.target.value)} />
                        </div>
                      </td>
                    )
                  })}
                  <td className="px-1 py-1.5 text-right tabular-nums">
                    {t.rows[i].questions} · <b>{marks(t.rows[i].marks)}</b>
                  </td>
                  <td className="py-1.5 pl-1">
                    <button type="button" aria-label={`Remove row ${i + 1}`} className="rounded px-1.5 text-muted hover:bg-canvas" onClick={() => (setRows((rs) => rs.filter((_, j) => j !== i)), setDirty(true))}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-xs">
                <td colSpan={2} className="py-2 font-bold">
                  <button type="button" className={button} onClick={() => (setRows((rs) => [...rs, { chapter: '', qtype: rs.at(-1)?.qtype ?? 'Short answer', cells: {} }]), setDirty(true))}>
                    Add a row
                  </button>
                </td>
                {levels.map((l) => (
                  <td key={l} className="px-1 py-2 text-center tabular-nums">
                    {t.byLevel[l].questions} · <b>{marks(t.byLevel[l].marks)}</b>
                    {t.marks > 0 && <span className="block text-muted">{Math.round((t.byLevel[l].marks / t.marks) * 100)}%</span>}
                  </td>
                ))}
                <td className="px-1 py-2 text-right text-sm tabular-nums">
                  {t.questions} · <b>{marks(t.marks)}</b>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p role="status" className={`text-sm font-semibold ${TONE[left.tone]}`}>
        {left.text}
        {badCell && <span className="ml-2 text-red-700">· a cell has questions without marks, or marks without questions</span>}
      </p>
      {!dirty && blueprint.checks.length > 0 && (
        <ul className="space-y-1 text-sm">
          {blueprint.checks.map((c, i) => (
            <li key={i} className={c.level === 'error' ? 'text-red-700' : 'text-amber-700'}>
              {c.row ? `Row ${c.row}: ` : ''}
              {c.message}
            </li>
          ))}
        </ul>
      )}
      {err && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {err instanceof ApiError ? err.message : 'That did not save.'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} disabled={!dirty || save.isPending || badCell} onClick={() => save.mutate(undefined)}>
          Save draft
        </button>
        {(blueprint.status === 'draft' || blueprint.status === 'returned' || dirty) && (
          <button type="button" className={primary} disabled={save.isPending || badCell || left.tone !== 'ok' || rows.length === 0} onClick={() => save.mutate('submit')}>
            Submit for approval
          </button>
        )}
        {approves && blueprint.status === 'submitted' && !dirty && (
          <>
            <button type="button" className={primary} disabled={step.isPending || errors.length > 0} onClick={() => step.mutate('approve')}>
              Approve
            </button>
            <input aria-label="Comment" placeholder="What to change" className="min-w-48 flex-1 rounded-md border border-line px-2 py-1.5 text-sm" value={comment} onChange={(e) => setComment(e.target.value)} />
            <button type="button" className={button} disabled={step.isPending || !comment.trim()} onClick={() => step.mutate('return')}>
              Return
            </button>
          </>
        )}
      </div>
    </section>
  )
}

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPaper, getPaper, getPaperHtml, paperStep, putPaperItem, type Blueprint, type Paper, type PaperItem, type PaperSummary, type Question } from '../../api/client'
import { ApiError } from '../../api/problem'
import { hundredths } from '../../lib/papers'
import { BLOOMS } from '../../lib/syllabus'

const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const bloomLabel = (b?: string) => BLOOMS.find((x) => x.key === b)?.label ?? ''

/** Opens a printable page in a new tab; the tab is opened first so no popup blocker stops it. */
async function print(load: () => Promise<string>) {
  const w = window.open('', '_blank')
  const html = await load()
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
}

/**
 * The paper in sets (B3.3): Set A laid out from the approved blueprint,
 * filled from the bank, any slot changed by hand, then finalised; Set B and
 * on are copies to change.
 */
export function PaperSets({ orgId, assessmentId, blueprint, sets, bank }: { orgId: string; assessmentId: string; blueprint: Blueprint; sets: PaperSummary[]; bank: Question[] }) {
  const qc = useQueryClient()
  const [pick, setPick] = useState('')
  const [fill, setFill] = useState(true)
  const selected = sets.find((s) => s.id === pick) ?? sets.find((s) => s.status === 'draft') ?? sets[0]
  const paper = useQuery({ queryKey: ['paper', orgId, selected?.id], queryFn: ({ signal }) => getPaper(orgId, selected!.id, signal), enabled: !!selected })
  const done = (p: Paper) => {
    qc.setQueryData(['paper', orgId, p.id], p)
    void qc.invalidateQueries({ queryKey: ['papers', orgId, assessmentId] })
    void qc.invalidateQueries({ queryKey: ['questions', orgId] })
    void qc.invalidateQueries({ queryKey: ['setup', orgId] })
    setPick(p.id)
  }
  const make = useMutation({ mutationFn: () => createPaper(orgId, assessmentId, fill), onSuccess: done })
  const step = useMutation({
    mutationFn: (s: 'fill' | 'duplicate' | 'finalise') => paperStep(orgId, selected!.id, s),
    onSuccess: (p, s) => {
      done(p)
      if (s === 'finalise') void qc.invalidateQueries({ queryKey: ['assessments', orgId] })
    },
  })
  const err = (make.error ?? step.error) as Error | null

  if (blueprint.status !== 'approved')
    return <p className="rounded-2xl border border-line bg-white p-6 text-sm text-muted">A paper is made from an approved blueprint. Finish the blueprint and have it approved first.</p>

  if (sets.length === 0)
    return (
      <div className="space-y-3 rounded-2xl border border-dashed border-line bg-white p-8 text-center">
        <p className="font-bold">No paper yet</p>
        <p className="text-sm text-muted">Set A is laid out exactly as the blueprint asks: one slot per question, in parts by question type.</p>
        <label className="flex items-center justify-center gap-2 text-sm">
          <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} />
          Fill the slots from the bank, the least used questions first
        </label>
        <button type="button" className={primary} disabled={make.isPending} onClick={() => make.mutate()}>
          Make Set A
        </button>
        {err && <Problem error={err} />}
      </div>
    )

  const p = paper.data
  const empty = p ? p.items.length - p.filled : 0
  const draft = p?.status === 'draft'
  return (
    <section aria-label="Paper sets" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Sets" className="flex gap-1.5">
          {sets.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === selected?.id}
              onClick={() => setPick(s.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${s.id === selected?.id ? 'border-brand bg-mist font-bold text-brand' : 'border-line bg-white'}`}
            >
              Set {s.set}
              <span className="ml-1.5 text-xs text-muted">{s.status === 'final' ? 'final' : `${s.filled}/${s.items}`}</span>
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {p && (
          <>
            {draft && empty > 0 && (
              <button type="button" className={button} disabled={step.isPending} onClick={() => step.mutate('fill')}>
                Fill from the bank
              </button>
            )}
            <button type="button" className={button} disabled={step.isPending || sets.length >= 26} onClick={() => step.mutate('duplicate')}>
              Make Set {String.fromCharCode(65 + sets.length)}
            </button>
            <button type="button" className={button} onClick={() => void print(() => getPaperHtml(orgId, p.id, false))}>
              Print paper
            </button>
            <button type="button" className={button} onClick={() => void print(() => getPaperHtml(orgId, p.id, true))}>
              Answer key
            </button>
            {draft && (
              <button type="button" className={primary} disabled={step.isPending || empty > 0} title={empty ? 'Fill every slot first' : undefined} onClick={() => step.mutate('finalise')}>
                Finalise Set {p.set}
              </button>
            )}
          </>
        )}
      </div>
      {err && <Problem error={err} />}

      {!p ? (
        <p className="text-sm text-muted">Loading</p>
      ) : (
        <>
          <p role="status" className="text-sm">
            {p.filled} of {p.items.length} slots filled · {p.total} marks
            {p.status === 'final' ? ' · final: marks are entered part by part, tagged with their learning outcomes' : empty ? ` · ${empty} still to choose` : ' · ready to finalise'}
          </p>
          {p.bySection.map((g) => (
            <SectionSlots key={g.key} orgId={orgId} paper={p} section={g.key} marks={g.wanted} bank={bank} onChange={done} />
          ))}
        </>
      )}
    </section>
  )
}

function SectionSlots({ orgId, paper, section, marks, bank, onChange }: { orgId: string; paper: Paper; section: string; marks: string; bank: Question[]; onChange: (p: Paper) => void }) {
  const [open, setOpen] = useState('')
  const put = useMutation({ mutationFn: (v: { item: PaperItem; questionId?: string; locked?: boolean }) => putPaperItem(orgId, paper.id, v.item.id, { questionId: v.questionId, locked: v.locked }), onSuccess: (p) => (setOpen(''), onChange(p)) })
  const items = paper.items.filter((i) => i.section === section)
  const inPaper = new Set(paper.items.flatMap((i) => (i.question ? [i.question.id] : [])))
  const fits = (it: PaperItem) =>
    bank.filter(
      (q) =>
        q.status === 'approved' &&
        !inPaper.has(q.id) &&
        q.qtype.toLowerCase() === it.section.toLowerCase() &&
        hundredths(q.marks) === hundredths(it.marks) &&
        (!it.lessonId || q.lessonId === it.lessonId) &&
        (!it.bloom || q.bloom === it.bloom),
    )
  const draft = paper.status === 'draft'
  return (
    <div className="rounded-2xl border border-line bg-white">
      <h3 className="flex items-baseline justify-between border-b border-line px-4 py-2.5 font-bold">
        {section}
        <span className="text-sm font-semibold text-muted">{marks} marks</span>
      </h3>
      <ol className="divide-y divide-line">
        {items.map((it) => (
          <li key={it.id} className="px-4 py-2.5">
            <div className="flex flex-wrap items-start gap-3">
              <span className="w-8 shrink-0 font-bold tabular-nums">Q{it.seq}</span>
              <div className="min-w-0 flex-1">
                {it.question ? <p className="whitespace-pre-wrap text-sm">{it.question.text}</p> : <p className="text-sm font-semibold text-amber-700">Still to choose</p>}
                <p className="mt-0.5 text-xs text-muted">
                  {it.chapter}
                  {it.bloom && ` · ${bloomLabel(it.bloom)}`} · {it.marks} {it.marks === '1' ? 'mark' : 'marks'}
                  {it.locked && ' · kept when filling'}
                </p>
              </div>
              {draft && (
                <span className="flex gap-1.5">
                  <button type="button" className={button} aria-expanded={open === it.id} onClick={() => setOpen(open === it.id ? '' : it.id)}>
                    {it.question ? 'Change' : 'Choose'}
                  </button>
                  {it.question && (
                    <button type="button" className={button} disabled={put.isPending} onClick={() => put.mutate({ item: it, locked: !it.locked })}>
                      {it.locked ? 'Unlock' : 'Keep'}
                    </button>
                  )}
                </span>
              )}
            </div>
            {open === it.id && (
              <div className="mt-2 rounded-xl bg-canvas p-2">
                {fits(it).length === 0 ? (
                  <p className="p-2 text-sm text-muted">No approved question in the bank fits this slot. Add one in Questions.</p>
                ) : (
                  <ul className="space-y-1">
                    {fits(it).map((q) => (
                      <li key={q.id} className="flex items-start gap-2 rounded-lg bg-white p-2 text-sm">
                        <span className="flex-1 whitespace-pre-wrap">{q.text}</span>
                        <button type="button" className={button} disabled={put.isPending} onClick={() => put.mutate({ item: it, questionId: q.id })}>
                          Use this
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {it.question && (
                  <button type="button" className="mt-2 text-sm font-semibold text-red-700" onClick={() => put.mutate({ item: it, questionId: '' })}>
                    Empty this slot
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      {put.error && (
        <div className="px-4 pb-3">
          <Problem error={put.error} />
        </div>
      )}
    </div>
  )
}

function Problem({ error }: { error: Error }) {
  return (
    <p role="alert" className="text-sm font-semibold text-red-700">
      {error instanceof ApiError ? error.message : 'That did not work. Try again.'}
    </p>
  )
}

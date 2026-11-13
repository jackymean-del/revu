import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPaper, getPaper, getPaperHtml, paperStep, putPaperItem, type Blueprint, type Paper, type PaperItem, type PaperSummary, type Question } from '../../api/client'
import { ApiError } from '../../api/problem'
import { hundredths } from '../../lib/papers'
import { levelLabel, questionLevel, type Taxonomy } from '../../lib/taxonomy'
import { usePaperSettings } from './settings'

const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const field = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'

/**
 * The paper in sets (B3.3): the first set laid out from the approved
 * blueprint, filled from the bank, any slot changed by hand, then
 * finalised; more sets are copies to change. Beside it, the paper exactly
 * as it prints, with or without space to answer, or as the answer key.
 */
export function PaperSets({ orgId, assessmentId, blueprint, sets, bank }: { orgId: string; assessmentId: string; blueprint: Blueprint; sets: PaperSummary[]; bank: Question[] }) {
  const qc = useQueryClient()
  const settings = usePaperSettings(orgId)
  const [pick, setPick] = useState('')
  const [fill, setFill] = useState(true)
  const [name, setName] = useState('')
  const selected = sets.find((s) => s.id === pick) ?? sets.find((s) => s.status === 'draft') ?? sets[0]
  const paper = useQuery({ queryKey: ['paper', orgId, selected?.id], queryFn: ({ signal }) => getPaper(orgId, selected!.id, signal), enabled: !!selected })
  // The next of the institution's set names not used yet.
  const nextName = (settings?.setNames ?? ['Set A', 'Set B', 'Set C', 'Set D']).find((n) => !sets.some((s) => s.set.toLowerCase() === n.toLowerCase())) ?? `Set ${sets.length + 1}`
  const done = (p: Paper) => {
    qc.setQueryData(['paper', orgId, p.id], p)
    void qc.invalidateQueries({ queryKey: ['papers', orgId, assessmentId] })
    void qc.invalidateQueries({ queryKey: ['questions', orgId] })
    void qc.invalidateQueries({ queryKey: ['setup', orgId] })
    void qc.invalidateQueries({ queryKey: ['paper-html', orgId, p.id] })
    setPick(p.id)
    setName('')
  }
  const make = useMutation({ mutationFn: () => createPaper(orgId, assessmentId, fill, name.trim() || nextName), onSuccess: done })
  const step = useMutation({
    mutationFn: (s: 'fill' | 'duplicate' | 'finalise') => paperStep(orgId, selected!.id, s, s === 'duplicate' ? name.trim() || nextName : ''),
    onSuccess: (p, s) => {
      done(p)
      if (s === 'finalise') void qc.invalidateQueries({ queryKey: ['assessments', orgId] })
    },
  })
  const err = (make.error ?? step.error) as Error | null
  const nameField = (
    <input aria-label="Set name" className={`${field} w-32`} placeholder={nextName} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
  )

  if (blueprint.status !== 'approved')
    return <p className="rounded-2xl border border-line bg-white p-6 text-sm text-muted">A paper is made from an approved blueprint. Finish the blueprint and have it approved first.</p>

  if (sets.length === 0)
    return (
      <div className="space-y-3 rounded-2xl border border-dashed border-line bg-white p-8 text-center">
        <p className="font-bold">No paper yet</p>
        <p className="text-sm text-muted">The first set is laid out exactly as the blueprint asks: one slot per question, in parts by question type.</p>
        <label className="flex items-center justify-center gap-2 text-sm">
          <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} />
          Fill the slots from the bank, the least used questions first
        </label>
        <div className="flex items-center justify-center gap-2">
          {nameField}
          <button type="button" className={primary} disabled={make.isPending} onClick={() => make.mutate()}>
            Make {name.trim() || nextName}
          </button>
        </div>
        {err && <Problem error={err} />}
      </div>
    )

  const p = paper.data
  const empty = p ? p.items.length - p.filled : 0
  const draft = p?.status === 'draft'
  return (
    <section aria-label="Paper sets" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Sets" className="flex flex-wrap gap-1.5">
          {sets.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === selected?.id}
              onClick={() => setPick(s.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${s.id === selected?.id ? 'border-brand bg-mist font-bold text-brand' : 'border-line bg-white'}`}
            >
              {s.set}
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
            <span className="flex items-center gap-1.5">
              {nameField}
              <button type="button" className={button} disabled={step.isPending || sets.length >= 26} onClick={() => step.mutate('duplicate')}>
                Copy as {name.trim() || nextName}
              </button>
            </span>
            {draft && (
              <button type="button" className={primary} disabled={step.isPending || empty > 0} title={empty ? 'Fill every slot first' : undefined} onClick={() => step.mutate('finalise')}>
                Finalise {p.set}
              </button>
            )}
          </>
        )}
      </div>
      {err && <Problem error={err} />}
      {draft && empty > 0 && <p className="text-xs text-muted">Finalising needs a question in every slot: {empty} still to choose.</p>}

      {!p ? (
        <p className="text-sm text-muted">Loading</p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <p role="status" className="text-sm">
              {p.filled} of {p.items.length} slots filled · {p.total} marks
              {p.status === 'final' ? ' · final: marks are entered question by question, each tagged with its learning outcome' : empty ? ` · ${empty} still to choose` : ' · ready to finalise'}
            </p>
            {p.bySection.map((g) => (
              <SectionSlots key={g.key} orgId={orgId} paper={p} section={g.key} marks={g.wanted} bank={bank} onChange={done} />
            ))}
          </div>
          <Preview orgId={orgId} paper={p} />
        </div>
      )}
    </section>
  )
}

/** The paper as it prints, refreshed as slots change. */
function Preview({ orgId, paper }: { orgId: string; paper: Paper }) {
  const [space, setSpace] = useState(true)
  const [key, setKey] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  // The content changes whenever a slot does; that is the cache key.
  const content = paper.items.map((i) => i.question?.id ?? '-').join()
  const html = useQuery({
    queryKey: ['paper-html', orgId, paper.id, content, key, space],
    queryFn: ({ signal }) => getPaperHtml(orgId, paper.id, key, space, signal),
    placeholderData: (prev) => prev,
  })
  return (
    <aside aria-label="Print preview" className="min-w-0 rounded-2xl border border-line bg-white lg:sticky lg:top-4">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2 text-sm">
        <h3 className="mr-auto font-bold">As it prints</h3>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={space} onChange={(e) => setSpace(e.target.checked)} />
          Space for answers
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={key} onChange={(e) => setKey(e.target.checked)} />
          Answer key
        </label>
        <button type="button" className={button} disabled={!html.data} onClick={() => frame.current?.contentWindow?.print()}>
          Print
        </button>
      </div>
      {html.isError ? (
        <Problem error={html.error} />
      ) : (
        <iframe ref={frame} title={`${paper.set} as it prints`} sandbox="allow-same-origin allow-modals" srcDoc={html.data ?? ''} className="h-[70vh] w-full rounded-b-2xl bg-white" />
      )}
    </aside>
  )
}

function SectionSlots({ orgId, paper, section, marks, bank, onChange }: { orgId: string; paper: Paper; section: string; marks: string; bank: Question[]; onChange: (p: Paper) => void }) {
  const settings = usePaperSettings(orgId)
  const tax = paper.taxonomy as Taxonomy
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
        (!it.level || questionLevel(q, tax) === it.level),
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
                  {it.level && ` · ${levelLabel(tax, it.level, settings)}`} · {it.marks} {it.marks === '1' ? 'mark' : 'marks'}
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

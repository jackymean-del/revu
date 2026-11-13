import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  addPaperItem,
  addPaperSection,
  deletePaperItem,
  deletePaperSection,
  putPaperItem,
  putPaperOrder,
  putPaperSection,
  type Paper,
  type PaperItem,
  type PaperSection,
  type Question,
  type TypedQuestion,
} from '../../api/client'
import { ApiError } from '../../api/problem'
import { hundredths, moveItem, moveSection, orderOf, type Order } from '../../lib/papers'
import { levelLabel, questionLevel, type Taxonomy } from '../../lib/taxonomy'
import { usePaperSettings } from './settings'
import { TypeSelect } from './TypeSelect'
import { PAPER, hasOptions } from './types'

const primary = 'rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const button = 'rounded-lg border border-line bg-white px-2.5 py-1 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const icon = 'grid size-7 place-items-center rounded border border-line bg-white text-sm text-muted hover:bg-canvas disabled:opacity-30'
const field = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const isMatch = (qtype: string) => /match/i.test(qtype)

type Drag = { kind: 'section'; id: string } | { kind: 'item'; id: string } | null

/**
 * The paper as section cards. A card shows its name, whether it is core or
 * extra and whether it prints; opened, it is where the section is named and
 * its questions are typed, picked from the bank, ordered and removed.
 * Everything moves by drag and drop, or by the up and down buttons.
 */
export function SectionCards({ orgId, paper, bank, onChange }: { orgId: string; paper: Paper; bank: Question[]; onChange: (p: Paper) => void }) {
  const draft = paper.status === 'draft'
  const [open, setOpen] = useState<string>(paper.sections[0]?.id ?? '')
  const [all, setAll] = useState(false)
  const [drag, setDrag] = useState<Drag>(null)
  const reorder = useMutation({ mutationFn: (o: Order) => putPaperOrder(orgId, paper.id, o), onSuccess: onChange })
  const add = useMutation({ mutationFn: () => addPaperSection(orgId, paper.id), onSuccess: (p) => (onChange(p), setOpen(p.sections.at(-1)?.id ?? '')) })
  const order = orderOf(paper)
  const err = (reorder.error ?? add.error) as Error | null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div role="group" aria-label="View" className="flex rounded-lg bg-mist p-0.5">
          {[
            [false, 'Cards'],
            [true, 'Full list'],
          ].map(([v, label]) => (
            <button key={String(label)} type="button" aria-pressed={all === v} onClick={() => setAll(v as boolean)} className={`rounded-md px-2.5 py-1 font-semibold ${all === v ? 'bg-white text-brand shadow-sm' : 'text-muted'}`}>
              {label}
            </button>
          ))}
        </div>
        {draft && <span className="text-xs text-muted">Drag a card or a question to move it, or use the arrows.</span>}
      </div>
      {err && <Problem error={err} />}
      {paper.sections.map((s, i) => (
        <SectionCard
          key={s.id}
          orgId={orgId}
          paper={paper}
          section={s}
          index={i}
          open={all || open === s.id}
          onToggle={() => setOpen(open === s.id ? '' : s.id)}
          bank={bank}
          draft={draft}
          drag={drag}
          setDrag={setDrag}
          busy={reorder.isPending}
          onOrder={(o) => reorder.mutate(o)}
          order={order}
          onChange={onChange}
        />
      ))}
      {draft && (
        <button type="button" className="w-full rounded-2xl border border-dashed border-line bg-white py-3 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50" disabled={add.isPending || paper.sections.length >= 26} onClick={() => add.mutate()}>
          Add a {PAPER.section}
        </button>
      )}
    </div>
  )
}

function SectionCard({ orgId, paper, section, index, open, onToggle, bank, draft, drag, setDrag, busy, onOrder, order, onChange }: {
  orgId: string
  paper: Paper
  section: PaperSection
  index: number
  open: boolean
  onToggle: () => void
  bank: Question[]
  draft: boolean
  drag: Drag
  setDrag: (d: Drag) => void
  busy: boolean
  onOrder: (o: Order) => void
  order: Order
  onChange: (p: Paper) => void
}) {
  const settings = usePaperSettings(orgId)
  const tax = paper.taxonomy as Taxonomy
  const items = paper.items.filter((i) => i.sectionId === section.id)
  const [title, setTitle] = useState(section.title)
  const [note, setNote] = useState(section.instructions)
  const [adding, setAdding] = useState<'' | 'type' | 'bank'>('')
  const [picking, setPicking] = useState('')
  const [over, setOver] = useState(false)
  const change = useMutation({ mutationFn: (b: Parameters<typeof putPaperSection>[3]) => putPaperSection(orgId, paper.id, section.id, b), onSuccess: onChange })
  const remove = useMutation({ mutationFn: () => deletePaperSection(orgId, paper.id, section.id), onSuccess: onChange })
  const drop = useMutation({ mutationFn: (item: string) => deletePaperItem(orgId, paper.id, item), onSuccess: onChange })
  const put = useMutation({ mutationFn: (v: { item: string; questionId: string }) => putPaperItem(orgId, paper.id, v.item, { questionId: v.questionId }), onSuccess: (p) => (setPicking(''), onChange(p)) })
  const err = (change.error ?? remove.error ?? drop.error ?? put.error) as Error | null
  const inPaper = new Set(paper.items.flatMap((i) => (i.question ? [i.question.id] : [])))
  const last = paper.sections.length - 1
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
  // A dragged section lands in this card's place; a dragged question at the end of this card.
  const onDrop = () => {
    setOver(false)
    if (!drag || !draft) return
    onOrder(drag.kind === 'section' ? moveSection(order, drag.id, index) : moveItem(order, drag.id, section.id, items.length))
    setDrag(null)
  }

  return (
    <section
      aria-label={section.title}
      className={`rounded-2xl border bg-white ${over ? 'border-brand ring-2 ring-brand/30' : 'border-line'}`}
      onDragOver={(e) => (draft && drag ? (e.preventDefault(), setOver(true)) : undefined)}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <header className="flex flex-wrap items-center gap-2 px-3 py-2.5" draggable={draft} onDragStart={() => setDrag({ kind: 'section', id: section.id })} onDragEnd={() => setDrag(null)}>
        {draft && (
          <span aria-hidden="true" className="cursor-grab select-none px-1 text-muted" title={`Drag to move this ${PAPER.section}`}>
            ⠿
          </span>
        )}
        <button type="button" aria-expanded={open} onClick={onToggle} className="min-w-0 flex-1 text-left">
          <span className="block truncate font-bold">{section.title}</span>
          <span className="block text-xs text-muted">
            {section.questions} {section.questions === 1 ? 'question' : 'questions'} · {section.marks} marks
          </span>
        </button>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${section.kind === 'core' ? 'bg-mist text-brand' : 'bg-amber-50 text-amber-800'}`}>{section.kind === 'core' ? 'Core' : 'Extra, not counted'}</span>
        {!section.print && <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold text-muted">Not printed</span>}
        {draft && (
          <>
            <button type="button" className={icon} aria-label={`Move ${section.title} up`} disabled={busy || index === 0} onClick={() => onOrder(moveSection(order, section.id, index - 1))}>
              ↑
            </button>
            <button type="button" className={icon} aria-label={`Move ${section.title} down`} disabled={busy || index === last} onClick={() => onOrder(moveSection(order, section.id, index + 1))}>
              ↓
            </button>
          </>
        )}
      </header>

      {open && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          {draft && (
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="flex flex-col gap-1 text-xs font-semibold">
                {PAPER.Section} name
                <input className={field} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== section.title && change.mutate({ title })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Instructions, printed under the name
                <input className={field} maxLength={500} placeholder="For example: answer any four" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== section.instructions && change.mutate({ instructions: note })} />
              </label>
              <div className="flex flex-wrap items-end gap-3 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={section.kind === 'extra'} onChange={(e) => change.mutate({ kind: e.target.checked ? 'extra' : 'core' })} />
                  Extra
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={section.print} onChange={(e) => change.mutate({ print: e.target.checked })} />
                  Print
                </label>
              </div>
            </div>
          )}
          {err && <Problem error={err} />}

          {items.length === 0 ? (
            <p className="rounded-lg bg-canvas px-3 py-2 text-sm text-muted">No questions here yet.</p>
          ) : (
            <ol className="divide-y divide-line rounded-xl border border-line">
              {items.map((it, k) => (
                <li
                  key={it.id}
                  className="px-2.5 py-2"
                  draggable={draft}
                  onDragStart={(e) => (e.stopPropagation(), setDrag({ kind: 'item', id: it.id }))}
                  onDragEnd={() => setDrag(null)}
                  onDragOver={(e) => (draft && drag?.kind === 'item' ? (e.preventDefault(), e.stopPropagation()) : undefined)}
                  onDrop={(e) => {
                    if (!draft || drag?.kind !== 'item') return
                    e.stopPropagation()
                    onOrder(moveItem(order, drag.id, section.id, k))
                    setDrag(null)
                  }}
                >
                  <div className="flex items-start gap-2">
                    {draft && (
                      <span aria-hidden="true" className="cursor-grab select-none pt-0.5 text-muted" title="Drag to move this question">
                        ⠿
                      </span>
                    )}
                    <span className="w-8 shrink-0 font-bold tabular-nums">Q{it.seq}</span>
                    <div className="min-w-0 flex-1">
                      {it.question ? <p className="whitespace-pre-wrap text-sm">{it.question.text}</p> : <p className="text-sm font-semibold text-amber-700">Still to choose</p>}
                      <p className="mt-0.5 text-xs text-muted">
                        {it.question?.qtype ?? it.section} · {it.marks} {it.marks === '1' ? 'mark' : 'marks'}
                        {it.chapter && ` · ${it.chapter}`}
                        {it.level && ` · ${levelLabel(tax, it.level, settings)}`}
                      </p>
                    </div>
                    {draft && (
                      <span className="flex shrink-0 gap-1">
                        {!it.question && (
                          <button type="button" className={button} aria-expanded={picking === it.id} onClick={() => setPicking(picking === it.id ? '' : it.id)}>
                            Choose
                          </button>
                        )}
                        <button type="button" className={icon} aria-label={`Move question ${it.seq} up`} disabled={busy || k === 0} onClick={() => onOrder(moveItem(order, it.id, section.id, k - 1))}>
                          ↑
                        </button>
                        <button type="button" className={icon} aria-label={`Move question ${it.seq} down`} disabled={busy || k === items.length - 1} onClick={() => onOrder(moveItem(order, it.id, section.id, k + 2))}>
                          ↓
                        </button>
                        <button type="button" className={icon} aria-label={`Remove question ${it.seq}`} disabled={drop.isPending} onClick={() => drop.mutate(it.id)}>
                          ×
                        </button>
                      </span>
                    )}
                  </div>
                  {picking === it.id && (
                    <ul className="mt-2 space-y-1 rounded-xl bg-canvas p-2">
                      {fits(it).length === 0 && <li className="p-1 text-sm text-muted">No approved question in the bank fits this slot. Remove the slot and type a question instead.</li>}
                      {fits(it).map((q) => (
                        <li key={q.id} className="flex items-start gap-2 rounded-lg bg-white p-2 text-sm">
                          <span className="flex-1 whitespace-pre-wrap">{q.text}</span>
                          <button type="button" className={button} disabled={put.isPending} onClick={() => put.mutate({ item: it.id, questionId: q.id })}>
                            Use this
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}

          {draft && adding === '' && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={primary} onClick={() => setAdding('type')}>
                Type a question
              </button>
              <button type="button" className={button} onClick={() => setAdding('bank')}>
                Add from the bank
              </button>
              <span className="flex-1" />
              <button
                type="button"
                className="text-sm font-semibold text-red-700 disabled:opacity-50"
                disabled={remove.isPending || paper.sections.length <= 1}
                title={paper.sections.length <= 1 ? `A paper keeps at least one ${PAPER.section}` : undefined}
                onClick={() => (items.length === 0 || window.confirm(`Remove ${section.title} and its ${items.length} questions from the paper? The questions stay in the bank.`)) && remove.mutate()}
              >
                Remove {PAPER.section}
              </button>
            </div>
          )}
          {adding === 'type' && <TypeQuestion orgId={orgId} paper={paper} sectionId={section.id} onAdded={onChange} onDone={(p) => (p && onChange(p), setAdding(''))} />}
          {adding === 'bank' && <FromBank orgId={orgId} paper={paper} sectionId={section.id} bank={bank.filter((q) => q.status === 'approved' && !inPaper.has(q.id))} onChange={onChange} onClose={() => setAdding('')} />}
        </div>
      )}
    </section>
  )
}

/** A question typed straight into the paper; it joins the bank as it is added. */
function TypeQuestion({ orgId, paper, sectionId, onAdded, onDone }: { orgId: string; paper: Paper; sectionId: string; onAdded: (p: Paper) => void; onDone: (p?: Paper) => void }) {
  const [q, setQ] = useState<TypedQuestion>({ qtype: 'Short answer', marks: '', text: '', options: [], answer: '' })
  const [more, setMore] = useState(false)
  const add = useMutation({
    mutationFn: (again: boolean) =>
      addPaperItem(orgId, paper.id, { sectionId, question: { ...q, options: hasOptions(q.qtype) || isMatch(q.qtype) ? (q.options ?? []).filter((o) => o.trim()) : [] } }).then((p) => ({ p, again })),
    onSuccess: ({ p, again }) => {
      if (again) {
        // Keep the type and marks: the next question is usually like the last.
        setQ({ ...q, text: '', options: [], answer: '' })
        setMore(true)
        onAdded(p)
      } else onDone(p)
    },
  })
  const options = q.options ?? []
  const choice = hasOptions(q.qtype)
  const match = isMatch(q.qtype)
  return (
    <form
      aria-label="Type a question"
      className="space-y-2 rounded-xl border border-brand/30 bg-mist/40 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        add.mutate(false)
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Type
          <TypeSelect label="Question type" className="py-1.5" value={q.qtype} onChange={(v) => setQ({ ...q, qtype: v })} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Marks
          <input required aria-label="Marks" inputMode="decimal" pattern="\d{1,4}(\.\d{1,2})?" className={field} value={q.marks} onChange={(e) => setQ({ ...q, marks: e.target.value })} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Question
        <textarea required aria-label="Question" rows={3} maxLength={5000} className={field} value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} placeholder={/blank/i.test(q.qtype) ? 'Use ____ for each blank' : undefined} />
      </label>
      {(choice || match) && (
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold">{match ? 'Pairs, written as left = right' : 'Options, in order'}</legend>
          {[...options, ''].slice(0, 8).map((o, i) => (
            <input
              key={i}
              aria-label={`${match ? 'Pair' : 'Option'} ${i + 1}`}
              className={`${field} w-full`}
              placeholder={match ? 'Delhi = India' : undefined}
              value={o}
              onChange={(e) => {
                const next = [...options]
                next[i] = e.target.value
                setQ({ ...q, options: next.filter((x, j) => x.trim() || j < next.length - 1) })
              }}
            />
          ))}
        </fieldset>
      )}
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Answer or marking guide, for the answer key
        <input aria-label="Answer" className={field} value={q.answer ?? ''} onChange={(e) => setQ({ ...q, answer: e.target.value })} />
      </label>
      {add.error && <Problem error={add.error} />}
      {more && !add.error && <p className="text-xs font-semibold text-emerald-700">Added. Type the next one.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primary} disabled={add.isPending}>
          Add question
        </button>
        <button type="button" className={button} disabled={add.isPending || !q.text.trim() || !q.marks.trim()} onClick={() => add.mutate(true)}>
          Add and type another
        </button>
        <button type="button" className={button} onClick={() => onDone()}>
          Close
        </button>
      </div>
    </form>
  )
}

function FromBank({ orgId, paper, sectionId, bank, onChange, onClose }: { orgId: string; paper: Paper; sectionId: string; bank: Question[]; onChange: (p: Paper) => void; onClose: () => void }) {
  const [find, setFind] = useState('')
  const add = useMutation({ mutationFn: (questionId: string) => addPaperItem(orgId, paper.id, { sectionId, questionId }), onSuccess: onChange })
  const shown = bank.filter((q) => !find.trim() || `${q.text} ${q.qtype}`.toLowerCase().includes(find.trim().toLowerCase())).slice(0, 30)
  return (
    <div className="space-y-2 rounded-xl border border-line bg-canvas p-3">
      <div className="flex gap-2">
        <input aria-label="Find in the bank" placeholder="Find by words or type" className={`${field} flex-1`} value={find} onChange={(e) => setFind(e.target.value)} />
        <button type="button" className={button} onClick={onClose}>
          Close
        </button>
      </div>
      {add.error && <Problem error={add.error} />}
      {shown.length === 0 ? (
        <p className="text-sm text-muted">Nothing in the bank matches. Type a question instead.</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-auto">
          {shown.map((q) => (
            <li key={q.id} className="flex items-start gap-2 rounded-lg bg-white p-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block whitespace-pre-wrap">{q.text}</span>
                <span className="text-xs text-muted">
                  {q.qtype} · {q.marks} {q.marks === '1' ? 'mark' : 'marks'}
                </span>
              </span>
              <button type="button" className={button} disabled={add.isPending} onClick={() => add.mutate(q.id)}>
                Add
              </button>
            </li>
          ))}
        </ul>
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

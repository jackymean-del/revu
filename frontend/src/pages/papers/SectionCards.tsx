import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
  type Syllabus,
  updateQuestion,
} from '../../api/client'
import { bitsAlike, hundredths, moveItem, moveSection, orderOf, parentsOf, type Order, type Parents } from '../../lib/papers'
import { levelLabel, questionLevel, type Taxonomy } from '../../lib/taxonomy'
import { useLater } from '../../lib/undo'
import { AiDraft } from './AiDraft'
import { Problem, QuestionForm } from './QuestionForm'
import { usePaperSettings } from './settings'
import { PAPER } from './types'

const primary = 'rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const button = 'rounded-lg border border-line bg-white px-2.5 py-1 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const icon = 'grid size-7 place-items-center rounded border border-line bg-white text-sm text-muted hover:bg-canvas disabled:opacity-30'
const field = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const letter = (i: number) => String.fromCharCode(97 + i)

type Drag = { kind: 'section'; id: string } | { kind: 'item'; id: string } | null

/** What every card of one paper shares. */
interface Board {
  orgId: string
  paper: Paper
  bank: Question[]
  syllabus: Syllabus
  place: { levelId: string; subjectId: string }
  draft: boolean
  open: Set<string>
  gone: Set<string> // removed, with Undo still open
  hide: (id: string, on: boolean) => void
  toggle: (id: string) => void
  editing: string
  setEditing: (itemId: string) => void
  drag: Drag
  setDrag: (d: Drag) => void
  busy: boolean
  order: Order
  parents: Parents
  onOrder: (o: Order) => void
  onChange: (p: Paper) => void
}

/**
 * The paper at every level: sections, the sub-sections in them, questions,
 * and a question's bits. As cards, a section shows its name, whether it is
 * core or extra and whether it prints, with its sub-sections as cards inside
 * it; a card's questions show only once it is opened, where it is named and
 * its questions are typed, picked from the bank, changed, ordered and
 * removed. Everything moves by drag and drop, or by the up and down
 * buttons. One button opens or closes every card at once.
 */
export function SectionCards({ orgId, paper, bank, syllabus, place, onChange }: {
  orgId: string
  paper: Paper
  bank: Question[]
  syllabus: Syllabus
  place: { levelId: string; subjectId: string }
  onChange: (p: Paper) => void
}) {
  // Whoever may change the set: its teachers while a draft, then those who moderate.
  const draft = paper.may.edit
  const [open, setOpen] = useState<Set<string>>(() => new Set(paper.sections.slice(0, 1).flatMap((s) => (paper.sections.some((x) => x.parentId === s.id) ? [] : [s.id]))))
  const [editing, setEditing] = useState('')
  const [drag, setDrag] = useState<Drag>(null)
  const [gone, setGone] = useState<Set<string>>(new Set())
  const reorder = useMutation({ mutationFn: (o: Order) => putPaperOrder(orgId, paper.id, o), onSuccess: onChange })
  const add = useMutation({ mutationFn: () => addPaperSection(orgId, paper.id), onSuccess: (p) => (onChange(p), setOpen(new Set([...open, p.sections.filter((s) => !s.parentId).at(-1)?.id ?? '']))) })
  const err = (reorder.error ?? add.error) as Error | null
  const tops = paper.sections.filter((s) => !s.parentId && !gone.has(s.id))

  // Every section and sub-section, to open or close them all at once.
  const every = paper.sections.filter((x) => !gone.has(x.id)).map((x) => x.id)
  const allOpen = every.length > 0 && every.every((id) => open.has(id))

  const board: Board = {
    orgId,
    paper,
    bank,
    syllabus,
    place,
    draft,
    open,
    gone,
    hide: (id, on) => setGone((was) => new Set(on ? [...was, id] : [...was].filter((x) => x !== id))),
    toggle: (id) => setOpen((was) => new Set(was.has(id) ? [...was].filter((x) => x !== id) : [...was, id])),
    editing,
    setEditing,
    drag,
    setDrag,
    busy: reorder.isPending,
    order: orderOf(paper),
    parents: parentsOf(paper),
    onOrder: (o) => reorder.mutate(o),
    onChange,
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {draft && <span className="flex-1 text-xs text-muted">Drag a card or a question to move it, or use the arrows.</span>}
        <button type="button" className={`${button} ml-auto`} onClick={() => setOpen(new Set(allOpen ? [] : every))}>
          {allOpen ? 'Close all' : 'Open all'}
        </button>
      </div>
      {err && <Problem error={err} />}
      {tops.map((s) => (
        <SectionCard key={s.id} board={board} section={s} />
      ))}
      {draft && (
        <button type="button" className="w-full rounded-2xl border border-dashed border-line bg-white py-3 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50" disabled={add.isPending || tops.length >= 26} onClick={() => add.mutate()}>
          Add a {PAPER.section}
        </button>
      )}
    </div>
  )
}

function SectionCard({ board, section }: { board: Board; section: PaperSection }) {
  const { orgId, paper, bank, syllabus, place: scope, draft, drag, setDrag, busy, order, parents, onOrder, onChange, editing, setEditing } = board
  const settings = usePaperSettings(orgId)
  const tax = paper.taxonomy as Taxonomy
  const sub = !!section.parentId
  const word = sub ? `sub-${PAPER.section}` : PAPER.section
  const items = paper.items.filter((i) => i.sectionId === section.id && !board.gone.has(i.id))
  const subs = paper.sections.filter((s) => s.parentId === section.id && !board.gone.has(s.id))
  const later = useLater()
  // A removal waits a few seconds with Undo; the card goes at once.
  const removeLater = (id: string, label: string, run: () => Promise<Paper>) => {
    board.hide(id, true)
    later(
      label,
      () => void run().then(onChange).finally(() => board.hide(id, false)),
      () => board.hide(id, false),
    )
  }
  const siblings = paper.sections.filter((s) => (s.parentId ?? '') === (section.parentId ?? ''))
  const place = siblings.findIndex((s) => s.id === section.id)
  const open = board.open.has(section.id)
  const [title, setTitle] = useState(section.title)
  const [note, setNote] = useState(section.instructions)
  const [adding, setAdding] = useState<'' | 'type' | 'bank'>('')
  const [picking, setPicking] = useState('')
  const [over, setOver] = useState(false)
  const change = useMutation({ mutationFn: (b: Parameters<typeof putPaperSection>[3]) => putPaperSection(orgId, paper.id, section.id, b), onSuccess: onChange })
  const addSub = useMutation({ mutationFn: () => addPaperSection(orgId, paper.id, section.id), onSuccess: (p) => (onChange(p), board.toggle(p.sections.filter((s) => s.parentId === section.id).at(-1)?.id ?? '')) })
  // Using a draft is approving it.
  const put = useMutation({
    mutationFn: async (v: { item: string; q: Question }) => {
      if (v.q.status === 'draft') await approve(orgId, scope, v.q)
      return putPaperItem(orgId, paper.id, v.item, { questionId: v.q.id })
    },
    onSuccess: (p) => (setPicking(''), onChange(p)),
  })
  const err = (change.error ?? addSub.error ?? put.error) as Error | null
  const inPaper = new Set(paper.items.flatMap((i) => (i.question ? [i.question.id] : [])))
  const only = !sub && siblings.length <= 1
  const fits = (it: PaperItem) =>
    bank.filter(
      (q) =>
        q.status !== 'retired' &&
        !inPaper.has(q.id) &&
        q.qtype.toLowerCase() === it.section.toLowerCase() &&
        hundredths(q.marks) === hundredths(it.marks) &&
        (!it.lessonId || q.lessonId === it.lessonId) &&
        (!it.level || questionLevel(q, tax) === it.level),
    )
  // A dragged section lands in this card's place; a dragged question at the end of this card.
  const onDrop = (e: React.DragEvent) => {
    e.stopPropagation()
    setOver(false)
    if (!drag || !draft) return
    onOrder(drag.kind === 'section' ? moveSection(order, parents, drag.id, section.id) : moveItem(order, drag.id, section.id, items.length))
    setDrag(null)
  }

  return (
    <section
      id={`sec-${section.id}`}
      aria-label={section.title}
      className={`border bg-white ${sub ? 'rounded-xl' : 'rounded-2xl'} ${over ? 'border-brand ring-2 ring-brand/30' : 'border-line'}`}
      onDragOver={(e) => (draft && drag ? (e.preventDefault(), e.stopPropagation(), setOver(true)) : undefined)}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <header className={`flex flex-wrap items-center gap-2 px-3 ${sub ? 'py-2' : 'py-2.5'}`} draggable={draft} onDragStart={(e) => (e.stopPropagation(), setDrag({ kind: 'section', id: section.id }))} onDragEnd={() => setDrag(null)}>
        {draft && (
          <span aria-hidden="true" className="cursor-grab select-none px-1 text-muted" title={`Drag to move this ${word}`}>
            ⠿
          </span>
        )}
        <button type="button" aria-expanded={open} onClick={() => board.toggle(section.id)} className="min-w-0 flex-1 text-left">
          <span className={`block truncate font-bold ${sub ? 'text-sm' : ''}`}>{section.title}</span>
          <span className="block text-xs text-muted">
            {subs.length > 0 && `${subs.length} ${subs.length === 1 ? `sub-${PAPER.section}` : `sub-${PAPER.sections}`} · `}
            {section.questions} {section.questions === 1 ? 'question' : 'questions'} · {section.marks} marks
          </span>
        </button>
        {!sub && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${section.kind === 'core' ? 'bg-mist text-brand' : 'bg-amber-50 text-amber-800'}`}>{section.kind === 'core' ? 'Core' : 'Extra, not counted'}</span>}
        {!section.print && <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold text-muted">Not printed</span>}
        {draft && (
          <>
            <button type="button" className={icon} aria-label={`Move ${section.title} up`} disabled={busy || place === 0} onClick={() => onOrder(moveSection(order, parents, section.id, siblings[place - 1].id))}>
              ↑
            </button>
            <button type="button" className={icon} aria-label={`Move ${section.title} down`} disabled={busy || place === siblings.length - 1} onClick={() => onOrder(moveSection(order, parents, siblings[place + 1].id, section.id))}>
              ↓
            </button>
          </>
        )}
      </header>

      {(open || subs.length > 0) && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          {open && draft && (
            <div className="flex flex-wrap gap-2">
              <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs font-semibold">
                {sub ? `Sub-${PAPER.section}` : PAPER.Section} name
                <input className={field} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== section.title && change.mutate({ title })} />
              </label>
              <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs font-semibold">
                Instructions, printed under the name
                <input className={field} maxLength={500} placeholder="For example: answer any four" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== section.instructions && change.mutate({ instructions: note })} />
              </label>
              <div className="flex flex-wrap items-end gap-3 pb-1.5 text-sm">
                {!sub && (
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={section.kind === 'extra'} onChange={(e) => change.mutate({ kind: e.target.checked ? 'extra' : 'core' })} />
                    Extra
                  </label>
                )}
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={section.print} onChange={(e) => change.mutate({ print: e.target.checked })} />
                  Print
                </label>
              </div>
            </div>
          )}
          {err && <Problem error={err} />}

          {!open ? null : items.length === 0 ? (
            subs.length === 0 && <p className="rounded-lg bg-canvas px-3 py-2 text-sm text-muted">No questions here yet.</p>
          ) : (
            <ol className="divide-y divide-line rounded-xl border border-line">
              {items.map((it, k) => (
                <li
                  key={it.id}
                  id={`item-${it.id}`}
                  className="px-2.5 py-2"
                  draggable={draft && editing !== it.id}
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
                  <div className="flex flex-wrap items-start gap-2">
                    {draft && (
                      <span aria-hidden="true" className="cursor-grab select-none pt-0.5 text-muted" title="Drag to move this question">
                        ⠿
                      </span>
                    )}
                    <span className="w-8 shrink-0 font-bold tabular-nums">Q{it.seq}</span>
                    <div className="min-w-0 flex-1">
                      {it.question ? <p className="whitespace-pre-wrap text-sm">{it.question.text}</p> : <p className="text-sm font-semibold text-amber-700">Still to choose</p>}
                    {it.question && !/match/i.test(it.question.qtype) && <Choices options={it.question.options} answer={it.question.answer} />}
                      {(it.question?.bits ?? []).length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-sm">
                          {(it.question?.bits ?? []).map((b, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="w-6 shrink-0 text-muted">({letter(i)})</span>
                              <span className="min-w-0 flex-1 whitespace-pre-wrap">
                                {b.text}
                                {b.qtype && <span className="ml-2 text-xs text-muted">{b.qtype}</span>}
                                <Choices options={b.options ?? []} answer={b.answer ?? ''} />
                              </span>
                              {!bitsAlike(it.question?.bits ?? []) && <span className="shrink-0 text-xs text-muted">[{b.marks}]</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-0.5 text-xs text-muted">
                        {(it.question?.bits ?? []).some((b) => b.qtype) ? 'Mixed types' : (it.question?.qtype ?? it.section)} · {bitsAlike(it.question?.bits ?? []) && `${it.question?.bits?.length} × ${it.question?.bits?.[0].marks} = `}
                        {it.marks} {it.marks === '1' ? 'mark' : 'marks'}
                        {it.chapter && ` · ${it.chapter}`}
                        {it.sameAsSource && draft && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">Same as {paper.copiedFrom}</span>}
                        {it.level && ` · ${levelLabel(tax, it.level, settings)}`}
                      </p>
                    </div>
                    {draft && (
                      <span className="flex shrink-0 gap-1 max-sm:w-full max-sm:justify-end">
                        {it.question ? (
                          <button type="button" className={button} aria-label={`Edit question ${it.seq}`} aria-expanded={editing === it.id} onClick={() => setEditing(editing === it.id ? '' : it.id)}>
                            Edit
                          </button>
                        ) : (
                          <>
                            <button type="button" className={button} aria-expanded={editing === it.id} onClick={() => (setPicking(''), setEditing(editing === it.id ? '' : it.id))}>
                              Type it
                            </button>
                            <button type="button" className={button} aria-expanded={picking === it.id} onClick={() => (setEditing(''), setPicking(picking === it.id ? '' : it.id))}>
                              Pick
                            </button>
                          </>
                        )}
                        <button type="button" className={icon} aria-label={`Move question ${it.seq} up`} disabled={busy || k === 0} onClick={() => onOrder(moveItem(order, it.id, section.id, k - 1))}>
                          ↑
                        </button>
                        <button type="button" className={icon} aria-label={`Move question ${it.seq} down`} disabled={busy || k === items.length - 1} onClick={() => onOrder(moveItem(order, it.id, section.id, k + 2))}>
                          ↓
                        </button>
                        <button type="button" className={icon} aria-label={`Remove question ${it.seq}`} onClick={() => removeLater(it.id, `Removed Q${it.seq}`, () => deletePaperItem(orgId, paper.id, it.id))}>
                          ×
                        </button>
                      </span>
                    )}
                  </div>
                  {editing === it.id && draft && (
                    <div className="mt-2">
                      <QuestionForm
                        key={it.question?.id ?? it.id}
                        orgId={orgId}
                        paper={paper}
                        sectionId={section.id}
                        editing={it.question}
                        slot={it}
                        itemId={it.id}
                        syllabus={syllabus}
                        onAdded={onChange}
                        onDone={(p) => (p && onChange(p), setEditing(''))}
                      />
                    </div>
                  )}
                  {picking === it.id && (
                    <ul className="mt-2 space-y-1 rounded-xl bg-canvas p-2">
                      <li className="flex flex-wrap items-center gap-2 p-1 text-sm text-muted">
                        <span className="flex-1">{fits(it).length === 0 ? 'Nothing in the bank fits this slot yet. Type one, or draft some with AI.' : 'Questions in the bank that fit this slot.'}</span>
                        <AiDraft
                          orgId={orgId}
                          place={scope}
                          need={{ key: it.id, lessonId: it.lessonId, chapter: it.chapter, qtype: it.section, level: it.level ?? '', marks: it.marks, count: 3, have: 0 }}
                          taxonomy={tax}
                          syllabus={syllabus}
                          onDone={() => onChange(paper)}
                        />
                      </li>
                      {fits(it).map((q) => (
                        <li key={q.id} className="flex items-start gap-2 rounded-lg bg-white p-2 text-sm">
                          <span className="flex-1 whitespace-pre-wrap">
                            {q.text}
                            {q.status === 'draft' && <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800">{q.source === 'ai' ? 'AI draft' : 'Draft'}</span>}
                          </span>
                          <button type="button" className={button} disabled={put.isPending} onClick={() => put.mutate({ item: it.id, q })}>
                            {q.status === 'draft' ? 'Approve and use' : 'Use this'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}

          {subs.map((s) => (
            <SectionCard key={s.id} board={board} section={s} />
          ))}

          {open && draft && adding === '' && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={primary} onClick={() => setAdding('type')}>
                Type a question
              </button>
              <button type="button" className={button} onClick={() => setAdding('bank')}>
                Add from the bank
              </button>
              {!sub && (
                <button type="button" className={button} disabled={addSub.isPending || subs.length >= 26} onClick={() => addSub.mutate()}>
                  Add a sub-{PAPER.section}
                </button>
              )}
              <span className="flex-1" />
              <button
                type="button"
                className="text-sm font-semibold text-red-700 disabled:opacity-50"
                disabled={only}
                title={only ? `A paper keeps at least one ${PAPER.section}` : undefined}
                onClick={() => removeLater(section.id, `Removed ${section.title}${section.questions ? ` and its ${section.questions} ${section.questions === 1 ? 'question' : 'questions'}` : ''}`, () => deletePaperSection(orgId, paper.id, section.id))}
              >
                Remove {word}
              </button>
            </div>
          )}
          {open && adding === 'type' && <QuestionForm orgId={orgId} paper={paper} sectionId={section.id} syllabus={syllabus} onAdded={onChange} onDone={(p) => (p && onChange(p), setAdding(''))} />}
          {open && adding === 'bank' && <FromBank orgId={orgId} paper={paper} place={scope} sectionId={section.id} bank={bank.filter((q) => q.status !== 'retired' && !inPaper.has(q.id))} onChange={onChange} onClose={() => setAdding('')} />}
        </div>
      )}
    </section>
  )
}

/** A question's options in one line, the right one in green. */
function Choices({ options, answer }: { options: string[]; answer: string }) {
  if (options.length === 0 || options.some((o) => o.includes('='))) return null
  return (
    <span className="block text-xs text-muted">
      {options.map((o, i) => (
        <span key={i} className={o.trim().toLowerCase() === answer.trim().toLowerCase() ? 'font-semibold text-emerald-700' : undefined}>
          {i > 0 && <span className="font-normal text-muted"> · </span>}
          {o}
        </span>
      ))}
    </span>
  )
}

/** A bank question as the server takes it back, made approved or retired. */
const approve = (orgId: string, place: { levelId: string; subjectId: string }, q: Question, status: 'approved' | 'retired' = 'approved') =>
  updateQuestion(orgId, q.id, {
    ...place,
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
    bits: q.bits,
    spaceKind: q.spaceKind,
    spaceSize: q.spaceSize,
    optionCols: q.optionCols,
    optionBoxes: q.optionBoxes,
    source: q.source,
    status,
  })

/**
 * The class and subject's question bank, to add from: approved questions
 * and drafts (approved by using them). A question no longer wanted is
 * retired here; it stays in past papers.
 */
function FromBank({ orgId, paper, place, sectionId, bank, onChange, onClose }: {
  orgId: string
  paper: Paper
  place: { levelId: string; subjectId: string }
  sectionId: string
  bank: Question[]
  onChange: (p: Paper) => void
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [find, setFind] = useState('')
  const add = useMutation({
    mutationFn: async (q: Question) => {
      if (q.status === 'draft') await approve(orgId, place, q)
      return addPaperItem(orgId, paper.id, { sectionId, questionId: q.id })
    },
    onSuccess: onChange,
  })
  const retire = useMutation({ mutationFn: (q: Question) => approve(orgId, place, q, 'retired'), onSuccess: () => qc.invalidateQueries({ queryKey: ['questions', orgId] }) })
  const shown = bank.filter((q) => !find.trim() || `${q.text} ${q.qtype}`.toLowerCase().includes(find.trim().toLowerCase())).slice(0, 30)
  const error = (add.error ?? retire.error) as Error | null
  return (
    <div className="space-y-2 rounded-xl border border-line bg-canvas p-3">
      <div className="flex gap-2">
        <input aria-label="Find in the bank" placeholder="Find by words or type" className={`${field} flex-1`} value={find} onChange={(e) => setFind(e.target.value)} />
        <button type="button" className={button} onClick={onClose}>
          Close
        </button>
      </div>
      {error && <Problem error={error} />}
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
                  {q.status === 'draft' && <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 font-semibold text-violet-800">{q.source === 'ai' ? 'AI draft' : 'Draft'}</span>}
                </span>
              </span>
              <button type="button" className={button} disabled={add.isPending} onClick={() => add.mutate(q)}>
                {q.status === 'draft' ? 'Approve and add' : 'Add'}
              </button>
              <button type="button" className="px-1 text-xs font-semibold text-muted hover:text-red-700" disabled={retire.isPending} onClick={() => retire.mutate(q)} title="No longer used in new papers; past papers keep it">
                Retire
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

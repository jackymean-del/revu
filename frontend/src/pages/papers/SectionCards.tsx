import { useEffect, useRef, useState } from 'react'
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
} from '../../api/client'
import { bitsAlike, hundredths, moveItem, moveSection, orderOf, parentsOf, type Order, type Parents } from '../../lib/papers'
import { levelLabel, questionLevel, type Taxonomy } from '../../lib/taxonomy'
import { Outline, type Place } from './Outline'
import { Problem, QuestionForm } from './QuestionForm'
import { usePaperSettings } from './settings'
import { PAPER } from './types'

const primary = 'rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const button = 'rounded-lg border border-line bg-white px-2.5 py-1 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const icon = 'grid size-7 place-items-center rounded border border-line bg-white text-sm text-muted hover:bg-canvas disabled:opacity-30'
const field = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const letter = (i: number) => String.fromCharCode(97 + i)

type Drag = { kind: 'section'; id: string } | { kind: 'item'; id: string } | null
type View = 'cards' | 'list' | 'outline'

/** What every card of one paper shares. */
interface Board {
  orgId: string
  paper: Paper
  bank: Question[]
  draft: boolean
  all: boolean
  open: Set<string>
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
 * buttons. The outline shows the whole paper as a tree and goes straight to
 * any level of it.
 */
export function SectionCards({ orgId, paper, bank, onChange }: { orgId: string; paper: Paper; bank: Question[]; onChange: (p: Paper) => void }) {
  const draft = paper.status === 'draft'
  const [open, setOpen] = useState<Set<string>>(() => new Set(paper.sections.slice(0, 1).flatMap((s) => (paper.sections.some((x) => x.parentId === s.id) ? [] : [s.id]))))
  const [view, setView] = useState<View>('cards')
  const [editing, setEditing] = useState('')
  const [drag, setDrag] = useState<Drag>(null)
  const goal = useRef('')
  const reorder = useMutation({ mutationFn: (o: Order) => putPaperOrder(orgId, paper.id, o), onSuccess: onChange })
  const add = useMutation({ mutationFn: () => addPaperSection(orgId, paper.id), onSuccess: (p) => (onChange(p), setOpen(new Set([...open, p.sections.filter((s) => !s.parentId).at(-1)?.id ?? '']))) })
  const err = (reorder.error ?? add.error) as Error | null
  const tops = paper.sections.filter((s) => !s.parentId)

  // After a jump from the outline, bring the place asked for into view.
  useEffect(() => {
    if (!goal.current) return
    document.getElementById(goal.current)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    goal.current = ''
  })
  const go = (to: Place) => {
    const s = paper.sections.find((x) => x.id === to.sectionId)
    setOpen(new Set([...open, to.sectionId, s?.parentId ?? to.sectionId]))
    setEditing(to.itemId && draft ? to.itemId : '')
    goal.current = to.itemId ? `item-${to.itemId}` : `sec-${to.sectionId}`
    setView('cards')
  }

  const board: Board = {
    orgId,
    paper,
    bank,
    draft,
    all: view === 'list',
    open,
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
        <div role="group" aria-label="View" className="flex rounded-lg bg-mist p-0.5">
          {(
            [
              ['cards', 'Cards'],
              ['list', 'Full list'],
              ['outline', 'Outline'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-md px-2.5 py-1 font-semibold ${view === v ? 'bg-white text-brand shadow-sm' : 'text-muted'}`}>
              {label}
            </button>
          ))}
        </div>
        {view === 'outline' ? (
          <span className="text-xs text-muted">The whole paper, level by level. Choose any line to go to it.</span>
        ) : (
          draft && <span className="text-xs text-muted">Drag a card or a question to move it, or use the arrows.</span>
        )}
      </div>
      {err && <Problem error={err} />}
      {view === 'outline' ? <Outline paper={paper} draft={draft} onGo={go} /> : tops.map((s) => <SectionCard key={s.id} board={board} section={s} />)}
      {draft && view !== 'outline' && (
        <button type="button" className="w-full rounded-2xl border border-dashed border-line bg-white py-3 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50" disabled={add.isPending || tops.length >= 26} onClick={() => add.mutate()}>
          Add a {PAPER.section}
        </button>
      )}
    </div>
  )
}

function SectionCard({ board, section }: { board: Board; section: PaperSection }) {
  const { orgId, paper, bank, draft, drag, setDrag, busy, order, parents, onOrder, onChange, editing, setEditing } = board
  const settings = usePaperSettings(orgId)
  const tax = paper.taxonomy as Taxonomy
  const sub = !!section.parentId
  const word = sub ? `sub-${PAPER.section}` : PAPER.section
  const items = paper.items.filter((i) => i.sectionId === section.id)
  const subs = paper.sections.filter((s) => s.parentId === section.id)
  const siblings = paper.sections.filter((s) => (s.parentId ?? '') === (section.parentId ?? ''))
  const place = siblings.findIndex((s) => s.id === section.id)
  const open = board.all || board.open.has(section.id)
  const [title, setTitle] = useState(section.title)
  const [note, setNote] = useState(section.instructions)
  const [adding, setAdding] = useState<'' | 'type' | 'bank'>('')
  const [picking, setPicking] = useState('')
  const [over, setOver] = useState(false)
  const change = useMutation({ mutationFn: (b: Parameters<typeof putPaperSection>[3]) => putPaperSection(orgId, paper.id, section.id, b), onSuccess: onChange })
  const remove = useMutation({ mutationFn: () => deletePaperSection(orgId, paper.id, section.id), onSuccess: onChange })
  const addSub = useMutation({ mutationFn: () => addPaperSection(orgId, paper.id, section.id), onSuccess: (p) => (onChange(p), board.toggle(p.sections.filter((s) => s.parentId === section.id).at(-1)?.id ?? '')) })
  const drop = useMutation({ mutationFn: (item: string) => deletePaperItem(orgId, paper.id, item), onSuccess: onChange })
  const put = useMutation({ mutationFn: (v: { item: string; questionId: string }) => putPaperItem(orgId, paper.id, v.item, { questionId: v.questionId }), onSuccess: (p) => (setPicking(''), onChange(p)) })
  const err = (change.error ?? remove.error ?? addSub.error ?? drop.error ?? put.error) as Error | null
  const inPaper = new Set(paper.items.flatMap((i) => (i.question ? [i.question.id] : [])))
  const only = !sub && siblings.length <= 1
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
                  <div className="flex items-start gap-2">
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
                        {it.level && ` · ${levelLabel(tax, it.level, settings)}`}
                      </p>
                    </div>
                    {draft && (
                      <span className="flex shrink-0 gap-1">
                        {it.question ? (
                          <button type="button" className={button} aria-label={`Edit question ${it.seq}`} aria-expanded={editing === it.id} onClick={() => setEditing(editing === it.id ? '' : it.id)}>
                            Edit
                          </button>
                        ) : (
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
                  {editing === it.id && it.question && draft && (
                    <div className="mt-2">
                      <QuestionForm key={it.question.id} orgId={orgId} paper={paper} sectionId={section.id} editing={it.question} onAdded={onChange} onDone={(p) => (p && onChange(p), setEditing(''))} />
                    </div>
                  )}
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
                disabled={remove.isPending || only}
                title={only ? `A paper keeps at least one ${PAPER.section}` : undefined}
                onClick={() => (section.questions === 0 || window.confirm(`Remove ${section.title} and its ${section.questions} questions from the paper? The questions stay in the bank.`)) && remove.mutate()}
              >
                Remove {word}
              </button>
            </div>
          )}
          {open && adding === 'type' && <QuestionForm orgId={orgId} paper={paper} sectionId={section.id} onAdded={onChange} onDone={(p) => (p && onChange(p), setAdding(''))} />}
          {open && adding === 'bank' && <FromBank orgId={orgId} paper={paper} sectionId={section.id} bank={bank.filter((q) => q.status === 'approved' && !inPaper.has(q.id))} onChange={onChange} onClose={() => setAdding('')} />}
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

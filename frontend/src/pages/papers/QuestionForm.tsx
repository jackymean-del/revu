import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { addPaperItem, putPaperItem, type Paper, type Question, type TypedQuestion } from '../../api/client'
import { ApiError } from '../../api/problem'
import { hundredths, marks } from '../../lib/papers'
import { TypeSelect } from './TypeSelect'
import { QUESTION_TYPES, hasOptions } from './types'

const primary = 'rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const button = 'rounded-lg border border-line bg-white px-2.5 py-1 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const icon = 'grid size-7 place-items-center rounded border border-line bg-white text-sm text-muted hover:bg-canvas disabled:opacity-30'
const field = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const label = 'flex flex-col gap-1 text-xs font-semibold'
const hint = 'text-xs font-normal text-muted'
const letter = (i: number) => String.fromCharCode(97 + i)
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

type Bit = NonNullable<Question['bits']>[number]

/** How a question, or a bit of one, is answered: by choosing, true or false, matching, or writing. */
type Kind = 'choice' | 'truth' | 'match' | 'written'
const kindOf = (qtype: string): Kind => (/true or false/i.test(qtype) ? 'truth' : /match/i.test(qtype) ? 'match' : hasOptions(qtype) ? 'choice' : 'written')
const same = (a: string, b: string) => a.trim() !== '' && a.trim().toLowerCase() === b.trim().toLowerCase()
const sides = (pair: string) => {
  const at = pair.indexOf('=')
  return at < 0 ? [pair.trim(), ''] : [pair.slice(0, at).trim(), pair.slice(at + 1).trim()]
}
/** What is sent for a kind: its options or pairs with the empty ones dropped; none when it has none. */
const clean = (kind: Kind, options?: string[]) => (kind === 'choice' || kind === 'match' ? (options ?? []).map((o) => o.trim()).filter((o) => o.replace('=', '').trim()) : [])

/**
 * What a question or a bit is answered from, with the right answer marked on
 * it instead of typed again: a click on an option's letter turns it green,
 * true or false is one of two buttons, and matching pairs are right as they
 * are written.
 */
function Answers({ kind, of, numbered, tight, options, answer, onChange }: { kind: Kind; of: string; numbered?: boolean; tight?: boolean; options: string[]; answer: string; onChange: (v: { options?: string[]; answer?: string }) => void }) {
  if (kind === 'truth')
    return (
      <div role="group" aria-label={`Right answer${of}`} className="flex flex-wrap items-center gap-1.5">
        {['True', 'False'].map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={same(answer, v)}
            onClick={() => onChange({ answer: same(answer, v) ? '' : v })}
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${same(answer, v) ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-line bg-white text-muted hover:border-emerald-500'}`}
          >
            {same(answer, v) && '✓ '}
            {v}
          </button>
        ))}
        {!['True', 'False'].some((v) => same(answer, v)) && <span className={hint}>Click the right one.</span>}
      </div>
    )
  const rows = [...options, ''].slice(0, 12)
  const put = (k: number, v: string) => {
    const next = [...options]
    next[k] = v
    return next.filter((x, j) => x.replace('=', '').trim() || j < next.length - 1)
  }
  if (kind === 'match')
    return (
      <div className="space-y-1">
        {rows.map((o, k) => {
          const [l, r] = sides(o)
          const set = (left: string, right: string) => onChange({ options: put(k, left || right ? `${left} = ${right}` : '') })
          return (
            <div key={k} className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
              <input aria-label={`Pair ${k + 1} left${of}`} placeholder={k === 0 ? 'Delhi' : 'Left'} className={field} value={l} onChange={(e) => set(e.target.value, r)} />
              <span aria-hidden="true" className="text-muted">
                →
              </span>
              <input aria-label={`Pair ${k + 1} right${of}`} placeholder={k === 0 ? 'India' : 'Right'} className={field} value={r} onChange={(e) => set(l, e.target.value)} />
            </div>
          )
        })}
        <p className={hint}>Write each pair as it matches. The paper prints the right column out of step.</p>
      </div>
    )
  const marked = options.some((o) => same(o, answer))
  return (
    <div className="space-y-1">
      <div className={tight ? 'flex flex-wrap gap-1.5' : 'space-y-1'}>
        {rows.map((o, k) => {
          const right = same(o, answer)
          return (
            <div key={k} className={`flex items-center gap-1 rounded-md border px-1 focus-within:ring-2 focus-within:ring-brand/30 ${right ? 'border-emerald-600 bg-emerald-50' : 'border-line bg-white'} ${tight ? 'min-w-40 flex-1 sm:max-w-64' : ''}`}>
              <button
                type="button"
                disabled={!o.trim()}
                aria-pressed={right}
                aria-label={`Option ${k + 1}${of} is the right answer`}
                title={right ? 'The right answer' : 'Mark as the right answer'}
                onClick={() => onChange({ answer: right ? '' : o.trim() })}
                className={`grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold ${right ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-line text-muted enabled:hover:border-emerald-600 enabled:hover:text-emerald-700'} disabled:opacity-40`}
              >
                {right ? '✓' : numbered ? ROMAN[k] : letter(k)}
              </button>
              <input
                aria-label={`Option ${k + 1}${of}`}
                placeholder={`Option ${k + 1}`}
                className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm outline-none"
                value={o}
                onChange={(e) => onChange({ options: put(k, e.target.value), ...(right ? { answer: e.target.value.trim() } : {}) })}
              />
            </div>
          )
        })}
      </div>
      {!marked && options.length > 1 && <p className={hint}>{answer.trim() ? `The key says "${answer.trim()}". Click a letter to mark the right option instead.` : 'Click the letter of the right answer to mark it.'}</p>}
    </div>
  )
}

/**
 * A question typed straight into the paper, which joins the bank as it is
 * added; or one already in the paper, changed in place. A question may be
 * split into lettered bits, each with its own marks; it is then worth what
 * they add up to. A bit is of the question's type unless it is given its
 * own, so one question can hold bits of several types.
 */
export function QuestionForm({ orgId, paper, sectionId, editing, itemId, onAdded, onDone }: { orgId: string; paper: Paper; sectionId: string; editing?: Question; itemId?: string; onAdded: (p: Paper) => void; onDone: (p?: Paper) => void }) {
  const [q, setQ] = useState<TypedQuestion>(
    editing
      ? { qtype: editing.qtype, marks: editing.marks, text: editing.text, options: editing.options, answer: editing.answer, spaceKind: editing.spaceKind ?? 'auto', spaceSize: editing.spaceSize ?? 0, optionCols: editing.optionCols ?? 0, optionBoxes: editing.optionBoxes ?? true }
      : { qtype: 'Short answer', marks: '', text: '', options: [], answer: '', spaceKind: 'auto', spaceSize: 0, optionCols: 0, optionBoxes: true },
  )
  const [bits, setBits] = useState<Bit[]>(editing?.bits ?? [])
  const [more, setMore] = useState(false)
  const typeOf = (b: Bit) => b.qtype || q.qtype
  const kind = kindOf(q.qtype)
  const split = bits.length > 0
  const kept = bits.filter((b) => b.text.trim())
  const total = kept.length > 0 ? marks(kept.reduce((n, b) => n + hundredths(b.marks), 0)) : q.marks
  const body = {
    ...q,
    marks: total,
    // With bits, what there is to choose from belongs to each bit.
    bits: kept.map((b) => ({ ...b, qtype: typeOf(b) === q.qtype ? '' : b.qtype, options: clean(kindOf(typeOf(b)), b.options) })),
    options: kept.length > 0 ? [] : clean(kind, q.options),
  }
  const save = useMutation({
    mutationFn: async (again: boolean) => {
      if (!editing || !itemId) return { p: await addPaperItem(orgId, paper.id, { sectionId, question: body }), again }
      // The server changes the question where it stands, or gives this slot
      // a new one when another set shares it.
      return { p: await putPaperItem(orgId, paper.id, itemId, { question: body }), again: false }
    },
    onSuccess: ({ p, again }) => {
      if (again) {
        // Keep the type and marks: the next question is usually like the last.
        setQ({ ...q, text: '', options: [], answer: '' })
        setBits([])
        setMore(true)
        onAdded(p)
      } else onDone(p)
    },
  })
  const setBit = (i: number, b: Partial<Bit>) => setBits(bits.map((x, j) => (j === i ? { ...x, ...b } : x)))
  // The first bit takes over what was typed for the question so far.
  const addBit = () => {
    setBits([...bits, { text: '', marks: split ? (bits.at(-1)?.marks ?? '') : '', answer: split ? '' : (q.answer ?? ''), qtype: '', options: split ? [] : (q.options ?? []) }])
    if (!split) setQ({ ...q, options: [], answer: '' })
  }
  const kinds = split ? bits.map((b) => kindOf(typeOf(b))) : [kind]
  const ticks = kinds.some((k) => k === 'choice' || k === 'truth')
  const writes = kinds.includes('written')
  const sized = q.spaceKind === 'lines' || q.spaceKind === 'blank' || q.spaceKind === 'box'
  const roomSet = (q.spaceKind ?? 'auto') !== 'auto'
  const types = [...new Set([...QUESTION_TYPES, q.qtype].filter(Boolean))]
  return (
    <form
      aria-label={editing ? 'Edit the question' : 'Type a question'}
      className="space-y-3 rounded-xl border border-brand/30 bg-mist/40 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(false)
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
        <label className={label}>
          Type
          <TypeSelect label="Question type" className="py-1.5" value={q.qtype} onChange={(v) => setQ({ ...q, qtype: v })} />
        </label>
        <label className={label}>
          Marks
          <input
            required
            aria-label="Marks"
            inputMode="decimal"
            pattern="\d{1,4}(\.\d{1,2})?"
            className={`${field} ${kept.length > 0 ? 'bg-canvas' : ''}`}
            readOnly={kept.length > 0}
            title={kept.length > 0 ? 'The bits add up to this' : undefined}
            value={total}
            onChange={(e) => setQ({ ...q, marks: e.target.value })}
          />
        </label>
      </div>
      <label className={label}>
        {split ? 'Common instruction, printed above the bits' : 'Question'}
        <textarea required aria-label="Question" rows={split ? 2 : 3} maxLength={5000} className={field} value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} placeholder={/blank/i.test(q.qtype) ? 'Use ____ for each blank' : undefined} />
      </label>

      {!split && kind !== 'written' && (
        <fieldset className="space-y-1">
          <legend className="pb-1 text-xs font-semibold">{kind === 'match' ? 'Pairs' : kind === 'truth' ? 'Right answer' : 'Options'}</legend>
          <Answers kind={kind} of="" options={q.options ?? []} answer={q.answer ?? ''} onChange={(v) => setQ({ ...q, ...v })} />
        </fieldset>
      )}
      {!split && kind === 'written' && (
        <label className={label}>
          Answer or marking guide <span className={hint}>For the answer key only; it is never printed on the paper.</span>
          <input aria-label="Answer" className={field} value={q.answer ?? ''} onChange={(e) => setQ({ ...q, answer: e.target.value })} />
        </label>
      )}

      <fieldset className="space-y-1.5">
        {split && <legend className="pb-1 text-xs font-semibold">Bits. Each is the same type as the question unless you change it.</legend>}
        {bits.map((b, i) => {
          const k = kindOf(typeOf(b))
          return (
            <div key={i} className="space-y-1.5 rounded-lg border border-line bg-white p-2">
              <div className="grid grid-cols-[1.5rem_1fr_4.5rem_auto] items-start gap-1.5">
                <span className="pt-1.5 text-sm font-bold text-muted">({letter(i)})</span>
                <input required aria-label={`Bit ${letter(i)}`} placeholder="The question" maxLength={2000} className={field} value={b.text} onChange={(e) => setBit(i, { text: e.target.value })} />
                <input required aria-label={`Marks for bit ${letter(i)}`} placeholder="Marks" inputMode="decimal" pattern="\d{1,4}(\.\d{1,2})?" className={field} value={b.marks} onChange={(e) => setBit(i, { marks: e.target.value })} />
                <button type="button" className={icon} aria-label={`Remove bit ${letter(i)}`} onClick={() => setBits(bits.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
              <div className="space-y-1.5 pl-[1.875rem]">
                {k !== 'written' && <Answers kind={k} of={` of bit ${letter(i)}`} numbered tight options={b.options ?? []} answer={b.answer ?? ''} onChange={(v) => setBit(i, v)} />}
                <div className="flex flex-wrap gap-1.5">
                  <select
                    aria-label={`Type of bit ${letter(i)}`}
                    title="This bit's type"
                    className={`${field} ${typeOf(b) !== q.qtype ? 'font-semibold text-brand' : 'text-muted'}`}
                    value={typeOf(b)}
                    onChange={(e) => setBit(i, { qtype: e.target.value === q.qtype ? '' : e.target.value, ...(kindOf(e.target.value) === k ? {} : { answer: '' }) })}
                  >
                    {[...new Set([...types, typeOf(b)])].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  {k === 'written' && <input aria-label={`Answer for bit ${letter(i)}`} placeholder="Answer, for the key only" className={`${field} min-w-28 flex-1`} value={b.answer ?? ''} onChange={(e) => setBit(i, { answer: e.target.value })} />}
                </div>
              </div>
            </div>
          )
        })}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={button} disabled={bits.length >= 12} onClick={addBit}>
            {split ? `Add bit (${letter(bits.length)})` : 'Split into bits (a), (b), (c)'}
          </button>
          {!split && <span className={hint}>For a question with parts, each with its own marks and type.</span>}
        </div>
      </fieldset>

      {(ticks || writes || roomSet) && (
        <details className="rounded-lg border border-line bg-white px-2.5 py-1.5" open={roomSet || (q.optionCols ?? 0) !== 0 || q.optionBoxes === false || undefined}>
          <summary className="cursor-pointer text-xs font-semibold text-muted">How it prints</summary>
          <div className="flex flex-wrap items-end gap-3 pt-2 pb-1 text-sm">
            {(writes || roomSet) && (
              <label className={label}>
                Room to answer
                <select aria-label="Room to answer" className={field} value={q.spaceKind ?? 'auto'} onChange={(e) => setQ({ ...q, spaceKind: e.target.value as TypedQuestion['spaceKind'], spaceSize: e.target.value === 'auto' || e.target.value === 'none' ? 0 : q.spaceSize || 4 })}>
                  <option value="auto">Lines, by the marks</option>
                  <option value="lines">Lines, as many as I set</option>
                  <option value="blank">Blank space</option>
                  <option value="box">A box to draw in</option>
                  <option value="none">None</option>
                </select>
              </label>
            )}
            {sized && (
              <label className={label}>
                {q.spaceKind === 'lines' ? 'Lines' : 'Height, in lines'}
                <input required aria-label="Size of the room to answer" type="number" min={1} max={60} className={`${field} w-24`} value={q.spaceSize || ''} onChange={(e) => setQ({ ...q, spaceSize: Number(e.target.value) })} />
              </label>
            )}
            {ticks && (
              <>
                <label className={label}>
                  Options sit
                  <select aria-label="Options print" className={field} value={q.optionCols ?? 0} onChange={(e) => setQ({ ...q, optionCols: Number(e.target.value) })}>
                    <option value={0}>fitted by their length</option>
                    <option value={1}>one under another</option>
                    <option value={2}>in 2 columns</option>
                    <option value={3}>in 3 columns</option>
                    <option value={4}>in 4 columns</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5 pb-1.5">
                  <input type="checkbox" checked={q.optionBoxes ?? true} onChange={(e) => setQ({ ...q, optionBoxes: e.target.checked })} />
                  A box to tick beside each option
                </label>
              </>
            )}
            {split && sized && <span className={`${hint} pb-2`}>Each written bit gets this much.</span>}
          </div>
        </details>
      )}

      {save.error && <Problem error={save.error} />}
      {more && !save.error && <p className="text-xs font-semibold text-emerald-700">Added. Type the next one.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primary} disabled={save.isPending}>
          {editing ? 'Save question' : 'Add question'}
        </button>
        {!editing && (
          <button type="button" className={button} disabled={save.isPending || !q.text.trim() || !total.trim()} onClick={() => save.mutate(true)}>
            Add and type another
          </button>
        )}
        <button type="button" className={button} onClick={() => onDone()}>
          Close
        </button>
      </div>
    </form>
  )
}

export function Problem({ error }: { error: Error }) {
  return (
    <p role="alert" className="text-sm font-semibold text-red-700">
      {error instanceof ApiError ? error.message : 'That did not work. Try again.'}
    </p>
  )
}

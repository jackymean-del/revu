import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPaper, getPaper, getPaperHtml, paperStep, type Blueprint, type Paper, type PaperSummary, type Question } from '../../api/client'
import { ApiError } from '../../api/problem'
import { SectionCards } from './SectionCards'
import { PAPER } from './types'
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
  const [view, setView] = usePreviewView()
  const split = useRef<HTMLDivElement>(null)
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
  const make = useMutation({ mutationFn: (blank: boolean) => createPaper(orgId, assessmentId, fill, name.trim() || nextName, blank), onSuccess: done })
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

  const approved = blueprint.status === 'approved'
  if (sets.length === 0)
    return (
      <div className="space-y-4 rounded-2xl border border-dashed border-line bg-white p-8 text-center">
        <p className="font-bold">No paper yet</p>
        <div className="flex items-center justify-center gap-2 text-sm">
          Name {nameField}
        </div>
        <div className="grid gap-3 text-left sm:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-line p-4">
            <p className="font-bold">Start a blank paper</p>
            <p className="text-sm text-muted">Add {PAPER.sections}, type your questions or pick them from the bank, and put them in any order. No blueprint needed.</p>
            <button type="button" className={primary} disabled={make.isPending} onClick={() => make.mutate(true)}>
              Start blank
            </button>
          </div>
          <div className="space-y-2 rounded-xl border border-line p-4">
            <p className="font-bold">Lay it out from the blueprint</p>
            <p className="text-sm text-muted">One slot for each question the blueprint asks for, in {PAPER.sections} by question type.{approved ? '' : ' Needs an approved blueprint.'}</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={fill} disabled={!approved} onChange={(e) => setFill(e.target.checked)} />
              Fill the slots from the bank
            </label>
            <button type="button" className={button} disabled={make.isPending || !approved} onClick={() => make.mutate(false)}>
              Make {name.trim() || nextName}
            </button>
          </div>
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
              <button type="button" className={primary} disabled={step.isPending || empty > 0 || p.items.length === 0} onClick={() => step.mutate('finalise')}>
                Finalise {p.set}
              </button>
            )}
          </>
        )}
      </div>
      {err && <Problem error={err} />}
      {draft && (empty > 0 || (p && p.items.length === 0)) && (
        <p className="text-xs text-muted">{p && p.items.length === 0 ? 'Add questions, then finalise.' : `Finalising needs a question in every slot: ${empty} still to choose.`}</p>
      )}

      {!p ? (
        <p className="text-sm text-muted">Loading</p>
      ) : (
        <div ref={split} className="items-start gap-1 lg:flex">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p role="status" className="flex-1 text-sm">
                {p.filled} of {p.items.length} slots filled · {p.total} marks
                {p.status === 'final' ? ' · final' : empty ? ` · ${empty} still to choose` : ' · ready to finalise'}
              </p>
              <button type="button" className={button} aria-pressed={view.show} onClick={() => setView({ ...view, show: !view.show })}>
                {view.show ? 'Hide the preview' : 'Show the preview'}
              </button>
            </div>
            <SectionCards key={p.id} orgId={orgId} paper={p} bank={bank} onChange={done} />
          </div>
          {view.show && (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Width of the preview"
                aria-valuemin={PREVIEW.min}
                aria-valuemax={PREVIEW.max}
                aria-valuenow={view.width}
                tabIndex={0}
                title="Drag, or use the left and right arrow keys, to make the preview wider or narrower"
                className="hidden w-2 shrink-0 cursor-col-resize self-stretch rounded-full hover:bg-brand/30 focus-visible:bg-brand/40 lg:block"
                onPointerDown={(e) => {
                  e.preventDefault() // no text is selected while dragging
                  e.currentTarget.focus()
                  e.currentTarget.setPointerCapture(e.pointerId)
                }}
                onPointerMove={(e) => {
                  const box = split.current?.getBoundingClientRect()
                  if (!e.currentTarget.hasPointerCapture(e.pointerId) || !box) return
                  setView({ ...view, width: previewWidth(((box.right - e.clientX) / box.width) * 100) })
                }}
                onKeyDown={(e) => {
                  const by = e.key === 'ArrowLeft' ? 5 : e.key === 'ArrowRight' ? -5 : 0
                  if (!by) return
                  e.preventDefault()
                  setView({ ...view, width: previewWidth(view.width + by) })
                }}
              />
              <div className="mt-4 min-w-0 lg:sticky lg:top-4 lg:mt-0 lg:w-(--preview) lg:shrink-0" style={{ '--preview': `${view.width}%` } as React.CSSProperties}>
                <Preview orgId={orgId} paper={p} />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

const PREVIEW = { min: 25, max: 70 }
const previewWidth = (percent: number) => Math.round(Math.min(PREVIEW.max, Math.max(PREVIEW.min, percent)))

/** Whether the preview shows and how wide it is, of the whole; kept on this device. */
function usePreviewView() {
  const [view, set] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('revu.paper.preview') ?? '{}') as { show?: boolean; width?: number }
      return { show: v.show !== false, width: previewWidth(v.width ?? 50) }
    } catch {
      return { show: true, width: 50 }
    }
  })
  const save = (v: typeof view) => {
    set(v)
    try {
      localStorage.setItem('revu.paper.preview', JSON.stringify(v))
    } catch {
      // Not kept; it still works for this visit.
    }
  }
  return [view, save] as const
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
    <aside aria-label="Print preview" className="min-w-0 rounded-2xl border border-line bg-white">
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

function Problem({ error }: { error: Error }) {
  return (
    <p role="alert" className="text-sm font-semibold text-red-700">
      {error instanceof ApiError ? error.message : 'That did not work. Try again.'}
    </p>
  )
}

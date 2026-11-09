import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { columnOrderingFeature, columnPinningFeature, columnVisibilityFeature, tableFeatures, useTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { parseCell, plain, showCell, type CellValue, type ValueState } from './cells'

/**
 * The marks-entry grid (decision D20): a thin grid owned by revU on TanStack
 * Table for the column model (order, pinning, visibility) and TanStack
 * Virtual for rows. Screens use this component and never a grid library.
 *
 * Keys (Part 7.4): arrows, Enter and Tab move; typing a number starts an
 * edit that commits on the move; A, E and N set absent, exempt and not
 * applicable; P, Delete and Backspace set pending; Escape reverts; F2 or a
 * double click edits the mark already there. Typed keys go into a buffer, not an input, so a
 * fast typist or a scanner never loses one.
 */

export type GridRow = { id: string; admissionNo: string; name: string; rollNo: string }
export type GridCol = { id: string; label: string; max: string }
export type SaveMark = 'saving' | 'failed' | 'conflict'

type Props = {
  label: string
  rows: GridRow[]
  columns: GridCol[]
  order: string[]
  hidden: string[]
  pinned: string[]
  value: (row: string, col: string) => CellValue | undefined
  canEdit: (row: string, col: string) => boolean
  /** A row's status label, such as Exempt; its cells are locked. */
  rowLabel?: (row: string) => string | undefined
  /** Rows shown greyed, for students who do not take the subject. */
  muted?: (row: string) => boolean
  saveMark?: (row: string, col: string) => SaveMark | undefined
  onCommit: (row: string, col: string, cell: CellValue) => void
  rowActions?: (row: GridRow) => ReactNode
}

const ROW_HEIGHT = 40
const IDENTITY = '3.5rem 13rem'
const COLUMN = 6.5 // rem
const KEY_STATES: Record<string, ValueState> = { a: 'absent', e: 'exempt', n: 'not_applicable', p: 'pending', delete: 'pending', backspace: 'pending' }
const STATE_WORDS: Record<ValueState, string> = {
  scored: '', absent: 'absent', exempt: 'exempt', not_applicable: 'not applicable', pending: 'pending', not_assessed: 'not assessed',
}

const features = tableFeatures({ columnOrderingFeature, columnPinningFeature, columnVisibilityFeature })

type Edit = { buffer: string; error?: string }

const same = (a: CellValue | undefined, b: CellValue) => (a?.state ?? 'pending') === b.state && (a?.value ?? '') === (b.value ?? '')

export function MarksGrid(p: Props) {
  // The column model: the person's order, pins and hidden columns.
  const table = useTable({
    features,
    data: [] as GridRow[],
    columns: useMemo(() => p.columns.map((c) => ({ id: c.id, header: c.label })), [p.columns]),
    state: {
      columnOrder: p.order,
      columnPinning: { start: p.pinned, end: [] },
      columnVisibility: Object.fromEntries(p.hidden.map((id) => [id, false])),
    },
  })
  const byId = useMemo(() => new Map(p.columns.map((c) => [c.id, c])), [p.columns])
  const start = table.getStartVisibleLeafColumns().map((c) => byId.get(c.id)!).filter(Boolean)
  const cols = [...start, ...table.getCenterVisibleLeafColumns().map((c) => byId.get(c.id)!).filter(Boolean)]

  const scroller = useRef<HTMLDivElement>(null)
  const rows = useVirtualizer({ count: p.rows.length, getScrollElement: () => scroller.current, estimateSize: () => ROW_HEIGHT, overscan: 12 })
  const [at, setAt] = useState({ r: 0, c: 0 })
  const [edit, setEditState] = useState<Edit | null>(null)
  const [said, say] = useState('')
  const focusNext = useRef(false)
  // The cursor and the edit are refs too, changed at once, so keys that
  // arrive before the next draw (a fast typist, a scanner) reach the cell
  // the person is on, not the one the browser still has in focus.
  const cursor = useRef(at)
  const editing = useRef<Edit | null>(null)
  const setEdit = (e: Edit | null) => {
    editing.current = e
    setEditState(e)
  }

  const r = Math.min(at.r, Math.max(0, p.rows.length - 1))
  const c = Math.min(at.c, Math.max(0, cols.length - 1))

  useEffect(() => {
    if (!focusNext.current) return
    focusNext.current = false
    scroller.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)?.focus()
  })

  const go = (nr: number, nc: number) => {
    const next = { r: Math.max(0, Math.min(p.rows.length - 1, nr)), c: Math.max(0, Math.min(cols.length - 1, nc)) }
    cursor.current = next
    setAt(next)
    rows.scrollToIndex(next.r, { align: 'auto' })
    focusNext.current = true
  }

  const editable = (row: GridRow, col: GridCol) => p.canEdit(row.id, col.id) && !p.rowLabel?.(row.id) && !p.muted?.(row.id)

  function commit(row: GridRow, col: GridCol, cell: CellValue) {
    if (!same(p.value(row.id, col.id), cell)) {
      p.onCommit(row.id, col.id, cell)
      say(`${row.name}, ${col.label}: ${cell.state === 'scored' ? plain(cell.value ?? '') : STATE_WORDS[cell.state]}`)
    }
  }

  /** Ends an edit on the cell under the cursor; false when the value is refused. */
  function finish(): boolean {
    const e = editing.current
    if (!e) return true
    const row = p.rows[cursor.current.r]
    const col = cols[cursor.current.c]
    const parsed = parseCell(e.buffer, col.max)
    if (!parsed.ok) {
      setEdit({ ...e, error: parsed.reason })
      say(`${row.name}, ${col.label}: ${parsed.reason}`)
      return false
    }
    setEdit(null)
    commit(row, col, parsed.cell)
    return true
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const { r, c } = cursor.current
    const row = p.rows[r]
    const col = cols[c]
    if (!row || !col) return
    const key = e.key.toLowerCase()
    const current = editing.current
    const moves: Record<string, [number, number]> = {
      arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1], enter: [1, 0],
    }
    if (key === 'tab') {
      e.preventDefault()
      if (!finish()) return
      const last = cols.length - 1
      if (e.shiftKey) go(c === 0 ? r - 1 : r, c === 0 ? last : c - 1)
      else go(c === last ? r + 1 : r, c === last ? 0 : c + 1)
      return
    }
    if (moves[key]) {
      e.preventDefault()
      if (finish()) go(r + moves[key][0], c + moves[key][1])
      return
    }
    if (key === 'escape') {
      if (current) {
        e.preventDefault()
        setEdit(null)
        say('Change undone')
      }
      return
    }
    if (!editable(row, col)) return
    if (/^[0-9.]$/.test(e.key)) {
      e.preventDefault()
      setEdit({ buffer: (current?.buffer ?? '') + e.key })
      return
    }
    if (current) {
      if (key === 'backspace') {
        e.preventDefault()
        setEdit({ buffer: current.buffer.slice(0, -1) })
      }
      return
    }
    if (key === 'f2') {
      e.preventDefault()
      setEdit({ buffer: plain(p.value(row.id, col.id)?.value ?? '') })
      return
    }
    if (KEY_STATES[key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      commit(row, col, { state: KEY_STATES[key] })
    }
  }

  const template = `${IDENTITY} repeat(${cols.length}, ${COLUMN}rem)${p.rowActions ? ' 3rem' : ''}`
  const width = `calc(16.5rem + ${cols.length * COLUMN}rem${p.rowActions ? ' + 3rem' : ''})`
  const pinnedLeft = (i: number) => (i < start.length ? { position: 'sticky' as const, left: `calc(16.5rem + ${i * COLUMN}rem)`, zIndex: 1 } : {})

  return (
    <div>
      <div
        ref={scroller}
        role="grid"
        aria-label={p.label}
        aria-rowcount={p.rows.length + 1}
        aria-colcount={cols.length + 2}
        onKeyDown={onKey}
        className="max-h-[70vh] overflow-auto rounded-xl border border-line bg-white text-sm"
      >
        <div role="rowgroup" className="sticky top-0 z-20" style={{ width }}>
          <div role="row" aria-rowindex={1} className="grid border-b border-line bg-canvas text-xs font-bold uppercase tracking-wide text-muted" style={{ gridTemplateColumns: template }}>
            <div role="columnheader" className="sticky left-0 z-10 bg-canvas px-2 py-2">
              Roll
            </div>
            <div role="columnheader" className="sticky left-14 z-10 bg-canvas px-2 py-2">
              Name
            </div>
            {cols.map((col, i) => (
              <div key={col.id} role="columnheader" className="bg-canvas px-2 py-2 text-right normal-case tracking-normal" style={pinnedLeft(i)}>
                <span className="block truncate">{col.label}</span>
                <span className="block font-normal">/ {plain(col.max)}</span>
              </div>
            ))}
            {p.rowActions && <div role="columnheader" aria-label="Row actions" />}
          </div>
        </div>
        <div role="rowgroup" style={{ height: rows.getTotalSize(), width, position: 'relative' }}>
          {rows.getVirtualItems().map((v) => {
            const row = p.rows[v.index]
            const status = p.rowLabel?.(row.id)
            const muted = p.muted?.(row.id)
            return (
              <div
                key={row.id}
                role="row"
                aria-rowindex={v.index + 2}
                className={`absolute left-0 grid border-b border-line ${muted ? 'text-subtle' : ''}`}
                style={{ transform: `translateY(${v.start}px)`, height: ROW_HEIGHT, gridTemplateColumns: template, width }}
              >
                <div role="rowheader" className="sticky left-0 z-10 flex items-center bg-white px-2 tabular-nums text-muted">
                  {row.rollNo}
                </div>
                <div role="rowheader" className="sticky left-14 z-10 flex min-w-0 items-center gap-2 bg-white px-2">
                  <span className="truncate font-semibold">{row.name}</span>
                  {status && <span className="shrink-0 rounded-full border border-line bg-mist px-1.5 text-xs font-semibold text-brand-700">{status}</span>}
                </div>
                {cols.map((col, i) => {
                  const active = v.index === r && i === c
                  const cell = p.value(row.id, col.id)
                  const editing = active && edit
                  const mark = p.saveMark?.(row.id, col.id)
                  const canChange = editable(row, col)
                  const shown = editing ? edit.buffer : status || muted ? '' : showCell(cell)
                  const name = `${row.name}, ${col.label}, out of ${plain(col.max)}: ${
                    status ? status : muted ? 'does not take this subject' : cell?.state === 'scored' ? plain(cell.value ?? '') : STATE_WORDS[cell?.state ?? 'pending']
                  }`
                  // An editable cell is drawn as an entry box, so a person sees
                  // where marks go; a locked one is flat. The box under the
                  // cursor shows a caret: typing starts there.
                  const box = editing
                    ? edit.error
                      ? 'border-red-600 bg-red-50'
                      : 'border-brand bg-white ring-2 ring-brand/25'
                    : active && canChange
                      ? 'border-brand bg-white ring-2 ring-brand/15'
                      : canChange
                        ? 'border-[#cfcaf0] bg-white group-hover:border-brand/60'
                        : active
                          ? 'border-brand/40 bg-transparent'
                          : 'border-transparent bg-transparent'
                  return (
                    <div
                      key={col.id}
                      role="gridcell"
                      data-cell={`${v.index}:${i}`}
                      tabIndex={active ? 0 : -1}
                      aria-label={name}
                      aria-readonly={!canChange || undefined}
                      aria-invalid={editing && edit.error ? true : undefined}
                      title={editing && edit.error ? edit.error : canChange ? 'Type a mark, or AB, EX or NA' : undefined}
                      onClick={() => {
                        if (active || !finish()) return
                        go(v.index, i)
                      }}
                      onDoubleClick={() => {
                        if (!canChange || !finish()) return
                        go(v.index, i)
                        setEdit({ buffer: plain(cell?.value ?? '') })
                      }}
                      className={`group relative flex items-center px-1 tabular-nums outline-none ${canChange ? 'cursor-text' : 'bg-canvas/60 text-muted'}`}
                      style={pinnedLeft(i)}
                    >
                      <span className={`flex h-7 w-full items-center justify-end rounded-md border px-2 ${box}`}>
                        {shown}
                        {active && canChange && <span aria-hidden="true" className="ml-0.5 h-4 w-px animate-pulse bg-brand" />}
                      </span>
                      {mark && (
                        <span
                          aria-hidden="true"
                          className={`absolute right-1.5 top-1.5 size-1.5 rounded-full ${mark === 'saving' ? 'bg-subtle' : mark === 'conflict' ? 'bg-amber-500' : 'bg-red-600'}`}
                        />
                      )}
                    </div>
                  )
                })}
                {p.rowActions && <div className="flex items-center justify-center">{p.rowActions(row)}</div>}
              </div>
            )
          })}
        </div>
      </div>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
      {edit?.error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
          {edit.error}
        </p>
      )}
    </div>
  )
}

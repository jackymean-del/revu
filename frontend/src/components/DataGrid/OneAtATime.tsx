import { useState } from 'react'
import { parseCell, plain, showCell, type CellValue, type ValueState } from './cells'
import type { GridCol, GridRow } from './MarksGrid'

type Props = {
  rows: GridRow[]
  columns: GridCol[]
  value: (row: string, col: string) => CellValue | undefined
  canEdit: (row: string, col: string) => boolean
  rowLabel?: (row: string) => string | undefined
  onCommit: (row: string, col: string, cell: CellValue) => void
}

const CODES: [string, ValueState][] = [
  ['AB', 'absent'],
  ['EX', 'exempt'],
  ['NA', 'not_applicable'],
]

/**
 * Entry on a phone (Part 59.7): one student at a time, each column a field
 * on the numeric keypad, with buttons for the state codes.
 */
export function OneAtATime(p: Props) {
  const [i, setI] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const row = p.rows[Math.min(i, p.rows.length - 1)]
  if (!row) return null
  const status = p.rowLabel?.(row.id)

  const commit = (col: GridCol) => {
    const key = row.id + col.id
    if (drafts[key] === undefined) return
    const parsed = parseCell(drafts[key], col.max)
    if (!parsed.ok) return setErrors({ ...errors, [key]: parsed.reason })
    setErrors({ ...errors, [key]: '' })
    setDrafts(({ [key]: _, ...rest }) => rest)
    p.onCommit(row.id, col.id, parsed.cell)
  }

  return (
    <section aria-label="One at a time" className="space-y-4 rounded-xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-40" disabled={i === 0} onClick={() => setI(i - 1)}>
          Previous
        </button>
        <p className="text-center">
          <span className="block font-extrabold">{row.name}</span>
          <span className="text-xs text-muted">
            Roll {row.rollNo || '-'} · {i + 1} of {p.rows.length}
          </span>
        </p>
        <button
          type="button"
          className="rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-40"
          disabled={i >= p.rows.length - 1}
          onClick={() => setI(i + 1)}
        >
          Next
        </button>
      </div>
      {status && <p className="text-sm font-semibold text-brand-700">{status}: no marks to enter.</p>}
      {!status &&
        p.columns.map((col) => {
          const key = row.id + col.id
          const editable = p.canEdit(row.id, col.id)
          const max = plain(col.max)
          return (
            <div key={col.id} className="space-y-1">
              <label className="flex items-center justify-between gap-3 text-sm font-semibold">
                <span>
                  {col.label} <span className="font-normal text-muted">/ {max}</span>
                </span>
                <input
                  inputMode="decimal"
                  aria-label={`${col.label} for ${row.name}, out of ${max}`}
                  aria-invalid={errors[key] ? true : undefined}
                  disabled={!editable}
                  value={drafts[key] ?? showCell(p.value(row.id, col.id))}
                  onChange={(e) => setDrafts({ ...drafts, [key]: e.target.value })}
                  onBlur={() => commit(col)}
                  onKeyDown={(e) => e.key === 'Enter' && commit(col)}
                  className="w-24 rounded-md border border-line px-2 py-2 text-right text-lg tabular-nums"
                />
              </label>
              {editable && (
                <div className="flex justify-end gap-2">
                  {CODES.map(([code, state]) => (
                    <button key={code} type="button" className="rounded-md border border-line px-2 py-1 text-xs font-semibold" onClick={() => p.onCommit(row.id, col.id, { state })}>
                      {code}
                    </button>
                  ))}
                  <button type="button" className="rounded-md border border-line px-2 py-1 text-xs font-semibold" onClick={() => p.onCommit(row.id, col.id, { state: 'pending' })}>
                    Clear
                  </button>
                </div>
              )}
              {errors[key] && (
                <p role="alert" className="text-right text-xs font-semibold text-red-700">
                  {errors[key]}
                </p>
              )}
            </div>
          )
        })}
    </section>
  )
}

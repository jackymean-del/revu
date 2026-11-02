import { useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createStructure, listStructure, removeStructure, restoreStructure, updateStructure, type StructurePath } from '../api/client'
import { ApiError } from '../api/problem'
import { toBody, toDraft, type Draft, type FieldSpec } from '../lib/forms'

export type Option = { value: string; label: string }

export type Col = FieldSpec & {
  label: string
  /** Choices for a select; the first can be an empty value with its own label. */
  options?: Option[]
  /** How a stored value reads in the list; defaults to the value or option label. */
  show?: (item: Item) => ReactNode
  width?: string
}

type Item = Record<string, unknown> & { id: string; removedAt?: string }

type Props = {
  orgId: string
  path: StructurePath
  /** List filters, also sent with every new item (for example its year). */
  scope?: Record<string, string>
  cols: Col[]
  canEdit: boolean
  /** Names the list for screen readers, and in the add button. */
  noun: string
  empty: string
}

const input = 'w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none'
const small = 'rounded-md px-2 py-1 text-xs font-semibold'

function FieldInput({ col, value, onChange, error, label }: { col: Col; value: string | boolean; onChange: (v: string | boolean) => void; error?: string; label: string }) {
  const described = error ? { 'aria-invalid': true, title: error } : {}
  let el: ReactNode
  if (col.kind === 'checkbox') {
    el = <input type="checkbox" aria-label={label} checked={value === true} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-brand" />
  } else if (col.kind === 'select') {
    el = (
      <select aria-label={label} value={String(value)} onChange={(e) => onChange(e.target.value)} className={input} {...described}>
        {col.required && <option value="">Choose</option>}
        {col.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  } else {
    el = (
      <input
        aria-label={label}
        type={col.kind === 'date' ? 'date' : 'text'}
        inputMode={col.kind === 'number' ? 'numeric' : undefined}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className={input}
        {...described}
      />
    )
  }
  return (
    <div>
      {el}
      {error && <p className="mt-1 text-xs font-semibold text-red-700">{error}</p>}
    </div>
  )
}

const blank = (cols: Col[]): Draft => Object.fromEntries(cols.map((c) => [c.key, c.kind === 'checkbox' ? false : '']))

/** A list of one structure resource that administrators can add to, change, remove and restore. */
export function EditableList({ orgId, path, scope = {}, cols, canEdit, noun, empty }: Props) {
  const qc = useQueryClient()
  const [showRemoved, setShowRemoved] = useState(false)
  const params = { ...scope, ...(showRemoved ? { includeRemoved: 'true' } : {}) }
  const items = useQuery({
    queryKey: ['structure', orgId, path, params],
    queryFn: ({ signal }) => listStructure<Item>(orgId, path, params, signal),
  })
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({})
  const [fresh, setFresh] = useState<Draft>(() => blank(cols))
  const [problem, setProblem] = useState<{ where: string; message?: string; fields: Record<string, string> } | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (where: string, work: () => Promise<unknown>, after?: () => void) => {
    setBusy(true)
    setProblem(null)
    try {
      await work()
      after?.()
      await qc.invalidateQueries({ queryKey: ['structure', orgId] })
    } catch (e) {
      if (e instanceof ApiError) {
        const fields = Object.fromEntries((e.fields ?? []).map((f) => [f.field, f.message]))
        setProblem({ where, message: Object.keys(fields).length ? undefined : e.message, fields })
      } else setProblem({ where, message: 'Could not reach the server. Try again.', fields: {} })
    } finally {
      setBusy(false)
    }
  }

  const save = (where: string, d: Draft, send: (body: unknown) => Promise<unknown>, after: () => void) => {
    const conv = toBody(cols, d)
    if (!conv.ok) return setProblem({ where, fields: conv.errors })
    void run(where, () => send({ ...scope, ...conv.body }), after)
  }

  const shown = (item: Item, col: Col): ReactNode => {
    if (col.show) return col.show(item)
    const v = item[col.key]
    if (col.options) return col.options.find((o) => o.value === (v ?? ''))?.label ?? ''
    return v === undefined || v === null ? '' : String(v)
  }

  const list = items.data ?? []
  return (
    <div className="rounded-xl border border-line bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">{noun}</caption>
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-subtle">
            <tr>
              {cols.map((c) => (
                <th key={c.key} scope="col" className="px-3 py-2 font-bold" style={{ width: c.width }}>
                  {c.label}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.isPending && (
              <tr>
                <td colSpan={cols.length + 1} className="px-3 py-4 text-muted">
                  Loading
                </td>
              </tr>
            )}
            {!items.isPending && list.length === 0 && (
              <tr>
                <td colSpan={cols.length + 1} className="px-3 py-4 text-muted">
                  {empty}
                </td>
              </tr>
            )}
            {list.map((item) => {
              const removed = !!item.removedAt
              const isEditing = editing === item.id
              const err = problem?.where === item.id ? problem : null
              return (
                <tr key={item.id} className={`border-b border-line align-top last:border-b-0 ${removed ? 'bg-canvas text-subtle' : ''}`}>
                  {cols.map((c) => (
                    <td key={c.key} className="px-3 py-2">
                      {isEditing ? (
                        <FieldInput col={c} label={c.label} value={draft[c.key]} error={err?.fields[c.key]} onChange={(v) => setDraft((d) => ({ ...d, [c.key]: v }))} />
                      ) : (
                        <span className={removed ? 'line-through' : ''}>{shown(item, c)}</span>
                      )}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {canEdit && !removed && !isEditing && (
                      <>
                        <button type="button" disabled={busy} className={`${small} text-brand hover:bg-mist`} onClick={() => (setEditing(item.id), setDraft(toDraft(cols, item)), setProblem(null))}>
                          Edit
                        </button>
                        <button type="button" disabled={busy} className={`${small} text-red-700 hover:bg-red-50`} onClick={() => void run(item.id, () => removeStructure(orgId, path, item.id))}>
                          Remove
                        </button>
                      </>
                    )}
                    {canEdit && isEditing && (
                      <>
                        <button type="button" disabled={busy} className={`${small} bg-brand text-white`} onClick={() => save(item.id, draft, (b) => updateStructure(orgId, path, item.id, b), () => setEditing(null))}>
                          Save
                        </button>
                        <button type="button" className={`${small} text-muted`} onClick={() => (setEditing(null), setProblem(null))}>
                          Cancel
                        </button>
                      </>
                    )}
                    {removed && (
                      <>
                        <span className="mr-2 rounded bg-line px-1.5 py-0.5 text-xs font-semibold text-muted">Removed</span>
                        {canEdit && (
                          <button type="button" disabled={busy} className={`${small} text-brand hover:bg-mist`} onClick={() => void run(item.id, () => restoreStructure(orgId, path, item.id))}>
                            Restore
                          </button>
                        )}
                      </>
                    )}
                    {err?.message && <p role="alert" className="mt-1 max-w-64 whitespace-normal text-left text-xs font-semibold text-red-700">{err.message}</p>}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {canEdit && (
            <tfoot className="border-t border-line bg-canvas/60">
              <tr className="align-top">
                {cols.map((c) => (
                  <td key={c.key} className="px-3 py-2">
                    <FieldInput col={c} label={`New ${noun}: ${c.label}`} value={fresh[c.key]} error={problem?.where === 'new' ? problem.fields[c.key] : undefined} onChange={(v) => setFresh((d) => ({ ...d, [c.key]: v }))} />
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <button type="button" disabled={busy} className={`${small} bg-brand px-3 py-1.5 text-white hover:bg-brand-600`} onClick={() => save('new', fresh, (b) => createStructure(orgId, path, b), () => setFresh(blank(cols)))}>
                    Add
                  </button>
                  {problem?.where === 'new' && problem.message && <p role="alert" className="mt-1 text-left text-xs font-semibold text-red-700">{problem.message}</p>}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <label className="flex items-center gap-2 border-t border-line px-3 py-2 text-xs text-muted">
        <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} className="accent-brand" />
        Show removed
      </label>
    </div>
  )
}

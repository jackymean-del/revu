import { useState } from 'react'
import { applyBulk, readTable } from '../../api/client'
import { ApiError } from '../../api/problem'
import { planUpload, type BulkPlan, type GridColumn, type GridStudent } from '../../components/DataGrid/bulk'
import { showCell, type CellValue } from '../../components/DataGrid/cells'
import { useT } from '../../lib/terminology/terms-context'

type Props = {
  orgId: string
  assessmentId: string
  sectionId: string
  students: GridStudent[]
  columns: GridColumn[]
  value: (s: string, c: string) => CellValue | undefined
  canEdit: (s: string, c: string) => boolean
  onDone: (message: string) => void
}

const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'

/**
 * Upload a filled template (Part 59.7): every change is listed with the
 * student and column beside it, with what could not be matched, before
 * anything is applied; applying is one step that can be undone.
 */
export function Upload(p: Props) {
  const t = useT()
  const [plan, setPlan] = useState<BulkPlan | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function read(file: File) {
    setBusy(true)
    setError('')
    try {
      const t = await readTable(p.orgId, file)
      setPlan(planUpload(t.header, t.rows, p.students, p.columns, p.value, p.canEdit))
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields?.[0]?.message ?? e.message) : 'This file could not be read.')
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (!plan) return
    setBusy(true)
    try {
      const res = await applyBulk(p.orgId, p.assessmentId, {
        sectionId: p.sectionId,
        kind: 'upload',
        cells: plan.changes.map((c) => ({ studentId: c.student.id, partId: c.column.id, state: c.to.state, ...(c.to.value ? { value: c.to.value } : {}) })),
      })
      setPlan(null)
      p.onDone(`${res.applied} applied${res.refused.length ? `, ${res.refused.length} not applied` : ''}. You can undo this upload in one step.`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Not applied. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="upload-heading" className="space-y-3 rounded-xl border border-line bg-white p-4">
      <h3 id="upload-heading" className="font-extrabold">
        Upload a filled template
      </h3>
      <input aria-label="Marks file" type="file" accept=".csv,.xlsx" disabled={busy} onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} className="text-sm" />
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      {plan && (
        <div className="space-y-3 text-sm" role="status">
          <p className="font-semibold">
            {plan.changes.length} {plan.changes.length === 1 ? 'change' : 'changes'} to apply
            {plan.problems.length > 0 && `, ${plan.problems.length} not applied`}
            {plan.unknown.length > 0 && `, ${plan.unknown.length} unknown ${t('person.admission_no', { count: plan.unknown.length, lower: true })}`}
            {plan.missing.length > 0 && `, ${plan.missing.length} not in the file`}.
          </p>
          {plan.changes.length > 0 && (
            <div className="max-h-72 overflow-auto rounded-lg border border-line">
              <table className="w-full text-left">
                <caption className="sr-only">Changes</caption>
                <thead className="bg-canvas text-xs uppercase text-muted">
                  <tr>
                    <th className="px-2 py-1">Name</th>
                    <th className="px-2 py-1">Column</th>
                    <th className="px-2 py-1 text-right">Now</th>
                    <th className="px-2 py-1 text-right">After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {plan.changes.map((c) => (
                    <tr key={c.student.id + c.column.id}>
                      <td className="px-2 py-1">{c.student.name}</td>
                      <td className="px-2 py-1">{c.column.label}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-muted">{showCell(c.from) || 'blank'}</td>
                      <td className="px-2 py-1 text-right font-semibold tabular-nums">{showCell(c.to) || 'blank'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {plan.problems.length > 0 && (
            <ul className="list-inside list-disc text-red-700">
              {plan.problems.map((x, i) => (
                <li key={i}>
                  {x.student?.name ?? x.admissionNo}
                  {x.column && `, ${x.column}`}
                  {x.raw && ` (${x.raw})`}: {x.reason}
                </li>
              ))}
            </ul>
          )}
          {plan.unknown.length > 0 && <p className="text-red-700">Unknown {t('person.admission_no', { count: 2, lower: true })}: {plan.unknown.join(', ')}</p>}
          {plan.unknownColumns.length > 0 && <p className="text-muted">Columns not read: {plan.unknownColumns.join(', ')}</p>}
          {plan.missing.length > 0 && <p className="text-muted">Not in the file, left as they are: {plan.missing.map((s) => s.name).join(', ')}</p>}
          <div className="flex gap-2">
            <button type="button" className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white disabled:opacity-50" disabled={busy || plan.changes.length === 0} onClick={() => void apply()}>
              Apply {plan.changes.length}
            </button>
            <button type="button" className={button} onClick={() => setPlan(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

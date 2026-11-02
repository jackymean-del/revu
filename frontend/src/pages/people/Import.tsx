import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { applyImport, download, listImportJobs, previewImport, saveBlob, type ImportJob, type ImportPreview } from '../../api/client'
import { ApiError } from '../../api/problem'
import { useT } from '../../lib/terminology/terms-context'
import { useSectionNames } from './sections'

const box = 'rounded-xl border border-line bg-white p-5'
const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const quiet = 'rounded-lg px-3 py-2 text-sm font-semibold text-brand hover:bg-mist'

function Count({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <p className={`text-2xl font-extrabold ${tone}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

/** Import a class list in three steps: choose, check, import. */
export function Import({ orgId, canEdit, onDone }: { orgId: string; canEdit: boolean; onDone: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const names = useSectionNames(orgId)
  const [file, setFile] = useState<File | null>(null)
  const [sectionId, setSection] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportJob | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const history = useQuery({ queryKey: ['import-jobs', orgId], queryFn: ({ signal }) => listImportJobs(orgId, signal), enabled: canEdit })

  if (!canEdit) return <p className="text-sm text-muted">Only an administrator can import.</p>

  const guard = async (work: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields?.[0]?.message ?? e.message) : 'Could not reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const template = () => {
    const head = [t('person.admission_no'), 'Name', 'Date of birth', t('group.section'), t('person.roll_no'), `${t('person.guardian')} name`, 'Phone', 'Email']
    saveBlob(new Blob(['﻿' + head.join(',') + '\n'], { type: 'text/csv' }), 'class-list-template.csv')
  }

  const reset = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError('')
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Steps">
        {['Choose a file', 'Check it', 'Import'].map((s, i) => {
          const step = result ? 2 : preview ? 1 : 0
          return (
            <li key={s} aria-current={i === step ? 'step' : undefined} className={`rounded-full px-3 py-1 font-semibold ${i === step ? 'bg-brand text-white' : i < step ? 'bg-mist text-brand' : 'bg-line text-muted'}`}>
              {i + 1}. {s}
            </li>
          )
        })}
      </ol>

      {!preview && !result && (
        <section className={`${box} space-y-4`}>
          <p className="text-sm text-muted">
            A .csv or .xlsx file with headings in the first row. {t('person.admission_no')} and name are needed; date of birth, {t('group.section', { lower: true })},{' '}
            {t('person.roll_no', { lower: true })} and a contact are optional. Rows are matched by {t('person.admission_no', { lower: true })}, so importing again updates instead
            of adding twice.
          </p>
          <button type="button" className={quiet} onClick={template}>
            Download a template
          </button>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-semibold">File</span>
              <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Place everyone without a {t('group.section', { lower: true })} column in</span>
              <select value={sectionId} onChange={(e) => setSection(e.target.value)} className="w-full rounded-md border border-line bg-white px-2 py-1.5">
                <option value="">Do not place them</option>
                {names.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {names.name(s)}, {names.year(s.yearId)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" className={primary} disabled={!file || busy} onClick={() => void guard(async () => setPreview(await previewImport(orgId, file!, sectionId)))}>
            {busy ? 'Checking' : 'Check the file'}
          </button>
        </section>
      )}

      {preview && !result && (
        <section className={`${box} space-y-5`}>
          <div>
            <h2 className="font-extrabold">{preview.fileName}</h2>
            <p className="text-sm text-muted">Nothing has changed yet. Check the numbers, then import.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Count label="Rows" value={preview.rows} />
            <Count label="Will be added" value={preview.create} tone="text-brand" />
            <Count label="Will be updated" value={preview.update} />
            <Count label="Unchanged" value={preview.unchanged} />
            <Count label="Cannot import" value={preview.rejected} tone={preview.rejected ? 'text-red-700' : ''} />
          </div>
          <p className="text-sm text-muted">
            Columns read: {preview.columns.join(', ')}
            {preview.unknownColumns.length > 0 && `. Ignored: ${preview.unknownColumns.join(', ')}`}
          </p>
          {preview.problems.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-extrabold">Rows that cannot be imported</h3>
                <button type="button" className={quiet} onClick={() => void guard(() => download(orgId, `/v1/import-jobs/${preview.id}/errors.csv`, preview.fileName.replace(/\.(csv|xlsx)$/i, '') + '-rejected.csv'))}>
                  Download them with reasons
                </button>
              </div>
              <div className="max-h-72 overflow-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-canvas text-left text-xs uppercase tracking-wide text-subtle">
                    <tr>
                      <th scope="col" className="px-3 py-2">Row</th>
                      <th scope="col" className="px-3 py-2">{t('person.admission_no')}</th>
                      <th scope="col" className="px-3 py-2">Name</th>
                      <th scope="col" className="px-3 py-2">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.problems.map((p) => (
                      <tr key={p.row} className="border-t border-line align-top">
                        <td className="px-3 py-2 tabular-nums">{p.row}</td>
                        <td className="px-3 py-2">{p.admissionNo}</td>
                        <td className="px-3 py-2">{p.name}</td>
                        <td className="px-3 py-2 text-red-700">{p.reasons.join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rejected > preview.problems.length && <p className="text-xs text-muted">The first {preview.problems.length} are shown; the download has all {preview.rejected}.</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primary}
              disabled={busy || preview.create + preview.update === 0}
              onClick={() =>
                void guard(async () => {
                  setResult(await applyImport(orgId, preview.id))
                  await qc.invalidateQueries()
                })
              }
            >
              {busy ? 'Importing' : `Import ${preview.create + preview.update} ${t('person.student', { count: preview.create + preview.update, lower: true })}`}
            </button>
            <button type="button" className={quiet} onClick={reset}>
              Choose another file
            </button>
          </div>
        </section>
      )}

      {result && (
        <section className={`${box} space-y-4`}>
          <h2 className="font-extrabold">Imported</h2>
          <div className="grid grid-cols-3 gap-3">
            <Count label="Added" value={result.summary.created ?? 0} tone="text-brand" />
            <Count label="Updated" value={result.summary.updated ?? 0} />
            <Count label="Unchanged" value={result.summary.unchanged ?? 0} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={onDone}>
              See the {t('person.student', { count: 2, lower: true })}
            </button>
            <button type="button" className={quiet} onClick={reset}>
              Import another file
            </button>
          </div>
        </section>
      )}

      {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}

      {(history.data?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h3 className="font-extrabold">Recent imports</h3>
          <ul className="divide-y divide-line rounded-xl border border-line bg-white text-sm">
            {history.data!.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="font-semibold">{j.fileName}</span>
                <span className="text-muted">
                  {new Date(j.createdAt).toLocaleString()} ·{' '}
                  {j.status === 'applied' ? `${j.summary.created ?? 0} added, ${j.summary.updated ?? 0} updated` : 'checked, not imported'}
                  {j.summary.rejected ? `, ${j.summary.rejected} could not be imported` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

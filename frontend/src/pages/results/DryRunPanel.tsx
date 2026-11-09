import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dryRunScheme, listStructure, type DryRun, type Period, type Subject } from '../../api/client'
import { ApiError } from '../../api/problem'
import { STATE } from '../../lib/results'
import { useT } from '../../lib/terminology/terms-context'
import { useSectionNames } from '../people/sections'

const select = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'

type Cell = DryRun['rows'][number]['before']

const show = (c: Cell) => (c ? (c.value ? `${c.value}${c.grade ? ` ${c.grade}` : ''}` : STATE[c.state].label) : 'none')

/**
 * Try this version on a section's real marks before it applies (AT-v3-08):
 * how many results change, by how much, and which become withheld. Nothing
 * is saved.
 */
export function DryRunPanel({ orgId, schemeId, unsaved }: { orgId: string; schemeId: string; unsaved: boolean }) {
  const t = useT()
  const names = useSectionNames(orgId)
  const periods = useQuery({ queryKey: ['structure', orgId, 'periods', {}], queryFn: ({ signal }) => listStructure<Period>(orgId, 'periods', {}, signal) }).data ?? []
  const subjects = useQuery({ queryKey: ['structure', orgId, 'subjects', {}], queryFn: ({ signal }) => listStructure<Subject>(orgId, 'subjects', {}, signal) }).data ?? []
  const [pick, setPick] = useState({ sectionId: '', periodId: '', subjectId: '' })
  const [out, setOut] = useState<DryRun | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const sectionId = pick.sectionId || names.sections[0]?.id || ''
  const yearId = names.byId(sectionId)?.yearId
  const yearPeriods = periods.filter((p) => p.yearId === yearId)
  const periodId = pick.periodId || yearPeriods[0]?.id || ''
  const subjectId = pick.subjectId || subjects[0]?.id || ''

  async function run() {
    setBusy(true)
    setError('')
    try {
      setOut(await dryRunScheme(orgId, schemeId, { sectionId, periodId, subjectId }))
    } catch (e) {
      setOut(null)
      setError(e instanceof ApiError ? (e.fields?.[0]?.message ?? e.message) : 'Not done. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="dry-heading" className="space-y-3 rounded-xl border border-line bg-white p-4">
      <h2 id="dry-heading" className="text-lg font-extrabold">
        Try it on real marks
      </h2>
      <p className="text-sm text-muted">
        Works out a {t('group.section', { lower: true })}'s results under this version and under the scheme in force, and shows the difference. Nothing is saved.
        {unsaved && ' Save the draft first to try your latest changes.'}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('group.section')}
          <select className={select} value={sectionId} onChange={(e) => setPick({ ...pick, sectionId: e.target.value, periodId: '' })}>
            {names.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {names.name(s)} {names.year(s.yearId)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('period.term')}
          <select className={select} value={periodId} onChange={(e) => setPick({ ...pick, sectionId, periodId: e.target.value })}>
            {yearPeriods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('course.subject')}
          <select className={select} value={subjectId} onChange={(e) => setPick({ ...pick, sectionId, periodId, subjectId: e.target.value })}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={button} disabled={busy || !sectionId || !periodId || !subjectId} onClick={() => void run()}>
          Try it
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      {out && (
        <div className="space-y-2">
          <p role="status" className="text-sm">
            <b>{out.changed}</b> of {out.students} results would change
            {out.nowBlocked > 0 && (
              <>
                , and <b>{out.nowBlocked}</b> would be withheld
              </>
            )}
            . {out.current ? `Compared with ${out.current.name}, version ${out.current.version}.` : 'No scheme applies here now.'}
          </p>
          {out.rows.some((r) => r.changed) && (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="py-1 pr-2">
                    {t('person.student')}
                  </th>
                  <th scope="col" className="py-1 pr-2">
                    Now
                  </th>
                  <th scope="col" className="py-1 pr-2">
                    With this version
                  </th>
                  <th scope="col" className="py-1 text-right">
                    Change in %
                  </th>
                </tr>
              </thead>
              <tbody>
                {out.rows
                  .filter((r) => r.changed)
                  .map((r) => (
                    <tr key={r.studentId} className="border-t border-line">
                      <td className="py-1 pr-2 font-semibold">{r.name}</td>
                      <td className="py-1 pr-2 tabular-nums">{show(r.before)}</td>
                      <td className="py-1 pr-2 tabular-nums">{show(r.after)}</td>
                      <td className="py-1 text-right tabular-nums">{r.delta ?? ''}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  )
}

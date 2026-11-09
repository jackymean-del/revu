import { useState } from 'react'
import { below, cellText, nextSort, sortRows, type Sort, type SortKey, type Summary } from '../../lib/analysis'
import { useT } from '../../lib/terminology/terms-context'

const th = 'border-b border-line px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted'
const td = 'border-b border-line px-2 py-1.5 text-right tabular-nums'

/** The lowest display threshold of the lists: a result below it is shaded, as on the lists. */
function watchPct(s: Summary): string {
  const ts = s.settings.lists.map((r) => r.showBelowPct)
  return ts.length ? ts.reduce((a, b) => (below(a, b) ? a : b)) : ''
}

/** A column heading that sorts the table by it; again, the other way. */
function SortHead({ label, k, sort, onSort, right, sticky, sub }: { label: string; k: SortKey; sort: Sort; onSort: (k: SortKey) => void; right?: boolean; sticky?: boolean; sub?: string }) {
  const on = sort.key === k
  return (
    <th scope="col" aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`${th} ${right ? 'text-right' : 'text-left'} ${sticky ? 'sticky left-0 z-20 bg-white' : ''}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase hover:bg-mist hover:text-ink ${right ? 'flex-row-reverse' : ''} ${on ? 'text-brand' : ''}`}
      >
        <span>{label}</span>
        <span aria-hidden="true" className={`text-[10px] ${on ? '' : 'opacity-30'}`}>
          {on ? (sort.dir === 'asc' ? '▲' : '▼') : '▲▼'}
        </span>
      </button>
      {sub && <span className="block px-1 font-normal normal-case">{sub}</span>}
    </th>
  )
}

/**
 * The aggregate: one row per student, each subject's percentage and band,
 * the total, and a footer of class figures. Every column sorts, both ways,
 * the whole row moving together.
 */
export function AggregateTable({ summary }: { summary: Summary }) {
  const t = useT()
  const [sort, setSort] = useState<Sort>({ key: 'roll', dir: 'asc' })
  const rows = sortRows(summary.students, sort)
  const watch = watchPct(summary)
  const full = summary.access === 'full'
  const several = new Set(summary.students.map((r) => r.sectionId)).size > 1
  const onSort = (k: SortKey) => setSort(nextSort(sort, k))
  const footer: [string, (x: Summary['subjects'][number]) => string | undefined][] = [
    ['Average', (x) => x.average],
    ['Median', (x) => x.median],
    ['Highest', (x) => x.highest],
    ['Lowest', (x) => x.lowest],
  ]
  if (summary.basis === '') footer.push(['Passed', (x) => (x.access === 'full' && x.complete > 0 ? `${x.passed} of ${x.complete}` : '')])
  const lead = several ? 4 : 3

  return (
    <section aria-label="Aggregate" className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span>
          {rows.length} {t('person.student', { count: rows.length, lower: true })}. Click any heading to sort by it; click again for the other way.
        </span>
        {watch && (
          <span className="ml-auto flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-amber-100 ring-1 ring-amber-300" /> below {watch}%
          </span>
        )}
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-line bg-white">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <SortHead label={t('person.roll_no')} k="roll" sort={sort} onSort={onSort} />
              <SortHead label={t('person.student')} k="name" sort={sort} onSort={onSort} sticky />
              <SortHead label={t('person.admission_no')} k="admission" sort={sort} onSort={onSort} />
              {several && <SortHead label={t('group.section')} k="section" sort={sort} onSort={onSort} />}
              {summary.subjects.map((s) => (
                <SortHead key={s.id} label={s.name} k={`subject:${s.id}`} sort={sort} onSort={onSort} right sub={s.max && summary.basis !== '' ? `out of ${s.max}` : undefined} />
              ))}
              {full && <th scope="col" className={`${th} text-right`}>Total</th>}
              {full && <SortHead label="%" k="total" sort={sort} onSort={onSort} right />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-canvas">
                <td className="border-b border-line px-2 py-1.5 tabular-nums text-muted">{r.rollNo}</td>
                <th scope="row" className="sticky left-0 border-b border-line bg-white px-2 py-1.5 text-left font-normal">
                  {r.name}
                </th>
                <td className="border-b border-line px-2 py-1.5 tabular-nums text-muted">{r.admissionNo}</td>
                {several && <td className="whitespace-nowrap border-b border-line px-2 py-1.5 text-muted">{r.section}</td>}
                {summary.subjects.map((s) => {
                  const c = r.subjects[s.id]
                  const low = !!watch && below(c?.pct, watch)
                  return (
                    <td key={s.id} className={`${td} ${low ? 'bg-amber-50 text-amber-900' : ''} ${c && !c.pct ? 'text-muted' : ''}`}>
                      {cellText(c)}
                      {c?.band && <span className="ml-1.5 rounded bg-mist px-1 text-xs font-semibold text-brand">{c.band}</span>}
                    </td>
                  )
                })}
                {full && <td className={`${td} text-muted`}>{r.total?.value ? `${r.total.value} / ${r.total.max}` : ''}</td>}
                {full && (
                  <td className={`${td} font-semibold`}>
                    {cellText(r.total)}
                    {r.total?.band && <span className="ml-1.5 rounded bg-brand px-1 text-xs font-semibold text-white">{r.total.band}</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-canvas">
            {footer.map(([label, pick]) => (
              <tr key={label}>
                <th scope="row" colSpan={lead} className="sticky left-0 border-b border-line bg-canvas px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  {label}
                </th>
                {summary.subjects.map((s) => (
                  <td key={s.id} className={`${td} font-semibold`}>
                    {pick(s) ?? ''}
                  </td>
                ))}
                {full && <td className={td} />}
                {full && <td className={td} />}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted">
        Percentages are of each result&apos;s own maximum. The total adds the {t('course.subject', { count: 2, lower: true })} each {t('person.student', { lower: true })} takes, so
        its maximum follows their choices. Withheld and not assessed sort last either way. Bands start at their lower edge.
      </p>
    </section>
  )
}

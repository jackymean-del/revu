import { useState } from 'react'
import { below, cellText, sortRows, type Order, type Summary } from '../../lib/analysis'
import { useT } from '../../lib/terminology/terms-context'

const th = 'border-b border-line px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const td = 'border-b border-line px-2 py-1.5 text-right tabular-nums'

/** The lowest display threshold of the lists: a result below it is shaded, as on the lists. */
function watchPct(s: Summary): string {
  const ts = s.settings.lists.map((r) => r.showBelowPct)
  return ts.length ? ts.reduce((a, b) => (below(a, b) ? a : b)) : ''
}

/** The aggregate: one row per student, each subject's percentage and band, the total, and a footer of class figures. */
export function AggregateTable({ summary }: { summary: Summary }) {
  const t = useT()
  const [order, setOrder] = useState<Order>('roll')
  const rows = sortRows(summary.students, order)
  const watch = watchPct(summary)
  const full = summary.access === 'full'
  const footer: [string, (x: Summary['subjects'][number]) => string | undefined][] = [
    ['Average', (x) => x.average],
    ['Median', (x) => x.median],
    ['Highest', (x) => x.highest],
    ['Lowest', (x) => x.lowest],
  ]
  if (summary.basis === '') footer.push(['Passed', (x) => (x.access === 'full' && x.complete > 0 ? `${x.passed} of ${x.complete}` : '')])

  return (
    <section aria-label="Aggregate" className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">Order</span>
        {(
          [
            ['roll', `${t('person.roll_no')}`],
            ['total', 'Total, highest first'],
          ] as [Order, string][]
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-1">
            <input type="radio" name="order" checked={order === key} disabled={key === 'total' && !full} onChange={() => setOrder(key)} />
            {label}
          </label>
        ))}
        {watch && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted">
            <span className="inline-block h-3 w-3 rounded-sm bg-amber-100 ring-1 ring-amber-300" /> below {watch}%
          </span>
        )}
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-line bg-white">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <th className={`${th} sticky left-0 z-20 bg-white`}>{t('person.student')}</th>
              {summary.subjects.map((s) => (
                <th key={s.id} className={`${th} text-right`} title={s.max ? `Out of ${s.max}` : undefined}>
                  {s.name}
                  {s.max && summary.basis !== '' && <span className="block font-normal normal-case">out of {s.max}</span>}
                </th>
              ))}
              {full && <th className={`${th} text-right`}>Total</th>}
              {full && <th className={`${th} text-right`}>%</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-canvas">
                <th scope="row" className="sticky left-0 border-b border-line bg-white px-2 py-1.5 text-left font-normal">
                  <span className="mr-2 inline-block w-7 tabular-nums text-muted">{r.rollNo}</span>
                  {r.name}
                </th>
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
                {full && (
                  <td className={`${td} text-muted`}>
                    {r.total?.value ? `${r.total.value} / ${r.total.max}` : ''}
                  </td>
                )}
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
                <th scope="row" className="sticky left-0 border-b border-line bg-canvas px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
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
        its maximum follows their choices. Bands start at their lower edge: a result exactly on an edge is in the higher band.
      </p>
    </section>
  )
}

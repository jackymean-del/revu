import type { Summary } from '../../lib/analysis'
import { useT } from '../../lib/terminology/terms-context'

const th = 'border-b border-line px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted'
const td = 'border-b border-line px-2 py-1.5 text-right tabular-nums'

/** How many students are in each band of each subject, with withheld, provisional and not assessed, adding up to those who take it. */
export function BandsTable({ summary }: { summary: Summary }) {
  const t = useT()
  const labels = summary.bands.length ? summary.bands.map((b) => b.label) : [...new Set(summary.subjects.flatMap((s) => s.bands.map((b) => b.label)))]
  return (
    <section aria-label="Bands" className="space-y-2">
      <div className="overflow-auto rounded-xl border border-line bg-white">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className={`${th} text-left`}>{t('course.subject')}</th>
              {labels.map((l) => (
                <th key={l} className={th}>
                  {l}
                </th>
              ))}
              <th className={th}>Provisional</th>
              <th className={th}>Withheld</th>
              <th className={th}>Not assessed</th>
              <th className={th}>Total</th>
              <th className={`${th} w-1/4 text-left`}>Spread</th>
            </tr>
          </thead>
          <tbody>
            {summary.subjects.map((s) => {
              const count = (l: string) => s.bands.find((b) => b.label === l)?.count ?? 0
              const banded = labels.reduce((n, l) => n + count(l), 0)
              const adds = banded + s.provisional + s.blocked + s.notAssessed === s.taking
              return (
                <tr key={s.id}>
                  <th scope="row" className="border-b border-line px-2 py-1.5 text-left font-semibold">
                    {s.name}
                  </th>
                  {labels.map((l) => (
                    <td key={l} className={td}>
                      {count(l) || <span className="text-muted">0</span>}
                    </td>
                  ))}
                  <td className={td}>{s.provisional}</td>
                  <td className={td}>{s.blocked}</td>
                  <td className={td}>{s.notAssessed}</td>
                  <td className={`${td} font-semibold ${adds ? '' : 'text-red-700'}`} title={adds ? undefined : 'The counts do not add up; tell your administrator.'}>
                    {s.taking}
                  </td>
                  <td className="border-b border-line px-2 py-1.5">
                    <div className="flex h-3 overflow-hidden rounded-full bg-canvas" aria-hidden="true">
                      {labels.map((l, i) => (
                        <div key={l} style={{ width: `${(count(l) / Math.max(s.taking, 1)) * 100}%`, opacity: 1 - (i / Math.max(labels.length, 1)) * 0.75 }} className="bg-brand" />
                      ))}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">The spread is the table drawn as a bar, darkest for the top band; the numbers are the record.</p>
    </section>
  )
}

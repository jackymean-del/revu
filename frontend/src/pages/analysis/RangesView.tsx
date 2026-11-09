import { useState } from 'react'
import { rangeIndex, ranges, type Summary } from '../../lib/analysis'
import { useT } from '../../lib/terminology/terms-context'

const select = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'

/** Students by range of percentage, for one subject or the total (criteria lists of B8.6). */
export function RangesView({ summary }: { summary: Summary }) {
  const t = useT()
  const full = summary.subjects.filter((s) => s.access === 'full')
  const [of, setOf] = useState(summary.access === 'full' ? 'total' : (full[0]?.id ?? ''))
  const [open, setOpen] = useState<number | null>(null)
  const rs = ranges(summary.settings.ranges)
  const pctOf = (r: Summary['students'][number]) => (of === 'total' ? r.total?.pct : r.subjects[of]?.pct)
  const placed = summary.students.filter((r) => (of === 'total' ? true : r.subjects[of]))
  const buckets = rs.map((_, i) => placed.filter((r) => rangeIndex(pctOf(r), rs) === i))
  const none = placed.filter((r) => rangeIndex(pctOf(r), rs) === -1)
  const most = Math.max(1, ...buckets.map((b) => b.length))
  if (full.length === 0) return <p className="text-sm text-muted">Your role shows counts only here; the bands view has them.</p>

  return (
    <section aria-label="By range" className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-semibold">
        Of
        <select className={select} value={of} onChange={(e) => (setOf(e.target.value), setOpen(null))}>
          {summary.access === 'full' && <option value="total">Total</option>}
          {full.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <ul className="divide-y divide-line rounded-xl border border-line bg-white">
        {rs.map((r, i) => (
          <li key={r.label}>
            <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-canvas">
              <span className="w-40 shrink-0">{r.label}</span>
              <span className="h-3 flex-1 rounded-full bg-canvas">
                <span className="block h-3 rounded-full bg-brand" style={{ width: `${(buckets[i].length / most) * 100}%` }} />
              </span>
              <span className="w-8 text-right font-semibold tabular-nums">{buckets[i].length}</span>
            </button>
            {open === i && buckets[i].length > 0 && (
              <ul className="flex flex-wrap gap-2 px-4 pb-3">
                {buckets[i].map((s) => (
                  <li key={s.id} className="rounded-md bg-mist px-2 py-1 text-xs">
                    {s.name} <span className="tabular-nums text-muted">{pctOf(s)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {none.length > 0 && (
        <p className="text-sm text-muted">
          {none.length} with no number yet (withheld, provisional with nothing in, or not assessed) {none.length === 1 ? 'is' : 'are'} in no range.
        </p>
      )}
      <p className="text-xs text-muted">
        Each range includes its lower edge; the top range includes 100%. Open a range to see who is in it. An administrator sets the boundaries; for a {t('course.subject', { lower: true })} and
        an assessment, use the Reteach tab.
      </p>
    </section>
  )
}

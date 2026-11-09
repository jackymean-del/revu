import { ACTION, cellText, describeRule, type Summary } from '../../lib/analysis'
import { useT } from '../../lib/terminology/terms-context'

const th = 'border-b border-line px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const td = 'border-b border-line px-2 py-1.5 tabular-nums'

/** The criteria lists, in order; a student is on the first list they meet only (decision D32). */
export function ListsView({ summary }: { summary: Summary }) {
  const t = useT()
  const noun = { one: t('course.subject', { lower: true }), many: t('course.subject', { count: 2, lower: true }) }
  const rows = new Map(summary.students.map((s) => [s.id, s]))
  const names = new Map(summary.subjects.map((s) => [s.id, s.name]))
  const several = new Set(summary.students.map((r) => r.sectionId)).size > 1
  if (summary.settings.lists.length === 0) return <p className="text-sm text-muted">No lists are set up. An administrator adds them under Settings.</p>
  return (
    <div className="space-y-4">
      {summary.lists.map((l, i) => {
        // Only the subjects someone on this list is shown for get a column.
        const cols = summary.subjects.filter((s) => l.students.some((e) => e.subjects.includes(s.id)))
        return (
          <section key={i} aria-label={l.rule.name} className="rounded-xl border border-line bg-white">
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-3">
              <h2 className="text-lg font-bold">{l.rule.name}</h2>
              <span className="rounded-full bg-mist px-2 py-0.5 text-xs font-semibold text-brand">{ACTION[l.rule.action]}</span>
              <span className="text-sm text-muted">{describeRule(l.rule, noun)}</span>
              <span className="ml-auto text-sm font-semibold">{l.students.length}</span>
            </header>
            {l.students.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">Nobody.</p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className={th}>{t('person.student')}</th>
                      {several && <th className={th}>{t('group.section')}</th>}
                      {cols.map((s) => (
                        <th key={s.id} className={`${th} text-right`}>
                          {names.get(s.id)}
                        </th>
                      ))}
                      <th className={`${th} text-right`}>Total %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.students.map((e) => (
                      <tr key={e.studentId}>
                        <th scope="row" className="border-b border-line px-2 py-1.5 text-left font-normal">
                          <span className="mr-2 inline-block w-7 tabular-nums text-muted">{e.rollNo}</span>
                          {e.name}
                        </th>
                        {several && <td className={`${td} whitespace-nowrap text-muted`}>{e.section}</td>}
                        {cols.map((s) => {
                          const c = e.subjects.includes(s.id) ? rows.get(e.studentId)?.subjects[s.id] : undefined
                          return (
                            <td key={s.id} className={`${td} text-right ${c ? 'bg-amber-50 text-amber-900' : ''}`}>
                              {c ? cellText(c) : ''}
                              {c?.band && <span className="ml-1.5 text-xs font-semibold">{c.band}</span>}
                            </td>
                          )
                        })}
                        <td className={`${td} text-right text-muted`}>{e.totalPct}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}
      <p className="text-xs text-muted">
        Lists are checked in order and each {t('person.student', { lower: true })} appears on the first they meet. These preselect the action for the meeting with families, where it can still be changed.
      </p>
    </div>
  )
}

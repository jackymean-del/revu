import { useT } from '../../lib/terminology/terms-context'
import type { Choice } from './assessments'

const field = 'w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm font-normal disabled:bg-canvas disabled:text-muted'

/** The levels the choice narrows through, in order; the last is the exam itself. */
const LEVELS = ['year', 'term', 'level', 'subject'] as const
type Level = (typeof LEVELS)[number]
const keyOf = (c: Choice, l: Level) => (l === 'level' ? c.level : c[l])

/**
 * The exam to work on, narrowed step by step: year, then term, class and
 * subject, then the exam itself. Each list holds only what the one before
 * leaves, and only what this person may open: everything for those who
 * lead, the classes and subjects they teach for a teacher. A list with one
 * thing in it shows it without asking.
 */
export function AssessmentSelect({ choices, value, onChange }: { choices: Choice[]; value: string; onChange: (id: string) => void }) {
  const t = useT()
  const current = choices.find((c) => c.a.id === value) ?? choices[0]
  const label: Record<Level, string> = { year: t('period.year'), term: t('period.term'), level: t('group.level'), subject: t('course.subject') }
  // What each list offers, given the choices made above it.
  const lists = LEVELS.map((l, i) => {
    const within = choices.filter((c) => LEVELS.slice(0, i).every((up) => keyOf(c, up) === keyOf(current, up)))
    return { l, options: [...new Set(within.map((c) => keyOf(c, l)))].filter(Boolean) }
  })
  const exams = choices.filter((c) => LEVELS.every((l) => keyOf(c, l) === keyOf(current, l)))
  // Choosing at one level keeps what still fits below it, or takes the first that does.
  const pick = (l: Level, v: string) => {
    const i = LEVELS.indexOf(l)
    const fits = choices.filter((c) => LEVELS.slice(0, i).every((up) => keyOf(c, up) === keyOf(current, up)) && keyOf(c, l) === v)
    const keep = fits.find((c) => LEVELS.slice(i + 1).every((down) => keyOf(c, down) === keyOf(current, down)) && c.a.title === current?.a.title)
    const next = keep ?? fits[0]
    if (next) onChange(next.a.id)
  }
  if (!current) return null
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {lists.map(({ l, options }) => (
        <label key={l} className="flex min-w-0 flex-col gap-1 text-xs font-semibold">
          {label[l]}
          <select aria-label={label[l]} className={field} value={keyOf(current, l)} disabled={options.length < 2} onChange={(e) => pick(l, e.target.value)}>
            {options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
      ))}
      <label className="col-span-2 flex min-w-0 flex-col gap-1 text-xs font-semibold sm:col-span-1">
        Exam
        <select aria-label="Exam" className={field} value={current.a.id} disabled={exams.length < 2} onChange={(e) => onChange(e.target.value)}>
          {exams.map((c) => (
            <option key={c.a.id} value={c.a.id}>
              {c.a.title}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

import { useT } from '../../lib/terminology/terms-context'
import type { Choice } from './assessments'

const field = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'

/**
 * The assessment to work on. A long list is narrowed by class first, so the
 * second list holds only that class's assessments and the class in hand is
 * always in view.
 */
export function AssessmentSelect({ choices, value, onChange }: { choices: Choice[]; value: string; onChange: (id: string) => void }) {
  const t = useT()
  const levels = [...new Set(choices.map((c) => c.level))]
  const level = choices.find((c) => c.a.id === value)?.level ?? levels[0] ?? ''
  const shown = levels.length > 1 ? choices.filter((c) => c.level === level) : choices
  return (
    <div className="flex flex-wrap gap-2">
      {levels.length > 1 && (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('group.level')}
          <select aria-label={t('group.level')} className={field} value={level} onChange={(e) => onChange(choices.find((c) => c.level === e.target.value)?.a.id ?? value)}>
            {levels.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      )}
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-semibold sm:flex-none">
        Assessment
        <select aria-label="Assessment" className={`${field} w-full sm:w-auto sm:min-w-96`} value={value} onChange={(e) => onChange(e.target.value)}>
          {shown.map((c) => (
            <option key={c.a.id} value={c.a.id}>
              {c.subject}, {c.a.title}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

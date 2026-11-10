import type { Choice } from './assessments'

/** The assessment to work on, grouped by class so a long list stays easy to scan. */
export function AssessmentSelect({ choices, value, onChange }: { choices: Choice[]; value: string; onChange: (id: string) => void }) {
  const groups = choices.reduce<{ level: string; items: Choice[] }[]>((out, c) => {
    const last = out.at(-1)
    if (last && last.level === c.level) last.items.push(c)
    else out.push({ level: c.level, items: [c] })
    return out
  }, [])
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      Assessment
      <select aria-label="Assessment" className="w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm sm:w-auto sm:min-w-96" value={value} onChange={(e) => onChange(e.target.value)}>
        {groups.map((g) => (
          <optgroup key={g.level} label={g.level}>
            {g.items.map((c) => (
              <option key={c.a.id} value={c.a.id}>
                {c.subject}, {c.a.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

import { useState } from 'react'
import { previewPromotion, type PromotionPreview } from '../../api/client'
import { ApiError } from '../../api/problem'
import { useT } from '../../lib/terminology/terms-context'
import { useSectionNames } from './sections'

/** Year-end preview: where each section would go next year. Nothing moves yet. */
export function Promotion({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const t = useT()
  const { years } = useSectionNames(orgId)
  const ordered = [...years].sort((a, b) => a.startsOn.localeCompare(b.startsOn))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [plan, setPlan] = useState<PromotionPreview | null>(null)
  const [error, setError] = useState('')
  const fromId = from || ordered[ordered.length - 2]?.id || ''
  const toId = to || ordered[ordered.length - 1]?.id || ''

  if (!canEdit) return <p className="text-sm text-muted">Only an administrator can plan the end of the {t('period.year', { lower: true })}.</p>
  if (ordered.length < 2)
    return (
      <p className="text-sm text-muted">
        Add the next {t('period.year', { lower: true })} in Structure first; the preview moves {t('person.student', { count: 2, lower: true })} from one to the next.
      </p>
    )

  const outcome = (o: string) => (o === 'promote' ? 'Moves up' : o === 'leaving' ? 'Leaving' : 'No place yet')
  const run = async () => {
    setError('')
    try {
      setPlan(await previewPromotion(orgId, fromId, toId))
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields?.[0]?.message ?? e.message) : 'Could not reach the server. Try again.')
    }
  }
  const pick = (label: string, value: string, set: (v: string) => void) => (
    <label className="text-sm">
      <span className="mb-1 block font-semibold">{label}</span>
      <select value={value} onChange={(e) => (set(e.target.value), setPlan(null))} className="rounded-md border border-line bg-white px-2 py-1.5">
        {ordered.map((y) => (
          <option key={y.id} value={y.id}>
            {y.label}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm text-muted">
        Each {t('group.section', { lower: true })} moves to the one of the same name, in the same {t('org.branch', { lower: true })}, at the next{' '}
        {t('group.level', { lower: true })}. This is a preview: nothing moves until the step that applies it, which comes next.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        {pick('From', fromId, setFrom)}
        {pick('To', toId, setTo)}
        <button type="button" onClick={() => void run()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
          Preview
        </button>
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
      {plan && (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[32rem] text-sm">
            <caption className="sr-only">Promotion preview</caption>
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th scope="col" className="px-3 py-2">From</th>
                <th scope="col" className="px-3 py-2">{t('person.student', { count: 2 })}</th>
                <th scope="col" className="px-3 py-2">Goes to</th>
                <th scope="col" className="px-3 py-2">Already placed</th>
              </tr>
            </thead>
            <tbody>
              {plan.moves.map((m) => (
                <tr key={m.fromSectionId} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2 font-semibold">{m.fromName}</td>
                  <td className="px-3 py-2 tabular-nums">{m.students}</td>
                  <td className={`px-3 py-2 ${m.outcome === 'no_match' ? 'font-semibold text-red-700' : ''}`}>
                    {m.outcome === 'promote' ? m.toName : outcome(m.outcome)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{m.alreadyPlaced ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-3 py-2 text-xs text-muted">
            {plan.students} {t('person.student', { count: plan.students, lower: true })} in all.
            {plan.moves.some((m) => m.outcome === 'no_match') && ` Add the missing ${t('group.section', { count: 2, lower: true })} in Structure to give everyone a place.`}
          </p>
        </div>
      )}
    </div>
  )
}

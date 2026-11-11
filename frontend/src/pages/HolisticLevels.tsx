import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getHolisticSettings, putHolisticSettings, type HolisticSettings } from '../api/client'
import { ApiError } from '../api/problem'
import { Icon } from '../components/Icon'
import { tone } from '../lib/holistic'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'

const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const field = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'

/**
 * Configuration > Levels: the scale holistic levels are shown in, renamed
 * freely (Beginner to Advanced, or Stream, Mountain, Sky) with where each
 * one starts.
 */
export function HolisticLevels() {
  const t = useT()
  const { current, loading } = useOrg()
  const orgId = current?.id ?? ''
  const settings = useQuery({ queryKey: ['holistic-settings', orgId], queryFn: ({ signal }) => getHolisticSettings(orgId, signal), enabled: !!orgId })
  if (loading || settings.isPending) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!orgId || !settings.data) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })}.</p>
  return <Form orgId={orgId} settings={settings.data} />
}

function Form({ orgId, settings }: { orgId: string; settings: HolisticSettings }) {
  const qc = useQueryClient()
  const [levels, setLevels] = useState(settings.levels.map((l) => ({ name: l.name, min: String(l.min) })))
  const save = useMutation({
    mutationFn: () => putHolisticSettings(orgId, { levels: levels.map((l) => ({ name: l.name, min: Number(l.min) || 0 })) }),
    onSuccess: (s) => {
      qc.setQueryData(['holistic-settings', orgId], s)
      void qc.invalidateQueries({ queryKey: ['holistic-class', orgId] })
    },
  })
  const set = (i: number, change: Partial<{ name: string; min: string }>) => setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...change } : l)))
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Levels</h1>
        <p className="mt-1 max-w-2xl text-muted">
          How competency and thinking-skill levels are named on the holistic report, and the share of marks each starts at. A level is shown only with three or more marks behind it.
        </p>
      </div>
      <form
        className="space-y-3 rounded-2xl border border-line bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        {levels.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-6 text-center text-sm font-bold" style={{ color: tone(i + 1, levels.length).fg }}>
              {i + 1}
            </span>
            <input aria-label={`Level ${i + 1} name`} className={`${field} min-w-40 flex-1`} maxLength={30} value={l.name} onChange={(e) => set(i, { name: e.target.value })} />
            <label className="flex items-center gap-1 text-sm">
              from
              <input aria-label={`Level ${i + 1} starts at`} inputMode="decimal" disabled={i === 0} className={`${field} w-16 text-right`} value={i === 0 ? '0' : l.min} onChange={(e) => set(i, { min: e.target.value })} />%
            </label>
            {levels.length > 2 && (
              <button type="button" aria-label={`Remove level ${i + 1}`} className="rounded px-2 text-muted hover:bg-canvas" onClick={() => setLevels((ls) => ls.filter((_, j) => j !== i))}>
                ×
              </button>
            )}
          </div>
        ))}
        {levels.length < 8 && (
          <button type="button" className="text-sm font-semibold text-brand" onClick={() => setLevels((ls) => [...ls, { name: '', min: String(Math.min(100, Number(ls.at(-1)?.min ?? 0) + 10)) }])}>
            Add a level
          </button>
        )}
        {save.error && (
          <p role="alert" className="text-sm font-semibold text-red-700">
            {save.error instanceof ApiError ? save.error.message : 'That did not save.'}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button type="submit" className={primary} disabled={save.isPending}>
            Save
          </button>
          {save.isSuccess && (
            <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
              <Icon name="check" size={16} />
              Saved
            </p>
          )}
        </div>
      </form>
    </div>
  )
}

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { putPaperSettings, type PaperSettings as Settings } from '../api/client'
import { ApiError } from '../api/problem'
import { Icon } from '../components/Icon'
import { useOrg } from '../lib/org-context'
import { SOLO } from '../lib/taxonomy'
import { BLOOMS } from '../lib/syllabus'
import { useT } from '../lib/terminology/terms-context'
import { usePaperSettings } from './papers/settings'

const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const field = 'w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

/**
 * Configuration > Papers: the names question paper sets take, in order,
 * and the institution's own taxonomy beside Bloom and SOLO.
 */
export function PaperSettings() {
  const t = useT()
  const { current, loading } = useOrg()
  const orgId = current?.id ?? ''
  const settings = usePaperSettings(orgId)
  if (loading || (orgId && !settings)) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!orgId || !settings) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })}.</p>
  return <Form orgId={orgId} settings={settings} />
}

function Form({ orgId, settings }: { orgId: string; settings: Settings }) {
  const qc = useQueryClient()
  const [names, setNames] = useState(settings.setNames.join('\n'))
  const [custom, setCustom] = useState(settings.custom.name)
  const [levels, setLevels] = useState(settings.custom.levels.join('\n'))
  const save = useMutation({
    mutationFn: () => putPaperSettings(orgId, { setNames: lines(names), custom: { name: custom.trim(), levels: lines(levels) } }),
    onSuccess: (s) => qc.setQueryData(['paper-settings', orgId], s),
  })
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Papers</h1>
        <p className="mt-1 max-w-3xl text-muted">How question papers are named and planned here. Blueprints can use Bloom, SOLO, your own levels below, or none.</p>
      </div>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <section className="space-y-2 rounded-2xl border border-line bg-white p-4">
          <h2 className="font-bold">Set names</h2>
          <p className="text-sm text-muted">One per line, in the order sets are made: Set A, Set B, or Red, Blue, Green. A set can still be given any name when it is made.</p>
          <textarea aria-label="Set names" rows={4} className={field} value={names} onChange={(e) => setNames(e.target.value)} />
        </section>
        <section className="space-y-2 rounded-2xl border border-line bg-white p-4">
          <h2 className="font-bold">Your own taxonomy</h2>
          <p className="text-sm text-muted">
            Optional. For example Webb&apos;s Depth of Knowledge, or easy, average and difficult. Name it and list its levels, lowest first, up to 12.
          </p>
          <label className="block text-sm font-semibold">
            Name
            <input aria-label="Taxonomy name" className={`${field} mt-1`} maxLength={40} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Depth of knowledge" />
          </label>
          <label className="block text-sm font-semibold">
            Levels, one per line
            <textarea aria-label="Levels" rows={5} className={`${field} mt-1`} value={levels} onChange={(e) => setLevels(e.target.value)} placeholder={'Recall\nSkill\nStrategic thinking\nExtended thinking'} />
          </label>
          <details className="text-sm text-muted">
            <summary className="cursor-pointer font-semibold text-brand">Bloom and SOLO, always available</summary>
            <p className="mt-1">Bloom: {BLOOMS.map((b) => b.label).join(', ')}.</p>
            <p>SOLO: {SOLO.map((l) => l.label).join(', ')}.</p>
          </details>
        </section>
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

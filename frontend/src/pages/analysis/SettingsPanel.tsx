import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAnalysisSettings, putAnalysisSettings } from '../../api/client'
import { ApiError } from '../../api/problem'
import { ACTION, checkSettings, describeRule, type Rule, type Settings } from '../../lib/analysis'
import { moveItem } from '../../lib/reports'
import { useT } from '../../lib/terminology/terms-context'

const input = 'w-20 rounded-md border border-line bg-white px-2 py-1 text-sm tabular-nums'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

/** The institution's analysis settings: mastery and reteach limits, range boundaries, criteria lists and sign-off lines. */
export function SettingsPanel({ orgId }: { orgId: string }) {
  const settings = useQuery({ queryKey: ['analysis-settings', orgId], queryFn: ({ signal }) => getAnalysisSettings(orgId, signal) })
  if (settings.isPending) return <p className="text-sm text-muted">Loading</p>
  if (settings.isError) return <p role="alert" className="text-sm font-semibold text-red-700">The settings could not be loaded.</p>
  return <Form orgId={orgId} initial={settings.data} />
}

function Form({ orgId, initial }: { orgId: string; initial: Settings }) {
  const t = useT()
  const qc = useQueryClient()
  const [s, setS] = useState<Settings>(initial)
  const [ranges, setRanges] = useState(initial.ranges.join(', '))
  const [signoff, setSignoff] = useState(initial.signoff.join(', '))
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  const noun = { one: t('course.subject', { lower: true }), many: t('course.subject', { count: 2, lower: true }) }
  const draft: Settings = {
    ...s,
    ranges: ranges.split(',').map((x) => x.trim()).filter(Boolean),
    signoff: signoff.split(',').map((x) => x.trim()).filter(Boolean),
  }
  const problem = checkSettings(draft)
  const save = useMutation({
    mutationFn: () => putAnalysisSettings(orgId, draft),
    onSuccess: (saved) => {
      qc.setQueryData(['analysis-settings', orgId], saved)
      void qc.invalidateQueries({ queryKey: ['analysis', orgId] })
      setNote({ text: 'Saved. The analysis uses these from now on.' })
    },
    onError: (e) => setNote({ text: e instanceof ApiError ? e.message : 'Not saved. Try again.', error: true }),
  })
  const setRule = (i: number, r: Partial<Rule>) => setS({ ...s, lists: s.lists.map((x, k) => (k === i ? { ...x, ...r } : x)) })

  return (
    <form
      className="max-w-3xl space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!problem) save.mutate()
      }}
    >
      <fieldset className="space-y-2 rounded-xl border border-line bg-white p-4">
        <legend className="px-1 font-bold">Reteach</legend>
        <label className="flex items-center gap-2 text-sm">
          Mastery is
          <input className={input} inputMode="decimal" value={s.masteryPct} onChange={(e) => setS({ ...s, masteryPct: e.target.value })} />% of the marks for a part of the paper.
        </label>
        <label className="flex items-center gap-2 text-sm">
          Teach again when
          <input className={input} inputMode="decimal" value={s.reteachSharePct} onChange={(e) => setS({ ...s, reteachSharePct: e.target.value })} />% or more are below mastery,
        </label>
        <label className="flex items-center gap-2 text-sm">
          with at least
          <input className={input} inputMode="numeric" value={s.minEvidence} onChange={(e) => setS({ ...s, minEvidence: Number(e.target.value) || 0 })} />
          marks.
        </label>
      </fieldset>

      <fieldset className="space-y-2 rounded-xl border border-line bg-white p-4">
        <legend className="px-1 font-bold">Ranges</legend>
        <label className="flex flex-col gap-1 text-sm">
          Boundaries, rising, separated by commas
          <input className="rounded-md border border-line px-2 py-1 text-sm" value={ranges} onChange={(e) => setRanges(e.target.value)} spellCheck={false} />
        </label>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-line bg-white p-4">
        <legend className="px-1 font-bold">Lists</legend>
        <p className="text-sm text-muted">Checked in order; each {t('person.student', { lower: true })} goes on the first list they meet.</p>
        {s.lists.map((r, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <input aria-label="List name" className="w-44 rounded-md border border-line px-2 py-1 font-semibold" value={r.name} onChange={(e) => setRule(i, { name: e.target.value })} />
              <select aria-label="Action" className="rounded-md border border-line px-2 py-1" value={r.action} onChange={(e) => setRule(i, { action: e.target.value as Rule['action'] })}>
                {(Object.keys(ACTION) as Rule['action'][]).map((a) => (
                  <option key={a} value={a}>
                    {ACTION[a]}
                  </option>
                ))}
              </select>
              <span className="ml-auto flex gap-1">
                <button type="button" className={button} aria-label="Move up" disabled={i === 0} onClick={() => setS({ ...s, lists: moveItem(s.lists, i, -1) })}>
                  Up
                </button>
                <button type="button" className={button} aria-label="Move down" disabled={i === s.lists.length - 1} onClick={() => setS({ ...s, lists: moveItem(s.lists, i, 1) })}>
                  Down
                </button>
                <button type="button" className={button} onClick={() => setS({ ...s, lists: s.lists.filter((_, k) => k !== i) })}>
                  Remove
                </button>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select aria-label="Looks at" className="rounded-md border border-line px-2 py-1" value={r.on} onChange={(e) => setRule(i, { on: e.target.value as Rule['on'] })}>
                <option value="subjects">At least</option>
                <option value="overall">Overall result</option>
              </select>
              {r.on === 'subjects' && (
                <>
                  <input aria-label="How many" className={input} inputMode="numeric" value={r.atLeast} onChange={(e) => setRule(i, { atLeast: Number(e.target.value) || 0 })} />
                  {noun.many}
                </>
              )}
              below
              <input aria-label="Below" className={input} inputMode="decimal" value={r.belowPct} onChange={(e) => setRule(i, { belowPct: e.target.value })} />%; show {noun.many} below
              <input aria-label="Show below" className={input} inputMode="decimal" value={r.showBelowPct} onChange={(e) => setRule(i, { showBelowPct: e.target.value })} />%
            </div>
            <p className="text-xs text-muted">{describeRule(r, noun)}</p>
          </div>
        ))}
        <button
          type="button"
          className={button}
          disabled={s.lists.length >= 8}
          onClick={() => setS({ ...s, lists: [...s.lists, { name: 'New list', action: 'support', on: 'subjects', belowPct: '40', atLeast: 1, showBelowPct: '40' }] })}
        >
          Add a list
        </button>
      </fieldset>

      <fieldset className="space-y-2 rounded-xl border border-line bg-white p-4">
        <legend className="px-1 font-bold">Sign-off</legend>
        <label className="flex flex-col gap-1 text-sm">
          Who signs the printed pack, separated by commas; empty for the {t('person.class_teacher', { lower: true })} and {t('person.principal', { lower: true })}
          <input className="rounded-md border border-line px-2 py-1 text-sm" value={signoff} onChange={(e) => setSignoff(e.target.value)} />
        </label>
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" className={primary} disabled={!!problem || save.isPending}>
          {save.isPending ? 'Saving' : 'Save settings'}
        </button>
        {problem && <p className="text-sm text-amber-900">{problem}</p>}
        {note && (
          <p role={note.error ? 'alert' : 'status'} className={`text-sm ${note.error ? 'font-semibold text-red-700' : 'text-muted'}`}>
            {note.text}
          </p>
        )}
      </div>
    </form>
  )
}

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getTerminology, putTerminology, type TerminologyDoc } from '../api/client'
import { ApiError } from '../api/problem'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'
import { PRESETS, TERM_KEYS, describe, makeT, presets, type Preset, type T, type TermKey } from '../lib/terminology/terminology'

type Draft = { preset: Preset; words: Partial<Record<TermKey, { one: string; other: string }>> }

const toDraft = (doc: TerminologyDoc): Draft => {
  const words: Draft['words'] = {}
  for (const o of doc.overrides) if (!o.branchId) words[o.key as TermKey] = { one: o.one, other: o.other }
  return { preset: doc.preset, words }
}

const toDoc = (d: Draft, branchWords: TerminologyDoc['overrides']): TerminologyDoc => ({
  preset: d.preset,
  overrides: [
    ...TERM_KEYS.flatMap((key) => {
      const w = d.words[key]
      return w && (w.one.trim() || w.other.trim()) ? [{ key, one: w.one, other: w.other }] : []
    }),
    ...branchWords,
  ],
})

const wordsOf = (d: TerminologyDoc) =>
  d.overrides
    .map((o) => [o.key, o.branchId ?? '', o.one.trim(), o.other.trim()].join('|'))
    .sort()
    .join(';')

const same = (a: TerminologyDoc, b: TerminologyDoc) => a.preset === b.preset && wordsOf(a) === wordsOf(b)

/** Settings: the words this organisation uses, applied to every screen, report and email. */
export function Words() {
  const { current, loading, error } = useOrg()
  const institution = useT()('org.institution', { lower: true })
  const q = useQuery({
    queryKey: ['terminology', current?.id],
    queryFn: ({ signal }) => getTerminology(current!.id, signal),
    enabled: !!current,
  })

  let body
  if (loading || q.isPending) body = <p className="text-muted">Loading</p>
  else if (error?.status === 401) body = <Notice title="Sign in to see your words">Sign-in arrives with the next release of the app.</Notice>
  else if (!current) body = <Notice title={`No ${institution} yet`}>Once you belong to one, its words appear here.</Notice>
  else if (q.isError) body = <Notice title="These words could not be loaded">{q.error.message}</Notice>
  else body = <Editor key={`${current.id}:${q.dataUpdatedAt}`} orgId={current.id} saved={q.data} canEdit={current.roles.includes('admin')} />

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-subtle">Settings</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Words</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Start from the set closest to how you speak, then rename anything. Every screen, report and email uses these words.
      </p>
      <div className="mt-8">{body}</div>
    </div>
  )
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white p-6">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  )
}

function Editor({ orgId, saved, canEdit }: { orgId: string; saved: TerminologyDoc; canEdit: boolean }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved))
  const branchWords = useMemo(() => saved.overrides.filter((o) => o.branchId), [saved])
  const doc = toDoc(draft, branchWords)
  const dirty = !same(doc, saved)
  const t = makeT(doc)

  const save = useMutation({
    mutationFn: () => putTerminology(orgId, doc),
    onSuccess: (next) => {
      qc.setQueryData(['terminology', orgId], next)
    },
  })
  const apiError = save.error instanceof ApiError ? save.error : null
  const fieldError = (key: TermKey) => {
    const i = doc.overrides.findIndex((o) => o.key === key && !o.branchId)
    return apiError?.fields?.find((f) => f.field.startsWith(`overrides[${i}]`))?.message
  }

  const setWord = (key: TermKey, form: 'one' | 'other', value: string) =>
    setDraft((d) => {
      const cur = d.words[key] ?? { one: '', other: '' }
      return { ...d, words: { ...d.words, [key]: { ...cur, [form]: value } } }
    })
  const clearWord = (key: TermKey) =>
    setDraft((d) => {
      const words = { ...d.words }
      delete words[key]
      return { ...d, words }
    })

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0 space-y-8">
        <fieldset disabled={!canEdit}>
          <legend className="text-sm font-bold">Starting set</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {PRESETS.map((p) => (
              <label
                key={p}
                className={`cursor-pointer rounded-xl border bg-white p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
                  draft.preset === p ? 'border-brand ring-1 ring-brand' : 'border-line hover:border-brand/40'
                }`}
              >
                <input
                  type="radio"
                  name="preset"
                  value={p}
                  checked={draft.preset === p}
                  onChange={() => setDraft((d) => ({ ...d, preset: p }))}
                  className="sr-only"
                />
                <span className="block font-extrabold">{presets[p]['org.institution'].one}</span>
                <span className="mt-1 block text-sm text-muted">
                  {presets[p]['group.section'].one}, {presets[p]['period.term'].one}, {presets[p]['person.student'].one}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset disabled={!canEdit}>
          <legend className="text-sm font-bold">Your words</legend>
          <p className="mt-1 text-sm text-muted">Leave a word blank to use the starting set.</p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th scope="col" className="px-4 py-2 font-bold">What it names</th>
                  <th scope="col" className="px-2 py-2 font-bold">One</th>
                  <th scope="col" className="px-2 py-2 font-bold">Many</th>
                  <th scope="col" className="px-2 py-2"><span className="sr-only">Reset</span></th>
                </tr>
              </thead>
              <tbody>
                {TERM_KEYS.map((key) => {
                  const w = draft.words[key]
                  const base = presets[draft.preset][key]
                  const err = fieldError(key)
                  return (
                    <tr key={key} className={`border-b border-line last:border-b-0 ${w ? 'bg-mist/40' : ''}`}>
                      <td className="px-4 py-2 align-top">
                        <span className="block text-ink">{describe(key)}</span>
                        {err && <span className="mt-1 block text-xs font-semibold text-red-700">{err}</span>}
                      </td>
                      {(['one', 'other'] as const).map((form) => (
                        <td key={form} className="px-2 py-2 align-top">
                          <input
                            aria-label={`${describe(key)}, ${form === 'one' ? 'one' : 'many'}`}
                            value={w?.[form] ?? ''}
                            placeholder={base[form]}
                            maxLength={60}
                            onChange={(e) => setWord(key, form, e.target.value)}
                            className="w-full rounded-md border border-line px-2 py-1.5 placeholder:text-subtle focus:border-brand focus:outline-none"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2 align-top">
                        {w && (
                          <button type="button" onClick={() => clearWord(key)} className="rounded-md px-2 py-1.5 text-xs font-semibold text-brand hover:bg-mist">
                            Reset
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {branchWords.length > 0 && (
            <p className="mt-2 text-xs text-subtle">
              {branchWords.length} words set for one {t('org.branch', { lower: true })} only are kept as they are.
            </p>
          )}
        </fieldset>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Preview t={t} />
        <div className="rounded-xl border border-line bg-white p-4">
          {canEdit ? (
            <>
              <button
                type="button"
                disabled={!dirty || save.isPending}
                onClick={() => save.mutate()}
                className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {save.isPending ? 'Saving' : 'Save words'}
              </button>
              <p role="status" className="mt-2 text-center text-xs text-subtle">
                {apiError ? <span className="font-semibold text-red-700">{apiError.message}</span> : dirty ? 'Unsaved changes' : 'All changes saved'}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">Only an administrator can change these words.</p>
          )}
        </div>
      </aside>
    </div>
  )
}

/** How the words read in real places, updating as you type. */
function Preview({ t }: { t: T }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 text-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-subtle">Preview</p>
      <p className="mt-3 font-extrabold">
        {t('group.level')} 6, {t('group.section')} A
      </p>
      <p className="text-muted">
        32 {t('person.student', { count: 32, lower: true })}, {t('person.class_teacher', { lower: true })}: Asha Rao
      </p>
      <ul className="mt-3 space-y-1 text-muted">
        <li>{t('assessment.periodic_test')} 2 marks are in</li>
        <li>
          {t('assessment.midterm')}, {t('period.term', { lower: true })} 1
        </li>
        <li>
          {t('report.report_card')} ready for the {t('person.principal', { lower: true })} to sign
        </li>
        <li>
          {t('person.admission_no')}: A-0412
        </li>
      </ul>
    </div>
  )
}

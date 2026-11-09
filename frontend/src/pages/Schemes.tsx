import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  assignScheme,
  createScheme,
  importSchemePack,
  listSchemeAssignments,
  listSchemePacks,
  listSchemes,
  listStructure,
  unassignScheme,
  type Level,
  type Period,
  type SchemeSummary,
  type Subject,
} from '../api/client'
import { ApiError } from '../api/problem'
import { blankScheme } from '../lib/results'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'

const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const select = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const STATUS = { draft: 'Draft', published: 'In force', retired: 'Replaced' }

function useList<T>(orgId: string, path: 'levels' | 'periods' | 'subjects') {
  return useQuery({ queryKey: ['structure', orgId, path, {}], queryFn: ({ signal }) => listStructure<T>(orgId, path, {}, signal), enabled: !!orgId }).data ?? []
}

/** Schemes: how marks become results, versioned, and where each applies. */
export function Schemes() {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { current, loading } = useOrg()
  const orgId = current?.id ?? ''
  const canWrite = (current?.roles ?? []).some((r) => r === 'admin' || r === 'coordinator')
  const schemes = useQuery({ queryKey: ['schemes', orgId], queryFn: ({ signal }) => listSchemes(orgId, signal), enabled: !!orgId })
  const packs = useQuery({ queryKey: ['scheme-packs', orgId], queryFn: ({ signal }) => listSchemePacks(orgId, signal), enabled: !!orgId })
  const assignments = useQuery({ queryKey: ['scheme-assignments', orgId], queryFn: ({ signal }) => listSchemeAssignments(orgId, signal), enabled: !!orgId })
  const levels = useList<Level>(orgId, 'levels')
  const periods = useList<Period>(orgId, 'periods')
  const subjects = useList<Subject>(orgId, 'subjects')
  const [form, setForm] = useState({ familyId: '', levelId: '', periodId: '', subjectId: '' })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!orgId) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })}.</p>

  // One entry per scheme, with its versions newest first.
  const families = new Map<string, SchemeSummary[]>()
  for (const s of schemes.data ?? []) families.set(s.familyId, [...(families.get(s.familyId) ?? []), s])
  const inForce = (versions: SchemeSummary[]) => versions.find((v) => v.status === 'published')
  const nameOf = (list: { id: string; name: string }[], id?: string) => (id ? (list.find((x) => x.id === id)?.name ?? '?') : '')

  async function act(run: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    try {
      await run()
    } catch (e) {
      setMessage(e instanceof ApiError ? (e.fields?.[0]?.message ?? e.message) : 'Not done. Try again.')
    } finally {
      setBusy(false)
    }
  }
  const refresh = () => Promise.all(['schemes', 'scheme-packs', 'scheme-assignments', 'results'].map((k) => qc.invalidateQueries({ queryKey: [k, orgId] })))

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Schemes</h1>
          <p className="mt-1 max-w-2xl text-muted">
            A scheme says how marks become a result: which assessments count, how they combine, what an absence does, and the bands (A1, B2 and so on). A published scheme never
            changes; editing it makes the next version, and results show the version they were worked out with.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            className={primary}
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const s = await createScheme(orgId, 'New scheme', blankScheme())
                await refresh()
                void navigate({ to: '/schemes/$schemeId', params: { schemeId: s.id } })
              })
            }
          >
            New scheme
          </button>
        )}
      </div>
      {message && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}

      {canWrite && (packs.data?.length ?? 0) > 0 && (
        <section aria-labelledby="packs-heading" className="space-y-3">
          <h2 id="packs-heading" className="text-lg font-extrabold">
            Start from a board pack
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {packs.data!.map((p) => (
              <li key={p.key} className="space-y-2 rounded-xl border border-line bg-white p-4">
                <p className="font-bold">{p.name}</p>
                <p className="text-sm text-muted">{p.description}</p>
                {p.schemeId ? (
                  <Link to="/schemes/$schemeId" params={{ schemeId: p.schemeId }} className="text-sm font-semibold text-brand underline">
                    Open the scheme made from it
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const r = await importSchemePack(orgId, p.key)
                        await refresh()
                        void navigate({ to: '/schemes/$schemeId', params: { schemeId: r.scheme.id } })
                      })
                    }
                  >
                    Use this pack
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="list-heading" className="space-y-3">
        <h2 id="list-heading" className="text-lg font-extrabold">
          Your schemes
        </h2>
        {schemes.isPending ? (
          <p className="text-sm text-muted">Loading</p>
        ) : families.size === 0 ? (
          <p className="text-sm text-muted">No scheme yet. Start from a board pack, or make one.</p>
        ) : (
          <ul className="space-y-2">
            {[...families.values()].map((versions) => (
              <li key={versions[0].familyId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-4">
                <div>
                  <p className="font-bold">{versions[0].name}</p>
                  <p className="text-xs text-muted">{versions[0].packKey ? `From the board pack ${versions[0].packKey}` : 'Made here'}</p>
                </div>
                <ul className="flex flex-wrap gap-2 text-sm">
                  {versions.map((v) => (
                    <li key={v.id}>
                      <Link to="/schemes/$schemeId" params={{ schemeId: v.id }} className="rounded-lg border border-line px-2 py-1 font-semibold text-brand hover:bg-mist">
                        Version {v.version}: {STATUS[v.status]}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="where-heading" className="space-y-3">
        <h2 id="where-heading" className="text-lg font-extrabold">
          Where each scheme applies
        </h2>
        <p className="text-sm text-muted">
          The most specific line wins: a {t('course.subject', { lower: true })} in a {t('group.level', { lower: true })} before a whole {t('group.level', { lower: true })}, before
          everything. Leave a choice on Every to cover all of them.
        </p>
        {(assignments.data?.length ?? 0) > 0 && (
          <table className="w-full rounded-xl border border-line bg-white text-sm">
            <thead className="bg-mist text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Scheme
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('group.level')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('period.term')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('course.subject')}
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {assignments.data!.map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="px-3 py-2 font-semibold">
                    {a.schemeName}
                    <span className="block text-xs font-normal text-muted">{a.publishedVersion ? `Version ${a.publishedVersion} in force` : 'Not published yet, so not applied'}</span>
                  </td>
                  <td className="px-3 py-2">{nameOf(levels, a.levelId) || 'Every'}</td>
                  <td className="px-3 py-2">{nameOf(periods, a.periodId) || 'Every'}</td>
                  <td className="px-3 py-2">{nameOf(subjects, a.subjectId) || 'Every'}</td>
                  <td className="px-3 py-2 text-right">
                    {canWrite && (
                      <button type="button" className={button} disabled={busy} onClick={() =>
                          void act(async () => {
                            await unassignScheme(orgId, a.id)
                            await refresh()
                          })
                        }>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {canWrite && families.size > 0 && (
          <form
            className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-4"
            onSubmit={(e) => {
              e.preventDefault()
              void act(async () => {
                const r = await assignScheme(orgId, {
                  familyId: form.familyId,
                  ...(form.levelId ? { levelId: form.levelId } : {}),
                  ...(form.periodId ? { periodId: form.periodId } : {}),
                  ...(form.subjectId ? { subjectId: form.subjectId } : {}),
                })
                await refresh()
                setMessage(`Applied. ${r.marked} ${r.marked === 1 ? 'result is' : 'results are'} being worked out again.`)
              })
            }}
          >
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Scheme
              <select className={select} value={form.familyId} onChange={(e) => setForm({ ...form, familyId: e.target.value })} required>
                <option value="">Choose</option>
                {[...families.values()].map((v) => (
                  <option key={v[0].familyId} value={v[0].familyId}>
                    {v[0].name}
                    {inForce(v) ? '' : ' (not published yet)'}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ['levelId', t('group.level'), levels],
                ['periodId', t('period.term'), periods],
                ['subjectId', t('course.subject'), subjects],
              ] as const
            ).map(([key, label, list]) => (
              <label key={key} className="flex flex-col gap-1 text-sm font-semibold">
                {label}
                <select className={select} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
                  <option value="">Every</option>
                  {list.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button type="submit" className={primary} disabled={busy || !form.familyId}>
              Apply
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

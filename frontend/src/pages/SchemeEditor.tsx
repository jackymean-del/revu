import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { deleteScheme, getScheme, newSchemeVersion, publishScheme, updateScheme, type Scheme } from '../api/client'
import { ApiError } from '../api/problem'
import { AGGREGATE, POLICY, errorsByPath, errorsUnder, newComponent, nextCode, type Aggregate, type Component, type Definition, type Policy } from '../lib/results'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'
import { DryRunPanel } from './results/DryRunPanel'

const input = 'w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm disabled:bg-mist'
const small = 'w-24 rounded-md border border-line bg-white px-2 py-1.5 text-sm tabular-nums disabled:bg-mist'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const label = 'flex flex-col gap-1 text-xs font-semibold text-muted'
const KINDS = ['periodic_test', 'midterm', 'term_end'] as const
const FUNCTIONS = 'sum, avg, min, max, best_n, scale, clamp, round_half_up, pct, coalesce'

function Errors({ list }: { list: string[] }) {
  if (list.length === 0) return null
  return (
    <ul className="space-y-0.5 text-xs font-semibold text-red-700">
      {list.map((m, i) => (
        <li key={i}>{m}</li>
      ))}
    </ul>
  )
}

/** One scheme version: a form over its definition, with save, dry run and publish. */
export function SchemeEditor() {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { schemeId } = useParams({ from: '/schemes/$schemeId' })
  const { current } = useOrg()
  const orgId = current?.id ?? ''
  const canWrite = (current?.roles ?? []).some((r) => r === 'admin' || r === 'coordinator')
  const loaded = useQuery({ queryKey: ['scheme', orgId, schemeId], queryFn: ({ signal }) => getScheme(orgId, schemeId, signal), enabled: !!orgId })
  const [name, setName] = useState('')
  const [def, setDef] = useState<Definition | null>(null)
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const scheme = loaded.data
  useEffect(() => {
    if (scheme) {
      setName(scheme.name)
      setDef(scheme.definition)
      setDirty(false)
      setErrors({})
    }
  }, [scheme])

  if (!orgId || loaded.isPending) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (loaded.isError || !scheme || !def)
    return (
      <p role="alert" className="mx-auto max-w-6xl px-4 py-10 text-red-700">
        This scheme could not be loaded.
      </p>
    )

  const editable = canWrite && scheme.status === 'draft'
  const change = (d: Definition) => {
    setDef(d)
    setDirty(true)
  }
  const setComponent = (i: number, c: Component) => change({ ...def, components: def.components.map((x, j) => (j === i ? c : x)) })
  const refresh = async (s?: Scheme) => {
    if (s) qc.setQueryData(['scheme', orgId, s.id], s)
    await Promise.all(['schemes', 'scheme-assignments', 'results'].map((k) => qc.invalidateQueries({ queryKey: [k, orgId] })))
  }

  async function act(run: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    try {
      await run()
    } catch (e) {
      if (e instanceof ApiError && e.fields?.length) {
        setErrors(errorsByPath(e.fields))
        setMessage('Not saved: fix the lines marked below.')
      } else setMessage(e instanceof ApiError ? e.message : 'Not done. Try again.')
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    const s = await updateScheme(orgId, scheme.id, name, def)
    setErrors({})
    setDirty(false)
    await refresh(s)
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/schemes" className="text-sm font-semibold text-brand underline">
            Schemes
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
            {scheme.name} <span className="text-base font-semibold text-muted">version {scheme.version}</span>
          </h1>
          <p className="mt-1 text-muted">
            {scheme.status === 'draft'
              ? 'A draft: change it freely, try it on real marks, then publish.'
              : scheme.status === 'published'
                ? 'In force. A published version never changes; make the next version to change it.'
                : 'Replaced by a later version. Results worked out with it keep saying so.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <>
              <button type="button" className={button} disabled={busy || !dirty} onClick={() =>
                  void act(async () => {
                    await save()
                    setMessage('Saved.')
                  })
                }>
                Save draft
              </button>
              <button
                type="button"
                className={primary}
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    if (dirty) await save()
                    const r = await publishScheme(orgId, scheme.id)
                    await refresh(r.scheme)
                    setMessage(`Published. ${r.marked} ${r.marked === 1 ? 'result is' : 'results are'} being worked out again.`)
                  })
                }
              >
                Publish
              </button>
            </>
          )}
          {canWrite && scheme.status !== 'draft' && (
            <button
              type="button"
              className={primary}
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const s = await newSchemeVersion(orgId, scheme.id)
                  await refresh(s)
                  void navigate({ to: '/schemes/$schemeId', params: { schemeId: s.id } })
                })
              }
            >
              Make the next version
            </button>
          )}
          {editable && (
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await deleteScheme(orgId, scheme.id)
                  await refresh()
                  void navigate({ to: '/schemes' })
                })
              }
            >
              Discard draft
            </button>
          )}
        </div>
      </div>
      {message && (
        <p role="status" className="rounded-lg bg-mist px-3 py-2 text-sm">
          {message}
        </p>
      )}
      <Errors list={errors[''] ?? []} />

      <label className="flex max-w-md flex-col gap-1 text-sm font-semibold">
        Name
        <input
          className={input}
          value={name}
          disabled={!editable}
          onChange={(e) => {
            setName(e.target.value)
            setDirty(true)
          }}
        />
      </label>

      <section aria-labelledby="components-heading" className="space-y-3">
        <h2 id="components-heading" className="text-lg font-extrabold">
          Components
        </h2>
        <p className="text-sm text-muted">Each component reads the marks of some kinds of assessment, combines them, and is worth a number of marks in the result.</p>
        <Errors list={errors['components'] ?? []} />
        {def.components.map((c, i) => (
          <fieldset key={i} className="space-y-3 rounded-xl border border-line bg-white p-4" disabled={!editable}>
            <legend className="sr-only">Component {i + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-[6rem_1fr_7rem]">
              <label className={label}>
                Code
                <input className={input} value={c.code} onChange={(e) => setComponent(i, { ...c, code: e.target.value.toUpperCase() })} />
              </label>
              <label className={label}>
                Name
                <input className={input} value={c.name} onChange={(e) => setComponent(i, { ...c, name: e.target.value })} />
              </label>
              <label className={label}>
                Worth
                <input className={small} inputMode="decimal" value={c.scale_to} onChange={(e) => setComponent(i, { ...c, scale_to: e.target.value.trim() })} />
              </label>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <fieldset className="space-y-1">
                <legend className="text-xs font-semibold text-muted">Reads</legend>
                <div className="flex flex-wrap gap-3 text-sm">
                  {KINDS.map((k) => (
                    <label key={k} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        className="size-4 accent-brand"
                        checked={c.from.kinds.includes(k)}
                        onChange={(e) => setComponent(i, { ...c, from: { ...c.from, kinds: e.target.checked ? [...c.from.kinds, k] : c.from.kinds.filter((x) => x !== k) } })}
                      />
                      {t(`assessment.${k}`, { count: 2 })}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className={label}>
                Columns
                <select
                  className={input}
                  value={c.from.part_kind}
                  onChange={(e) => {
                    const part_kind = e.target.value as 'main' | 'additional'
                    setComponent(i, { ...c, from: part_kind === 'main' ? { kinds: c.from.kinds, part_kind } : { ...c.from, part_kind, component_code: c.from.component_code ?? '' } })
                  }}
                >
                  <option value="main">The main marks</option>
                  <option value="additional">An additional column</option>
                </select>
              </label>
              {c.from.part_kind === 'additional' && (
                <label className={label}>
                  Its code
                  <input className={small} value={c.from.component_code ?? ''} onChange={(e) => setComponent(i, { ...c, from: { ...c.from, component_code: e.target.value.toUpperCase() } })} />
                </label>
              )}
              <label className={label}>
                Combine
                <select
                  className={input}
                  value={c.aggregate.fn}
                  onChange={(e) => {
                    const fn = e.target.value as Aggregate
                    setComponent(i, { ...c, aggregate: fn === 'best_n' ? { fn, n: c.aggregate.n ?? 2 } : { fn } })
                  }}
                >
                  {(Object.keys(AGGREGATE) as Aggregate[]).map((fn) => (
                    <option key={fn} value={fn}>
                      {AGGREGATE[fn]}
                    </option>
                  ))}
                </select>
              </label>
              {c.aggregate.fn === 'best_n' && (
                <label className={label}>
                  How many
                  <input
                    className={small}
                    type="number"
                    min={1}
                    value={c.aggregate.n ?? 2}
                    onChange={(e) => setComponent(i, { ...c, aggregate: { fn: 'best_n', n: Number(e.target.value) || 1 } })}
                  />
                </label>
              )}
              <label className={label}>
                If absent
                <select className={input} value={c.on_absent} onChange={(e) => setComponent(i, { ...c, on_absent: e.target.value as Policy })}>
                  {(Object.keys(POLICY) as Policy[]).map((p) => (
                    <option key={p} value={p}>
                      {POLICY[p]}
                    </option>
                  ))}
                </select>
              </label>
              {editable && def.components.length > 1 && (
                <button type="button" className={button} onClick={() => change({ ...def, components: def.components.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              )}
            </div>
            <Errors list={errorsUnder(errors, `components[${i}]`)} />
          </fieldset>
        ))}
        {editable && (
          <button type="button" className={button} onClick={() => change({ ...def, components: [...def.components, newComponent(nextCode(def), 'New component')] })}>
            Add a component
          </button>
        )}
      </section>

      <section aria-labelledby="subject-heading" className="space-y-3 rounded-xl border border-line bg-white p-4">
        <h2 id="subject-heading" className="text-lg font-extrabold">
          The result
        </h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
          <label className={label}>
            How the components combine
            <input
              className={`${input} font-mono`}
              value={def.subject.expr}
              disabled={!editable}
              onChange={(e) => change({ ...def, subject: { ...def.subject, expr: e.target.value } })}
            />
          </label>
          <label className={label}>
            Out of
            <input className={small} inputMode="decimal" value={def.subject.max} disabled={!editable} onChange={(e) => change({ ...def, subject: { ...def.subject, max: e.target.value.trim() } })} />
          </label>
        </div>
        <p className="text-xs text-muted">
          Use the codes above with + - * / and the functions {FUNCTIONS}. For example PT + NB + TE, or best_n([UT1, UT2, UT3], 2) + TE.
        </p>
        <Errors list={[...errorsUnder(errors, 'subject'), ...errorsUnder(errors, 'schema')]} />
        <div className="flex flex-wrap gap-4">
          <label className={label}>
            Round to
            <select
              className={input}
              value={def.rounding.places}
              disabled={!editable}
              onChange={(e) => change({ ...def, rounding: { ...def.rounding, places: Number(e.target.value) } })}
            >
              <option value={0}>Whole marks</option>
              <option value={1}>1 decimal place</option>
              <option value={2}>2 decimal places</option>
            </select>
          </label>
          <label className={label}>
            Round
            <select
              className={input}
              value={def.rounding.at}
              disabled={!editable}
              onChange={(e) => change({ ...def, rounding: { ...def.rounding, at: e.target.value as 'components' | 'subject' } })}
            >
              <option value="components">Each component, so the parts add up to the total</option>
              <option value="subject">Once, at the end</option>
            </select>
          </label>
        </div>
        <Errors list={errorsUnder(errors, 'rounding')} />
      </section>

      <section aria-labelledby="grades-heading" className="space-y-3 rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="grades-heading" className="text-lg font-extrabold">
            Bands
          </h2>
          {editable && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-4 accent-brand"
                checked={!!def.grading}
                onChange={(e) => {
                  const { grading: _drop, ...rest } = def
                  void _drop
                  change(e.target.checked ? { ...def, grading: { from: 'rounded', bands: [{ label: 'A', min_pct: '80' }, { label: 'B', min_pct: '0' }] } } : rest)
                }}
              />
              Give bands
            </label>
          )}
        </div>
        {def.grading ? (
          <>
            <p className="text-xs text-muted">A band starts at its percentage and runs up to the next one, like A1 from 91%. One band must start at 0.</p>
            <ul className="space-y-2">
              {def.grading.bands.map((b, i) => (
                <li key={i} className="flex flex-wrap items-end gap-2">
                  {(
                    [
                      ['label', 'Band', small],
                      ['min_pct', 'From %', small],
                      ['descriptor', 'Description', input + ' max-w-xs'],
                    ] as const
                  ).map(([key, text, cls]) => (
                    <label key={key} className={label}>
                      {text}
                      <input
                        className={cls}
                        value={b[key] ?? ''}
                        disabled={!editable}
                        onChange={(e) => change({ ...def, grading: { ...def.grading!, bands: def.grading!.bands.map((x, j) => (j === i ? { ...x, [key]: e.target.value } : x)) } })}
                      />
                    </label>
                  ))}
                  {editable && (
                    <button type="button" className={button} onClick={() => change({ ...def, grading: { ...def.grading!, bands: def.grading!.bands.filter((_, j) => j !== i) } })}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {editable && (
              <button
                type="button"
                className={button}
                onClick={() => change({ ...def, grading: { ...def.grading!, bands: [...def.grading!.bands, { label: '', min_pct: '' }] } })}
              >
                Add a band
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">No bands: results show marks and percentages only.</p>
        )}
        <Errors list={errorsUnder(errors, 'grading')} />
      </section>

      <section aria-labelledby="pass-heading" className="space-y-3 rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pass-heading" className="text-lg font-extrabold">
            Pass rule
          </h2>
          {editable && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-4 accent-brand"
                checked={!!def.pass}
                onChange={(e) => {
                  const { pass: _drop, ...rest } = def
                  void _drop
                  change(e.target.checked ? { ...def, pass: { subject_min_pct: '33' } } : rest)
                }}
              />
              Has a pass rule
            </label>
          )}
        </div>
        {def.pass ? (
          <div className="flex flex-wrap gap-3">
            <label className={label}>
              The result, at least %
              <input
                className={small}
                value={def.pass.subject_min_pct}
                disabled={!editable}
                onChange={(e) => change({ ...def, pass: { ...def.pass!, subject_min_pct: e.target.value.trim() } })}
              />
            </label>
            {def.components.map((c) => (
              <label key={c.code} className={label}>
                {c.name}, at least % (optional)
                <input
                  className={small}
                  value={def.pass!.components?.[c.code] ?? ''}
                  disabled={!editable}
                  onChange={(e) => {
                    const rest = { ...(def.pass!.components ?? {}) }
                    if (e.target.value.trim()) rest[c.code] = e.target.value.trim()
                    else delete rest[c.code]
                    change({ ...def, pass: { subject_min_pct: def.pass!.subject_min_pct, ...(Object.keys(rest).length ? { components: rest } : {}) } })
                  }}
                />
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No pass rule.</p>
        )}
        <Errors list={errorsUnder(errors, 'pass')} />
      </section>

      {canWrite && <DryRunPanel orgId={orgId} schemeId={scheme.id} unsaved={dirty} />}
    </div>
  )
}

import { Fragment, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { auditFacets, listAudit, type AuditPage } from '../api/client'
import { ApiError } from '../api/problem'
import { changes, fieldLabel, recordName } from '../lib/audit'
import { useOrg } from '../lib/org-context'
import type { T } from '../lib/terminology/terminology'
import { useT } from '../lib/terminology/terms-context'

type Entry = AuditPage['items'][number]

const ACTIONS: Record<string, string> = {
  create: 'Added',
  update: 'Changed',
  delete: 'Removed',
  restore: 'Restored',
  import: 'Imported',
  sync: 'Updated by sign-in',
}

/** What each kind of record is called, in the organisation's words where it has them. */
function entityName(t: T, entity: string): string {
  const named: Record<string, () => string> = {
    students: () => t('person.student', { count: 2 }),
    guardians: () => t('person.guardian', { count: 2 }),
    sections: () => t('group.section', { count: 2 }),
    levels: () => t('group.level', { count: 2 }),
    academic_years: () => t('period.year', { count: 2 }),
    periods: () => t('period.term', { count: 2 }),
    subjects: () => t('course.subject', { count: 2 }),
    branches: () => t('org.branch', { count: 2 }),
    level_subjects: () => `${t('course.subject', { count: 2 })} of each ${t('group.level', { lower: true })}`,
    teaching_assignments: () => 'Teaching assignments',
    enrolments: () => 'Placements',
    staff: () => 'Staff',
    memberships: () => 'Roles',
    terminology: () => 'Words',
  }
  return named[entity]?.() ?? fieldLabel(entity)
}

const select = 'w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm'

function Details({ entry }: { entry: Entry }) {
  if (entry.action === 'import' || entry.action === 'sync') {
    const counts = Object.entries(entry.after ?? {}).map(([k, v]) => `${fieldLabel(k)}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    return <p className="text-sm text-muted">{counts.join(', ')}</p>
  }
  const list = changes(entry.before, entry.after)
  if (list.length === 0) return <p className="text-sm text-muted">No field changed.</p>
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-subtle">
        <tr>
          <th scope="col" className="py-1 pr-3">Field</th>
          <th scope="col" className="py-1 pr-3">Before</th>
          <th scope="col" className="py-1">After</th>
        </tr>
      </thead>
      <tbody>
        {list.map((c) => (
          <tr key={c.field} className="border-t border-line align-top">
            <td className="py-1 pr-3 font-semibold">{fieldLabel(c.field)}</td>
            <td className="break-all py-1 pr-3 text-muted">{c.from || '-'}</td>
            <td className="break-all py-1">{c.to || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Settings: who changed what and when, with filters. */
export function Audit() {
  const t = useT()
  const { current, loading } = useOrg()
  const orgId = current?.id
  const canRead = !!current?.roles.some((r) => r === 'admin' || r === 'principal')
  const [filters, setFilters] = useState({ entity: '', action: '', actor: '', from: '', to: '' })
  const [open, setOpen] = useState<string | null>(null)
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
  const facets = useQuery({ queryKey: ['audit-facets', orgId], queryFn: ({ signal }) => auditFacets(orgId!, signal), enabled: !!orgId && canRead })
  const pages = useInfiniteQuery({
    queryKey: ['audit', orgId, params],
    queryFn: ({ pageParam, signal }) => listAudit(orgId!, pageParam ? { ...params, cursor: pageParam } : params, signal),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor || undefined,
    enabled: !!orgId && canRead,
  })
  const items = pages.data?.pages.flatMap((p) => p.items) ?? []
  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setFilters((f) => ({ ...f, [k]: e.target.value }))
  const who = (e: Entry) => (e.actorId ? e.actorName || e.actorId : 'Sign-in sync')

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!orgId) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })} to see its history.</p>

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-subtle">Settings</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight">History</h1>
      <p className="mt-2 max-w-2xl text-muted">Every change, who made it and when, with what it was before and after.</p>

      {!canRead ? (
        <p className="mt-6 text-sm text-muted">Only an administrator or the {t('person.principal', { lower: true })} can see the history.</p>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-5">
            <label className="text-sm">
              <span className="mb-1 block font-semibold">What</span>
              <select className={select} value={filters.entity} onChange={set('entity')}>
                <option value="">Everything</option>
                {facets.data?.entities.map((e) => (
                  <option key={e} value={e}>
                    {entityName(t, e)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Change</span>
              <select className={select} value={filters.action} onChange={set('action')}>
                <option value="">Any</option>
                {facets.data?.actions.map((a) => (
                  <option key={a} value={a}>
                    {ACTIONS[a] ?? fieldLabel(a)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Who</span>
              <select className={select} value={filters.actor} onChange={set('actor')}>
                <option value="">Anyone</option>
                {facets.data?.actors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">From</span>
              <input type="date" className={select} value={filters.from} onChange={set('from')} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">To</span>
              <input type="date" className={select} value={filters.to} onChange={set('to')} />
            </label>
          </div>

          {pages.error instanceof ApiError && <p role="alert" className="mt-4 text-sm font-semibold text-red-700">{pages.error.fields?.[0]?.message ?? pages.error.message}</p>}

          <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">History</caption>
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th scope="col" className="px-3 py-2">When</th>
                  <th scope="col" className="px-3 py-2">Who</th>
                  <th scope="col" className="px-3 py-2">What happened</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {pages.isPending && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-muted">Loading</td>
                  </tr>
                )}
                {!pages.isPending && items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-muted">Nothing matches.</td>
                  </tr>
                )}
                {items.map((e) => (
                  <Fragment key={e.id}>
                    <tr className="border-b border-line align-top last:border-b-0">
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted">{new Date(e.at).toLocaleString()}</td>
                      <td className="px-3 py-2">{who(e)}</td>
                      <td className="px-3 py-2">
                        <span className="font-semibold">{ACTIONS[e.action] ?? fieldLabel(e.action)}</span> {entityName(t, e.entity).toLowerCase()}
                        {recordName(e.before, e.after) && <span className="text-muted">: {recordName(e.before, e.after)}</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)} className="rounded-md px-2 py-1 text-xs font-semibold text-brand hover:bg-mist">
                          {open === e.id ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {open === e.id && (
                      <tr className="border-b border-line bg-canvas/60">
                        <td colSpan={4} className="px-3 py-3">
                          <Details entry={e} />
                          {e.requestId && <p className="mt-2 font-mono text-xs text-subtle">Request {e.requestId}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {pages.hasNextPage && (
              <div className="border-t border-line p-2 text-center">
                <button type="button" disabled={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()} className="rounded-md px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist">
                  {pages.isFetchingNextPage ? 'Loading' : 'Show more'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

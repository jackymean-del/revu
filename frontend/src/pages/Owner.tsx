import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addGroupAdmin, createOwnerDemo, createOwnerGroup, getOwnerDemo, createOwnerOrg, listOwnerGroups, listOwnerOrgs, removeGroupAdmin, setGroupMember, type OwnerGroup,
} from '../api/client'
import { ApiError } from '../api/problem'
import { useOrg } from '../lib/org-context'
import { RolesAndAccess } from './owner/RolesAndAccess'

const card = 'rounded-xl border border-line bg-white p-5'
const input = 'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm'
const button = 'rounded-lg bg-brand px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const quiet = 'rounded-md px-2 py-1 text-xs font-semibold text-brand hover:bg-mist'

/** The institution types an owner picks from: values of the type itself, not any institution's vocabulary. */
const INSTITUTION_TYPES = [
  { value: 'school', label: 'School' },
  { value: 'college', label: 'College' },
  { value: 'university', label: 'University' },
] as const

const message = (e: unknown) => (e instanceof ApiError ? (e.fields?.[0]?.message ?? e.message) : 'Something went wrong. Try again.')

/**
 * The platform owner's console (blueprint Part 56). Institutions by name,
 * type, administrators and counts, never anything inside them; creating an
 * institution invites its administrator and gives the owner no access to it
 * (Parts 56.5 and 77). Groups are names over institutions (Part 49).
 * Institution words here are the platform's own, the same for every client.
 */
export function Owner() {
  const qc = useQueryClient()
  const { platformOwner, loading } = useOrg()
  const orgs = useQuery({ queryKey: ['owner', 'orgs'], queryFn: ({ signal }) => listOwnerOrgs(signal), enabled: platformOwner })
  const groups = useQuery({ queryKey: ['owner', 'groups'], queryFn: ({ signal }) => listOwnerGroups(signal), enabled: platformOwner })
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'school' as 'school' | 'college' | 'university', adminEmail: '' })
  const [groupName, setGroupName] = useState('')
  const [adminFor, setAdminFor] = useState<Record<string, string>>({})

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!platformOwner) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">This console is for the platform owner.</p>

  async function run(work: () => Promise<string>) {
    setBusy(true)
    setNote(null)
    try {
      setNote({ text: await work() })
      void qc.invalidateQueries({ queryKey: ['owner'] })
      void qc.invalidateQueries({ queryKey: ['me'] })
    } catch (e) {
      setNote({ text: message(e), error: true })
    } finally {
      setBusy(false)
    }
  }

  const create = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const r = await createOwnerOrg(form)
      setForm({ ...form, name: '', adminEmail: '' })
      return r.emailed
        ? `${form.name} is created, and ${form.adminEmail} has an invitation by email.`
        : `${form.name} is created. The invitation email did not go; ${form.adminEmail} can still sign in with that address.`
    })
  }

  const groupOf = (orgId: string) => (groups.data ?? []).find((g) => g.orgIds.includes(orgId))

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-subtle">Platform</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Owner console</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Every institution on revU, by name and counts. What is inside an institution belongs to it: you see no one's records, marks or remarks here.
          </p>
        </div>
        <DemoLoader />
      </div>

      {note && (
        <p role={note.error ? 'alert' : 'status'} className={`text-sm font-semibold ${note.error ? 'text-red-700' : 'text-brand-700'}`}>
          {note.text}
        </p>
      )}

      <RolesAndAccess />

      <section aria-labelledby="new-org" className={card}>
        <h2 id="new-org" className="font-extrabold">
          New institution
        </h2>
        <p className="mt-1 text-sm text-muted">Its administrator is invited by email and becomes the first administrator on signing in with that address.</p>
        <form onSubmit={create} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Name
            <input className={`${input} w-64`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Type
            <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}>
              {INSTITUTION_TYPES.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            {"Administrator's email"}
            <input className={`${input} w-64`} type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} required />
          </label>
          <button type="submit" className={button} disabled={busy}>
            Create and invite
          </button>
        </form>
      </section>

      <section aria-labelledby="orgs-heading" className={card}>
        <h2 id="orgs-heading" className="font-extrabold">
          Institutions ({orgs.data?.length ?? 0})
        </h2>
        <div className="mt-3 relative overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Administrators</th>
                <th className="py-2 pr-3 text-right">Enrolled / staff</th>
                <th className="py-2 pr-3">Group</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(orgs.data ?? []).map((o) => (
                <tr key={o.id}>
                  <td className="py-2 pr-3 font-semibold">
                    {o.name}
                    {o.demo && <span className="ml-2 rounded-full bg-mist px-1.5 text-xs font-semibold text-brand-700">Demo</span>}
                  </td>
                  <td className="py-2 pr-3">{INSTITUTION_TYPES.find((x) => x.value === o.type)?.label}</td>
                  <td className="py-2 pr-3">
                    {o.admins} signed in{o.pendingAdmins.length > 0 && <span className="text-muted">, invited: {o.pendingAdmins.join(', ')}</span>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {o.students} / {o.staff}
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      aria-label={`Group of ${o.name}`}
                      className={input}
                      disabled={busy}
                      value={groupOf(o.id)?.id ?? ''}
                      onChange={(e) =>
                        void run(async () => {
                          const now = groupOf(o.id)
                          if (e.target.value) await setGroupMember(e.target.value, o.id, true)
                          else if (now) await setGroupMember(now.id, o.id, false)
                          return 'Group changed.'
                        })
                      }
                    >
                      <option value="">No group</option>
                      {(groups.data ?? []).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="groups-heading" className={card}>
        <h2 id="groups-heading" className="font-extrabold">
          Groups
        </h2>
        <p className="mt-1 text-sm text-muted">
          A group is a name over several institutions, for one administration. It owns no records. Its administrators see each institution's counts, and open one only
          where they also belong to it.
        </p>
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => (await createOwnerGroup(groupName), setGroupName(''), 'Group created.'))
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            New group
            <input className={`${input} w-64`} value={groupName} onChange={(e) => setGroupName(e.target.value)} required />
          </label>
          <button type="submit" className={button} disabled={busy}>
            Create group
          </button>
        </form>
        <ul className="mt-4 space-y-3">
          {(groups.data ?? []).map((g: OwnerGroup) => (
            <li key={g.id} className="rounded-lg border border-line p-3">
              <p className="font-semibold">
                {g.name} <span className="font-normal text-muted">· {g.orgIds.length} institutions</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">Administrators:</span>
                {g.admins.length === 0 && <span className="text-subtle">none yet</span>}
                {g.admins.map((a) => (
                  <span key={a} className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5">
                    {a}
                    <button type="button" aria-label={`Remove ${a}`} className={quiet} onClick={() => void run(async () => (await removeGroupAdmin(g.id, a), `${a} removed.`))}>
                      ×
                    </button>
                  </span>
                ))}
                <form
                  className="flex items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const email = adminFor[g.id] ?? ''
                    void run(async () => (await addGroupAdmin(g.id, email), setAdminFor({ ...adminFor, [g.id]: '' }), `${email} can now see ${g.name}.`))
                  }}
                >
                  <input aria-label={`Add an administrator to ${g.name}`} className={input} type="email" placeholder="email address" value={adminFor[g.id] ?? ''} onChange={(e) => setAdminFor({ ...adminFor, [g.id]: e.target.value })} />
                  <button type="submit" className={quiet}>
                    Add
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/**
 * Loads the sample institutions into a demo group the owner administers.
 * One is a whole school with a term's work done, so it takes some minutes
 * and runs on the server; this shows how it stands and says when it is done.
 */
function DemoLoader() {
  const qc = useQueryClient()
  const demo = useQuery({
    queryKey: ['owner-demo'],
    queryFn: ({ signal }) => getOwnerDemo(signal),
    refetchInterval: (q) => (q.state.data?.status === 'loading' ? 5000 : false),
  })
  const start = useMutation({ mutationFn: createOwnerDemo, onSuccess: (d) => qc.setQueryData(['owner-demo'], d) })
  const status = demo.data?.status ?? 'idle'
  const [seen, setSeen] = useState(status)
  if (seen !== status) {
    setSeen(status)
    // The institutions appear in the lists and in the institution menu as they are ready.
    if (status === 'done' || status === 'failed') {
      void qc.invalidateQueries({ queryKey: ['owner'] })
      void qc.invalidateQueries({ queryKey: ['me'] })
    }
  }
  return (
    <div className="flex max-w-md flex-col items-end gap-1 text-right">
      <button type="button" className={button} disabled={start.isPending || status === 'loading'} onClick={() => start.mutate()}>
        {status === 'loading' ? 'Loading the sample institutions' : status === 'done' ? 'Load the sample institutions again' : 'Load the sample institutions'}
      </button>
      <p role={start.error || status === 'failed' ? 'alert' : status === 'idle' ? undefined : 'status'} className={`text-xs ${status === 'failed' || start.error ? 'font-semibold text-red-700' : 'text-muted'}`}>
        {start.error
          ? message(start.error)
          : status === 'loading'
            ? 'This takes some minutes. You can leave this page; it carries on.'
            : status === 'done'
              ? 'Ready. Open one from the institution menu, then use Switch to preview each role.'
              : status === 'failed'
                ? demo.data?.detail
                : 'Three sample institutions, one with all its work done: syllabus, papers, marks and reports.'}
      </p>
    </div>
  )
}

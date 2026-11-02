import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createInvitation, listInvitations, revokeInvitation, type InvitationInput } from '../../api/client'
import { ApiError } from '../../api/problem'
import type { Option } from '../../components/EditableList'

const input = 'w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none'

/** Invite people by email, and withdraw open invitations. */
export function Invitations({ orgId, roles }: { orgId: string; roles: Option[] }) {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['invitations', orgId], queryFn: ({ signal }) => listInvitations(orgId, signal) })
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InvitationInput['role']>('teacher')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const roleName = (r: string) => roles.find((o) => o.value === r)?.label ?? r

  const run = async (work: () => Promise<unknown>) => {
    setError('')
    setNote('')
    try {
      await work()
      await qc.invalidateQueries({ queryKey: ['invitations', orgId] })
      return true
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields?.[0]?.message ?? e.message) : 'Could not reach the server. Try again.')
      return false
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const inv = await createInvitation(orgId, { email, role })
      setEmail('')
      setNote(inv.sent ? `Invitation emailed to ${inv.email}.` : `Saved. The email could not be sent, but ${inv.email} gets the role on signing in with that address.`)
    })
  }

  return (
    <section className="space-y-3">
      <h2 className="font-extrabold">Invitations</h2>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1 text-sm">
          <span className="mb-1 block font-semibold">Email</span>
          <input type="email" required className={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Role</span>
          <select className={input} value={role} onChange={(e) => setRole(e.target.value as InvitationInput['role'])}>
            {roles.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
          Invite
        </button>
      </form>
      {note && <p role="status" className="text-sm text-muted">{note}</p>}
      {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
      <ul className="divide-y divide-line rounded-xl border border-line bg-white text-sm">
        {(list.data ?? []).length === 0 && <li className="px-3 py-2 text-muted">No invitations yet.</li>}
        {list.data?.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span>
              <span className="font-semibold">{i.email}</span> <span className="text-muted">as {roleName(i.role)}</span>
            </span>
            <span className="flex items-center gap-2 text-muted">
              {i.status === 'pending' ? (i.sent ? 'Emailed, waiting' : 'Waiting for sign-in') : i.status === 'accepted' ? 'Accepted' : 'Withdrawn'}
              {i.status === 'pending' && (
                <button type="button" onClick={() => void run(() => revokeInvitation(orgId, i.id))} className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
                  Withdraw
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { handFamilyMessages, issueFamilyAccounts, listFamilyAccounts, listFamilyMessages, sendFamilyMessages } from '../../api/client'
import { ApiError } from '../../api/problem'
import { Loading } from '../../components/Loading'
import { useT } from '../../lib/terminology/terms-context'
import { useSectionNames } from './sections'

const primary = 'rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const STATE: Record<string, { label: string; className: string }> = {
  none: { label: 'No sign-in yet', className: 'bg-canvas text-muted' },
  issued: { label: 'Sent, not used yet', className: 'bg-amber-50 text-amber-800' },
  active: { label: 'In use', className: 'bg-emerald-50 text-emerald-800' },
}

/**
 * Family sign-ins, for an administrator: who has one, issuing them for a
 * whole section or one student, and the messages that carry each temporary
 * password, waiting to be sent or printed as slips and handed over.
 */
export function FamilyAccounts({ orgId }: { orgId: string }) {
  const t = useT()
  const qc = useQueryClient()
  const names = useSectionNames(orgId)
  const sections = names.sections.filter((s) => s.yearId === names.chosenYear)
  const [picked, setPicked] = useState('')
  const sectionId = sections.some((s) => s.id === picked) ? picked : (sections[0]?.id ?? '')
  const accounts = useQuery({ queryKey: ['family-accounts', orgId, sectionId], queryFn: ({ signal }) => listFamilyAccounts(orgId, sectionId, signal), enabled: !!sectionId })
  const outbox = useQuery({ queryKey: ['family-messages', orgId], queryFn: ({ signal }) => listFamilyMessages(orgId, signal) })
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['family-accounts', orgId] })
    void qc.invalidateQueries({ queryKey: ['family-messages', orgId] })
  }
  const issue = useMutation({ mutationFn: (v: { studentIds?: string[]; reset?: boolean }) => issueFamilyAccounts(orgId, v.studentIds ? v : { ...v, sectionId }), onSuccess: refresh })
  const send = useMutation({ mutationFn: () => sendFamilyMessages(orgId), onSuccess: refresh })
  const handed = useMutation({ mutationFn: () => handFamilyMessages(orgId), onSuccess: refresh })
  const error = (issue.error ?? send.error ?? handed.error) as Error | null
  const list = accounts.data ?? []
  const without = list.filter((a) => a.state === 'none').length
  const waiting = outbox.data?.messages ?? []

  if (sections.length === 0) return <p className="text-sm text-muted">Add {t('group.section', { count: 2, lower: true })} first.</p>
  return (
    <div className="max-w-5xl space-y-5">
      <p className="text-sm text-muted">
        A family signs in for its child with a user name and a password. The first password is random and temporary: the family must choose its own the first time it signs in. Only you see this
        page.
      </p>

      {waiting.length > 0 && (
        <section aria-label="Messages waiting" className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50/70 p-4 print:border-0 print:bg-white print:p-0">
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <h2 className="mr-auto font-bold">
              {waiting.length} {waiting.length === 1 ? 'message' : 'messages'} waiting to reach families
            </h2>
            <button type="button" className={primary} disabled={!outbox.data?.canSend || send.isPending} onClick={() => send.mutate()}>
              Send by SMS and email
            </button>
            <button type="button" className={button} onClick={() => window.print()}>
              Print slips
            </button>
            <button type="button" className={button} disabled={handed.isPending} onClick={() => handed.mutate()}>
              Mark all as handed over
            </button>
          </div>
          <p className="text-sm text-muted print:hidden">
            {outbox.data?.canSend
              ? 'Each message carries a temporary password. It is wiped from here as soon as it is sent or marked as handed over.'
              : 'No SMS or email service is connected yet, so nothing is sent from here. Print the slips, hand them over, then mark them as handed over, which wipes the passwords from here.'}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 print:grid-cols-2">
            {waiting.map((m) => (
              <li key={m.id} className="break-inside-avoid rounded-lg border border-line bg-white p-3 text-sm">
                <p className="font-bold">{m.student}</p>
                <p className="text-xs text-muted">
                  {m.channel === 'paper' ? 'Paper slip' : `${m.channel === 'sms' ? 'SMS' : 'Email'} to ${m.recipient}, ${m.address}`}
                  {m.status === 'failed' && <span className="ml-1 font-semibold text-red-700">did not send: {m.error}</span>}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-sm">
          <span className="mb-1 block font-semibold">{t('group.section')}</span>
          <select aria-label={t('group.section')} className="rounded-md border border-line bg-white px-2 py-1.5 text-sm" value={sectionId} onChange={(e) => setPicked(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {names.name(s)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={primary} disabled={issue.isPending || without === 0} onClick={() => issue.mutate({})}>
          {without === 0 ? 'Everyone here has a sign-in' : `Give a sign-in to the ${without} without one`}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700 print:hidden">
          {error instanceof ApiError ? error.message : 'That did not work. Try again.'}
        </p>
      )}
      {issue.data && (
        <p role="status" className="text-sm print:hidden">
          <span className="font-semibold text-emerald-700">
            {issue.data.issued} {issue.data.issued === 1 ? 'sign-in' : 'sign-ins'} made, {issue.data.messages} {issue.data.messages === 1 ? 'message' : 'messages'} waiting above.
          </span>
          {issue.data.skipped.length > 0 && <span className="block text-amber-800">Left out: {issue.data.skipped.join('; ')}</span>}
        </p>
      )}

      {accounts.isPending ? (
        <Loading />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white print:hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">User name</th>
                <th className="px-3 py-2">Sign-in</th>
                <th className="px-3 py-2">Contacts</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((a) => (
                <tr key={a.studentId}>
                  <td className="px-3 py-2 font-semibold">{a.name}</td>
                  <td className="px-3 py-2">{a.username || <span className="text-muted">{a.admissionNo}</span>}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATE[a.state].className}`}>{STATE[a.state].label}</span>
                  </td>
                  <td className="px-3 py-2">{a.contacts === 0 ? <span className="text-amber-800">None: a paper slip</span> : a.contacts}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" className="text-sm font-semibold text-brand disabled:opacity-50" disabled={issue.isPending} onClick={() => issue.mutate({ studentIds: [a.studentId], reset: true })}>
                      {a.state === 'none' ? 'Give a sign-in' : 'New password'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

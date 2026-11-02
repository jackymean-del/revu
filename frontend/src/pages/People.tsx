import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listStructure, type Branch, type Staff } from '../api/client'
import { EditableList } from '../components/EditableList'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'
import { Import } from './people/Import'
import { Promotion } from './people/Promotion'
import { Students } from './people/Students'

type Tab = 'students' | 'staff' | 'members' | 'import' | 'promotion'

/** People: students and their contacts, staff, who can sign in, imports and the year-end preview. */
export function People() {
  const t = useT()
  const { current, loading } = useOrg()
  const orgId = current?.id
  const canEdit = !!current?.roles.includes('admin')
  const [tab, setTab] = useState<Tab>('students')
  const staff = useQuery({ queryKey: ['structure', orgId, 'staff', {}], queryFn: ({ signal }) => listStructure<Staff>(orgId!, 'staff', {}, signal), enabled: !!orgId && tab === 'members' }).data ?? []
  const branches = useQuery({ queryKey: ['structure', orgId, 'branches', {}], queryFn: ({ signal }) => listStructure<Branch>(orgId!, 'branches', {}, signal), enabled: !!orgId && tab === 'members' }).data ?? []

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!orgId)
    return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })} to see its people.</p>

  const tabs: { id: Tab; label: string }[] = [
    { id: 'students', label: t('person.student', { count: 2 }) },
    { id: 'staff', label: 'Staff' },
    { id: 'members', label: 'Who can sign in' },
    { id: 'import', label: 'Import a class list' },
    { id: 'promotion', label: 'Year end' },
  ]
  const roles = [
    { value: 'admin', label: 'Administrator' },
    { value: 'principal', label: t('person.principal') },
    { value: 'coordinator', label: 'Coordinator' },
    { value: 'teacher', label: t('person.teacher') },
    { value: 'class_teacher', label: t('person.class_teacher') },
    { value: 'viewer', label: 'View only' },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-extrabold tracking-tight">People</h1>
      <div role="tablist" aria-label="People" className="mt-6 flex flex-wrap gap-1 border-b border-line">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === x.id ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-6">
        {tab === 'students' && <Students orgId={orgId} canEdit={canEdit} />}
        {tab === 'staff' && (
          <EditableList
            orgId={orgId}
            path="staff"
            canEdit={canEdit}
            noun="staff member"
            empty="No staff yet."
            cols={[
              { key: 'name', label: 'Name', kind: 'text', required: true, width: '24%' },
              { key: 'designation', label: 'Designation', kind: 'text' },
              { key: 'email', label: 'Email', kind: 'text' },
              { key: 'phone', label: 'Phone', kind: 'text' },
              { key: 'employeeNo', label: 'Employee number', kind: 'text', width: '9rem' },
            ]}
          />
        )}
        {tab === 'members' && (
          <div className="space-y-3">
            <p className="max-w-2xl text-sm text-muted">
              Each row is one role for one signed-up person. Roles marked From sign-in follow the bhusku sign-in organisation and change there; inviting people by email
              arrives with the setup steps.
            </p>
            {canEdit ? (
              <EditableList
                orgId={orgId}
                path="memberships"
                canEdit={canEdit}
                restorable={false}
                editable={(m) => m.source !== 'clerk'}
                noun="role"
                empty="Nobody yet."
                cols={[
                  { key: 'staffId', label: 'Staff record', kind: 'select', options: [{ value: '', label: 'Not linked' }, ...staff.map((s) => ({ value: s.id, label: s.name }))] },
                  { key: 'clerkUserId', label: 'Sign-in id', kind: 'text', required: true },
                  { key: 'role', label: 'Role', kind: 'select', required: true, options: roles },
                  { key: 'branchId', label: t('org.branch'), kind: 'select', options: [{ value: '', label: 'Everywhere' }, ...branches.map((b) => ({ value: b.id, label: b.name }))] },
                  { key: 'source', label: 'From', kind: 'text', readOnly: true, show: (m) => (m.source === 'clerk' ? 'Sign-in' : 'Here') },
                ]}
              />
            ) : (
              <p className="text-sm text-muted">Only an administrator can see who can sign in.</p>
            )}
          </div>
        )}
        {tab === 'import' && <Import orgId={orgId} canEdit={canEdit} onDone={() => setTab('students')} />}
        {tab === 'promotion' && <Promotion orgId={orgId} canEdit={canEdit} />}
      </div>
    </div>
  )
}

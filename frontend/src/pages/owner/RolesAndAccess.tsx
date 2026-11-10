import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { getAccessMatrix } from '../../api/client'
import { useOrg } from '../../lib/org-context'

/**
 * The owner's view of roles (blueprint Parts 5, 31 and 77): open any
 * institution you administer as each role, with the server enforcing that
 * role, and read the permission matrix exactly as the server applies it.
 * Role and action names are the platform's own, the same for every
 * institution; nothing here is an institution's vocabulary.
 */

const ROLE_NAMES: Record<string, string> = {
  admin: 'Administrator',
  principal: 'Head of institution',
  coordinator: 'Coordinator',
  teacher: 'Educator',
  class_teacher: 'Class lead',
  viewer: 'View only',
}

const ACTIONS: Record<string, string> = {
  'structure.write': 'Set up structure and people',
  'terminology.write': 'Change the institution words',
  'scheme.write': 'Write assessment schemes',
  'assessment.edit': 'Create and edit assessments',
  'assessment.publish': 'Publish assessments',
  'assessment.lock': 'Lock assessments',
  'evidence.enter': 'Enter marks',
  'evidence.change_locked': 'Change marks after a lock',
  'results.read': 'Read results',
  'remarks.edit': 'Draft and edit remarks',
  'remarks.approve': 'Approve remarks',
  'reports.publish': 'Approve and publish reports',
  'reports.build': 'Make draft reports and results sheets',
  'blueprint.approve': 'Approve or return blueprints',
  insight: 'Insight and support plans',
  'audit.read': 'Read the history',
  'api_keys.manage': 'Manage API keys',
  'layout.institution': 'Order and layout for everyone',
  'layout.personal': 'Their own entry view',
  'historical.import': 'Import past marks',
  'parent.messaging': 'Message families',
  'data_requests.read': 'Read data requests',
  'data_requests.manage': 'Retention and erasure',
  'subject_choices.write': 'Record optional choices',
  'row_status.write': 'Mark absent, exempt or not applicable',
  'row_status_left.write': 'Mark as left (TC)',
  'paper.view_finalised': 'See finalised papers',
  'paper.print': 'Print papers',
  'paper.revise': 'Revise a printed paper',
  'visibility.policy': 'Set what is visible to families',
  'group_sharing.policy': 'Set group sharing',
  'deduction_reasons.write': 'Keep deduction reasons',
  'content_grants.manage': 'Grant, hide or show content',
  'ownership.reassign': 'Reassign ownership',
}

const RULES: Record<string, { text: string; tone: string }> = {
  deny: { text: 'No', tone: 'text-subtle' },
  allow: { text: 'Yes', tone: 'font-semibold text-ink' },
  own_subject: { text: 'What they teach', tone: 'text-brand-700' },
  own_sections: { text: 'Classes they teach', tone: 'text-brand-700' },
  own_section: { text: 'Their own class', tone: 'text-brand-700' },
  section_remark: { text: "Their class's remark", tone: 'text-brand-700' },
  by_grant: { text: 'With a grant', tone: 'text-amber-800' },
  by_grant_with_reason: { text: 'Grant and a reason', tone: 'text-amber-800' },
  counts_only: { text: 'Counts only', tone: 'text-muted' },
  counts_reports_at_approval: { text: 'Counts, and reports to approve', tone: 'text-muted' },
  by_policy: { text: 'If the institution allows', tone: 'text-amber-800' },
  group_admin: { text: 'Group administrator', tone: 'text-brand-700' },
}

const button = 'rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-brand hover:bg-mist'

export function RolesAndAccess() {
  const { orgs, choose, preview, groups } = useOrg()
  const navigate = useNavigate()
  const matrix = useQuery({ queryKey: ['owner', 'access'], queryFn: ({ signal }) => getAccessMatrix(signal) })
  const mine = orgs.filter((o) => o.roles.includes('admin'))

  const open = (orgId: string, role: string | null) => {
    choose(orgId)
    preview(role, orgId)
    void navigate({ to: '/' })
  }

  return (
    <>
      <section aria-labelledby="views-heading" className="rounded-xl border border-line bg-white p-5">
        <h2 id="views-heading" className="font-extrabold">
          See it as each role
        </h2>
        <p className="mt-1 text-sm text-muted">
          Opens the institution as that role. The server enforces the role and refuses changes, so you see exactly what it sees. Client institutions open only where
          you belong to them; your demo group is where to look around.
        </p>
        {mine.length === 0 ? (
          <p className="mt-3 text-sm text-muted">You administer no institution yet. Create your demo group above to have one of each kind.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {mine.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2">
                <span className="w-56 truncate text-sm font-semibold">{o.name}</span>
                <button type="button" className={button} onClick={() => open(o.id, null)}>
                  {ROLE_NAMES.admin}
                </button>
                {['principal', 'coordinator', 'teacher', 'class_teacher', 'viewer'].map((r) => (
                  <button key={r} type="button" className={button} onClick={() => open(o.id, r)}>
                    {ROLE_NAMES[r]}
                  </button>
                ))}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
          <span className="font-semibold">Beyond one institution:</span>
          {groups.length > 0 ? (
            <button type="button" className={button} onClick={() => void navigate({ to: '/groups' })}>
              Group administrator
            </button>
          ) : (
            <span className="text-subtle">Group administrator, once you run a group</span>
          )}
          <span className="text-subtle">· Families and their children: with the family portal</span>
        </div>
      </section>

      <section aria-labelledby="access-heading" className="rounded-xl border border-line bg-white p-5">
        <h2 id="access-heading" className="font-extrabold">
          What each role can reach
        </h2>
        <p className="mt-1 text-sm text-muted">The permission matrix as the server applies it. A role limited to one site reaches that site only.</p>
        {matrix.isPending ? (
          <p className="mt-3 text-sm text-muted">Loading</p>
        ) : matrix.isError ? (
          <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
            {matrix.error.message}
          </p>
        ) : (
          <div className="mt-3 max-h-[32rem] overflow-auto rounded-lg border border-line">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Permission matrix</caption>
              <thead className="sticky top-0 bg-canvas text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Action
                  </th>
                  {matrix.data.roles.map((r) => (
                    <th key={r} scope="col" className="px-3 py-2">
                      {ROLE_NAMES[r] ?? r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {matrix.data.rows.map((row) => (
                  <tr key={row.action}>
                    <th scope="row" className="px-3 py-1.5 font-semibold">
                      {ACTIONS[row.action] ?? row.action}
                    </th>
                    {row.rules.map((rule, i) => (
                      <td key={i} className={`px-3 py-1.5 ${RULES[rule]?.tone ?? ''}`}>
                        {RULES[rule]?.text ?? rule}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { listMyGroups } from '../api/client'
import { useOrg } from '../lib/org-context'

/**
 * The groups a person administers (blueprint Parts 49 and 77): each member
 * institution's status by counts. Opening one needs a membership of it, as
 * the group never grants access to an institution's records by itself.
 * Words are the platform's own, the same for every institution in the group.
 */
export function Groups() {
  const { groups, choose, orgs } = useOrg()
  const navigate = useNavigate()
  const mine = useQuery({ queryKey: ['groups', 'mine'], queryFn: ({ signal }) => listMyGroups(signal), enabled: groups.length > 0 })

  if (groups.length === 0) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">You do not administer a group.</p>

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-subtle">Groups</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Your groups</h1>
        <p className="mt-2 max-w-2xl text-muted">Each institution's status at a glance. Its records stay with it: open one where you belong to it.</p>
      </div>
      {mine.isPending && <p className="text-sm text-muted">Loading</p>}
      {(mine.data ?? []).map((g) => (
        <section key={g.id} aria-labelledby={`g-${g.id}`} className="rounded-xl border border-line bg-white p-5">
          <h2 id={`g-${g.id}`} className="font-extrabold">
            {g.name}
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.institutions.map((i) => (
              <li key={i.id} className="rounded-lg border border-line p-4">
                <p className="font-semibold">{i.name}</p>
                <p className="text-xs capitalize text-muted">{i.type}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  {[
                    ['Enrolled', i.students],
                    ['Classes running', i.sections],
                    ['Assessments open', i.assessments],
                    ['Marks entered', i.marksEntered],
                  ].map(([label, n]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="text-lg font-extrabold tabular-nums">{n}</dd>
                    </div>
                  ))}
                </dl>
                {i.member && orgs.some((o) => o.id === i.id) ? (
                  <button
                    type="button"
                    className="mt-3 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist"
                    onClick={() => (choose(i.id), void navigate({ to: '/' }))}
                  >
                    Open
                  </button>
                ) : (
                  <p className="mt-3 text-xs text-subtle">You see its status only.</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

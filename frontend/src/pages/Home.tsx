import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getSetup } from '../api/client'
import { SignInPrompt } from '../components/Account'
import { Dashboard } from '../components/Dashboard'
import { useAuthState } from '../lib/auth-context'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'

const card = 'rounded-xl border border-line bg-white p-5'

/** Home: what to do next, by role. Administrators finish setup; everyone sees their own tiles. */
export function Home() {
  const t = useT()
  const auth = useAuthState()
  const { current, orgs, loading, error, unreachable, userId } = useOrg()
  const orgId = current?.id ?? ''
  const roles = current?.roles ?? []
  const isAdmin = roles.includes('admin')
  const teaches = roles.includes('teacher') || roles.includes('class_teacher')
  const leads = roles.some((r) => r === 'admin' || r === 'principal' || r === 'coordinator')
  const setup = useQuery({ queryKey: ['setup', orgId], queryFn: ({ signal }) => getSetup(orgId, signal), enabled: !!orgId })
  const shell = (children: React.ReactNode) => <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10">{children}</div>

  if (auth.enabled && auth.loaded && !auth.signedIn)
    return shell(
      <div className={card}>
        <h1 className="text-2xl font-extrabold tracking-tight">Welcome to revU</h1>
        <p className="mt-2 text-muted">Sign in with the account you use for other bhusku apps.</p>
        <SignInPrompt />
      </div>,
    )
  if (loading) return shell(<p className="text-muted">Loading</p>)
  if (error?.status === 401) return shell(<p className="text-muted">Your sign-in was not accepted. Sign out and sign in again.</p>)
  if (unreachable)
    return shell(
      <div role="alert" className={card}>
        <h1 className="text-xl font-extrabold">revU cannot be reached</h1>
        <p className="mt-2 text-muted">Your sign-in worked, but the revU server did not answer. Check your connection, then try again.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
          Try again
        </button>
      </div>,
    )
  if (!current)
    return shell(
      <div className={card}>
        <h1 className="text-xl font-extrabold">You are signed in</h1>
        <p className="mt-2 text-muted">
          You do not belong to any {t('org.institution', { lower: true })} yet. Ask its administrator to invite the email address you signed in with; you will be
          added the next time you open revU.
        </p>
        {import.meta.env.DEV && userId && <p className="mt-2 font-mono text-xs text-subtle">Sign-in id: {userId}</p>}
      </div>,
    )

  const s = setup.data
  const steps = s
    ? [
        { done: s.years > 0 && s.periods > 0, text: `Add the ${t('period.year', { lower: true })} and its ${t('period.term', { count: 2, lower: true })}` },
        { done: s.levels > 0 && s.sections > 0, text: `Add ${t('group.level', { count: 2, lower: true })} and ${t('group.section', { count: 2, lower: true })}` },
        { done: s.subjects > 0, text: `Choose ${t('course.subject', { count: 2, lower: true })}` },
        { done: s.invitations > 0 || s.staff > 1, text: 'Invite staff' },
        { done: s.students > 0, text: `Import ${t('person.student', { count: 2, lower: true })}` },
      ]
    : []

  return shell(
    <>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-subtle">{current.name}</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Home</h1>
        {orgs.length > 1 && <p className="mt-1 text-sm text-muted">You belong to {orgs.length}; switch at the top right.</p>}
      </div>

      {isAdmin && s && !s.done && (
        <section aria-labelledby="setup-heading" className={`${card} space-y-3 border-brand/40 print:hidden`}>
          <h2 id="setup-heading" className="font-extrabold">
            Finish setting up
          </h2>
          <ul className="space-y-1 text-sm">
            {steps.map((x) => (
              <li key={x.text} className="flex items-center gap-2">
                <span aria-hidden="true" className={`grid size-5 place-items-center rounded-full text-xs font-bold ${x.done ? 'bg-brand text-white' : 'border border-line text-subtle'}`}>
                  {x.done ? '✓' : ''}
                </span>
                <span className={x.done ? 'text-muted line-through' : ''}>{x.text}</span>
                <span className="sr-only">{x.done ? '(done)' : '(to do)'}</span>
              </li>
            ))}
          </ul>
          <Link to="/setup" className="inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            Continue setup
          </Link>
        </section>
      )}

      <Dashboard orgId={orgId} orgName={current.name} canAct={isAdmin} canPrint={leads} />

      {teaches && !current.staffId && (
        <p className={`${card} text-sm text-muted`}>Your sign-in is not linked to a staff record yet. Ask your administrator to link it in People.</p>
      )}
      {teaches && <p className="text-xs text-subtle print:hidden">Marks entry for your classes arrives with the next release.</p>}

      {isAdmin && (
        <nav aria-label="Shortcuts" className="flex flex-wrap gap-2 text-sm print:hidden">
          {[
            { to: '/people', label: `Import ${t('person.student', { count: 2, lower: true })}` },
            { to: '/settings/structure', label: 'Structure' },
            { to: '/settings/words', label: 'Words' },
            { to: '/settings/history', label: 'History' },
          ].map((l) => (
            <Link key={l.to} to={l.to} className="rounded-lg border border-line bg-white px-3 py-2 font-semibold text-brand hover:bg-mist">
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </>,
  )
}

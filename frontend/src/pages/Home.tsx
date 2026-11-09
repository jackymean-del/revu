import { Link } from '@tanstack/react-router'
import { SignInPrompt } from '../components/Account'
import { Dashboard } from '../components/Dashboard'
import { Icon } from '../components/Icon'
import { useSetup } from '../lib/progress'
import { cardFact, modules, nextStep, statuses, visiblePages } from '../lib/journey'
import { useAuthState } from '../lib/auth-context'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'

const card = 'rounded-xl border border-line bg-white p-5'

/** Home: what to do next, by role. Administrators finish setup; everyone sees their own tiles. */
export function Home() {
  const t = useT()
  const auth = useAuthState()
  const { current, loading, error, unreachable, userId, platformOwner, groups } = useOrg()
  const orgId = current?.id ?? ''
  const roles = current?.roles ?? []
  const isAdmin = roles.includes('admin')
  const teaches = roles.includes('teacher') || roles.includes('class_teacher')
  const leads = roles.some((r) => r === 'admin' || r === 'principal' || r === 'coordinator')
  const setup = useSetup()
  const shell = (children: React.ReactNode) => <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">{children}</div>

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
  if (!current && (platformOwner || groups.length > 0))
    return shell(
      <div className={card}>
        <h1 className="text-xl font-extrabold">You are signed in</h1>
        <p className="mt-2 text-muted">
          {platformOwner ? 'You run the platform: create institutions, form groups and make your demo group from the owner console.' : 'You administer a group: see each institution at a glance.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {platformOwner && (
            <Link to="/owner" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              Open the owner console
            </Link>
          )}
          {groups.length > 0 && (
            <Link to="/groups" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-brand hover:bg-mist">
              Open your groups
            </Link>
          )}
        </div>
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
  const ms = modules(t)
  const next = nextStep(ms, s, roles, t)
  const status = statuses(ms, s, roles, t)

  return shell(
    <>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-subtle">{current.name}</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Home</h1>
      </div>

      {next && (
        <section aria-labelledby="next-heading" className="flex flex-wrap items-center gap-4 rounded-2xl bg-brand p-5 text-white shadow-[0_8px_30px_rgba(104,93,188,0.25)] print:hidden">
          <div className="min-w-0 flex-1">
            <h2 id="next-heading" className="text-xs font-bold uppercase tracking-[0.1em] text-white/75">
              Next step
            </h2>
            <p className="mt-1 text-xl font-extrabold">{next.text}</p>
            <p className="mt-0.5 text-sm text-white/80">
              Step {ms.find((m) => m.key === next.module)?.n} of 8, {ms.find((m) => m.key === next.module)?.title}
            </p>
          </div>
          <Link to={next.to} className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-base font-bold text-brand hover:bg-mist">
            Start
            <Icon name="arrow" size={18} />
          </Link>
        </section>
      )}

      {(
        [
          { id: 'master', title: 'Master', note: 'Set up once, changed when something changes', cols: 'sm:grid-cols-2' },
          { id: 'exams', title: 'Exam steps', note: 'Each term, in this order', cols: 'sm:grid-cols-2 lg:grid-cols-3' },
        ] as const
      ).map((g) => {
        const list = ms.filter((m) => m.group === g.id)
        return (
          <section key={g.id} aria-labelledby={`${g.id}-heading`}>
            <div className="mb-2 flex items-baseline gap-3">
              <h2 id={`${g.id}-heading`} className="font-extrabold">
                {g.title}
              </h2>
              <p className="text-sm text-subtle">{g.note}</p>
            </div>
            <ol className={`grid gap-3 ${g.cols}`}>
              {list.map((m) => {
                const st = status[m.key]
                const pages = visiblePages(m, roles)
                const fact = st === 'later' ? '' : cardFact(m.key, s, t)
                const body = (
                  <>
                    <span className="flex items-center justify-between gap-2">
                      <span
                        className={`grid size-9 place-items-center rounded-xl ${st === 'next' ? 'bg-brand text-white' : st === 'done' ? 'bg-mist text-brand' : 'bg-canvas text-muted'}`}
                      >
                        <Icon name={m.icon} />
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CHIP[st].className}`}>
                        {st === 'done' && <Icon name="check" size={12} className="mr-0.5 inline" />}
                        {CHIP[st].text}
                      </span>
                    </span>
                    <span className="mt-3 block text-xs font-bold text-subtle">Step {m.n}</span>
                    <span className="block text-base font-extrabold leading-tight text-ink">{m.title}</span>
                    <span className="mt-1 block text-sm leading-snug text-muted">{m.blurb}</span>
                    {fact && <span className="mt-2 block text-xs font-semibold text-subtle">{fact}</span>}
                  </>
                )
                const box = `flex h-full flex-col rounded-2xl border bg-white p-4 text-left ${
                  st === 'next' ? 'border-brand ring-2 ring-brand/20' : 'border-line'
                }`
                return (
                  <li key={m.key}>
                    {st !== 'later' && pages.length > 0 ? (
                      <Link to={pages[0].to} className={`${box} transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md`}>
                        {body}
                      </Link>
                    ) : (
                      <div className={`${box} ${st === 'later' ? 'opacity-60' : ''}`} aria-disabled="true">
                        {body}
                      </div>
                    )}
                  </li>
                )
          })}
            </ol>
          </section>
        )
      })}

      <Dashboard orgId={orgId} orgName={current.name} canAct={isAdmin} canPrint={leads} />

      {teaches && !current.staffId && (
        <p className={`${card} text-sm text-muted`}>Your sign-in is not linked to a staff record yet. Ask your administrator to link it in {`${t('person.student', { count: 2 })} and staff`}.</p>
      )}
    </>,
  )
}

const CHIP = {
  done: { text: 'Done', className: 'bg-mist text-brand' },
  next: { text: 'Next', className: 'bg-brand text-white' },
  todo: { text: 'To do', className: 'bg-canvas text-muted' },
  later: { text: 'Coming soon', className: 'bg-canvas text-subtle' },
} as const

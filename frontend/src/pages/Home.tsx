import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getSetup, listStructure, type Level, type Section, type Subject } from '../api/client'
import { SignInPrompt } from '../components/Account'
import { useAuthState } from '../lib/auth-context'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'

type Assignment = { id: string; sectionId: string; subjectId?: string }

const card = 'rounded-xl border border-line bg-white p-5'

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <p className="text-2xl font-extrabold tabular-nums">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  )
}

/** Home: what to do next, by role. Administrators finish setup and see counts; teachers see their classes. */
export function Home() {
  const t = useT()
  const auth = useAuthState()
  const { current, orgs, loading, error, userId } = useOrg()
  const orgId = current?.id ?? ''
  const roles = current?.roles ?? []
  const isAdmin = roles.includes('admin')
  const teaches = roles.includes('teacher') || roles.includes('class_teacher')
  const setup = useQuery({ queryKey: ['setup', orgId], queryFn: ({ signal }) => getSetup(orgId, signal), enabled: !!orgId })
  const mine = useQuery({
    queryKey: ['structure', orgId, 'teaching-assignments', { staffId: current?.staffId }],
    queryFn: ({ signal }) => listStructure<Assignment>(orgId, 'teaching-assignments', { staffId: current!.staffId! }, signal),
    enabled: !!orgId && teaches && !!current?.staffId,
  })
  const sections = useQuery({ queryKey: ['structure', orgId, 'sections', {}], queryFn: ({ signal }) => listStructure<Section>(orgId, 'sections', {}, signal), enabled: !!orgId && teaches })
  const levels = useQuery({ queryKey: ['structure', orgId, 'levels', {}], queryFn: ({ signal }) => listStructure<Level>(orgId, 'levels', {}, signal), enabled: !!orgId && teaches })
  const subjects = useQuery({ queryKey: ['structure', orgId, 'subjects', {}], queryFn: ({ signal }) => listStructure<Subject>(orgId, 'subjects', {}, signal), enabled: !!orgId && teaches })

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
  const level = (id: string) => levels.data?.find((l) => l.id === id)?.name ?? ''
  const sectionName = (id: string) => {
    const sec = sections.data?.find((x) => x.id === id)
    return sec ? `${level(sec.levelId)} ${sec.name}`.trim() : ''
  }
  const subjectName = (id?: string) => (id ? (subjects.data?.find((x) => x.id === id)?.name ?? '') : t('person.class_teacher'))
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
        <section aria-labelledby="setup-heading" className={`${card} space-y-3 border-brand/40`}>
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

      {s && (isAdmin || roles.some((r) => r === 'principal' || r === 'coordinator')) && (
        <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile value={s.students} label={t('person.student', { count: s.students })} />
          <Tile value={s.staff} label="Staff" />
          <Tile value={s.sections} label={t('group.section', { count: s.sections })} />
          <Tile value={s.subjects} label={t('course.subject', { count: s.subjects })} />
        </section>
      )}

      {teaches && (
        <section aria-labelledby="classes-heading" className={`${card} space-y-3`}>
          <h2 id="classes-heading" className="font-extrabold">
            Your classes
          </h2>
          {!current.staffId ? (
            <p className="text-sm text-muted">Your sign-in is not linked to a staff record yet. Ask your administrator to link it in People.</p>
          ) : (mine.data ?? []).length === 0 ? (
            <p className="text-sm text-muted">Nothing is assigned to you yet. Your administrator assigns classes in Structure.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {mine.data!.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 py-2">
                  <span className="font-semibold">{sectionName(a.sectionId)}</span>
                  <span className="text-muted">{subjectName(a.subjectId)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-subtle">Marks entry for these classes arrives with the next release.</p>
        </section>
      )}

      {isAdmin && (
        <nav aria-label="Shortcuts" className="flex flex-wrap gap-2 text-sm">
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

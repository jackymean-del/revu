import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  completeSetup,
  createInvitation,
  createStructure,
  getSetup,
  getTerminology,
  listInvitations,
  listStructure,
  putTerminology,
  type Branch,
  type InvitationInput,
  type Level,
  type Year,
} from '../api/client'
import { ApiError } from '../api/problem'
import { useOrg } from '../lib/org-context'
import { defaultYear, levelRun, sectionNames, splitTerms, suggestedSubjects, type TermDraft } from '../lib/setup'
import { PRESETS, presets, type Preset } from '../lib/terminology/terminology'
import { useT } from '../lib/terminology/terms-context'

const input = 'w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none'
const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const quiet = 'rounded-lg px-3 py-2 text-sm font-semibold text-brand hover:bg-mist'

type StepId = 'words' | 'year' | 'levels' | 'subjects' | 'people' | 'done'
const ORDER: StepId[] = ['words', 'year', 'levels', 'subjects', 'people', 'done']

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

/** Runs async work, turning a failure into a message for the step. */
function useWork() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await work()
      return true
    } catch (e) {
      if (e instanceof ApiError) setError(e.fields?.[0] ? `${e.fields[0].field}: ${e.fields[0].message}` : e.message)
      else if (e instanceof Error && e.name === 'Error') setError(e.message + '.')
      else setError('Could not reach the server. Try again.')
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

/** Guided setup: words, the year and its terms, levels and sections, subjects, and inviting staff. */
export function Setup() {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { current } = useOrg()
  const orgId = current?.id ?? ''
  const isAdmin = !!current?.roles.includes('admin')
  const [step, setStep] = useState<StepId>('words')
  const heading = useRef<HTMLHeadingElement>(null)
  const status = useQuery({ queryKey: ['setup', orgId], queryFn: ({ signal }) => getSetup(orgId, signal), enabled: !!orgId })
  const work = useWork()

  useEffect(() => heading.current?.focus(), [step])

  if (!current) return <p className="mx-auto max-w-3xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })} first.</p>
  if (!isAdmin) return <p className="mx-auto max-w-3xl px-4 py-10 text-muted">Only an administrator can set up the {t('org.institution', { lower: true })}.</p>

  const next = async () => {
    await qc.invalidateQueries()
    setStep(ORDER[ORDER.indexOf(step) + 1])
  }
  const s = status.data
  const titles: Record<StepId, string> = {
    words: 'How you speak',
    year: `The ${t('period.year', { lower: true })} and its ${t('period.term', { count: 2, lower: true })}`,
    levels: `${t('group.level', { count: 2 })} and ${t('group.section', { count: 2, lower: true })}`,
    subjects: t('course.subject', { count: 2 }),
    people: 'Invite staff',
    done: 'All set',
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-subtle">Set up {current.name}</p>
      <ol className="mt-3 flex flex-wrap gap-2 text-xs" aria-label="Steps">
        {ORDER.map((id, i) => (
          <li key={id} aria-current={id === step ? 'step' : undefined} className={`rounded-full px-3 py-1 font-semibold ${id === step ? 'bg-brand text-white' : ORDER.indexOf(step) > i ? 'bg-mist text-brand' : 'bg-line text-muted'}`}>
            {i + 1}. {titles[id]}
          </li>
        ))}
      </ol>
      <h1 ref={heading} tabIndex={-1} className="mt-6 text-2xl font-extrabold tracking-tight outline-none">
        {titles[step]}
      </h1>
      <div className="mt-4">
        {step === 'words' && <WordsStep orgId={orgId} work={work} onDone={next} />}
        {step === 'year' && <YearStep orgId={orgId} existing={s?.years ?? 0} work={work} onDone={next} />}
        {step === 'levels' && <LevelsStep orgId={orgId} orgName={current.name} existing={s?.levels ?? 0} work={work} onDone={next} />}
        {step === 'subjects' && <SubjectsStep orgId={orgId} preset={current.preset} existing={s?.subjects ?? 0} work={work} onDone={next} />}
        {step === 'people' && <PeopleStep orgId={orgId} work={work} onDone={next} />}
        {step === 'done' && (
          <div className="space-y-4">
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              <li>{s?.years ?? 0} {t('period.year', { count: s?.years ?? 0, lower: true })}, {s?.periods ?? 0} {t('period.term', { count: s?.periods ?? 0, lower: true })}</li>
              <li>{s?.levels ?? 0} {t('group.level', { count: s?.levels ?? 0, lower: true })}, {s?.sections ?? 0} {t('group.section', { count: s?.sections ?? 0, lower: true })}</li>
              <li>{s?.subjects ?? 0} {t('course.subject', { count: s?.subjects ?? 0, lower: true })}</li>
              <li>{s?.invitations ?? 0} open invitations</li>
            </ul>
            <p className="text-sm text-muted">Everything here can be changed later in Structure, People and Words.</p>
            <button
              type="button"
              className={primary}
              disabled={work.busy}
              onClick={() =>
                void work
                  .run(async () => {
                    await completeSetup(orgId)
                    await qc.invalidateQueries()
                  })
                  .then((ok) => {
                    if (ok) void navigate({ to: '/' })
                  })
              }
            >
              Finish and go to Home
            </button>
          </div>
        )}
      </div>
      {work.error && <p role="alert" className="mt-4 text-sm font-semibold text-red-700">{work.error}</p>}
    </div>
  )
}

type StepProps = { orgId: string; work: ReturnType<typeof useWork>; onDone: () => void }

function Actions({ busy, label, onSkip }: { busy: boolean; label: string; onSkip?: () => void }) {
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      <button type="submit" className={primary} disabled={busy}>
        {busy ? 'Saving' : label}
      </button>
      {onSkip && (
        <button type="button" className={quiet} onClick={onSkip}>
          Skip this step
        </button>
      )}
    </div>
  )
}

function WordsStep({ orgId, work, onDone }: StepProps) {
  const words = useQuery({ queryKey: ['terminology', orgId], queryFn: ({ signal }) => getTerminology(orgId, signal) })
  const [pick, setPick] = useState<Preset | ''>('')
  const chosen = (pick || words.data?.preset || 'school') as Preset
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void work.run(() => putTerminology(orgId, { preset: chosen, overrides: words.data?.overrides ?? [] }).then(() => undefined)).then((ok) => ok && onDone())
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted">Pick the set of words closest to how you speak. You can rename any word later in Words.</p>
      <fieldset>
        <legend className="sr-only">Starting set</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <label key={p} className={`cursor-pointer rounded-xl border bg-white p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${chosen === p ? 'border-brand ring-1 ring-brand' : 'border-line'}`}>
              <input type="radio" name="preset" value={p} checked={chosen === p} onChange={() => setPick(p)} className="sr-only" />
              <span className="block font-extrabold">{presets[p]['org.institution'].one}</span>
              <span className="mt-1 block text-sm text-muted">
                {presets[p]['group.level'].one}, {presets[p]['group.section'].one}, {presets[p]['period.term'].one}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Actions busy={work.busy} label="Continue" />
    </form>
  )
}

function YearStep({ orgId, existing, work, onDone }: StepProps & { existing: number }) {
  const t = useT()
  const [year, setYear] = useState(() => defaultYear(new Date()))
  const [count, setCount] = useState(2)
  const [terms, setTerms] = useState<TermDraft[]>(() => splitTerms(year.startsOn, year.endsOn, 2, t('period.term')))
  const resplit = (y = year, n = count) => setTerms(splitTerms(y.startsOn, y.endsOn, n, t('period.term')))
  const setTerm = (i: number, k: keyof TermDraft, v: string) => setTerms((ts) => ts.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void work
      .run(async () => {
        const made = (await createStructure(orgId, 'years', year)) as Year
        for (const [i, term] of terms.entries()) await createStructure(orgId, 'periods', { yearId: made.id, seq: i + 1, ...term })
      })
      .then((ok) => ok && onDone())
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {existing > 0 && (
        <p className="rounded-lg bg-mist px-3 py-2 text-sm">
          You already have {existing} {t('period.year', { count: existing, lower: true })}. Skip this step, or add another.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name">
          <input className={input} value={year.label} onChange={(e) => setYear({ ...year, label: e.target.value })} required />
        </Field>
        <Field label="Starts">
          <input type="date" className={input} value={year.startsOn} onChange={(e) => (setYear({ ...year, startsOn: e.target.value }), resplit({ ...year, startsOn: e.target.value }))} required />
        </Field>
        <Field label="Ends">
          <input type="date" className={input} value={year.endsOn} onChange={(e) => (setYear({ ...year, endsOn: e.target.value }), resplit({ ...year, endsOn: e.target.value }))} required />
        </Field>
      </div>
      <Field label={`How many ${t('period.term', { count: 2, lower: true })}`}>
        <select className={`${input} max-w-32`} value={count} onChange={(e) => (setCount(Number(e.target.value)), resplit(year, Number(e.target.value)))}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <div className="space-y-2">
        {terms.map((term, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-3">
            <input aria-label={`${t('period.term')} ${i + 1} name`} className={input} value={term.name} onChange={(e) => setTerm(i, 'name', e.target.value)} required />
            <input aria-label={`${t('period.term')} ${i + 1} starts`} type="date" className={input} value={term.startsOn} onChange={(e) => setTerm(i, 'startsOn', e.target.value)} required />
            <input aria-label={`${t('period.term')} ${i + 1} ends`} type="date" className={input} value={term.endsOn} onChange={(e) => setTerm(i, 'endsOn', e.target.value)} required />
          </div>
        ))}
      </div>
      <Actions busy={work.busy} label={`Add the ${t('period.year', { lower: true })}`} onSkip={existing > 0 ? onDone : undefined} />
    </form>
  )
}

function LevelsStep({ orgId, orgName, existing, work, onDone }: StepProps & { orgName: string; existing: number }) {
  const t = useT()
  const [prefix, setPrefix] = useState(t('group.level'))
  const [from, setFrom] = useState('1')
  const [to, setTo] = useState('12')
  const [sections, setSections] = useState('A, B')
  const run = levelRun(prefix, Number(from), Number(to))
  const names = sectionNames(sections)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void work
      .run(async () => {
        const years = await listStructure<Year>(orgId, 'years', {})
        if (!years[0]) throw new Error(`Add ${t('period.year', { lower: true })} first`)
        let branches = await listStructure<Branch>(orgId, 'branches', {})
        if (!branches[0]) branches = [(await createStructure(orgId, 'branches', { name: orgName })) as Branch]
        for (const l of run) {
          const level = (await createStructure(orgId, 'levels', l)) as Level
          for (const name of names) await createStructure(orgId, 'sections', { levelId: level.id, yearId: years[0].id, branchId: branches[0].id, name })
        }
      })
      .then((ok) => ok && onDone())
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {existing > 0 && (
        <p className="rounded-lg bg-mist px-3 py-2 text-sm">
          You already have {existing} {t('group.level', { count: existing, lower: true })}. Skip this step, or add more.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Called">
          <input className={input} value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </Field>
        <Field label="From">
          <input className={input} inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input className={input} inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <Field label={`${t('group.section', { count: 2 })} in each`} hint="Separate them with commas, for example A, B, C.">
        <input className={input} value={sections} onChange={(e) => setSections(e.target.value)} />
      </Field>
      <p className="text-sm text-muted" aria-live="polite">
        {run.length ? `${run[0].name} to ${run[run.length - 1].name}` : `Choose a run of ${t('group.level', { count: 2, lower: true })}`}
        {run.length > 0 && names.length > 0 && `, each with ${names.join(', ')}: ${run.length * names.length} ${t('group.section', { count: run.length * names.length, lower: true })} in the newest ${t('period.year', { lower: true })}.`}
      </p>
      <Actions busy={work.busy} label={`Add ${t('group.level', { count: 2, lower: true })} and ${t('group.section', { count: 2, lower: true })}`} onSkip={existing > 0 ? onDone : undefined} />
    </form>
  )
}

function SubjectsStep({ orgId, preset, existing, work, onDone }: StepProps & { preset: string; existing: number }) {
  const t = useT()
  const options = suggestedSubjects[preset] ?? suggestedSubjects.school
  const [picked, setPicked] = useState<string[]>(options.slice(0, 5))
  const [extra, setExtra] = useState('')
  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const all = [...picked, ...sectionNames(extra)]
    void work
      .run(async () => {
        const levels = await listStructure<Level>(orgId, 'levels', {})
        for (const name of all) {
          const subject = (await createStructure(orgId, 'subjects', { name, kind: 'academic' })) as { id: string }
          for (const l of levels) await createStructure(orgId, 'level-subjects', { levelId: l.id, subjectId: subject.id, optional: false })
        }
      })
      .then((ok) => ok && onDone())
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted">
        Each one you choose is taught in every {t('group.level', { lower: true })}. Change that later in Structure.
        {existing > 0 && ` You already have ${existing}.`}
      </p>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Common choices</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={picked.includes(s)} onChange={() => toggle(s)} className="size-4 accent-brand" />
              {s}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Others" hint="Separate them with commas.">
        <input className={input} value={extra} onChange={(e) => setExtra(e.target.value)} />
      </Field>
      <Actions busy={work.busy} label={`Add ${t('course.subject', { count: 2, lower: true })}`} onSkip={onDone} />
    </form>
  )
}

function PeopleStep({ orgId, work, onDone }: StepProps) {
  const t = useT()
  const invited = useQuery({ queryKey: ['invitations', orgId], queryFn: ({ signal }) => listInvitations(orgId, signal) })
  const [rows, setRows] = useState([{ email: '', role: 'teacher' }])
  const roles = [
    { value: 'teacher', label: t('person.teacher') },
    { value: 'class_teacher', label: t('person.class_teacher') },
    { value: 'coordinator', label: 'Coordinator' },
    { value: 'principal', label: t('person.principal') },
    { value: 'admin', label: 'Administrator' },
    { value: 'viewer', label: 'View only' },
  ]
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const filled = rows.filter((r) => r.email.trim())
    void work
      .run(async () => {
        for (const r of filled) await createInvitation(orgId, { email: r.email, role: r.role as InvitationInput['role'] })
      })
      .then((ok) => ok && onDone())
  }
  const pending = (invited.data ?? []).filter((i) => i.status === 'pending')
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted">
        Each person gets an email link. When they sign in with that address they get the role you chose. Nobody is sent a password.
      </p>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_12rem]">
          <input aria-label={`Email ${i + 1}`} type="email" className={input} placeholder="name@example.com" value={r.email} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
          <select aria-label={`Role ${i + 1}`} className={input} value={r.role} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}>
            {roles.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      <button type="button" className={quiet} onClick={() => setRows((rs) => [...rs, { email: '', role: 'teacher' }])}>
        Add another person
      </button>
      {pending.length > 0 && <p className="text-sm text-muted">Already invited: {pending.map((i) => i.email).join(', ')}</p>}
      <Actions busy={work.busy} label="Send invitations" onSkip={onDone} />
    </form>
  )
}

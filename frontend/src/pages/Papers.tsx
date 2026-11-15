import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Loading } from '../components/Loading'
import { useQuery } from '@tanstack/react-query'
import { getBlueprint, getSyllabus, listPapers, listQuestions } from '../api/client'
import { Icon } from '../components/Icon'
import { needs } from '../lib/papers'
import type { Taxonomy } from '../lib/taxonomy'
import { useT } from '../lib/terminology/terms-context'
import { AssessmentSelect } from './papers/AssessmentSelect'
import { usePaperAssessments } from './papers/assessments'
import { BlueprintEditor } from './papers/BlueprintEditor'
import { PaperSets } from './papers/PaperSets'

export type PaperTab = 'blueprint' | 'sets'

const STATUS: Record<string, string> = { draft: 'Draft', submitted: 'Waiting for approval', approved: 'Approved', returned: 'Returned for changes' }

/**
 * Create question paper (exam step 1): for one assessment, the blueprint
 * (marks by chapter, question type and Bloom level), then the paper in
 * sets, where its questions are typed, picked from the bank or drafted
 * with AI, slot by slot. One step at a time, the next one named.
 */
export function Papers() {
  const t = useT()
  const search = useSearch({ from: '/papers' })
  const navigate = useNavigate({ from: '/papers' })
  const { orgId, loading, pending, choices, approves } = usePaperAssessments()
  const choice = choices.find((c) => c.a.id === search.a) ?? choices[0]
  const a = choice?.a
  const id = a?.id ?? ''
  // Old links to the question bank open the paper, where the bank now lives.
  const tab: PaperTab = !search.tab ? 'blueprint' : search.tab === 'blueprint' ? 'blueprint' : 'sets'
  const place = { levelId: a?.levelId ?? '', subjectId: a?.subjectId ?? '' }

  const blueprint = useQuery({ queryKey: ['blueprint', orgId, id], queryFn: ({ signal }) => getBlueprint(orgId, id, signal), enabled: !!(orgId && id) })
  const syllabus = useQuery({ queryKey: ['syllabus', orgId, place], queryFn: ({ signal }) => getSyllabus(orgId, place, signal), enabled: !!(orgId && place.levelId) })
  const bank = useQuery({ queryKey: ['questions', orgId, place], queryFn: ({ signal }) => listQuestions(orgId, place, signal), enabled: !!(orgId && place.levelId) })
  const papers = useQuery({ queryKey: ['papers', orgId, id], queryFn: ({ signal }) => listPapers(orgId, id, signal), enabled: !!(orgId && id) })

  if (loading) return <Loading page />
  if (!orgId) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })}.</p>

  const bp = blueprint.data
  const short = bp && bank.data ? needs(bp.rows, bank.data, bp.taxonomy as Taxonomy).reduce((n, x) => n + Math.max(0, x.count - x.have), 0) : 0
  const sets = papers.data ?? []
  const next = !bp
    ? null
    : sets.length > 0
      ? sets.some((x) => x.status === 'final')
        ? null
        : { tab: 'sets' as const, text: `Add or choose the questions, then finalise ${sets[0].set}` }
      : bp.status !== 'approved'
      ? { tab: 'blueprint' as const, text: bp.status === 'submitted' ? (approves ? 'Approve the blueprint, or return it with a comment' : 'The blueprint is waiting for approval') : 'Plan the marks, then submit the blueprint' }
      : sets.length === 0
        ? { tab: 'sets' as const, text: short > 0 ? `Make the first set: ${short} ${short === 1 ? 'question' : 'questions'} to write, pick or draft with AI` : 'Make the first set from the bank' }
          : sets.some((s) => s.status === 'final')
            ? null
            : { tab: 'sets' as const, text: `Fill every slot and finalise ${sets[0].set}` }
  const open = (to: PaperTab) => void navigate({ search: { a: id, tab: to } })
  const steps: { key: PaperTab; label: string; fact: string }[] = [
    { key: 'blueprint', label: 'Blueprint', fact: bp ? (bp.exists ? STATUS[bp.status] : 'Not started') : '' },
    { key: 'sets', label: 'Paper', fact: sets.length ? sets.map((s) => `${s.set} ${s.status}`).join(', ') : 'None yet' },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:space-y-5 sm:px-6 sm:py-8">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Create question paper</h1>
        <p className="mt-1 hidden max-w-3xl text-muted sm:block">
          Build the paper freely, or plan the marks in a blueprint first and lay the paper out from it. Every question can carry its lesson, learning outcome and Bloom level, so
          marks entered for it feed the holistic report.
        </p>
      </div>

      {pending ? (
        <Loading />
      ) : !a ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center">
          <p className="font-bold">No assessments to make a paper for</p>
          <p className="mt-1 text-sm text-muted">An administrator creates each exam in Master, step 3. Then its paper is made here.</p>
        </div>
      ) : (
        <>
          <AssessmentSelect choices={choices} value={id} onChange={(id) => void navigate({ search: { a: id, tab } })} />

          <nav aria-label="Paper steps" className="grid grid-cols-2 gap-2">
            {steps.map((s, i) => (
              <button
                key={s.key}
                type="button"
                aria-current={tab === s.key ? 'step' : undefined}
                onClick={() => open(s.key)}
                className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center sm:flex-row sm:items-start sm:gap-3 sm:p-3 sm:text-left ${tab === s.key ? 'border-brand bg-mist' : 'border-line bg-white hover:bg-canvas'}`}
              >
                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold ${tab === s.key ? 'bg-brand text-white' : 'bg-canvas text-muted'}`}>{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold sm:text-base">{s.label}</span>
                  <span className="hidden truncate text-xs text-muted sm:block">{s.fact}</span>
                </span>
              </button>
            ))}
          </nav>

          {next && next.tab !== tab && (
            <button type="button" onClick={() => open(next.tab)} className="flex w-full items-center gap-2 rounded-xl border border-brand/30 bg-mist px-4 py-2.5 text-left text-sm font-semibold text-brand">
              <span className="flex-1">Next: {next.text}</span>
              <Icon name="arrow" size={16} />
            </button>
          )}
          {sets.some((s) => s.status === 'final') && (
            <Link to="/assign" search={{ a: id }} className="flex w-full items-center gap-2 rounded-xl border border-brand/30 bg-mist px-4 py-2.5 text-sm font-semibold text-brand">
              <span className="flex-1">Next: give each set to who sits it</span>
              <Icon name="arrow" size={16} />
            </Link>
          )}

          {!bp || !syllabus.data || !bank.data ? (
            <Loading />
          ) : tab === 'blueprint' ? (
            <BlueprintEditor key={`${id}-${bp.version}-${bp.status}`} orgId={orgId} assessmentId={id} blueprint={bp} syllabus={syllabus.data} approves={approves} />
          ) : (
            <PaperSets orgId={orgId} assessmentId={id} blueprint={bp} sets={sets} bank={bank.data} syllabus={syllabus.data} place={place} />
          )}
        </>
      )}
    </div>
  )
}

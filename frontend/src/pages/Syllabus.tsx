import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSyllabus, getSyllabusSummary, importSyllabus, listStructure, updateLearningOutcome, type Subject, type SyllabusImportReport } from '../api/client'
import { ApiError } from '../api/problem'
import { BLOOMS, bloomCounts, importSummary, type Bloom } from '../lib/syllabus'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'
import { useSectionNames } from './people/sections'

const select = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
// The heading rows the import reads, exactly as other systems export them.
const SHAPES = ['competency, description, subject', 'learning_outcome, competency, lesson_name', 'Grade, Subject, Lesson No, Lesson Name, OutcomeID, Learning Outcome']
const SHADE = ['bg-brand/25', 'bg-brand/40', 'bg-brand/55', 'bg-brand/70', 'bg-brand/85', 'bg-brand']

/**
 * Configuration > Syllabus (P0.11 H1): each class and subject's lessons,
 * competencies and learning outcomes with their Bloom levels, and the
 * import that brings them in from the files schools already have.
 */
export function Syllabus() {
  const t = useT()
  const qc = useQueryClient()
  const { current, loading } = useOrg()
  const orgId = current?.id ?? ''
  const admin = !!current?.roles.includes('admin')
  const names = useSectionNames(orgId)
  const subjects = useQuery({ queryKey: ['structure', orgId, 'subjects', {}], queryFn: ({ signal }) => listStructure<Subject>(orgId, 'subjects', {}, signal), enabled: !!orgId }).data ?? []
  const places = useQuery({ queryKey: ['syllabus-summary', orgId], queryFn: ({ signal }) => getSyllabusSummary(orgId, signal), enabled: !!orgId })
  const [pick, setPick] = useState({ levelId: '', subjectId: '' })
  const [importing, setImporting] = useState(false)

  const levels = names.levels
  const levelId = pick.levelId || levels[0]?.id || ''
  const inLevel = (places.data ?? []).filter((p) => p.levelId === levelId)
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? ''
  const levelSubjects = inLevel.map((p) => ({ ...p, name: subjectName(p.subjectId) })).sort((a, b) => a.name.localeCompare(b.name))
  const subjectId = levelSubjects.some((s) => s.subjectId === pick.subjectId) ? pick.subjectId : (levelSubjects[0]?.subjectId ?? '')
  const q = { levelId, subjectId }
  const syllabus = useQuery({ queryKey: ['syllabus', orgId, q], queryFn: ({ signal }) => getSyllabus(orgId, q, signal), enabled: !!(orgId && levelId && subjectId) })

  const change = useMutation({
    mutationFn: (v: { id: string; bloom?: Bloom; competencyId?: string }) => updateLearningOutcome(orgId, v.id, { bloom: v.bloom, competencyId: v.competencyId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['syllabus', orgId, q] }),
  })

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!orgId) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })}.</p>

  const s = syllabus.data
  const counts = s ? bloomCounts(s) : null
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0
  const compName = (id?: string) => s?.competencies.find((c) => c.id === id)?.name ?? ''

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Syllabus</h1>
          <p className="mt-1 max-w-3xl text-muted">
            For each {t('group.level', { lower: true })} and {t('course.subject', { lower: true })}: its lessons, competencies and learning outcomes. Each outcome carries a Bloom level,
            suggested from its first verb; change any you disagree with. Tag paper parts with these, and the holistic report works out the rest from marks.
          </p>
        </div>
        {admin && !importing && (
          <button type="button" className={primary} onClick={() => setImporting(true)}>
            Import a file
          </button>
        )}
      </div>

      {importing && (
        <ImportPanel
          orgId={orgId}
          levels={levels}
          subjects={subjects}
          levelId={levelId}
          subjectId={subjectId}
          onClose={() => setImporting(false)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ['syllabus-summary', orgId] })
            void qc.invalidateQueries({ queryKey: ['syllabus', orgId] })
            void qc.invalidateQueries({ queryKey: ['structure', orgId, 'subjects'] })
          }}
        />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('group.level')}
          <select aria-label={t('group.level')} className={select} value={levelId} onChange={(e) => setPick({ levelId: e.target.value, subjectId: '' })}>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <div role="group" aria-label={t('course.subject', { count: 2 })} className="flex flex-wrap gap-1.5">
          {levelSubjects.map((p) => (
            <button
              key={p.subjectId}
              type="button"
              aria-pressed={p.subjectId === subjectId}
              onClick={() => setPick({ levelId, subjectId: p.subjectId })}
              className={`rounded-lg border px-3 py-1.5 text-left text-sm ${p.subjectId === subjectId ? 'border-brand bg-mist font-bold text-brand' : 'border-line bg-white hover:bg-canvas'}`}
            >
              {p.name}
              <span className={`ml-2 text-xs ${p.outcomes ? 'text-muted' : 'text-amber-700'}`}>{p.outcomes ? `${p.outcomes} outcomes` : 'nothing yet'}</span>
            </button>
          ))}
        </div>
      </div>

      {change.isError && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {change.error instanceof ApiError ? change.error.message : 'That change did not save. Try again.'}
        </p>
      )}

      {!subjectId ? (
        <p className="text-sm text-muted">This {t('group.level', { lower: true })} has no {t('course.subject', { count: 2, lower: true })} yet. Add them in Configuration.</p>
      ) : syllabus.isPending ? (
        <p className="text-sm text-muted">Loading</p>
      ) : syllabus.isError ? (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {syllabus.error instanceof ApiError ? syllabus.error.message : 'The syllabus could not be loaded.'}
        </p>
      ) : (
        <div className="space-y-4">
          {total > 0 && counts && (
            <section aria-label="Bloom levels" className="rounded-2xl border border-line bg-white p-4">
              <h2 className="text-sm font-bold">Thinking skills these outcomes ask for</h2>
              <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-canvas" aria-hidden="true">
                {BLOOMS.map((b, i) => (
                  <div key={b.key} className={SHADE[i]} style={{ width: `${(counts[b.key] / total) * 100}%` }} />
                ))}
              </div>
              <ul className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1 text-xs sm:grid-cols-6">
                {BLOOMS.map((b, i) => (
                  <li key={b.key} title={b.hint} className="flex items-center gap-1.5">
                    <span className={`inline-block size-2.5 rounded-sm ${SHADE[i]}`} />
                    {b.label} <b className="tabular-nums">{counts[b.key]}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="Competencies">
            <h2 className="mb-2 text-sm font-bold">
              Competencies{' '}
              <span className="font-normal text-muted">
                {s!.kind === 'co_curricular' ? `rated by the ${t('person.teacher', { lower: true })} each ${t('period.term', { lower: true })}` : 'worked out from marks on tagged parts'}
              </span>
            </h2>
            {s!.competencies.length === 0 ? (
              <p className="text-sm text-muted">None yet. Import a competency file, or they are made as outcome files name them.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {s!.competencies.map((c) => (
                  <li key={c.id} title={c.description} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm">
                    {c.name} <span className="text-xs text-muted">{c.outcomes}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Lessons">
            <h2 className="mb-2 text-sm font-bold">Lessons and learning outcomes</h2>
            {s!.lessons.length === 0 && s!.unplaced.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-white p-6 text-center">
                <p className="font-bold">No learning outcomes yet</p>
                <p className="mt-1 text-sm text-muted">Import the outcomes file for this {t('group.level', { lower: true })} and {t('course.subject', { lower: true })}.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...s!.lessons, ...(s!.unplaced.length ? [{ id: 'none', seq: 0, name: 'Not in a lesson', outcomes: s!.unplaced }] : [])].map((l) => (
                  <details key={l.id} className="rounded-xl border border-line bg-white">
                    <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm">
                      {l.seq > 0 && <span className="w-6 tabular-nums text-muted">{l.seq}</span>}
                      <span className="flex-1 font-semibold">{l.name}</span>
                      <span className="text-xs text-muted">{l.outcomes.length} outcomes</span>
                    </summary>
                    <ul className="divide-y divide-line border-t border-line">
                      {l.outcomes.map((o) => (
                        <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                          <span className="min-w-0 flex-1 basis-80">
                            {o.text}
                            {o.note && <span className="ml-2 rounded bg-amber-50 px-1.5 text-xs text-amber-900" title={o.note}>note</span>}
                          </span>
                          {admin ? (
                            <>
                              <select
                                aria-label={`Competency of: ${o.text}`}
                                className={`${select} max-w-56`}
                                value={o.competencyId ?? ''}
                                onChange={(e) => change.mutate({ id: o.id, competencyId: e.target.value })}
                              >
                                <option value="">No competency</option>
                                {s!.competencies.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                              <select
                                aria-label={`Bloom level of: ${o.text}`}
                                className={select}
                                value={o.bloom}
                                onChange={(e) => change.mutate({ id: o.id, bloom: e.target.value as Bloom })}
                              >
                                {BLOOMS.map((b) => (
                                  <option key={b.key} value={b.key}>
                                    {b.label}
                                    {o.bloomBy === 'suggested' && o.bloom === b.key ? ' (suggested)' : ''}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : (
                            <span className="text-xs text-muted">
                              {compName(o.competencyId)} · {BLOOMS.find((b) => b.key === o.bloom)?.label}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

/** The import: choose a file, preview what it holds, then save it. */
function ImportPanel({ orgId, levels, subjects, levelId, subjectId, onClose, onSaved }: {
  orgId: string
  levels: { id: string; name: string }[]
  subjects: Subject[]
  levelId: string
  subjectId: string
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const [file, setFile] = useState<File | null>(null)
  const [place, setPlace] = useState({ levelId, subjectId })
  const [create, setCreate] = useState(false)
  const [report, setReport] = useState<SyllabusImportReport | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(apply: boolean) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const r = await importSyllabus(orgId, file, { ...place, apply, createSubjects: create })
      setReport(r)
      if (apply) onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Not read. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Import" className="space-y-3 rounded-2xl border border-brand/30 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">Import competencies or learning outcomes</h2>
          <p className="text-sm text-muted">
            A .csv or .xlsx with one of these heading rows: <code className="text-xs">{SHAPES[0]}</code>; <code className="text-xs">{SHAPES[1]}</code> (for the{' '}
            {t('group.level', { lower: true })} and {t('course.subject', { lower: true })} chosen here); or <code className="text-xs">{SHAPES[2]}</code>. Nothing is saved until you press Save.
          </p>
        </div>
        <button type="button" className={button} onClick={onClose}>
          Close
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          File
          <input type="file" accept=".csv,.xlsx" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setReport(null))} className="text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('group.level')} (outcome files)
          <select className={select} value={place.levelId} onChange={(e) => (setPlace({ ...place, levelId: e.target.value }), setReport(null))}>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('course.subject')} (outcome files)
          <select className={select} value={place.subjectId} onChange={(e) => (setPlace({ ...place, subjectId: e.target.value }), setReport(null))}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={create} onChange={(e) => (setCreate(e.target.checked), setReport(null))} />
          Create {t('course.subject', { count: 2, lower: true })} that are not here yet
        </label>
        <button type="button" className={button} disabled={!file || busy} onClick={() => void run(false)}>
          {busy && !report ? 'Reading' : 'Preview'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      {report && (
        <div role="status" className="space-y-2 rounded-xl bg-canvas p-3 text-sm">
          <p className="font-semibold">{importSummary(report)}</p>
          {report.unknownSubjects.length > 0 && (
            <p>
              Not here: {report.unknownSubjects.join(', ')}. {create ? 'They will be created.' : `Tick the box to create them, or their rows are left out.`}
            </p>
          )}
          {report.unknownLevels.length > 0 && <p>No such {t('group.level', { lower: true })}: {report.unknownLevels.join(', ')}. Those rows are left out.</p>}
          {report.noCompetency > 0 && <p>{report.noCompetency} outcomes name no competency; choose one for them after saving.</p>}
          {report.problems.length > 0 && (
            <details>
              <summary className="cursor-pointer">{report.problems.length} rows could not be read</summary>
              <ul className="mt-1 list-disc pl-5 text-muted">
                {report.problems.map((p) => (
                  <li key={p.row}>
                    Row {p.row}: {p.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!report.applied ? (
            <button type="button" className={primary} disabled={busy} onClick={() => void run(true)}>
              {busy ? 'Saving' : 'Save'}
            </button>
          ) : (
            <p className="font-semibold text-brand">Saved.</p>
          )}
        </div>
      )}
    </section>
  )
}

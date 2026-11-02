import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  assignSubjectChoices,
  copySubjectChoices,
  endSubjectChoice,
  getChoiceCompleteness,
  importSubjectChoices,
  listStructure,
  listStudents,
  listSubjectChoices,
  type ChoiceImportReport,
  type Subject,
  type SubjectChoice,
  type TeachingAssignment,
} from '../api/client'
import { ApiError } from '../api/problem'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'
import { useSectionNames } from './people/sections'

const input = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const primary = 'rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const message = (e: unknown) => (e instanceof ApiError ? (e.fields?.[0]?.message ?? e.message) : 'Something went wrong. Try again.')

/**
 * Subject choices (Part 74.1): for one section, which option of each subject
 * group every student takes. A change takes a date and keeps the earlier
 * choice in history; anyone below a group's minimum is listed, never guessed.
 */
export function Choices() {
  const t = useT()
  const qc = useQueryClient()
  const { current, loading } = useOrg()
  const orgId = current?.id ?? ''
  const roles = current?.roles ?? []
  const leads = roles.some((r) => r === 'admin' || r === 'coordinator')
  const names = useSectionNames(orgId)
  const mine = useQuery({
    queryKey: ['structure', orgId, 'teaching-assignments', { staffId: current?.staffId }],
    queryFn: ({ signal }) => listStructure<TeachingAssignment>(orgId, 'teaching-assignments', { staffId: current!.staffId! }, signal),
    enabled: !!orgId && !leads && !!current?.staffId,
  }).data
  const subjects = useQuery({ queryKey: ['structure', orgId, 'subjects', {}], queryFn: ({ signal }) => listStructure<Subject>(orgId, 'subjects', {}, signal), enabled: !!orgId }).data ?? []

  // Leaders choose any section; a class teacher their own.
  const latestYear = [...names.years].sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0]?.id
  const sections = names.sections.filter((s) => (leads ? s.yearId === latestYear : mine?.some((a) => a.sectionId === s.id && !a.subjectId)))
  const [picked, setPicked] = useState('')
  const sectionId = sections.some((s) => s.id === picked) ? picked : (sections[0]?.id ?? '')
  const [from, setFrom] = useState(today())
  const [selected, setSelected] = useState<string[]>([])
  const [bulk, setBulk] = useState({ group: '', subject: '' })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)

  const check = useQuery({ queryKey: ['choices', orgId, sectionId, 'check'], queryFn: ({ signal }) => getChoiceCompleteness(orgId, sectionId, '', signal), enabled: !!sectionId })
  const choices = useQuery({ queryKey: ['choices', orgId, sectionId, 'list'], queryFn: ({ signal }) => listSubjectChoices(orgId, sectionId, '', signal), enabled: !!sectionId })
  const students = useQuery({
    queryKey: ['students', orgId, { sectionId, limit: '200' }],
    queryFn: ({ signal }) => listStudents(orgId, { sectionId, limit: '200' }, signal),
    enabled: !!sectionId,
  })

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!orgId) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })}.</p>

  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? ''
  const groups = check.data?.groups ?? []
  const people = students.data?.items ?? []
  const of = (studentId: string, groupId: string) => (choices.data ?? []).filter((c) => c.studentId === studentId && c.groupId === groupId)
  const refresh = () => qc.invalidateQueries({ queryKey: ['choices', orgId, sectionId] })

  async function run(work: () => Promise<string>) {
    setBusy(true)
    setNote(null)
    try {
      setNote({ text: await work() })
    } catch (e) {
      setNote({ text: message(e), error: true })
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  // A change takes the date; a first choice applies from the start of the year.
  const give = (groupId: string, subjectId: string, studentIds: string[], isChange: boolean) =>
    assignSubjectChoices(orgId, { groupId, subjectId, studentIds, ...(isChange ? { effectiveFrom: from } : {}) })

  const summary = (r: { assigned: number; changed: number; unchanged: number; skipped: number }) =>
    [r.assigned && `${r.assigned} chosen`, r.changed && `${r.changed} changed`, r.unchanged && `${r.unchanged} already so`, r.skipped && `${r.skipped} left as they were`]
      .filter(Boolean)
      .join(', ') || 'Nothing to change.'

  function setOne(studentId: string, groupId: string, subjectId: string) {
    const now = of(studentId, groupId)
    if (!subjectId) return run(async () => (await Promise.all(now.map((c) => endSubjectChoice(orgId, c.id, from))), 'Choice ended.'))
    return run(async () => summary(await give(groupId, subjectId, [studentId], now.length > 0)))
  }

  function toggle(studentId: string, groupId: string, subjectId: string, held?: SubjectChoice) {
    if (held) return run(async () => (await endSubjectChoice(orgId, held.id, from), 'Choice ended.'))
    return run(async () => summary(await give(groupId, subjectId, [studentId], false)))
  }

  const bulkGroup = groups.find((g) => g.groupId === bulk.group)
  const missingCount = groups.reduce((n, g) => n + g.missing.length, 0)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{t('course.subject')} choices</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Which option of each {t('course.subject', { lower: true })} group every {t('person.student', { lower: true })} takes. A change applies from the date you set and keeps the earlier choice in
          history.
        </p>
      </div>

      {sections.length === 0 ? (
        <p className="text-sm text-muted">
          {leads ? `Add ${t('group.section', { count: 2, lower: true })} for the current ${t('period.year', { lower: true })} first.` : `You are not ${t('person.class_teacher', { lower: true })} of any ${t('group.section', { lower: true })}.`}
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {t('group.section')}
            <select className={input} value={sectionId} onChange={(e) => (setPicked(e.target.value), setSelected([]))}>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {names.name(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Changes apply from
            <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <button type="button" className={button} disabled={busy || !sectionId} onClick={() => run(async () => summary(await copySubjectChoices(orgId, sectionId)))}>
            Copy choices from the previous {t('period.year', { lower: true })}
          </button>
        </div>
      )}

      {note && (
        <p role={note.error ? 'alert' : 'status'} className={`text-sm font-semibold ${note.error ? 'text-red-700' : 'text-brand-700'}`}>
          {note.text}
        </p>
      )}

      {check.data && groups.length === 0 && (
        <p className="text-sm text-muted">
          This {t('group.level', { lower: true })} has no {t('course.subject', { lower: true })} groups, so everyone takes every {t('course.subject', { lower: true })}. Add groups in Structure.
        </p>
      )}

      {missingCount > 0 && (
        <section aria-labelledby="missing-heading" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <h2 id="missing-heading" className="font-extrabold text-amber-900">
            Choices missing
          </h2>
          <p className="mt-1 text-amber-900">Until these are chosen, the group's result for each is held back with the reason choice missing.</p>
          <ul className="mt-2 space-y-1">
            {groups
              .filter((g) => g.missing.length > 0)
              .map((g) => (
                <li key={g.groupId}>
                  <b>{g.name}:</b> {g.missing.map((m) => m.name).join(', ')}
                </li>
              ))}
          </ul>
        </section>
      )}

      {groups.length > 0 && people.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-3 text-sm">
            <span className="font-semibold">{selected.length} selected:</span>
            <select aria-label={`${t('course.subject')} group`} className={input} value={bulk.group} onChange={(e) => setBulk({ group: e.target.value, subject: '' })}>
              <option value="">{t('course.subject')} group</option>
              {groups.map((g) => (
                <option key={g.groupId} value={g.groupId}>
                  {g.name}
                </option>
              ))}
            </select>
            <select aria-label="Option" className={input} value={bulk.subject} onChange={(e) => setBulk({ ...bulk, subject: e.target.value })} disabled={!bulkGroup}>
              <option value="">Option</option>
              {bulkGroup?.options.map((o) => (
                <option key={o.subjectId} value={o.subjectId}>
                  {subjectName(o.subjectId)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={primary}
              disabled={busy || selected.length === 0 || !bulk.subject}
              onClick={() => run(async () => summary(await give(bulk.group, bulk.subject, selected, selected.some((id) => of(id, bulk.group).length > 0))))}
            >
              Give them this option
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select everyone"
                      className="size-4 accent-brand"
                      checked={selected.length === people.length}
                      onChange={(e) => setSelected(e.target.checked ? people.map((p) => p.id) : [])}
                    />
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Name
                  </th>
                  {groups.map((g) => (
                    <th key={g.groupId} scope="col" className="px-3 py-2">
                      {g.name}
                      <span className="block font-normal normal-case tracking-normal">
                        {g.options.map((o) => `${subjectName(o.subjectId)} ${o.students}`).join(' · ')}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {people.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.name}`}
                        className="size-4 accent-brand"
                        checked={selected.includes(p.id)}
                        onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))}
                      />
                    </td>
                    <th scope="row" className="px-3 py-2 font-semibold">
                      {p.name}
                    </th>
                    {groups.map((g) => {
                      const held = of(p.id, g.groupId)
                      const missing = g.missing.some((m) => m.studentId === p.id)
                      return (
                        <td key={g.groupId} className={`px-3 py-2 ${missing ? 'bg-amber-50' : ''}`}>
                          {g.maxChoices === 1 ? (
                            <select
                              aria-label={`${g.name} for ${p.name}`}
                              className={input}
                              disabled={busy}
                              value={held[0]?.subjectId ?? ''}
                              onChange={(e) => void setOne(p.id, g.groupId, e.target.value)}
                            >
                              <option value="">Not chosen</option>
                              {g.options.map((o) => (
                                <option key={o.subjectId} value={o.subjectId}>
                                  {subjectName(o.subjectId)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              {g.options.map((o) => {
                                const h = held.find((c) => c.subjectId === o.subjectId)
                                return (
                                  <label key={o.subjectId} className="flex items-center gap-1">
                                    <input type="checkbox" className="size-4 accent-brand" disabled={busy} checked={!!h} onChange={() => void toggle(p.id, g.groupId, o.subjectId, h)} />
                                    {subjectName(o.subjectId)}
                                  </label>
                                )
                              })}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {leads && <ImportChoices orgId={orgId} onDone={() => void refresh()} />}
    </div>
  )
}

/** Choices from a file of admission numbers and options: a report first, then apply. */
function ImportChoices({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const t = useT()
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ChoiceImportReport | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function go(apply: boolean) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      setReport(await importSubjectChoices(orgId, file, apply))
      if (apply) onDone()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="import-heading" className="space-y-3 rounded-xl border border-line bg-white p-4">
      <h2 id="import-heading" className="font-extrabold">
        Import choices
      </h2>
      <p className="max-w-2xl text-sm text-muted">
        A .csv or .xlsx file with a column headed {t('person.admission_no')} and one column per {t('course.subject', { lower: true })} group, headed with the group's name (or one headed {t('course.subject')}). Nothing
        changes until you apply it.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input aria-label="Choices file" type="file" accept=".csv,.xlsx" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setReport(null))} className="text-sm" />
        <button type="button" className={button} disabled={!file || busy} onClick={() => void go(false)}>
          Check the file
        </button>
        {report && !report.applied && report.assign + report.change > 0 && (
          <button type="button" className={primary} disabled={busy} onClick={() => void go(true)}>
            Apply {report.assign + report.change}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      {report && (
        <div role="status" className="space-y-2 text-sm">
          <p>
            {report.applied ? 'Applied. ' : ''}
            {report.rows} rows: {report.assign} new, {report.change} changed, {report.unchanged} already so, {report.problems.length} with problems.
          </p>
          {report.problems.length > 0 && (
            <ul className="list-inside list-disc text-red-700">
              {report.problems.map((p) => (
                <li key={p.row}>
                  Row {p.row} {p.admissionNo && `(${p.admissionNo})`}: {p.reasons.join(' ')}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { downloadHolisticPdf, draftHolisticNote, getHolisticHtml, getHolisticStudent, putHolisticStudent, type HolisticClass, type HolisticReport } from '../../api/client'
import { ApiError } from '../../api/problem'
import { printPage } from '../../lib/holistic'
import { useT } from '../../lib/terminology/terms-context'

const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const field = 'w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const VOICES = [
  { key: 'self', label: 'In their words', hint: 'What I enjoyed, what I found hard' },
  { key: 'peer', label: 'A classmate says', hint: 'One line from a classmate' },
  { key: 'parent', label: 'At home', hint: 'One line from the family' },
  { key: 'ambition', label: 'Ambition', hint: 'What they want to become or do' },
] as const

/**
 * One child: the report exactly as it prints, and beside it what the class
 * teacher adds. Previous and next move through the class without going back.
 */
export function ChildPanel({ orgId, studentId, periodId, students, onPick, onBack }: {
  orgId: string
  studentId: string
  periodId: string
  students: HolisticClass['students']
  onPick: (id: string) => void
  onBack: () => void
}) {
  const qc = useQueryClient()
  const q = { studentId, periodId }
  const report = useQuery({ queryKey: ['holistic-student', orgId, q], queryFn: ({ signal }) => getHolisticStudent(orgId, q, signal) })
  const [version, setVersion] = useState(0)
  const html = useQuery({ queryKey: ['holistic-html', orgId, q, version], queryFn: ({ signal }) => getHolisticHtml(orgId, { periodId, studentId }, signal), placeholderData: (p) => p })
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  const i = students.findIndex((s) => s.id === studentId)
  const saved = (r: HolisticReport) => {
    qc.setQueryData(['holistic-student', orgId, q], r)
    void qc.invalidateQueries({ queryKey: ['holistic-class', orgId] })
    setVersion((v) => v + 1)
  }
  const run = async (work: () => Promise<string>) => {
    setNote(null)
    try {
      setNote({ text: await work() })
    } catch (e) {
      setNote({ text: e instanceof ApiError ? e.message : 'That did not work. Try again.', error: true })
    }
  }
  const r = report.data

  return (
    <section aria-label="Child report" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} onClick={onBack}>
          Back to the class
        </button>
        <button type="button" className={button} disabled={i <= 0} onClick={() => onPick(students[i - 1].id)}>
          Previous
        </button>
        <button type="button" className={button} disabled={i < 0 || i >= students.length - 1} onClick={() => onPick(students[i + 1].id)}>
          Next
        </button>
        <span className="text-sm text-muted">
          {i + 1} of {students.length}
        </span>
        <span className="flex-1" />
        <button type="button" className={button} disabled={!html.data} onClick={() => void run(async () => (await printPage(() => getHolisticHtml(orgId, { periodId, studentId })), 'The report is open to print.'))}>
          Print
        </button>
        <button type="button" className={button} onClick={() => void run(async () => (await downloadHolisticPdf(orgId, { periodId, studentId }, `holistic-${r?.student.admissionNo ?? 'report'}.pdf`), 'The PDF is downloaded.'))}>
          PDF
        </button>
      </div>
      {note && (
        <p role={note.error ? 'alert' : 'status'} className={`text-sm ${note.error ? 'font-semibold text-red-700' : 'text-muted'}`}>
          {note.text}
        </p>
      )}
      {report.isError ? (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {report.error instanceof ApiError ? report.error.message : 'This report could not be loaded.'}
        </p>
      ) : !r ? (
        <p className="text-sm text-muted">Loading</p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 rounded-2xl border border-line bg-white">
            <iframe title={`${r.student.name}, holistic report`} sandbox="allow-same-origin" srcDoc={html.data ?? ''} className="h-[80vh] w-full rounded-2xl" />
          </div>
          {r.canEdit ? <Additions key={studentId} orgId={orgId} report={r} onSaved={saved} /> : <ReadOnly report={r} />}
        </div>
      )}
    </section>
  )
}

function ReadOnly({ report }: { report: HolisticReport }) {
  const t = useT()
  const ct = t('person.class_teacher', { lower: true })
  return (
    <aside className="space-y-2 rounded-2xl border border-line bg-white p-4 text-sm text-muted">
      <p>The {ct} adds activity ratings, voices and the note.</p>
      {report.note.status === 'draft' && <p>A note is drafted and waits for the {ct} to approve it.</p>}
    </aside>
  )
}

function Additions({ orgId, report, onSaved }: { orgId: string; report: HolisticReport; onSaved: (r: HolisticReport) => void }) {
  const t = useT()
  const base = { studentId: report.student.id, periodId: report.periodId }
  const [ratings, setRatings] = useState(() => Object.fromEntries(report.activities.map((a) => [a.competencyId, a.level])))
  const [voices, setVoices] = useState(report.voices)
  const [text, setText] = useState(report.note.text)
  const [fromAi, setFromAi] = useState(report.note.fromAi)
  const [done, setDone] = useState('')
  const save = useMutation({
    mutationFn: (approve: boolean) =>
      putHolisticStudent(orgId, {
        ...base,
        ratings: Object.entries(ratings).map(([competencyId, level]) => ({ competencyId, level })),
        voices,
        note: { text, approve, fromAi },
      }),
    onSuccess: (r, approve) => (setDone(approve ? 'Saved; the note is approved and prints on the report.' : 'Saved.'), onSaved(r)),
  })
  const draft = useMutation({ mutationFn: () => draftHolisticNote(orgId, base), onSuccess: (d) => (setText(d.text), setFromAi(true), setDone('')) })
  const err = (save.error ?? draft.error) as Error | null
  return (
    <aside aria-label="What you add" className="space-y-4 rounded-2xl border border-line bg-white p-4">
      {report.activities.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="font-bold">Beyond academics</legend>
          <p className="text-xs text-muted">Your rating for the {t('period.term', { lower: true })}.</p>
          {report.activities.map((a) => (
            <label key={a.competencyId} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">
                {a.name} <span className="text-xs text-muted">{a.subject}</span>
              </span>
              <select aria-label={`${a.name} rating`} className="rounded border border-line px-1.5 py-1 text-sm" value={ratings[a.competencyId] ?? 0} onChange={(e) => (setRatings({ ...ratings, [a.competencyId]: Number(e.target.value) }), setDone(''))}>
                <option value={0}>Not rated</option>
                {report.scale.map((l, k) => (
                  <option key={l.name} value={k + 1}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      )}
      <fieldset className="space-y-2">
        <legend className="font-bold">Voices</legend>
        {VOICES.map((v) => (
          <label key={v.key} className="block text-sm font-semibold">
            {v.label}
            <input aria-label={v.label} spellCheck maxLength={300} placeholder={v.hint} className={`${field} mt-0.5 font-normal`} value={voices[v.key]} onChange={(e) => (setVoices({ ...voices, [v.key]: e.target.value }), setDone(''))} />
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="flex w-full items-center justify-between font-bold">
          Note for the family
          {report.note.status && <span className={`rounded-full px-2 py-0.5 text-xs ${report.note.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{report.note.status}</span>}
        </legend>
        <textarea aria-label="Note for the family" spellCheck rows={6} maxLength={1500} className={field} value={text} onChange={(e) => (setText(e.target.value), setDone(''))} placeholder="A few warm, specific lines for the family." />
        {fromAi && text && <p className="text-xs text-amber-800">Drafted by AI from the levels; read and change it before approving.</p>}
        <button type="button" className={button} disabled={draft.isPending} onClick={() => draft.mutate()} title="Drafts from the levels and outcomes only; the name is never sent">
          {draft.isPending ? 'Drafting' : text ? 'Draft again with AI' : 'Draft with AI'}
        </button>
      </fieldset>
      {err && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {err instanceof ApiError ? err.message : 'That did not save. Try again.'}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm font-semibold text-emerald-700">
          {done}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={save.isPending} onClick={() => save.mutate(false)}>
          Save
        </button>
        <button type="button" className={primary} disabled={save.isPending || !text.trim()} title={!text.trim() ? 'Write or draft a note first' : undefined} onClick={() => save.mutate(true)}>
          Save and approve the note
        </button>
      </div>
    </aside>
  )
}

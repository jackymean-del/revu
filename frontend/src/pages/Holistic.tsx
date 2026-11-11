import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { downloadHolisticPdf, getHolisticClass, getHolisticHtml, listStructure, type HolisticClass, type Period, type TeachingAssignment } from '../api/client'
import { ApiError } from '../api/problem'
import { Icon } from '../components/Icon'
import { dots, printPage, tone } from '../lib/holistic'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'
import { useSectionNames } from './people/sections'
import { ChildPanel } from './holistic/ChildPanel'

const select = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'

/**
 * Holistic report (B8.6.2): the class as a heatmap of children against
 * competencies, then each child's report, ready for a parent-teacher
 * meeting. Levels come from tagged marks; the class teacher adds the
 * activity ratings, the voices and the note.
 */
export function Holistic() {
  const t = useT()
  const search = useSearch({ from: '/holistic' })
  const navigate = useNavigate({ from: '/holistic' })
  const { current, loading } = useOrg()
  const orgId = current?.id ?? ''
  const roles = current?.roles ?? []
  const leads = roles.some((r) => r === 'admin' || r === 'coordinator' || r === 'principal')
  const names = useSectionNames(orgId)
  const periods = useQuery({ queryKey: ['structure', orgId, 'periods', {}], queryFn: ({ signal }) => listStructure<Period>(orgId, 'periods', {}, signal), enabled: !!orgId }).data ?? []
  const mine = useQuery({
    queryKey: ['structure', orgId, 'teaching-assignments', { staffId: current?.staffId }],
    queryFn: ({ signal }) => listStructure<TeachingAssignment>(orgId, 'teaching-assignments', { staffId: current!.staffId! }, signal),
    enabled: !!orgId && !leads && !!current?.staffId,
  }).data
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  const [busy, setBusy] = useState('')

  const latestYear = [...names.years].sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0]?.id ?? ''
  const sections = names.sections
    .filter((s) => s.yearId === latestYear && (leads || mine?.some((m) => m.sectionId === s.id)))
    .sort((a, b) => (names.levels.findIndex((l) => l.id === a.levelId) - names.levels.findIndex((l) => l.id === b.levelId)) || a.name.localeCompare(b.name))
  const sectionId = sections.some((s) => s.id === search.section) ? search.section! : (sections[0]?.id ?? '')
  const yearPeriods = periods.filter((p) => p.yearId === latestYear).sort((a, b) => a.seq - b.seq)
  const periodId = yearPeriods.some((p) => p.id === search.term) ? search.term! : (yearPeriods[0]?.id ?? '')
  const q = { sectionId, periodId }
  const cls = useQuery({ queryKey: ['holistic-class', orgId, q], queryFn: ({ signal }) => getHolisticClass(orgId, q, signal), enabled: !!(orgId && sectionId && periodId), placeholderData: keepPreviousData })
  const go = (change: { section?: string; term?: string; child?: string }) => void navigate({ search: { section: sectionId, term: periodId, ...change } })

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!orgId) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })}.</p>

  const run = async (key: string, work: () => Promise<string>) => {
    setBusy(key)
    setNote(null)
    try {
      setNote({ text: await work() })
    } catch (e) {
      setNote({ text: e instanceof ApiError ? e.message : 'That did not work. Try again.', error: true })
    } finally {
      setBusy('')
    }
  }
  const data = cls.data
  const child = search.child && data?.students.some((s) => s.id === search.child) ? search.child : ''

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Holistic report</h1>
        <p className="mt-1 max-w-3xl text-muted">
          Scores and the whole child together, one page each, ready to talk through with families. Levels are worked out from the marks of tagged questions; a level needs three
          marks. The {t('person.class_teacher', { lower: true })} adds activity ratings, voices and a note.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('group.section')}
          <select aria-label={t('group.section')} className={select} value={sectionId} onChange={(e) => go({ section: e.target.value, child: undefined })}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {names.name(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('period.term')}
          <select aria-label={t('period.term')} className={select} value={periodId} onChange={(e) => go({ term: e.target.value })}>
            {yearPeriods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <span className="flex-1" />
        {data && !child && (
          <>
            <button type="button" className={button} disabled={!!busy} onClick={() => void run('print', async () => (await printPage(() => getHolisticHtml(orgId, q)), 'The meeting pack is open to print.'))}>
              Print meeting pack
            </button>
            <button
              type="button"
              className={button}
              disabled={!!busy}
              onClick={() => void run('pdf', async () => (await downloadHolisticPdf(orgId, q, `holistic-${data.section.replace(/\s+/g, '-')}.pdf`), 'The meeting pack is downloaded.'))}
            >
              {busy === 'pdf' ? 'Making the PDF' : 'Meeting pack PDF'}
            </button>
          </>
        )}
      </div>
      {note && (
        <p role={note.error ? 'alert' : 'status'} className={`text-sm ${note.error ? 'font-semibold text-red-700' : 'text-muted'}`}>
          {note.text}
        </p>
      )}

      {!sectionId ? (
        <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted">No {t('group.section', { count: 2, lower: true })} to show yet.</p>
      ) : cls.isError ? (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {cls.error instanceof ApiError ? cls.error.message : 'The holistic report could not be loaded.'}
        </p>
      ) : !data ? (
        <p className="text-sm text-muted">Loading</p>
      ) : child ? (
        <ChildPanel key={child} orgId={orgId} studentId={child} periodId={periodId} students={data.students} onPick={(id) => go({ child: id })} onBack={() => go({ child: undefined })} />
      ) : (
        <Heatmap data={data} onPick={(id) => go({ child: id })} />
      )}
    </div>
  )
}

function Heatmap({ data, onPick }: { data: HolisticClass; onPick: (id: string) => void }) {
  const n = data.scale.length
  if (data.students.length === 0) return <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted">Nobody is enrolled here yet.</p>
  return (
    <section aria-label="Class heatmap" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">Levels:</span>
        {data.scale.map((l, i) => (
          <span key={l.name} className="rounded-full px-2 py-0.5 font-semibold" style={{ background: tone(i + 1, n).bg, color: tone(i + 1, n).fg }}>
            {l.name} {dots(i + 1, n)} <span className="font-normal">from {l.min}%</span>
          </span>
        ))}
        <span className="rounded-full px-2 py-0.5" style={{ background: tone(0, n).bg, color: tone(0, n).fg }}>
          · too little evidence
        </span>
      </div>
      {data.competencies.length === 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          No marks are tagged with learning outcomes or competencies yet. Tag paper parts (Create question paper does it when a set is finalised), then levels appear here.
        </p>
      )}
      <div className="relative overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="sticky left-0 bg-white px-3 py-2 font-semibold">Child</th>
              <th className="px-2 py-2 text-right font-semibold">Overall</th>
              {data.competencies.map((c) => (
                <th key={c.id} className="max-w-28 px-1 py-2 text-center align-bottom font-semibold" title={`${c.subject}: ${c.name}`}>
                  <span className="block truncate text-[10px] font-normal">{c.subject}</span>
                  <span className="block truncate">{c.name}</span>
                </th>
              ))}
              <th className="px-2 py-2 font-semibold">Added</th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((s, r) => (
              <tr key={s.id} className="border-b border-line/60 hover:bg-canvas">
                <td className="sticky left-0 bg-white px-3 py-1.5">
                  <button type="button" className="flex items-center gap-2 text-left font-semibold text-brand hover:underline" onClick={() => onPick(s.id)}>
                    <span className="w-6 text-xs tabular-nums text-muted">{s.rollNo}</span>
                    {s.name}
                  </button>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{s.overall !== undefined ? `${s.overall}%` : ''}</td>
                {data.cells[r].map((c, i) => (
                  <td key={data.competencies[i].id} className="px-1 py-1 text-center">
                    {c.marks > 0 && (
                      <span
                        className="inline-block min-w-14 rounded px-1.5 py-0.5 text-xs font-semibold"
                        style={{ background: tone(c.level, n).bg, color: tone(c.level, n).fg }}
                        title={c.level ? `${data.scale[c.level - 1].name}, ${c.pct}% on ${c.marks} marks` : `Too little evidence: ${c.marks} ${c.marks === 1 ? 'mark' : 'marks'}`}
                      >
                        {c.level ? dots(c.level, n) : '·'}
                      </span>
                    )}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-xs text-muted">
                  {[s.rated && `${s.rated} rated`, s.voices && `${s.voices} voices`, s.note && `note ${s.note}`].filter(Boolean).join(' · ') || 'nothing yet'}
                </td>
              </tr>
            ))}
          </tbody>
          {data.competencies.length > 0 && (
            <tfoot>
              <tr className="text-xs text-muted">
                <td className="sticky left-0 bg-white px-3 py-2 font-semibold">How many reach each level</td>
                <td />
                {data.summary.map((sum) => (
                  <td key={sum.id} className="px-1 py-2 text-center tabular-nums">
                    {sum.counts.slice(1).join(' · ')}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Icon name="arrow" size={13} />
        Open a child to see the report as it prints and to add ratings, voices and the note.
      </p>
    </section>
  )
}

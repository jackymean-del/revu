import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  download,
  downloadReportPdf,
  getReportHtml,
  getReportStatus,
  listStructure,
  type Period,
  type TeachingAssignment,
} from '../api/client'
import { ApiError } from '../api/problem'
import { STATE } from '../lib/results'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'
import { useSectionNames } from './people/sections'
import { BrandingPanel } from './reports/BrandingPanel'
import { TemplatePanel } from './reports/TemplatePanel'

const select = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

/** Reports: preview a section's report cards, download them as PDF or print them, and download the marksheet. */
export function Reports() {
  const t = useT()
  const { current, loading } = useOrg()
  const orgId = current?.id ?? ''
  const roles = current?.roles ?? []
  const admin = roles.includes('admin')
  const designs = admin || roles.includes('coordinator')
  const names = useSectionNames(orgId)
  const periods = useQuery({ queryKey: ['structure', orgId, 'periods', {}], queryFn: ({ signal }) => listStructure<Period>(orgId, 'periods', {}, signal), enabled: !!orgId }).data ?? []
  const mine = useQuery({
    queryKey: ['structure', orgId, 'teaching-assignments', { staffId: current?.staffId }],
    queryFn: ({ signal }) => listStructure<TeachingAssignment>(orgId, 'teaching-assignments', { staffId: current!.staffId! }, signal),
    enabled: !!orgId && !admin && !!current?.staffId,
  }).data
  const [pick, setPick] = useState({ sectionId: '', periodId: '', studentId: '' })
  const [tab, setTab] = useState<'preview' | 'design' | 'branding'>('preview')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  const printer = useRef<HTMLIFrameElement>(null)

  const latestYear = [...names.years].sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0]?.id ?? ''
  // Class teachers build their own section's reports; administrators any.
  const sections = names.sections.filter((s) => s.yearId === latestYear && (admin || mine?.some((m) => m.sectionId === s.id && !m.subjectId)))
  const sectionId = pick.sectionId || sections[0]?.id || ''
  const yearPeriods = periods.filter((p) => p.yearId === (names.byId(sectionId)?.yearId ?? latestYear)).sort((a, b) => a.seq - b.seq)
  const periodId = pick.periodId || yearPeriods[0]?.id || ''
  const q = { sectionId, periodId }
  const ready = !!(orgId && sectionId && periodId)

  const status = useQuery({ queryKey: ['report-status', orgId, q], queryFn: ({ signal }) => getReportStatus(orgId, q, signal), enabled: ready })
  const studentId = pick.studentId || status.data?.students[0]?.id || ''
  const preview = useQuery({
    queryKey: ['report-html', orgId, q, studentId],
    queryFn: ({ signal }) => getReportHtml(orgId, { ...q, studentId }, signal),
    enabled: ready && !!studentId && tab === 'preview',
  })

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!orgId) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })}.</p>

  const sectionName = names.byId(sectionId) ? names.name(names.byId(sectionId)!) : ''
  const student = status.data?.students.find((s) => s.id === studentId)
  const counts = status.data?.counts

  async function run(label: string, work: () => Promise<string | void>) {
    setBusy(label)
    setNote(null)
    try {
      const text = await work()
      if (text) setNote({ text })
    } catch (e) {
      setNote({ text: e instanceof ApiError ? e.message : 'Not done. Try again.', error: true })
    } finally {
      setBusy('')
    }
  }

  // Printing uses the same page as the PDF, in a hidden frame.
  const printSection = () =>
    run('print', async () => {
      const html = await getReportHtml(orgId, q)
      const frame = printer.current
      if (!frame) return
      frame.srcdoc = html
      await new Promise((resolve) => (frame.onload = resolve))
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    })

  const fileBase = `${sectionName.replace(/\s+/g, '-')}-${yearPeriods.find((p) => p.id === periodId)?.name.replace(/\s+/g, '-') ?? ''}`

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Reports</h1>
        <p className="mt-1 max-w-2xl text-muted">
          {t('report.report_card', { count: 2 })} for a {t('group.section', { lower: true })}, drawn from the results your scheme worked out, and the Excel results sheet. Preview one,
          then download them all as one PDF or print them from the browser.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('group.section')}
          <select className={select} value={sectionId} onChange={(e) => setPick({ sectionId: e.target.value, periodId: '', studentId: '' })}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {names.name(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('period.term')}
          <select className={select} value={periodId} onChange={(e) => setPick({ ...pick, sectionId, periodId: e.target.value })}>
            {yearPeriods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div role="tablist" aria-label="Reports" className="ml-auto flex gap-1 rounded-lg bg-mist p-1">
          {(
            [
              ['preview', 'Preview and download'],
              ...(designs ? [['design', 'Report design']] : []),
              ...(admin ? [['branding', 'Institution details']] : []),
            ] as [typeof tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === key ? 'bg-white text-brand shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!ready ? (
        <p className="text-sm text-muted">There is no {t('group.section', { lower: true })} whose reports you can make yet.</p>
      ) : tab === 'design' ? (
        <TemplatePanel orgId={orgId} levelId={names.byId(sectionId)?.levelId ?? ''} />
      ) : tab === 'branding' ? (
        <BrandingPanel orgId={orgId} />
      ) : status.isPending ? (
        <p className="text-sm text-muted">Loading</p>
      ) : status.isError ? (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {status.error instanceof ApiError ? status.error.message : 'These reports could not be loaded.'}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
          <aside className="space-y-3">
            {counts && (
              <div className="rounded-xl border border-line bg-white p-3 text-sm">
                <p className="font-semibold">{t('course.subject')} results</p>
                <ul className="mt-1 space-y-0.5 text-muted">
                  <li>
                    {STATE.complete.label}: {counts.complete}
                  </li>
                  <li>
                    {STATE.provisional.label}: {counts.provisional}
                  </li>
                  <li>
                    {STATE.blocked.label}: {counts.blocked}
                  </li>
                  <li>
                    {STATE.not_assessed.label}: {counts.notAssessed}
                  </li>
                </ul>
                {counts.provisional + counts.blocked > 0 && <p className="mt-2 text-xs text-amber-900">Reports show these as they are: nothing is filled in or counted as zero.</p>}
              </div>
            )}
            <nav aria-label={t('person.student', { count: 2 })} className="max-h-[60vh] overflow-y-auto rounded-xl border border-line bg-white">
              <ul>
                {status.data!.students.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      aria-current={s.id === studentId ? 'true' : undefined}
                      onClick={() => setPick({ ...pick, sectionId, periodId, studentId: s.id })}
                      className={`flex w-full gap-2 border-b border-line px-3 py-2 text-left text-sm ${s.id === studentId ? 'bg-mist font-semibold text-brand' : 'hover:bg-canvas'}`}
                    >
                      <span className="w-8 shrink-0 tabular-nums text-muted">{s.rollNo}</span>
                      <span className="truncate">{s.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <section aria-label="Report preview" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={primary}
                disabled={!!busy || !status.data?.pdf}
                onClick={() =>
                  run('section', async () => {
                    await downloadReportPdf(orgId, q, `reports-${fileBase}.pdf`)
                    return 'The PDF is downloaded.'
                  })
                }
              >
                {busy === 'section' ? 'Making the PDF' : `PDF for the whole ${t('group.section', { lower: true })}`}
              </button>
              <button
                type="button"
                className={button}
                disabled={!!busy || !status.data?.pdf || !student}
                onClick={() =>
                  run('one', async () => {
                    await downloadReportPdf(orgId, { ...q, studentIds: [studentId] }, `report-${student!.admissionNo}.pdf`)
                    return 'The PDF is downloaded.'
                  })
                }
              >
                {busy === 'one' ? 'Making the PDF' : `PDF for ${student?.name ?? 'this report'}`}
              </button>
              <button type="button" className={button} disabled={!!busy} onClick={() => void printSection()}>
                Print from the browser
              </button>
              <button
                type="button"
                className={button}
                disabled={!!busy}
                onClick={() => run('xlsx', () => download(orgId, `/v1/marksheets.xlsx?${new URLSearchParams(q)}`, `results-${fileBase}.xlsx`))}
              >
                Excel results sheet
              </button>
              {!status.data?.pdf && <p className="text-xs text-muted">PDF making is not set up here yet; printing from the browser gives the same page.</p>}
            </div>
            {note && (
              <p role={note.error ? 'alert' : 'status'} className={`text-sm ${note.error ? 'font-semibold text-red-700' : 'text-muted'}`}>
                {note.text}
              </p>
            )}
            {preview.isPending ? (
              <p className="text-sm text-muted">Loading the preview</p>
            ) : preview.isError ? (
              <p role="alert" className="text-sm font-semibold text-red-700">
                {preview.error instanceof ApiError ? preview.error.message : 'The preview could not be loaded.'}
              </p>
            ) : (
              <iframe title={`Report of ${student?.name ?? ''}`} sandbox="" srcDoc={preview.data} className="h-[80vh] w-full rounded-xl border border-line bg-canvas" />
            )}
          </section>
        </div>
      )}
      <iframe ref={printer} title="Print" aria-hidden="true" tabIndex={-1} className="pointer-events-none fixed h-0 w-0 opacity-0" />
    </div>
  )
}

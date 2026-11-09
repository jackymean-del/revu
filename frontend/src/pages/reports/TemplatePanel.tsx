import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getReportTemplate, listStructure, putReportTemplate, type ReportConfig, type Subject } from '../../api/client'
import { ApiError } from '../../api/problem'
import { useT } from '../../lib/terminology/terms-context'
import type { TermKey } from '../../lib/terminology/terminology'
import { moveItem, orderSubjects, SECTION_LABEL } from '../../lib/reports'

const input = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const small = 'rounded px-2 py-0.5 text-sm hover:bg-mist disabled:opacity-40'
const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const SIGNOFF: TermKey[] = ['person.class_teacher', 'person.principal', 'person.guardian']

/** The report template: which sections show, in what order, the subject order, sign-off lines and print options. */
export function TemplatePanel({ orgId, levelId }: { orgId: string; levelId: string }) {
  const t = useT()
  const qc = useQueryClient()
  const saved = useQuery({ queryKey: ['report-template', orgId], queryFn: ({ signal }) => getReportTemplate(orgId, signal) })
  const subjects = useQuery({ queryKey: ['structure', orgId, 'subjects', {}], queryFn: ({ signal }) => listStructure<Subject>(orgId, 'subjects', {}, signal) }).data ?? []
  const levelSubjects = useQuery({
    queryKey: ['structure', orgId, 'level-subjects', { levelId }],
    queryFn: ({ signal }) => listStructure<{ subjectId: string }>(orgId, 'level-subjects', { levelId }, signal),
    enabled: !!levelId,
  }).data
  const [cfg, setCfg] = useState<ReportConfig | null>(null)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (saved.data) setCfg(saved.data.config)
  }, [saved.data])

  if (!cfg) return <p className="text-sm text-muted">Loading</p>
  const change = (c: ReportConfig) => {
    setCfg(c)
    setNote(null)
  }
  const shown = subjects.filter((s) => !levelSubjects || levelSubjects.some((l) => l.subjectId === s.id))
  const ordered = orderSubjects(shown, cfg.subjectOrder)

  async function save() {
    setBusy(true)
    try {
      const out = await putReportTemplate(orgId, cfg!)
      qc.setQueryData(['report-template', orgId], out)
      await qc.invalidateQueries({ queryKey: ['report-html', orgId] })
      setNote({ text: `Saved as version ${out.version}. Reports already made keep the version they used.` })
    } catch (e) {
      setNote({ text: e instanceof ApiError ? (e.fields?.[0]?.message ?? e.message) : 'Not saved. Try again.', error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-labelledby="sections-heading" className="space-y-3 rounded-xl border border-line bg-white p-4">
        <h2 id="sections-heading" className="font-extrabold">
          What the report shows
        </h2>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Title
          <input className={input} spellCheck value={cfg.title} maxLength={80} onChange={(e) => change({ ...cfg, title: e.target.value })} />
        </label>
        <ol className="space-y-1">
          {cfg.sections.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                id={`sec-${s.key}`}
                className="size-4 accent-brand"
                checked={s.on}
                disabled={s.key === 'identity'}
                onChange={(e) => change({ ...cfg, sections: cfg.sections.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)) })}
              />
              <label htmlFor={`sec-${s.key}`} className="flex-1">
                {SECTION_LABEL[s.key]}
              </label>
              <button type="button" className={small} disabled={i === 0} aria-label={`Move ${SECTION_LABEL[s.key]} up`} onClick={() => change({ ...cfg, sections: moveItem(cfg.sections, i, -1) })}>
                ↑
              </button>
              <button
                type="button"
                className={small}
                disabled={i === cfg.sections.length - 1}
                aria-label={`Move ${SECTION_LABEL[s.key]} down`}
                onClick={() => change({ ...cfg, sections: moveItem(cfg.sections, i, 1) })}
              >
                ↓
              </button>
            </li>
          ))}
        </ol>
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold">Sign-off lines</legend>
          {SIGNOFF.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-brand"
                checked={cfg.signoff.includes(k as ReportConfig['signoff'][number])}
                onChange={(e) =>
                  change({
                    ...cfg,
                    signoff: e.target.checked
                      ? SIGNOFF.filter((x) => x === k || cfg.signoff.includes(x as ReportConfig['signoff'][number])).map((x) => x as ReportConfig['signoff'][number])
                      : cfg.signoff.filter((x) => x !== k),
                  })
                }
              />
              {t(k)}
            </label>
          ))}
        </fieldset>
      </section>

      <section aria-labelledby="order-heading" className="space-y-3 rounded-xl border border-line bg-white p-4">
        <h2 id="order-heading" className="font-extrabold">
          {t('course.subject', { count: 2 })} order
        </h2>
        <p className="text-xs text-muted">The order on reports and results sheets. It never changes a result.</p>
        <ol className="space-y-1">
          {ordered.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="w-6 tabular-nums text-muted">{i + 1}</span>
              <span className="flex-1">{s.name}</span>
              <button type="button" className={small} disabled={i === 0} aria-label={`Move ${s.name} up`} onClick={() => change({ ...cfg, subjectOrder: moveItem(ordered, i, -1).map((x) => x.id) })}>
                ↑
              </button>
              <button
                type="button"
                className={small}
                disabled={i === ordered.length - 1}
                aria-label={`Move ${s.name} down`}
                onClick={() => change({ ...cfg, subjectOrder: moveItem(ordered, i, 1).map((x) => x.id) })}
              >
                ↓
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="print-heading" className="space-y-3 rounded-xl border border-line bg-white p-4 lg:col-span-2">
        <h2 id="print-heading" className="font-extrabold">
          Printing
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Paper
            <select
              className={input}
              value={cfg.paper.size}
              onChange={(e) => {
                const size = e.target.value as ReportConfig['paper']['size']
                change({ ...cfg, paper: size === 'custom' ? { ...cfg.paper, size, widthMm: cfg.paper.widthMm ?? 210, heightMm: cfg.paper.heightMm ?? 297 } : { size, orientation: cfg.paper.orientation }, booklet: size === 'custom' ? false : cfg.booklet })
              }}
            >
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
              <option value="A5">A5</option>
              <option value="custom">Custom size</option>
            </select>
          </label>
          {cfg.paper.size === 'custom' &&
            (['widthMm', 'heightMm'] as const).map((k) => (
              <label key={k} className="flex flex-col gap-1 text-sm font-semibold">
                {k === 'widthMm' ? 'Width (mm)' : 'Height (mm)'}
                <input type="number" min={90} max={600} className={`${input} w-24`} value={cfg.paper[k] ?? ''} onChange={(e) => change({ ...cfg, paper: { ...cfg.paper, [k]: Number(e.target.value) } })} />
              </label>
            ))}
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Orientation
            <select className={input} value={cfg.paper.orientation} onChange={(e) => change({ ...cfg, paper: { ...cfg.paper, orientation: e.target.value as 'portrait' | 'landscape' } })}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
        </div>
        <div className="space-y-1 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={cfg.padEven} onChange={(e) => change({ ...cfg, padEven: e.target.checked })} />
            <span>
              Start every report on a new sheet <span className="block text-xs text-muted">In a PDF of a whole {t('group.section', { lower: true })}, a report with an odd number of pages gets a blank page, for printing on both sides.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-brand"
              checked={cfg.booklet}
              disabled={cfg.paper.size === 'custom'}
              onChange={(e) => change({ ...cfg, booklet: e.target.checked })}
            />
            <span>
              Folded booklet <span className="block text-xs text-muted">Two pages to a side of the next sheet size up (A5 pages on A4), in folding order. Print on both sides, flipping on the short edge.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={cfg.qr} onChange={(e) => change({ ...cfg, qr: e.target.checked })} />
            <span>
              QR code <span className="block text-xs text-muted">Opens the report as it was made, after sign-in. It carries no personal details.</span>
            </span>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={primary} disabled={busy} onClick={() => void save()}>
            Save the design
          </button>
          {note && (
            <p role={note.error ? 'alert' : 'status'} className={`text-sm ${note.error ? 'font-semibold text-red-700' : 'text-muted'}`}>
              {note.text}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

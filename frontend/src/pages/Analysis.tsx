import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { download, getAnalysisSummary, listStructure, type Period, type TeachingAssignment } from '../api/client'
import { ApiError } from '../api/problem'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'
import { useSectionNames } from './people/sections'
import { AggregateTable } from './analysis/AggregateTable'
import { BandsTable } from './analysis/BandsTable'
import { ListsView } from './analysis/ListsView'
import { RangesView } from './analysis/RangesView'
import { ReteachPanel } from './analysis/ReteachPanel'
import { SettingsPanel } from './analysis/SettingsPanel'

const select = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'

type Tab = 'aggregate' | 'bands' | 'lists' | 'ranges' | 'reteach' | 'settings'

/**
 * Analysis (P0.6, blueprint B8.6.1 and B8.7): the standard analysis pack of
 * a section for a period, on the term result or one component, and the
 * reteach list of an assessment. Every number comes from the server.
 */
export function Analysis() {
  const t = useT()
  const { current, loading } = useOrg()
  const orgId = current?.id ?? ''
  const roles = current?.roles ?? []
  const admin = roles.includes('admin')
  const leads = roles.some((r) => r === 'admin' || r === 'coordinator' || r === 'principal')
  const names = useSectionNames(orgId)
  const periods = useQuery({ queryKey: ['structure', orgId, 'periods', {}], queryFn: ({ signal }) => listStructure<Period>(orgId, 'periods', {}, signal), enabled: !!orgId }).data ?? []
  const mine = useQuery({
    queryKey: ['structure', orgId, 'teaching-assignments', { staffId: current?.staffId }],
    queryFn: ({ signal }) => listStructure<TeachingAssignment>(orgId, 'teaching-assignments', { staffId: current!.staffId! }, signal),
    enabled: !!orgId && !leads && !!current?.staffId,
  }).data
  const [pick, setPick] = useState({ sectionId: '', periodId: '', basis: '' })
  const [tab, setTab] = useState<Tab>('aggregate')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)

  const latestYear = [...names.years].sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0]?.id ?? ''
  const sections = names.sections.filter((s) => s.yearId === latestYear && (leads || mine?.some((m) => m.sectionId === s.id)))
  const sectionId = pick.sectionId || sections[0]?.id || ''
  const yearPeriods = periods.filter((p) => p.yearId === (names.byId(sectionId)?.yearId ?? latestYear)).sort((a, b) => a.seq - b.seq)
  const periodId = pick.periodId || yearPeriods[0]?.id || ''
  const ready = !!(orgId && sectionId && periodId)
  const q = { sectionId, periodId, basis: pick.basis }
  const packTab = tab === 'aggregate' || tab === 'bands' || tab === 'lists' || tab === 'ranges'

  const summary = useQuery({
    queryKey: ['analysis', orgId, q],
    queryFn: ({ signal }) => getAnalysisSummary(orgId, q, signal),
    enabled: ready && packTab,
    placeholderData: keepPreviousData,
  })

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!orgId) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })}.</p>

  const sectionName = names.byId(sectionId) ? names.name(names.byId(sectionId)!) : ''
  const periodName = yearPeriods.find((p) => p.id === periodId)?.name ?? ''
  const data = summary.data
  const basisName = (code: string, name: string) => (code === '' ? `${t('period.term')} result` : name)
  const tabs: [Tab, string][] = [
    ['aggregate', 'Aggregate'],
    ['bands', 'Bands'],
    ['lists', 'Lists'],
    ['ranges', 'By range'],
    ['reteach', 'Reteach'],
    ...(admin ? ([['settings', 'Settings']] as [Tab, string][]) : []),
  ]

  async function exportPack() {
    setBusy(true)
    setNote(null)
    try {
      const params = new URLSearchParams(pick.basis ? q : { sectionId, periodId })
      await download(orgId, `/v1/analysis/summary.xlsx?${params}`, `analysis-${sectionName.replace(/\s+/g, '-')}-${periodName.replace(/\s+/g, '-')}.xlsx`)
      setNote({ text: 'The workbook is downloaded.' })
    } catch (e) {
      setNote({ text: e instanceof ApiError ? e.message : 'Not downloaded. Try again.', error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-10">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Analysis</h1>
        <p className="mt-1 max-w-3xl text-muted">
          How a {t('group.section', { lower: true })} did: every {t('course.subject', { lower: true })} side by side, how many are in each band, who needs a warning or an
          undertaking, and which parts of a paper to teach again. Absent, withheld and not assessed are never counted as zero.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('group.section')}
          <select className={select} value={sectionId} onChange={(e) => setPick({ sectionId: e.target.value, periodId: '', basis: '' })}>
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
        {packTab && data && data.bases.length > 1 && (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Based on
            <select className={select} value={pick.basis} onChange={(e) => setPick({ ...pick, sectionId, periodId, basis: e.target.value })}>
              {data.bases.map((b) => (
                <option key={b.code} value={b.code}>
                  {basisName(b.code, b.name)}
                </option>
              ))}
            </select>
          </label>
        )}
        {packTab && data && data.access !== 'counts' && (
          <button type="button" className={button} disabled={busy} onClick={() => void exportPack()}>
            {busy ? 'Making the workbook' : 'Excel workbook'}
          </button>
        )}
        <div role="tablist" aria-label="Analysis" className="ml-auto flex flex-wrap gap-1 rounded-lg bg-mist p-1">
          {tabs.map(([key, label]) => (
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
      {note && (
        <p role={note.error ? 'alert' : 'status'} className={`text-sm ${note.error ? 'font-semibold text-red-700' : 'text-muted'}`}>
          {note.text}
        </p>
      )}

      {!ready ? (
        <p className="text-sm text-muted">There is no {t('group.section', { lower: true })} you can analyse yet.</p>
      ) : tab === 'settings' ? (
        <SettingsPanel orgId={orgId} />
      ) : tab === 'reteach' ? (
        <ReteachPanel orgId={orgId} sectionId={sectionId} periodId={periodId} />
      ) : summary.isPending ? (
        <p className="text-sm text-muted">Loading</p>
      ) : summary.isError ? (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {summary.error instanceof ApiError ? summary.error.message : 'This analysis could not be loaded.'}
        </p>
      ) : data!.subjects.length === 0 ? (
        <p className="text-sm text-muted">No results here yet. They appear once marks are in and a scheme applies.</p>
      ) : (
        <div className={summary.isFetching ? 'opacity-60 transition-opacity' : ''}>
          {data!.access !== 'full' && (
            <p className="mb-3 rounded-lg bg-mist px-3 py-2 text-sm text-muted">
              {data!.access === 'counts'
                ? 'Your role shows counts only, so names and marks are left out.'
                : `You see the ${t('course.subject', { count: 2, lower: true })} you teach in full and the others as counts; totals need every ${t('course.subject', { lower: true })}.`}
            </p>
          )}
          {tab === 'aggregate' && (data!.access === 'counts' ? <BandsTable summary={data!} /> : <AggregateTable summary={data!} />)}
          {tab === 'bands' && <BandsTable summary={data!} />}
          {tab === 'lists' && <ListsView summary={data!} />}
          {tab === 'ranges' && <RangesView summary={data!} />}
        </div>
      )}
    </div>
  )
}

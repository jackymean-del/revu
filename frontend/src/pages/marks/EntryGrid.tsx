import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyBulk,
  getMarksGrid,
  listBulkWrites,
  lockAssessment,
  marksTemplate,
  resolveLayout,
  saveLayout,
  setParticipation,
  undoBulk,
  unlockAssessment,
} from '../../api/client'
import { ApiError } from '../../api/problem'
import { MarksGrid } from '../../components/DataGrid/MarksGrid'
import { OneAtATime } from '../../components/DataGrid/OneAtATime'
import { arrange, blanks, counts, move, sortStudents, toItems, type Arrangement, type MarksStudent, type RowStatus, type SortRule } from '../../lib/marks'
import { useT } from '../../lib/terminology/terms-context'
import { Upload } from './Upload'
import { useMarks } from './useMarks'

const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const input = 'rounded-md border border-line bg-white px-2 py-1.5 text-sm'

const DEFAULT_SORT: SortRule[] = [{ field: 'roll_no', direction: 'asc' }]

const STATUS_LABEL: Record<RowStatus, string> = { not_applicable: 'NA', absent: 'Absent', exempt: 'Exempt', left: 'Left' }

const phone = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches

/** The entry grid of one assessment for one section, with everything around it. */
export function EntryGrid({ orgId, assessmentId, sectionId, sectionName, subjectName }: { orgId: string; assessmentId: string; sectionId: string; sectionName: string; subjectName: string }) {
  const t = useT()
  const qc = useQueryClient()
  const grid = useQuery({ queryKey: ['marks', orgId, assessmentId, sectionId], queryFn: ({ signal }) => getMarksGrid(orgId, assessmentId, sectionId, signal) })
  const layout = useQuery({ queryKey: ['layout', orgId, assessmentId], queryFn: ({ signal }) => resolveLayout(orgId, assessmentId, signal) })
  const bulks = useQuery({ queryKey: ['bulks', orgId, assessmentId, sectionId], queryFn: ({ signal }) => listBulkWrites(orgId, assessmentId, sectionId, signal) })
  const marks = useMarks(orgId, grid.data)
  const [savedArr, setArr] = useState<Arrangement | null>(null)
  const [savedSort, setSort] = useState<SortRule[] | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [oneByOne, setOneByOne] = useState(phone)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [panel, setPanel] = useState<'columns' | 'upload' | null>(null)
  const [menu, setMenu] = useState<string | null>(null)

  const data = grid.data
  const columns = useMemo(() => (data?.assessment.parts ?? []).map((p) => ({ id: p.id, label: p.name, max: p.maxMarks })), [data])
  useEffect(() => {
    if (layout.data && data) {
      setArr(arrange(columns, layout.data.items))
      setSort(layout.data.sort as SortRule[])
    }
  }, [layout.data, data, columns])

  if (grid.isPending) return <p className="text-sm text-muted">Loading the grid</p>
  if (grid.isError) return <p role="alert" className="text-sm font-semibold text-red-700">{grid.error.message}</p>
  if (!data) return null
  // The grid draws as soon as its marks are in; the person's own column
  // layout applies when it arrives, and paper order stands in until then
  // (or if it cannot be loaded).
  const arr = savedArr ?? arrange(columns, layout.data?.items ?? [])
  const sort = savedSort ?? (layout.data?.sort as SortRule[] | undefined) ?? DEFAULT_SORT

  const as = data.assessment
  const students: MarksStudent[] = data.students.map((s) => ({ ...s, status: s.status as RowStatus | undefined }))
  const shown = sortStudents(students.filter((s) => showAll || s.applicable), sort)
  const byId = new Map(students.map((s) => [s.id, s]))
  const canEdit = (s: string) => data.canEdit && !!byId.get(s)?.applicable && !byId.get(s)?.status
  const visible = arr.order.filter((id) => !arr.hidden.includes(id)).map((id) => columns.find((c) => c.id === id)!)
  const n = counts(students, columns, marks.value)
  const left = blanks(students, columns, marks.value).filter((b) => canEdit(b.studentId))
  const lastBulk = bulks.data?.find((b) => !b.undoneAt)

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['marks', orgId, assessmentId, sectionId] })
    void qc.invalidateQueries({ queryKey: ['bulks', orgId, assessmentId, sectionId] })
  }
  async function run(work: () => Promise<string>) {
    setBusy(true)
    setNote(null)
    try {
      setNote({ text: await work() })
    } catch (e) {
      setNote({ text: e instanceof ApiError ? (e.fields?.[0]?.message ?? e.message) : 'Something went wrong. Try again.', error: true })
    } finally {
      setBusy(false)
      refresh()
    }
  }

  function keep(next: Arrangement, nextSort: SortRule[] = sort) {
    setArr(next)
    setSort(nextSort)
    void saveLayout(orgId, { surface: 'entry_grid', scopeId: assessmentId, items: toItems(next), sort: nextSort })
  }

  function setStatus(s: MarksStudent, status: RowStatus | '') {
    const held = columns.filter((c) => marks.value(s.id, c.id)?.state === 'scored').length
    if (status && held > 0 && !window.confirm(`This hides ${held} ${held === 1 ? 'mark' : 'marks'} for ${s.name}. They are kept, and come back when you clear the status.`)) return
    void run(async () => (await setParticipation(orgId, assessmentId, s.id, { status }), status ? `${s.name}: ${STATUS_LABEL[status]}.` : `${s.name}: status cleared.`))
  }

  const rowActions = (row: { id: string; name: string }) => {
    const s = byId.get(row.id)!
    if (!data.canEdit || !s.applicable) return null
    return (
      <button
        type="button"
        aria-label={`Actions for ${row.name}`}
        aria-expanded={menu === row.id}
        className="rounded-md px-2 py-1 text-muted hover:bg-mist"
        onClick={() => setMenu(menu === row.id ? null : row.id)}
      >
        ⋯
      </button>
    )
  }
  const menuStudent = menu ? byId.get(menu) : undefined

  const name = (id: string) => byId.get(id)?.name ?? ''
  const label = (id: string) => columns.find((c) => c.id === id)?.label ?? ''

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <p className="font-semibold" aria-live="polite">
          {marks.waiting > 0 ? (marks.offline ? `${marks.waiting} waiting to send: you are offline, and they go when you are back.` : `Saving ${marks.waiting}`) : 'All saved'}
        </p>
        <p className="text-muted">
          Scored {n.scored} · Absent {n.absent} · NA {n.not_applicable} · Exempt {n.exempt} · Pending {n.pending}
          {Object.entries(n.rows).some(([, v]) => v > 0) &&
            ` · Rows: ${Object.entries(n.rows)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => `${STATUS_LABEL[k as RowStatus]} ${v}`)
              .join(', ')}`}
        </p>
        {as.status === 'locked' && <span className="rounded-full border border-line bg-mist px-2 py-0.5 text-xs font-semibold text-brand-700">Locked</span>}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Sort by
          <select
            className={input}
            value={sort[0]?.field ?? 'roll_no'}
            onChange={(e) => keep(arr, [{ field: e.target.value as SortRule['field'], direction: 'asc' }])}
          >
            <option value="roll_no">{t('person.roll_no')}</option>
            <option value="admission_no">{t('person.admission_no')}</option>
            <option value="name">Name</option>
          </select>
        </label>
        <button type="button" className={button} aria-expanded={panel === 'columns'} onClick={() => setPanel(panel === 'columns' ? null : 'columns')}>
          Columns
        </button>
        <button type="button" className={button} onClick={() => setOneByOne(!oneByOne)}>
          {oneByOne ? 'Show the grid' : 'One at a time'}
        </button>
        {data.applicability === 'selected' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-brand" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show all {t('person.student', { count: 2, lower: true })}
          </label>
        )}
        <button
          type="button"
          className={button}
          onClick={() => void run(async () => (await marksTemplate(orgId, assessmentId, sectionId, visible.map((c) => c.id), `${subjectName} ${as.title} ${sectionName}.xlsx`), 'Template downloaded.'))}
        >
          Download template
        </button>
        {data.canEdit && (
          <button type="button" className={button} aria-expanded={panel === 'upload'} onClick={() => setPanel(panel === 'upload' ? null : 'upload')}>
            Upload
          </button>
        )}
        {data.canEdit && left.length > 0 && (
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Mark ${left.length} blank ${left.length === 1 ? 'cell' : 'cells'} as not applicable? You can undo this in one step.`)) return
              void run(async () => {
                const r = await applyBulk(orgId, assessmentId, { sectionId, kind: 'blanks_not_applicable', cells: left.map((b) => ({ studentId: b.studentId, partId: b.columnId, state: 'not_applicable' })) })
                return `${r.applied} marked not applicable.`
              })
            }}
          >
            Mark {left.length} blanks NA
          </button>
        )}
        {data.canEdit && lastBulk && (
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => void run(async () => {
              const r = await undoBulk(orgId, lastBulk.id)
              return `Undone: ${r.restored} restored${r.kept ? `, ${r.kept} changed since and kept` : ''}.`
            })}
          >
            Undo last {lastBulk.kind === 'upload' ? 'upload' : 'bulk change'} ({lastBulk.cells})
          </button>
        )}
        {data.canLock && as.status === 'open' && (
          <button type="button" className={button} disabled={busy} onClick={() => void run(async () => (await lockAssessment(orgId, assessmentId), 'Locked. Marks now change only after it is opened again.'))}>
            Lock
          </button>
        )}
        {data.canLock && as.status === 'locked' && (
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => {
              const reason = window.prompt('Why open it again?')
              if (reason?.trim()) void run(async () => (await unlockAssessment(orgId, assessmentId, reason), 'Open again.'))
            }}
          >
            Open again
          </button>
        )}
      </div>

      {note && (
        <p role={note.error ? 'alert' : 'status'} className={`text-sm font-semibold ${note.error ? 'text-red-700' : 'text-brand-700'}`}>
          {note.text}
        </p>
      )}

      {panel === 'columns' && (
        <section aria-label="Columns" className="space-y-1 rounded-xl border border-line bg-white p-3 text-sm">
          <p className="text-xs text-muted">Your own view: it changes what you see, never a calculation.</p>
          {arr.order.map((id, i) => (
            <div key={id} className="flex flex-wrap items-center gap-3">
              <span className="w-40 truncate font-semibold">{label(id)}</span>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  className="size-4 accent-brand"
                  checked={!arr.hidden.includes(id)}
                  onChange={(e) => keep({ ...arr, hidden: e.target.checked ? arr.hidden.filter((x) => x !== id) : [...arr.hidden, id] })}
                />
                Shown
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  className="size-4 accent-brand"
                  checked={arr.pinned.includes(id)}
                  onChange={(e) => keep({ ...arr, pinned: e.target.checked ? [...arr.pinned, id] : arr.pinned.filter((x) => x !== id) })}
                />
                Pinned
              </label>
              <button type="button" className="rounded px-2 py-0.5 hover:bg-mist disabled:opacity-40" disabled={i === 0} aria-label={`Move ${label(id)} earlier`} onClick={() => keep(move(arr, id, -1))}>
                ↑
              </button>
              <button
                type="button"
                className="rounded px-2 py-0.5 hover:bg-mist disabled:opacity-40"
                disabled={i === arr.order.length - 1}
                aria-label={`Move ${label(id)} later`}
                onClick={() => keep(move(arr, id, 1))}
              >
                ↓
              </button>
            </div>
          ))}
        </section>
      )}

      {panel === 'upload' && (
        <Upload
          orgId={orgId}
          assessmentId={assessmentId}
          sectionId={sectionId}
          students={students.filter((s) => s.applicable && !s.status)}
          columns={columns}
          value={marks.value}
          canEdit={(s) => canEdit(s)}
          onDone={(text) => {
            setPanel(null)
            setNote({ text })
            refresh()
          }}
        />
      )}

      {menuStudent && (
        <section aria-label={`Actions for ${menuStudent.name}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white p-3 text-sm">
          <span className="font-semibold">{menuStudent.name}, whole assessment:</span>
          {(['absent', 'exempt', 'not_applicable', ...(data.canSetLeft ? ['left'] : [])] as RowStatus[]).map((x) => (
            <button key={x} type="button" className={button} onClick={() => (setMenu(null), setStatus(menuStudent, x))}>
              {x === 'left' ? 'Left the institution (TC)' : x === 'not_applicable' ? 'Not applicable' : STATUS_LABEL[x]}
            </button>
          ))}
          {menuStudent.status && (
            <button type="button" className={button} onClick={() => (setMenu(null), setStatus(menuStudent, ''))}>
              Clear the status
            </button>
          )}
          {!menuStudent.status && columns.length > 1 && (
            <>
              <span className="font-semibold">Absent for one part:</span>
              {columns.map((c) => (
                <button key={c.id} type="button" className={button} onClick={() => (setMenu(null), void marks.save(menuStudent.id, c.id, { state: 'absent' }))}>
                  {c.label}
                </button>
              ))}
            </>
          )}
          <button type="button" className="ml-auto rounded-md px-2 py-1 font-semibold text-muted hover:bg-mist" onClick={() => setMenu(null)}>
            Close
          </button>
        </section>
      )}

      {marks.conflicts.length > 0 && (
        <section aria-labelledby="conflicts-heading" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <h3 id="conflicts-heading" className="font-extrabold text-amber-900">
            Changed by someone else
          </h3>
          <p className="text-amber-900">These cells changed after you opened them. Nothing was overwritten; choose which mark stays.</p>
          <ul className="space-y-1">
            {marks.conflicts.map((c) => (
              <li key={c.studentId + c.partId} className="flex flex-wrap items-center gap-2">
                <span>
                  {name(c.studentId)}, {label(c.partId)}: yours {c.mine.value ?? c.mine.state}, now {c.theirs.value ?? c.theirs.state}
                </span>
                <button type="button" className={button} onClick={() => marks.keepMine(c)}>
                  Keep mine
                </button>
                <button type="button" className={button} onClick={() => marks.takeTheirs(c)}>
                  Take theirs
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {marks.failures.length > 0 && (
        <section role="alert" className="space-y-1 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-extrabold">Not saved</p>
          <ul className="list-inside list-disc">
            {marks.failures.map((f, i) => (
              <li key={i}>
                {name(f.studentId)}, {label(f.partId)}: {f.message}
              </li>
            ))}
          </ul>
          <button type="button" className={button} onClick={marks.clearFailures}>
            Dismiss
          </button>
        </section>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-muted">Nobody in this {t('group.section', { lower: true })} takes this {t('course.subject', { lower: true })} yet.</p>
      ) : oneByOne ? (
        <OneAtATime
          rows={shown}
          columns={visible}
          value={marks.value}
          canEdit={(s) => canEdit(s)}
          rowLabel={(s) => (byId.get(s)?.status ? STATUS_LABEL[byId.get(s)!.status!] : undefined)}
          onCommit={(s, c, cell) => void marks.save(s, c, cell)}
        />
      ) : (
        <>
          {data.canEdit && <p className="text-sm text-muted">Click a box and type the mark. Enter goes down, Tab goes across, and a double click changes a mark already there.</p>}
          <MarksGrid
            label={`${subjectName}, ${as.title}, ${sectionName}`}
            rows={shown}
            columns={columns}
            order={arr.order}
            hidden={arr.hidden}
            pinned={arr.pinned}
            value={marks.value}
            canEdit={(s) => canEdit(s)}
            rowLabel={(s) => (byId.get(s)?.status ? STATUS_LABEL[byId.get(s)!.status!] : undefined)}
            muted={(s) => !byId.get(s)?.applicable}
            saveMark={marks.mark}
            onCommit={(s, c, cell) => void marks.save(s, c, cell)}
            rowActions={rowActions}
          />
        </>
      )}
    </div>
  )
}

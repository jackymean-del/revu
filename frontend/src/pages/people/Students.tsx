import { useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { createStructure, listStudents, removeStructure, restoreStructure, updateStructure, type Student } from '../../api/client'
import { ApiError } from '../../api/problem'
import { EditableList } from '../../components/EditableList'
import { toBody, toDraft, type Draft, type FieldSpec } from '../../lib/forms'
import { useT } from '../../lib/terminology/terms-context'
import { useSectionNames } from './sections'

const input = 'w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none'
const STATUS: Record<string, string> = { active: 'Active', left: 'Left', graduated: 'Completed' }

const studentFields: FieldSpec[] = [
  { key: 'admissionNo', kind: 'text', required: true },
  { key: 'name', kind: 'text', required: true },
  { key: 'preferredName', kind: 'text' },
  { key: 'dob', kind: 'date' },
  { key: 'status', kind: 'select' },
]

function StudentForm({ fields, draft, setDraft, errors }: { fields: Record<string, string>; draft: Draft; setDraft: (d: Draft) => void; errors: Record<string, string> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {studentFields.map((f) => (
        <label key={f.key} className="text-sm">
          <span className="mb-1 block font-semibold">{fields[f.key]}</span>
          {f.kind === 'select' ? (
            <select aria-label={fields[f.key]} className={input} value={String(draft[f.key] || 'active')} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}>
              {Object.entries(STATUS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          ) : (
            <input aria-label={fields[f.key]} className={input} type={f.kind === 'date' ? 'date' : 'text'} value={String(draft[f.key] ?? '')} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} aria-invalid={errors[f.key] ? true : undefined} />
          )}
          {errors[f.key] && <span className="mt-1 block text-xs font-semibold text-red-700">{errors[f.key]}</span>}
        </label>
      ))}
    </div>
  )
}

function useSave() {
  const qc = useQueryClient()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setErrors({})
    setMessage('')
    try {
      const out = await work()
      await qc.invalidateQueries()
      return out
    } catch (e) {
      if (e instanceof ApiError) {
        const f = Object.fromEntries((e.fields ?? []).map((x) => [x.field, x.message]))
        setErrors(f)
        if (!Object.keys(f).length) setMessage(e.message)
      } else setMessage('Could not reach the server. Try again.')
      return null
    } finally {
      setBusy(false)
    }
  }
  return { run, errors, setErrors, message, busy }
}

function StudentPanel({ orgId, student, canEdit, onClose }: { orgId: string; student: Student; canEdit: boolean; onClose: () => void }) {
  const t = useT()
  const names = useSectionNames(orgId)
  const [draft, setDraft] = useState<Draft>(() => toDraft(studentFields, student as unknown as Record<string, unknown>))
  const save = useSave()
  const removed = !!student.removedAt
  const labels = { admissionNo: t('person.admission_no'), name: 'Name', preferredName: 'Preferred name', dob: 'Date of birth', status: 'Status' }
  const submit = () => {
    const conv = toBody(studentFields, draft)
    if (!conv.ok) return save.setErrors(conv.errors)
    void save.run(() => updateStructure(orgId, 'students', student.id, conv.body))
  }
  return (
    <aside aria-label={student.name} className="space-y-6 rounded-xl border border-line bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">{student.name}</h2>
          <p className="text-sm text-muted">
            {t('person.admission_no')} {student.admissionNo}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm font-semibold text-muted hover:bg-canvas">
          Close
        </button>
      </div>
      <fieldset disabled={!canEdit || removed} className="space-y-3">
        <StudentForm fields={labels} draft={draft} setDraft={setDraft} errors={save.errors} />
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            {!removed && (
              <button type="button" disabled={save.busy} onClick={submit} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600">
                Save
              </button>
            )}
          </div>
        )}
      </fieldset>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {removed ? (
            <button type="button" disabled={save.busy} onClick={() => void save.run(() => restoreStructure(orgId, 'students', student.id))} className="rounded-md px-2 py-1 text-sm font-semibold text-brand hover:bg-mist">
              Restore
            </button>
          ) : (
            <button type="button" disabled={save.busy} onClick={() => void save.run(() => removeStructure(orgId, 'students', student.id)).then((ok) => ok !== null && onClose())} className="rounded-md px-2 py-1 text-sm font-semibold text-red-700 hover:bg-red-50">
              Remove
            </button>
          )}
        </div>
      )}
      {save.message && <p role="alert" className="text-sm font-semibold text-red-700">{save.message}</p>}

      <section className="space-y-2">
        <h3 className="font-extrabold">Placements</h3>
        <EditableList
          orgId={orgId}
          path="enrolments"
          scope={{ studentId: student.id }}
          canEdit={canEdit && !removed}
          noun="placement"
          empty={`Not placed in any ${t('period.year', { lower: true })} yet.`}
          cols={[
            { key: 'sectionId', label: t('group.section'), kind: 'select', required: true, options: names.sections.map((s) => ({ value: s.id, label: `${names.name(s)}, ${names.year(s.yearId)}` })) },
            { key: 'rollNo', label: t('person.roll_no'), kind: 'text', width: '8rem' },
          ]}
        />
      </section>

      <section className="space-y-2">
        <h3 className="font-extrabold">{t('person.guardian', { count: 2 })}</h3>
        <EditableList
          orgId={orgId}
          path="guardians"
          scope={{ studentId: student.id }}
          canEdit={canEdit && !removed}
          noun={t('person.guardian', { lower: true })}
          empty="No contacts yet."
          cols={[
            { key: 'name', label: 'Name', kind: 'text', required: true },
            { key: 'relation', label: 'Relation', kind: 'text', width: '7rem' },
            { key: 'phone', label: 'Phone', kind: 'text' },
            { key: 'email', label: 'Email', kind: 'text' },
            { key: 'isPrimary', label: 'First contact', kind: 'checkbox', show: (g) => (g.isPrimary ? 'First contact' : '') },
          ]}
        />
      </section>
    </aside>
  )
}

/** Students: search, filter by section, page through, add, and open one to edit. */
export function Students({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const t = useT()
  const names = useSectionNames(orgId)
  const [q, setQ] = useState('')
  const [sectionId, setSection] = useState('')
  const [showRemoved, setShowRemoved] = useState(false)
  const [open, setOpen] = useState<Student | null>(null)
  const params: Record<string, string> = { limit: '50', ...(q.trim() ? { q: q.trim() } : {}), ...(sectionId ? { sectionId } : {}), ...(showRemoved ? { includeRemoved: 'true' } : {}) }
  const pages = useInfiniteQuery({
    queryKey: ['students', orgId, params],
    queryFn: ({ pageParam, signal }) => listStudents(orgId, pageParam ? { ...params, cursor: pageParam } : params, signal),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor || undefined,
  })
  const list = pages.data?.pages.flatMap((p) => p.items) ?? []
  const current = open ? (list.find((s) => s.id === open.id) ?? open) : null

  const [draft, setDraft] = useState<Draft>({ admissionNo: '', name: '', preferredName: '', dob: '', status: 'active' })
  const add = useSave()
  const labels = { admissionNo: t('person.admission_no'), name: 'Name', preferredName: 'Preferred name', dob: 'Date of birth', status: 'Status' }
  const submitNew = async () => {
    const conv = toBody(studentFields, draft)
    if (!conv.ok) return add.setErrors(conv.errors)
    const made = await add.run(() => createStructure(orgId, 'students', conv.body))
    if (made) {
      setDraft({ admissionNo: '', name: '', preferredName: '', dob: '', status: 'active' })
      setOpen(made as Student)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-48 flex-1 text-sm">
            <span className="mb-1 block font-semibold">Search</span>
            <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Name or ${t('person.admission_no', { lower: true })}`} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t('group.section')}</span>
            <select className={input} value={sectionId} onChange={(e) => setSection(e.target.value)}>
              <option value="">All</option>
              {names.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {names.name(s)}, {names.year(s.yearId)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-xs text-muted">
            <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} className="accent-brand" />
            Show removed
          </label>
        </div>

        <div className="relative overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[34rem] text-sm">
            <caption className="sr-only">{t('person.student', { count: 2 })}</caption>
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th scope="col" className="px-3 py-2 font-bold">Name</th>
                <th scope="col" className="px-3 py-2 font-bold">{t('person.admission_no')}</th>
                <th scope="col" className="px-3 py-2 font-bold">{t('group.section')}</th>
                <th scope="col" className="px-3 py-2 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {pages.isPending && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-muted">Loading</td>
                </tr>
              )}
              {!pages.isPending && list.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-muted">
                    {q || sectionId ? 'Nobody matches.' : 'Nobody here yet. Add someone below, or import a class list.'}
                  </td>
                </tr>
              )}
              {list.map((s) => {
                const sec = s.placement ? names.byId(s.placement.sectionId) : undefined
                return (
                  <tr key={s.id} className={`border-b border-line last:border-b-0 ${s.removedAt ? 'text-subtle line-through' : ''} ${current?.id === s.id ? 'bg-mist/50' : ''}`}>
                    <td className="px-3 py-2">
                      <button type="button" className="text-left font-semibold text-brand hover:underline" onClick={() => setOpen(s)}>
                        {s.name}
                      </button>
                    </td>
                    <td className="px-3 py-2">{s.admissionNo}</td>
                    <td className="px-3 py-2">
                      {sec ? names.name(sec) : ''}
                      {s.placement?.rollNo ? `, ${s.placement.rollNo}` : ''}
                    </td>
                    <td className="px-3 py-2">{STATUS[s.status] ?? s.status}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {pages.hasNextPage && (
            <div className="border-t border-line p-2 text-center">
              <button type="button" disabled={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()} className="rounded-md px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist">
                {pages.isFetchingNextPage ? 'Loading' : 'Show more'}
              </button>
            </div>
          )}
        </div>

        {canEdit && (
          <section className="space-y-3 rounded-xl border border-line bg-white p-4">
            <h2 className="font-extrabold">Add {t('person.student', { lower: true })}</h2>
            <StudentForm fields={labels} draft={draft} setDraft={setDraft} errors={add.errors} />
            <div className="flex items-center gap-3">
              <button type="button" disabled={add.busy} onClick={() => void submitNew()} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600">
                Add
              </button>
              {add.message && <p role="alert" className="text-sm font-semibold text-red-700">{add.message}</p>}
            </div>
          </section>
        )}
      </div>
      {current && <StudentPanel key={current.id + (current.removedAt ?? '')} orgId={orgId} student={current} canEdit={canEdit} onClose={() => setOpen(null)} />}
    </div>
  )
}

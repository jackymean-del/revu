import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { putStudentFields, type StudentField, type StudentFieldSettings } from '../../api/client'
import { ApiError } from '../../api/problem'
import { Loading } from '../../components/Loading'
import { useT } from '../../lib/terminology/terms-context'
import { useStudentFields } from './fields'

const input = 'w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none'
const AREAS: [StudentField['area'], string][] = [
  ['identity', 'Identity'],
  ['contact', 'Contact'],
  ['family', 'Family'],
  ['health', 'Health and care'],
  ['other', 'Other'],
]
const TYPES: [StudentField['type'], string][] = [
  ['text', 'Text'],
  ['longtext', 'Long text'],
  ['number', 'Number'],
  ['date', 'Date'],
  ['choice', 'Choice from a list'],
  ['yesno', 'Yes or no'],
  ['phone', 'Phone'],
  ['email', 'Email'],
]

/**
 * A student's values for the institution's own fields, grouped as the
 * blueprint groups them. Hidden fields are not asked; their values stay
 * with the student untouched.
 */
export function DetailFields({ fields, details, onChange, errors }: { fields: StudentField[]; details: Record<string, string>; onChange: (d: Record<string, string>) => void; errors: Record<string, string> }) {
  const shown = fields.filter((f) => !f.hidden)
  if (shown.length === 0) return null
  const set = (key: string, v: string) => onChange({ ...details, [key]: v })
  return (
    <div className="space-y-4">
      {AREAS.filter(([a]) => shown.some((f) => f.area === a)).map(([area, title]) => (
        <fieldset key={area} className="space-y-2">
          <legend className="text-xs font-extrabold uppercase tracking-[0.08em] text-subtle">{title}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {shown
              .filter((f) => f.area === area)
              .map((f) => {
                const v = details[f.key] ?? ''
                const err = errors[`details.${f.key}`]
                return (
                  <label key={f.key} className={`text-sm ${f.type === 'longtext' ? 'sm:col-span-2' : ''}`}>
                    <span className="mb-1 block font-semibold">
                      {f.label}
                      {f.required && <span className="text-red-700"> *</span>}
                      {f.adminOnly && <span className="ml-1.5 text-xs font-normal text-muted">administrators only</span>}
                    </span>
                    {f.type === 'choice' || f.type === 'yesno' ? (
                      <select aria-label={f.label} className={input} value={v} onChange={(e) => set(f.key, e.target.value)}>
                        <option value="">Not set</option>
                        {(f.type === 'yesno' ? ['yes', 'no'] : f.options).map((o) => (
                          <option key={o} value={o}>
                            {f.type === 'yesno' ? (o === 'yes' ? 'Yes' : 'No') : o}
                          </option>
                        ))}
                      </select>
                    ) : f.type === 'longtext' ? (
                      <textarea aria-label={f.label} rows={2} className={input} value={v} onChange={(e) => set(f.key, e.target.value)} />
                    ) : (
                      <input
                        aria-label={f.label}
                        className={input}
                        type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'}
                        inputMode={f.type === 'number' ? 'decimal' : undefined}
                        value={v}
                        onChange={(e) => set(f.key, e.target.value)}
                      />
                    )}
                    {err && <span className="mt-1 block text-xs font-semibold text-red-700">{err}</span>}
                  </label>
                )
              })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

/**
 * The institution's list of student fields: each renamed, shown or hidden,
 * required or not, kept to administrators or not, moved up and down, and
 * new ones added. Hiding keeps what was entered. Also which field families
 * sign in with.
 */
export function FieldSettings({ orgId }: { orgId: string }) {
  const settings = useStudentFields(orgId)
  if (!settings) return <Loading />
  return <Editor key={JSON.stringify(settings)} orgId={orgId} settings={settings} />
}

function Editor({ orgId, settings }: { orgId: string; settings: StudentFieldSettings }) {
  const t = useT()
  const qc = useQueryClient()
  const [fields, setFields] = useState(settings.fields)
  const [username, setUsername] = useState(settings.usernameField)
  const [fresh, setFresh] = useState({ label: '', type: 'text' as StudentField['type'], options: '', area: 'other' as StudentField['area'] })
  const save = useMutation({
    mutationFn: (f: StudentField[]) => putStudentFields(orgId, { fields: f, usernameField: f.some((x) => x.key === username && x.unique && !x.hidden) ? username : 'admissionNo' }),
    onSuccess: (s) => qc.setQueryData(['student-fields', orgId], s),
  })
  const change = (i: number, patch: Partial<StudentField>) => setFields(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const move = (i: number, by: number) => {
    const next = [...fields]
    const [x] = next.splice(i, 1)
    next.splice(i + by, 0, x)
    setFields(next)
  }
  const add = () => {
    const label = fresh.label.trim()
    if (!label) return
    // A key of its own, made from the name: "Bus route" becomes busRoute.
    const words = label.replace(/[^a-zA-Z0-9 ]/g, '').split(/\s+/).filter(Boolean)
    let key = (words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('') || 'field').replace(/^[^a-z]+/, 'f')
    while (fields.some((f) => f.key === key) || ['admissionNo', 'name', 'preferredName', 'dob', 'status'].includes(key)) key += '2'
    setFields([...fields, { key: key.slice(0, 40), label, type: fresh.type, options: fresh.type === 'choice' ? fresh.options.split(',').map((o) => o.trim()).filter(Boolean) : [], area: fresh.area, required: false, hidden: false, adminOnly: false, unique: false, custom: true }])
    setFresh({ label: '', type: 'text', options: '', area: 'other' })
  }
  const dirty = JSON.stringify(fields) !== JSON.stringify(settings.fields) || username !== settings.usernameField
  const uniques = fields.filter((f) => f.unique && !f.hidden)
  const check = 'flex items-center gap-1.5 text-xs'
  return (
    <div className="max-w-4xl space-y-5">
      <p className="text-sm text-muted">
        The {t('person.admission_no', { lower: true })}, name, preferred name, date of birth and status are always kept. Everything else is yours: rename it, hide it, make it required, or add your own. Hiding a field keeps what was
        already entered.
      </p>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
        {fields.map((f, i) => (
          <li key={f.key} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 ${f.hidden ? 'bg-canvas' : ''}`}>
            <span className="flex gap-1">
              <button type="button" className="grid size-6 place-items-center rounded border border-line text-xs text-muted disabled:opacity-30" aria-label={`Move ${f.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" className="grid size-6 place-items-center rounded border border-line text-xs text-muted disabled:opacity-30" aria-label={`Move ${f.label} down`} disabled={i === fields.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
            </span>
            <input aria-label={`Name of ${f.label}`} className={`${input} max-w-52 flex-1 font-semibold`} maxLength={60} value={f.label} onChange={(e) => change(i, { label: e.target.value })} />
            <span className="w-28 text-xs text-muted">
              {TYPES.find(([k]) => k === f.type)?.[1]}
              {f.custom ? ' · yours' : ''}
            </span>
            <select aria-label={`Group of ${f.label}`} className="rounded-md border border-line bg-white px-1.5 py-1 text-xs" value={f.area} onChange={(e) => change(i, { area: e.target.value as StudentField['area'] })}>
              {AREAS.map(([a, title]) => (
                <option key={a} value={a}>
                  {title}
                </option>
              ))}
            </select>
            <label className={check}>
              <input type="checkbox" checked={!f.hidden} onChange={(e) => change(i, { hidden: !e.target.checked })} />
              Shown
            </label>
            <label className={check}>
              <input type="checkbox" checked={f.required} disabled={f.hidden} onChange={(e) => change(i, { required: e.target.checked })} />
              Required
            </label>
            <label className={check} title="Only administrators see what is entered">
              <input type="checkbox" checked={f.adminOnly} onChange={(e) => change(i, { adminOnly: e.target.checked })} />
              Administrators only
            </label>
            <label className={check} title="No two may share a value; it can then be the sign-in name">
              <input type="checkbox" checked={f.unique} disabled={f.type === 'choice' || f.type === 'yesno' || f.type === 'longtext'} onChange={(e) => change(i, { unique: e.target.checked })} />
              Unique
            </label>
            {f.type === 'choice' && (
              <input aria-label={`Choices of ${f.label}`} className={`${input} basis-full text-xs`} placeholder="Choices, separated by commas" value={f.options.join(', ')} onChange={(e) => change(i, { options: e.target.value.split(',').map((o) => o.trimStart()) })} onBlur={() => change(i, { options: f.options.map((o) => o.trim()).filter(Boolean) })} />
            )}
          </li>
        ))}
      </ul>

      <section className="space-y-2 rounded-2xl border border-dashed border-line bg-white p-4">
        <h3 className="font-bold">Add a field of your own</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-40 flex-1 text-xs font-semibold">
            Name
            <input aria-label="New field name" className={`${input} mt-1`} maxLength={60} placeholder="For example: Bus route" value={fresh.label} onChange={(e) => setFresh({ ...fresh, label: e.target.value })} />
          </label>
          <label className="text-xs font-semibold">
            Kind
            <select aria-label="New field kind" className={`${input} mt-1`} value={fresh.type} onChange={(e) => setFresh({ ...fresh, type: e.target.value as StudentField['type'] })}>
              {TYPES.map(([k, title]) => (
                <option key={k} value={k}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          {fresh.type === 'choice' && (
            <label className="min-w-40 flex-1 text-xs font-semibold">
              Choices, separated by commas
              <input aria-label="New field choices" className={`${input} mt-1`} placeholder="North, South" value={fresh.options} onChange={(e) => setFresh({ ...fresh, options: e.target.value })} />
            </label>
          )}
          <button type="button" className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50" disabled={!fresh.label.trim()} onClick={add}>
            Add field
          </button>
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-line bg-white p-4">
        <h3 className="font-bold">Sign-in name for families</h3>
        <p className="text-sm text-muted">What a family types as its user name. Any field marked Unique can be chosen.</p>
        <select aria-label="Sign-in name" className={`${input} max-w-xs`} value={uniques.some((f) => f.key === username) ? username : 'admissionNo'} onChange={(e) => setUsername(e.target.value)}>
          <option value="admissionNo">{t('person.admission_no')}</option>
          {uniques.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </section>

      <div className="flex items-center gap-3">
        <button type="button" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50" disabled={!dirty || save.isPending} onClick={() => save.mutate(fields)}>
          Save fields
        </button>
        {save.isSuccess && !dirty && (
          <span role="status" className="text-sm font-semibold text-emerald-700">
            Saved
          </span>
        )}
        {save.error && (
          <span role="alert" className="text-sm font-semibold text-red-700">
            {save.error instanceof ApiError ? (save.error.fields?.[0]?.message ?? save.error.message) : 'That did not save.'}
          </span>
        )}
      </div>
    </div>
  )
}

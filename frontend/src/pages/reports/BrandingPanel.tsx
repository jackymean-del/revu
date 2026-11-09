import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteLogo, getBranding, logoURL, putBranding, putLogo, type BrandingInput } from '../../api/client'
import { ApiError } from '../../api/problem'
import { useT } from '../../lib/terminology/terms-context'

const input = 'w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

const FIELDS: { key: keyof BrandingInput; label: string; max: number }[] = [
  { key: 'displayName', label: 'Name as printed', max: 160 },
  { key: 'address', label: 'Address', max: 300 },
  { key: 'contact', label: 'Phone, email or website', max: 200 },
  { key: 'affiliation', label: 'Affiliation or registration', max: 200 },
  { key: 'headerNote', label: 'A line under the header (optional)', max: 200 },
]

/**
 * The institution's details on every document. Each save is a new version;
 * documents already made keep the version they used.
 */
export function BrandingPanel({ orgId }: { orgId: string }) {
  const t = useT()
  const qc = useQueryClient()
  const branding = useQuery({ queryKey: ['branding', orgId], queryFn: ({ signal }) => getBranding(orgId, signal) })
  const logo = useQuery({ queryKey: ['branding-logo', orgId, branding.data?.version], queryFn: () => logoURL(orgId), enabled: !!branding.data?.hasLogo })
  const [form, setForm] = useState<BrandingInput | null>(null)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (branding.data) {
      const b = branding.data
      setForm({ displayName: b.displayName, address: b.address ?? '', contact: b.contact ?? '', affiliation: b.affiliation ?? '', headerNote: b.headerNote ?? '' })
    }
  }, [branding.data])

  if (!form) return <p className="text-sm text-muted">Loading</p>

  async function act(work: () => Promise<unknown>, done: string) {
    setBusy(true)
    setNote(null)
    try {
      const b = await work()
      qc.setQueryData(['branding', orgId], b)
      await qc.invalidateQueries({ queryKey: ['report-html', orgId] })
      setNote({ text: done })
    } catch (e) {
      setNote({ text: e instanceof ApiError ? (e.fields?.[0]?.message ?? e.message) : 'Not saved. Try again.', error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="brand-heading" className="max-w-2xl space-y-4 rounded-xl border border-line bg-white p-4">
      <div>
        <h2 id="brand-heading" className="font-extrabold">
          Your {t('org.institution', { lower: true })} on documents
        </h2>
        <p className="text-sm text-muted">Shown at the top of every report and results sheet. Saving makes a new version; reports already made keep theirs.</p>
      </div>
      {FIELDS.map((f) => (
        <label key={f.key} className="flex flex-col gap-1 text-sm font-semibold">
          {f.label}
          <input className={input} spellCheck maxLength={f.max} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primary} disabled={busy || !form.displayName.trim()} onClick={() => void act(() => putBranding(orgId, form), 'Saved.')}>
          Save the details
        </button>
      </div>
      <div className="space-y-2 border-t border-line pt-4">
        <p className="text-sm font-semibold">Logo</p>
        {logo.data ? <img src={logo.data} alt="Current logo" className="max-h-16 rounded border border-line p-1" /> : <p className="text-sm text-muted">No logo yet.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${button} cursor-pointer`}>
            {branding.data?.hasLogo ? 'Replace the logo' : 'Add a logo'}
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void act(() => putLogo(orgId, file), 'Logo saved.')
              }}
            />
          </label>
          {branding.data?.hasLogo && (
            <button type="button" className={button} disabled={busy} onClick={() => void act(() => deleteLogo(orgId), 'Logo removed.')}>
              Remove the logo
            </button>
          )}
          <span className="text-xs text-muted">PNG or JPEG, at most 256 KB.</span>
        </div>
      </div>
      {note && (
        <p role={note.error ? 'alert' : 'status'} className={`text-sm ${note.error ? 'font-semibold text-red-700' : 'text-muted'}`}>
          {note.text}
        </p>
      )}
    </section>
  )
}

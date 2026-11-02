/**
 * Reading an audit entry: what record it was, and which fields changed from
 * what to what. Ids and bookkeeping fields are left out; a field holding a
 * list or object (such as the overrides of the words) is compared whole.
 */

export type Doc = Record<string, unknown> | undefined

export type Change = { field: string; from: string; to: string }

const HIDDEN = new Set(['id', 'removedAt', 'createdAt', 'updatedAt'])

const show = (v: unknown): string => {
  if (v === undefined || v === null || v === '') return ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const NAMED: Record<string, string> = { dob: 'Date of birth', isPrimary: 'First contact', seq: 'Order', clerkUserId: 'Sign-in id' }

/** "admissionNo" reads as "Admission no"; ids read as the thing they point at. */
export const fieldLabel = (key: string) => {
  if (NAMED[key]) return NAMED[key]
  const words = key.replace(/Id$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The fields that differ between before and after, in a stable order. */
export function changes(before: Doc, after: Doc): Change[] {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter((k) => !HIDDEN.has(k)).sort()
  const out: Change[] = []
  for (const k of keys) {
    const from = show(before?.[k])
    const to = show(after?.[k])
    if (from !== to) out.push({ field: k, from, to })
  }
  return out
}

/** A short name for the record an entry is about. */
export function recordName(before: Doc, after: Doc): string {
  const doc = after ?? before ?? {}
  for (const k of ['name', 'label', 'admissionNo', 'fileName', 'user']) {
    const v = doc[k]
    if (typeof v === 'string' && v) return v
  }
  return ''
}

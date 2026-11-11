/** Where a re-exam stands, in words. */
export const STATUS: Record<string, { text: string; className: string }> = {
  draft: { text: 'Policy to approve', className: 'bg-amber-50 text-amber-800' },
  approved: { text: 'Approved, to apply', className: 'bg-sky-50 text-sky-800' },
  applied: { text: 'Counted in results', className: 'bg-emerald-50 text-emerald-700' },
}

/** How the new mark counts, in words a teacher reads. */
export const POLICIES = [
  { key: 'higher', label: 'The higher mark counts', hint: 'Part by part, the better of the two; a result never goes down.' },
  { key: 'replace', label: 'The re-exam mark replaces the original', hint: 'Part by part; a result can go down.' },
  { key: 'separate', label: 'Shown separately', hint: 'Both are kept and shown; the result stays as it was.' },
] as const

export const ABSENT_RULES = [
  { key: 'keep', label: 'Keep the original mark' },
  { key: 'pending', label: 'Leave the result pending' },
] as const

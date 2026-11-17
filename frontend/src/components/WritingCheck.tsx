import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { checkWritingDeeper } from '../api/client'
import { ApiError } from '../api/problem'
import { checkWriting } from '../lib/writing'

/**
 * Under a text box: after a pause in typing, what a quick check would
 * correct (spelling, spacing, capitals, punctuation), shown with the text
 * as it would read, to use or to keep as it is. A deeper check of grammar
 * and meaning asks the AI, when it is set up; names given in mask are
 * never sent.
 */
export function WritingCheck({ text, onUse, mask = [] }: { text: string; onUse: (t: string) => void; mask?: string[] }) {
  const [settled, setSettled] = useState(text)
  const [kept, setKept] = useState('')
  const [deep, setDeep] = useState<{ text: string; changes: string[] } | null>(null)
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(text), 800)
    return () => window.clearTimeout(id)
  }, [text])
  const quick = checkWriting(settled)
  const ask = useMutation({
    mutationFn: () => checkWritingDeeper(text, mask),
    onSuccess: (r) => setDeep(r.text.trim() === text.trim() ? { text: '', changes: [] } : r),
  })
  if (!text.trim()) return null
  const showQuick = quick.fixes.length > 0 && settled === text && kept !== text
  const reasons = [...new Set(quick.fixes.map((f) => f.why.toLowerCase()))]
  return (
    <div className="space-y-1 text-xs">
      {showQuick && (
        <div role="status" className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5">
          <p>
            <b>
              {quick.fixes.length} {quick.fixes.length === 1 ? 'suggestion' : 'suggestions'}:
            </b>{' '}
            {reasons.join(', ')}.
          </p>
          <p className="whitespace-pre-wrap text-ink">{quick.text}</p>
          <span className="flex gap-3">
            <button type="button" className="font-semibold text-brand" onClick={() => onUse(quick.text)}>
              Use this
            </button>
            <button type="button" className="font-semibold text-muted" onClick={() => setKept(text)}>
              Keep mine
            </button>
          </span>
        </div>
      )}
      {deep && deep.text && (
        <div role="status" className="space-y-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1.5">
          <p>
            <b>Grammar and meaning:</b> {deep.changes.join('; ') || 'reworded for clarity'}.
          </p>
          <p className="whitespace-pre-wrap text-ink">{deep.text}</p>
          <span className="flex gap-3">
            <button type="button" className="font-semibold text-brand" onClick={() => (onUse(deep.text), setDeep(null))}>
              Use this
            </button>
            <button type="button" className="font-semibold text-muted" onClick={() => setDeep(null)}>
              Keep mine
            </button>
          </span>
        </div>
      )}
      {deep && !deep.text && <p className="text-emerald-700">Grammar and meaning read well.</p>}
      {ask.error && <p className="text-muted">{ask.error instanceof ApiError ? ask.error.message : 'The check did not run. Try again.'}</p>}
      {!deep && (
        <button type="button" className="font-semibold text-muted hover:text-brand disabled:opacity-50" disabled={ask.isPending} onClick={() => ask.mutate()}>
          {ask.isPending ? 'Checking' : 'Check grammar and meaning'}
        </button>
      )}
    </div>
  )
}

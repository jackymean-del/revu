import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { explainResult, type ResultComponent, type StudentResult } from '../../api/client'
import { ApiError } from '../../api/problem'
import { BASIS, COMPONENT_STATE, PART_USE, POLICY, aggregateText, eventText, reasonText, type Policy } from '../../lib/results'
import { useT } from '../../lib/terminology/terms-context'
import type { TermKey } from '../../lib/terminology/terminology'
import { StateBadge } from '../Results'

const KIND_KEYS = new Set(['periodic_test', 'midterm', 'term_end'])

function ComponentBlock({ c, titles }: { c: ResultComponent; titles: Record<string, string> }) {
  const t = useT()
  return (
    <section aria-labelledby={`c-${c.code}`} className="space-y-2 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`c-${c.code}`} className="font-bold">
          {c.name} <span className="text-xs font-normal text-muted">{c.code}</span>
        </h3>
        <p className="tabular-nums">
          {c.value ? (
            <>
              <b>{c.value}</b>
              <span className="text-muted"> of {c.max}</span>
            </>
          ) : (
            <span className="text-muted">{COMPONENT_STATE[c.state]}</span>
          )}
        </p>
      </div>
      <p className="text-xs text-muted">
        {aggregateText(c.aggregate)}. If absent: {POLICY[c.onAbsent as Policy]?.toLowerCase() ?? c.onAbsent}.
        {c.exact && ` Before rounding: ${c.exact}.`}
      </p>
      {c.working && <p className="rounded bg-mist px-2 py-1 font-mono text-xs">{c.working}</p>}
      {c.events.length > 0 && (
        <table className="w-full text-xs">
          <thead className="text-left text-muted">
            <tr>
              <th scope="col" className="py-1 pr-2 font-semibold">
                Assessment
              </th>
              <th scope="col" className="py-1 pr-2 text-right font-semibold">
                Marks
              </th>
              <th scope="col" className="py-1 font-semibold">
                How it counted
              </th>
            </tr>
          </thead>
          <tbody>
            {c.events.map((e) => (
              <tr key={e.assessmentId} className="border-t border-line align-top">
                <td className="py-1 pr-2">
                  <span className="font-semibold">{e.title}</span>
                  <span className="block text-muted">
                    {KIND_KEYS.has(e.kind) ? t(`assessment.${e.kind}` as TermKey) : e.kind}
                    {e.heldOn ? `, ${e.heldOn}` : ''}
                  </span>
                  {e.parts.length > 1 && (
                    <ul className="mt-0.5 text-muted">
                      {e.parts.map((p) => (
                        <li key={p.partId}>
                          {p.name}: {p.value ?? '-'} of {p.max}, {PART_USE[p.use]}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {e.value !== undefined ? (
                    <>
                      {e.value}/{e.max} <span className="text-muted">({e.pct}%)</span>
                    </>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="py-1">{eventText(e.use, e.reason, e.carriedFrom ? titles[e.carriedFrom] : '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

/**
 * How one result was worked out (AT-P-05): the scheme and its version,
 * every assessment and mark used, each decision the scheme made, the
 * arithmetic and the rounding.
 */
export function Explain({
  orgId,
  student,
  periodId,
  subjectId,
  subjectName,
  onClose,
}: {
  orgId: string
  student: StudentResult
  periodId: string
  subjectId: string
  subjectName: string
  onClose: () => void
}) {
  const t = useT()
  const close = useRef<HTMLButtonElement>(null)
  const q = { studentId: student.studentId, periodId, subjectId }
  const explained = useQuery({ queryKey: ['explain', orgId, q, student.stale], queryFn: ({ signal }) => explainResult(orgId, q, signal) })
  useEffect(() => {
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const x = explained.data
  const d = x?.detail
  const codes = Object.fromEntries((d?.components ?? []).map((c) => [c.code, c.name]))
  const titles = Object.fromEntries((d?.components ?? []).flatMap((c) => c.events.map((e) => [e.assessmentId, e.title])))
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/30 print:static print:bg-transparent" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="explain-heading"
        className="h-full w-full max-w-xl space-y-4 overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="explain-heading" className="text-lg font-extrabold">
              How this result was worked out
            </h2>
            <p className="text-sm text-muted">
              {student.name}, {subjectName}
            </p>
          </div>
          <button ref={close} type="button" onClick={onClose} className="rounded-lg border border-line px-3 py-1 text-sm font-semibold hover:bg-mist">
            Close
          </button>
        </div>
        {explained.isPending ? (
          <p className="text-sm text-muted">Loading</p>
        ) : explained.isError ? (
          <p role="alert" className="text-sm text-red-700">
            {explained.error instanceof ApiError ? explained.error.message : 'This could not be loaded.'}
          </p>
        ) : (
          x &&
          d && (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-mist p-3">
                <StateBadge state={d.state} />
                {d.value ? (
                  <p className="text-lg tabular-nums">
                    <b>{d.value}</b> <span className="text-muted">of {d.max}</span> <span className="ml-2">{d.pct}%</span>
                    {d.grade && (
                      <span className="ml-2 font-bold">
                        {d.grade}
                        {d.gradeDescriptor && <span className="font-normal text-muted"> {d.gradeDescriptor}</span>}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-muted">No number</p>
                )}
                {d.passed !== undefined && <p className="text-sm font-semibold">{d.passed ? 'Meets the pass rule' : 'Below the pass rule'}</p>}
              </div>
              {d.reason && <p className="text-sm">{reasonText(d.reason, codes)}</p>}
              {d.basis && d.basis !== 'full' && <p className="text-sm text-muted">{BASIS[d.basis]}</p>}
              {(d.working?.length ?? 0) > 0 && (
                <section aria-labelledby="working-heading">
                  <h3 id="working-heading" className="text-sm font-bold">
                    The arithmetic
                  </h3>
                  <ol className="mt-1 space-y-0.5 rounded bg-mist p-2 font-mono text-xs">
                    {d.working!.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ol>
                </section>
              )}
              {d.components.map((c) => (
                <ComponentBlock key={c.code} c={c} titles={titles} />
              ))}
              <p className="text-xs text-muted">
                {x.scheme.name}, version {x.scheme.version}. Rounded half up to {d.rounding.places} decimal {d.rounding.places === 1 ? 'place' : 'places'}
                {d.rounding.at === 'components' ? ', each part before the total' : ', once at the end'}. Worked out {new Date(x.computedAt).toLocaleString()}.
                {x.stale && ' Marks have changed since; a fresh result follows within seconds.'} {t('person.student')} names and marks stay inside this {t('org.institution', { lower: true })}.
              </p>
            </>
          )
        )}
      </aside>
    </div>
  )
}

import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { listReexams } from '../api/client'
import { ApiError } from '../api/problem'
import { Icon } from '../components/Icon'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'
import { usePaperAssessments } from './papers/assessments'
import { ReexamDetailView } from './reexam/ReexamDetailView'
import { ReexamPlan } from './reexam/ReexamPlan'
import { STATUS } from './reexam/status'

const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600'
/**
 * Re-exam (exam step 6, B7): students picked from an assessment by rules
 * or by hand sit a re-exam, a new assessment linked to the original; their
 * marks count in results only under a policy approved and applied. The
 * original marks never change.
 */
export function Reexam() {
  const t = useT()
  const search = useSearch({ from: '/reexam' })
  const navigate = useNavigate({ from: '/reexam' })
  const { current, loading } = useOrg()
  const orgId = current?.id ?? ''
  const exams = usePaperAssessments()
  const list = useQuery({ queryKey: ['reexams', orgId], queryFn: ({ signal }) => listReexams(orgId, signal), enabled: !!orgId })

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!orgId) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })}.</p>

  if (search.id) return <ReexamDetailView orgId={orgId} id={search.id} sectionName={exams.sectionName} onBack={() => void navigate({ search: {} })} />
  if (search.plan !== undefined)
    return (
      <ReexamPlan
        orgId={orgId}
        sourceId={search.plan}
        choices={exams.choices}
        onSource={(id) => void navigate({ search: { plan: id } })}
        onMade={(id) => void navigate({ search: { id } })}
        onCancel={() => void navigate({ search: {} })}
      />
    )

  const rows = list.data ?? []
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Re-exam</h1>
          <p className="mt-1 max-w-3xl text-muted">
            Another chance for those an assessment picks out: below a percentage, in a range, absent, or chosen by hand. The re-exam is a new assessment linked to the original; its
            marks count only under the policy you approve, and the original marks never change.
          </p>
        </div>
        <button type="button" className={`${primary} flex items-center gap-2`} onClick={() => void navigate({ search: { plan: '' } })}>
          Plan a re-exam
        </button>
      </div>
      {list.isError ? (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {list.error instanceof ApiError ? list.error.message : 'The re-exams could not be loaded.'}
        </p>
      ) : list.isPending ? (
        <p className="text-sm text-muted">Loading</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center">
          <p className="font-bold">No re-exams yet</p>
          <p className="mt-1 text-sm text-muted">Start from an assessment: the rules suggest who sits it, and you can add or remove anyone with a reason.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to="/reexam" search={{ id: r.id }} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-canvas">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {r.subject}, {r.title}
                  </p>
                  <p className="text-sm text-muted">
                    {r.sectionIds.map(exams.sectionName).join(', ')} · {r.marked} of {r.sitting} marked{r.heldOn ? ` · ${r.heldOn}` : ''}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[r.status].className}`}>{STATUS[r.status].text}</span>
                <Icon name="arrow" size={15} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

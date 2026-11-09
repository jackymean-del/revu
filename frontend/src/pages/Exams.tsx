import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listAssessments, listStructure, type Assessment, type Subject, type TeachingAssignment } from '../api/client'
import { Icon } from '../components/Icon'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'
import { NewAssessment } from './marks/NewAssessment'
import { useSectionNames } from './people/sections'

const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600'

/**
 * Create exam (step 3): every assessment in one list, a new one in one
 * form, and from each, straight to entering its marks.
 */
export function Exams() {
  const t = useT()
  const qc = useQueryClient()
  const { current, loading } = useOrg()
  const orgId = current?.id ?? ''
  const roles = current?.roles ?? []
  const leads = roles.some((r) => r === 'admin' || r === 'coordinator' || r === 'principal')
  const names = useSectionNames(orgId)
  const assessments = useQuery({ queryKey: ['assessments', orgId], queryFn: ({ signal }) => listAssessments(orgId, {}, signal), enabled: !!orgId })
  const subjects = useQuery({ queryKey: ['structure', orgId, 'subjects', {}], queryFn: ({ signal }) => listStructure<Subject>(orgId, 'subjects', {}, signal), enabled: !!orgId }).data ?? []
  const mine = useQuery({
    queryKey: ['structure', orgId, 'teaching-assignments', { staffId: current?.staffId }],
    queryFn: ({ signal }) => listStructure<TeachingAssignment>(orgId, 'teaching-assignments', { staffId: current!.staffId! }, signal),
    enabled: !!orgId && !leads && !!current?.staffId,
  }).data
  const [creating, setCreating] = useState(false)
  const [made, setMade] = useState<Assessment | null>(null)

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading</p>
  if (!orgId) return <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Sign in and choose your {t('org.institution', { lower: true })}.</p>

  const latestYear = [...names.years].sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0]?.id ?? ''
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? ''
  const sectionName = (id: string) => {
    const s = names.byId(id)
    return s ? names.name(s) : ''
  }
  const mineOnly = (a: Assessment) => leads || a.sectionIds.some((s) => mine?.some((m) => m.sectionId === s && (!m.subjectId || m.subjectId === a.subjectId)))
  const list = (assessments.data ?? []).filter(mineOnly)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Assessments</h1>
          <p className="mt-1 max-w-2xl text-muted">
            Each test or exam once, for every {t('group.section', { lower: true })} that sits it. Enter one total, or marks part by part to see what to teach again.
          </p>
        </div>
        {!creating && latestYear && (
          <button type="button" className={primary} onClick={() => (setCreating(true), setMade(null))}>
            New assessment
          </button>
        )}
      </div>

      {!latestYear && (
        <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted">
          Add the {t('period.year', { lower: true })}, its {t('period.term', { count: 2, lower: true })} and {t('group.section', { count: 2, lower: true })} in Resources first.
        </p>
      )}

      {creating && (
        <NewAssessment
          orgId={orgId}
          yearId={latestYear}
          onCancel={() => setCreating(false)}
          onMade={(a) => {
            setCreating(false)
            setMade(a)
            void qc.invalidateQueries({ queryKey: ['assessments', orgId] })
            void qc.invalidateQueries({ queryKey: ['setup', orgId] })
          }}
        />
      )}

      {made && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-mist p-4">
          <Icon name="check" className="text-brand" />
          <p className="flex-1 text-sm">
            <b>{made.title}</b> is ready.
          </p>
          <Link to="/marks" search={{ a: `${made.id}/${made.sectionIds[0]}` }} className={`${primary} flex items-center gap-2`}>
            Enter its marks now
            <Icon name="arrow" size={16} />
          </Link>
        </div>
      )}

      {assessments.isPending ? (
        <p className="text-sm text-muted">Loading</p>
      ) : list.length === 0 ? (
        !creating &&
        latestYear && (
          <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center">
            <p className="font-bold">No assessments yet</p>
            <p className="mt-1 text-sm text-muted">Create the first one; it takes a minute.</p>
            <button type="button" className={`${primary} mt-4`} onClick={() => setCreating(true)}>
              New assessment
            </button>
          </div>
        )
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {list.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {subjectName(a.subjectId)}, {a.title}
                </p>
                <p className="text-sm text-muted">
                  {a.sectionIds.map(sectionName).join(', ')} &middot; {a.entryMode === 'sections' ? `${a.parts.filter((p) => p.kind === 'main').length} parts` : 'one total'}
                  {a.heldOn ? ` · ${a.heldOn}` : ''}
                </p>
              </div>
              {a.status === 'locked' && <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold text-muted">Locked</span>}
              <Link
                to="/marks"
                search={{ a: `${a.id}/${a.sectionIds[0]}` }}
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist"
              >
                {a.status === 'locked' ? 'See marks' : 'Enter marks'}
                <Icon name="arrow" size={15} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

import { useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listStructure, type Branch, type Level, type Section, type Staff, type StructurePath, type Subject, type SubjectGroup, type Year } from '../api/client'
import { EditableList, type Col, type Option } from '../components/EditableList'
import { useOrg } from '../lib/org-context'
import { withArticle } from '../lib/terminology/terminology'
import { useT } from '../lib/terminology/terms-context'

type Tab = 'years' | 'levels' | 'subjects' | 'teaching' | 'branches'

/** Live items of one structure resource, for choosing in a select. */
function useChoices<T>(orgId: string | undefined, path: StructurePath, params: Record<string, string> = {}) {
  return useQuery({
    queryKey: ['structure', orgId, path, params],
    queryFn: ({ signal }) => listStructure<T>(orgId!, path, params, signal),
    enabled: !!orgId,
  }).data ?? []
}

function Picker({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-line bg-white px-2 py-1.5 font-normal">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Block({ title, children, tools }: { title: string; children: React.ReactNode; tools?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-extrabold">{title}</h2>
        {tools}
      </div>
      {children}
    </section>
  )
}

/** Settings: years, periods, levels, sections, subjects and who teaches what. */
export function Structure() {
  const t = useT()
  const { current, loading } = useOrg()
  const orgId = current?.id
  const canEdit = !!current?.roles.includes('admin')
  // Each way in starts on its own tab: grades and sections, years and terms, or subjects.
  const path = useRouterState({ select: (s) => s.location.pathname })
  const [tab, setTab] = useState<Tab>(path.endsWith('/subjects') ? 'subjects' : path.endsWith('/years') ? 'years' : 'levels')

  const years = useChoices<Year>(orgId, 'years')
  const levels = useChoices<Level>(orgId, 'levels')
  const branches = useChoices<Branch>(orgId, 'branches')
  const subjects = useChoices<Subject>(orgId, 'subjects')
  const [yearPick, setYear] = useState('')
  const [levelPick, setLevel] = useState('')
  const [sectionPick, setSection] = useState('')
  const yearId = yearPick || years[0]?.id || ''
  const levelId = levelPick || levels[0]?.id || ''
  const sections = useChoices<Section>(orgId, 'sections', yearId ? { yearId } : {})
  const sectionId = sections.some((s) => s.id === sectionPick) ? sectionPick : sections[0]?.id || ''
  const staff = useChoices<Staff>(orgId, 'staff')
  const groups = useChoices<SubjectGroup>(orgId, 'subject-groups', levelId ? { levelId } : {})
  const [groupPick, setGroup] = useState('')
  const groupId = groups.some((g) => g.id === groupPick) ? groupPick : groups[0]?.id || ''

  if (loading) return <p className="mx-auto max-w-5xl px-4 py-10 text-muted">Loading</p>
  if (!orgId)
    return (
      <p className="mx-auto max-w-5xl px-4 py-10 text-muted">
        Sign in and choose your {t('org.institution', { lower: true })} to see its structure.
      </p>
    )

  const yearOptions = years.map((y) => ({ value: y.id, label: y.label }))
  const levelOptions = levels.map((l) => ({ value: l.id, label: l.name }))
  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }))
  const subjectOptions = subjects.map((s) => ({ value: s.id, label: s.name }))
  const levelName = (id: string) => levels.find((l) => l.id === id)?.name ?? ''
  const sectionOptions = sections.map((s) => ({ value: s.id, label: `${levelName(s.levelId)} ${s.name}`.trim() }))

  const tabs: { id: Tab; label: string }[] = [
    { id: 'years', label: `${t('period.year', { count: 2 })} and ${t('period.term', { count: 2, lower: true })}` },
    { id: 'levels', label: `${t('group.level', { count: 2 })} and ${t('group.section', { count: 2, lower: true })}` },
    { id: 'subjects', label: t('course.subject', { count: 2 }) },
    { id: 'teaching', label: 'Who teaches what' },
    { id: 'branches', label: t('org.branch', { count: 2 }) },
  ]

  const nameCol = (max = '40%'): Col => ({ key: 'name', label: 'Name', kind: 'text', required: true, width: max })
  const noYears = <p className="text-sm text-muted">Add {withArticle(t('period.year', { lower: true }))} first.</p>

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-subtle">Settings</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Structure</h1>
      <p className="mt-2 max-w-2xl text-muted">How your {t('org.institution', { lower: true })} is organised. Removing something can always be undone.</p>
      {!canEdit && <p className="mt-2 text-sm text-muted">Only an administrator can change the structure.</p>}

      <div role="tablist" aria-label="Structure" className="mt-6 flex flex-wrap gap-1 border-b border-line">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === x.id ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-6 space-y-8">
        {tab === 'years' && (
          <>
            <Block title={t('period.year', { count: 2 })}>
              <EditableList
                orgId={orgId}
                path="years"
                canEdit={canEdit}
                noun={t('period.year', { lower: true })}
                empty={`No ${t('period.year', { count: 2, lower: true })} yet.`}
                cols={[
                  { key: 'label', label: 'Label', kind: 'text', required: true, width: '30%' },
                  { key: 'startsOn', label: 'Starts', kind: 'date', required: true },
                  { key: 'endsOn', label: 'Ends', kind: 'date', required: true },
                ]}
              />
            </Block>
            <Block title={t('period.term', { count: 2 })} tools={yearOptions.length > 0 && <Picker label={t('period.year')} value={yearId} options={yearOptions} onChange={setYear} />}>
              {yearId ? (
                <EditableList
                  key={yearId}
                  orgId={orgId}
                  path="periods"
                  scope={{ yearId }}
                  canEdit={canEdit}
                  noun={t('period.term', { lower: true })}
                  empty={`No ${t('period.term', { count: 2, lower: true })} in this ${t('period.year', { lower: true })} yet.`}
                  cols={[
                    { key: 'seq', label: 'Order', kind: 'number', required: true, width: '5rem' },
                    nameCol('30%'),
                    { key: 'startsOn', label: 'Starts', kind: 'date', required: true },
                    { key: 'endsOn', label: 'Ends', kind: 'date', required: true },
                  ]}
                />
              ) : (
                noYears
              )}
            </Block>
          </>
        )}

        {tab === 'levels' && (
          <>
            <Block title={t('group.level', { count: 2 })}>
              <EditableList
                orgId={orgId}
                path="levels"
                canEdit={canEdit}
                noun={t('group.level', { lower: true })}
                empty={`No ${t('group.level', { count: 2, lower: true })} yet.`}
                cols={[{ key: 'seq', label: 'Order', kind: 'number', required: true, width: '5rem' }, nameCol(), { key: 'stage', label: 'Stage', kind: 'text' }]}
              />
            </Block>
            <Block title={t('group.section', { count: 2 })} tools={yearOptions.length > 0 && <Picker label={t('period.year')} value={yearId} options={yearOptions} onChange={setYear} />}>
              {yearId ? (
                <EditableList
                  key={yearId}
                  orgId={orgId}
                  path="sections"
                  scope={{ yearId }}
                  canEdit={canEdit}
                  noun={t('group.section', { lower: true })}
                  empty={`No ${t('group.section', { count: 2, lower: true })} in this ${t('period.year', { lower: true })} yet.`}
                  cols={[
                    { key: 'levelId', label: t('group.level'), kind: 'select', required: true, options: levelOptions },
                    nameCol('25%'),
                    { key: 'branchId', label: t('org.branch'), kind: 'select', required: true, options: branchOptions },
                  ]}
                />
              ) : (
                noYears
              )}
            </Block>
          </>
        )}

        {tab === 'subjects' && (
          <>
            <Block title={t('course.subject', { count: 2 })}>
              <EditableList
                orgId={orgId}
                path="subjects"
                canEdit={canEdit}
                noun={t('course.subject', { lower: true })}
                empty={`No ${t('course.subject', { count: 2, lower: true })} yet.`}
                cols={[
                  nameCol(),
                  { key: 'code', label: 'Code', kind: 'text', width: '8rem' },
                  {
                    key: 'kind',
                    label: 'Type',
                    kind: 'select',
                    required: true,
                    options: [
                      { value: 'academic', label: 'Academic' },
                      { value: 'co_curricular', label: 'Co-curricular' },
                    ],
                  },
                ]}
              />
            </Block>
            <Block
              title={`${t('course.subject', { count: 2 })} of each ${t('group.level', { lower: true })}`}
              tools={levelOptions.length > 0 && <Picker label={t('group.level')} value={levelId} options={levelOptions} onChange={setLevel} />}
            >
              {levelId ? (
                <EditableList
                  key={levelId}
                  orgId={orgId}
                  path="level-subjects"
                  scope={{ levelId }}
                  canEdit={canEdit}
                  noun={t('course.subject', { lower: true })}
                  empty={`No ${t('course.subject', { count: 2, lower: true })} for this ${t('group.level', { lower: true })} yet.`}
                  cols={[
                    { key: 'subjectId', label: t('course.subject'), kind: 'select', required: true, options: subjectOptions },
                    { key: 'optional', label: 'Elective', kind: 'checkbox', show: (i) => (i.optional ? 'Elective' : 'Everyone') },
                    { key: 'applicability', label: 'Who takes it', kind: 'text', readOnly: true, show: (i) => (i.applicability === 'selected' ? 'Those who choose it' : 'Everyone') },
                  ]}
                />
              ) : (
                <p className="text-sm text-muted">Add {withArticle(t('group.level', { lower: true }))} first.</p>
              )}
            </Block>
            {levelId && (
              <Block title={`${t('course.subject')} groups of this ${t('group.level', { lower: true })}`}>
                <p className="max-w-2xl text-sm text-muted">
                  A group such as Second language holds the options a {t('person.student', { lower: true })} chooses from. A {t('course.subject', { lower: true })} in no
                  group is taken by everyone.
                </p>
                <EditableList
                  key={`groups-${levelId}`}
                  orgId={orgId}
                  path="subject-groups"
                  scope={{ levelId }}
                  canEdit={canEdit}
                  noun={`${t('course.subject', { lower: true })} group`}
                  empty={`No ${t('course.subject', { lower: true })} groups for this ${t('group.level', { lower: true })}.`}
                  cols={[
                    nameCol('30%'),
                    {
                      key: 'rule',
                      label: 'Rule',
                      kind: 'select',
                      required: true,
                      options: [
                        { value: 'exactly_one', label: 'Exactly one' },
                        { value: 'at_most_one', label: 'At most one' },
                        { value: 'range', label: 'A range' },
                      ],
                    },
                    { key: 'minChoices', label: 'At least', kind: 'number', width: '6rem' },
                    { key: 'maxChoices', label: 'At most', kind: 'number', width: '6rem' },
                  ]}
                />
                {groupId && (
                  <div className="space-y-2 pt-2">
                    <Picker label="Options of" value={groupId} options={groups.map((g) => ({ value: g.id, label: g.name }))} onChange={setGroup} />
                    <EditableList
                      key={`options-${groupId}`}
                      orgId={orgId}
                      path="subject-group-options"
                      scope={{ groupId }}
                      canEdit={canEdit}
                      noun="option"
                      empty="No options yet."
                      cols={[{ key: 'subjectId', label: t('course.subject'), kind: 'select', required: true, options: subjectOptions }]}
                    />
                  </div>
                )}
              </Block>
            )}
          </>
        )}

        {tab === 'teaching' && (
          <Block
            title="Who teaches what"
            tools={
              <div className="flex flex-wrap gap-3">
                {yearOptions.length > 0 && <Picker label={t('period.year')} value={yearId} options={yearOptions} onChange={setYear} />}
                {sectionOptions.length > 0 && <Picker label={t('group.section')} value={sectionId} options={sectionOptions} onChange={setSection} />}
              </div>
            }
          >
            {sectionId ? (
              <EditableList
                key={sectionId}
                orgId={orgId}
                path="teaching-assignments"
                scope={{ sectionId }}
                canEdit={canEdit}
                noun="assignment"
                empty={`No one assigned to this ${t('group.section', { lower: true })} yet.`}
                cols={[
                  { key: 'staffId', label: t('person.teacher'), kind: 'select', required: true, options: staff.map((s) => ({ value: s.id, label: s.name })) },
                  { key: 'subjectId', label: t('course.subject'), kind: 'select', options: [{ value: '', label: t('person.class_teacher') }, ...subjectOptions] },
                ]}
              />
            ) : (
              <p className="text-sm text-muted">Add {withArticle(t('group.section', { lower: true }))} first.</p>
            )}
          </Block>
        )}

        {tab === 'branches' && (
          <Block title={t('org.branch', { count: 2 })}>
            <EditableList
              orgId={orgId}
              path="branches"
              canEdit={canEdit}
              noun={t('org.branch', { lower: true })}
              empty={`No ${t('org.branch', { count: 2, lower: true })} yet.`}
              cols={[nameCol(), { key: 'address', label: 'Address', kind: 'text' }]}
            />
          </Block>
        )}
      </div>
    </div>
  )
}

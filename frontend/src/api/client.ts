import type { components } from './schema.gen'
import { toApiError } from './problem'

export type Health = components['schemas']['Health']
export type Me = components['schemas']['Me']
export type MyOrg = components['schemas']['MyOrg']
export type TerminologyDoc = components['schemas']['Terminology']

/** Base URL of the API. Empty in development, where Vite proxies /api and /v1. */
const BASE = import.meta.env.VITE_API_URL ?? ''

/** Supplies the signed-in session token; set by the sign-in provider. */
let tokenGetter: (() => Promise<string | null>) | null = null
export const setTokenGetter = (get: (() => Promise<string | null>) | null) => {
  tokenGetter = get
}

/**
 * The role an administrator is previewing, sent with every call inside the
 * institution. The server narrows the request to that role and refuses any
 * change, so the preview shows exactly what the role would see.
 */
let previewRole: string | null = null
export const setPreviewRole = (role: string | null) => {
  previewRole = role
}

type Options = { signal?: AbortSignal; orgId?: string; method?: string; body?: unknown; form?: FormData }

/** Calls the API; a non-2xx answer throws an ApiError. */
async function call<T>(path: string, { signal, orgId, method = 'GET', body, form }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = tokenGetter ? await tokenGetter() : null
  if (token) headers.Authorization = `Bearer ${token}`
  if (orgId) headers['X-Org-Id'] = orgId
  if (orgId && previewRole) headers['X-View-As'] = previewRole
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(BASE + path, { signal, method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) })
  if (!res.ok) throw await toApiError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const getHealth = (signal?: AbortSignal) => call<Health>('/api/health', { signal })

export const getMe = (signal?: AbortSignal) => call<Me>('/v1/me', { signal })

export const getTerminology = (orgId: string, signal?: AbortSignal) => call<TerminologyDoc>('/v1/terminology', { orgId, signal })

export const putTerminology = (orgId: string, body: TerminologyDoc) =>
  call<TerminologyDoc>('/v1/terminology', { orgId, method: 'PUT', body })

export type Branch = components['schemas']['Branch']
export type Year = components['schemas']['Year']
export type Level = components['schemas']['Level']
export type Section = components['schemas']['Section']
export type Subject = components['schemas']['Subject']
export type TeachingAssignment = components['schemas']['TeachingAssignment']
export type Staff = components['schemas']['Staff']
export type Student = components['schemas']['Student']
export type StudentPage = components['schemas']['StudentPage']
export type ImportPreview = components['schemas']['ImportPreview']
export type ImportJob = components['schemas']['ImportJob']
export type PromotionPreview = components['schemas']['PromotionPreview']

/** Records with the shared operations: list, create, change, remove, restore (memberships: no restore). */
export type StructurePath =
  | 'branches'
  | 'years'
  | 'periods'
  | 'levels'
  | 'sections'
  | 'subjects'
  | 'level-subjects'
  | 'teaching-assignments'
  | 'staff'
  | 'guardians'
  | 'enrolments'
  | 'memberships'
  | 'students'
  | 'subject-groups'
  | 'subject-group-options'

export const listStructure = <T>(orgId: string, path: StructurePath, params: Record<string, string>, signal?: AbortSignal) =>
  call<T[]>(`/v1/${path}?${new URLSearchParams(params)}`, { orgId, signal })

export const createStructure = (orgId: string, path: StructurePath, body: unknown) => call<unknown>(`/v1/${path}`, { orgId, method: 'POST', body })

export const updateStructure = (orgId: string, path: StructurePath, id: string, body: unknown) =>
  call<unknown>(`/v1/${path}/${id}`, { orgId, method: 'PUT', body })

export const removeStructure = (orgId: string, path: StructurePath, id: string) => call<void>(`/v1/${path}/${id}`, { orgId, method: 'DELETE' })

export const restoreStructure = (orgId: string, path: StructurePath, id: string) =>
  call<unknown>(`/v1/${path}/${id}/restore`, { orgId, method: 'POST' })

export const listStudents = (orgId: string, params: Record<string, string>, signal?: AbortSignal) =>
  call<StudentPage>(`/v1/students?${new URLSearchParams(params)}`, { orgId, signal })

/** Checks a class list; nothing changes until the import is applied. */
export async function previewImport(orgId: string, file: File, sectionId: string): Promise<ImportPreview> {
  const form = new FormData()
  form.append('file', file)
  if (sectionId) form.append('sectionId', sectionId)
  return call<ImportPreview>('/v1/students/import', { orgId, method: 'POST', form })
}

export const applyImport = (orgId: string, id: string) => call<ImportJob>(`/v1/import-jobs/${id}/apply`, { orgId, method: 'POST' })

export const listImportJobs = (orgId: string, signal?: AbortSignal) => call<ImportJob[]>('/v1/import-jobs', { orgId, signal })

export const previewPromotion = (orgId: string, fromYearId: string, toYearId: string) =>
  call<PromotionPreview>('/v1/enrolments/promote', { orgId, method: 'POST', body: { fromYearId, toYearId } })

/** Downloads a file the API serves to signed-in people, under the given name. */
export async function download(orgId: string, path: string, filename: string) {
  const headers: Record<string, string> = { 'X-Org-Id': orgId }
  if (previewRole) headers['X-View-As'] = previewRole
  const token = tokenGetter ? await tokenGetter() : null
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(BASE + path, { headers })
  if (!res.ok) throw await toApiError(res)
  saveBlob(await res.blob(), filename)
}

/** Hands a file made in the browser to the person, for example a template. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type AuditPage = components['schemas']['AuditPage']
export type AuditFacets = components['schemas']['AuditFacets']

export const listAudit = (orgId: string, params: Record<string, string>, signal?: AbortSignal) =>
  call<AuditPage>(`/v1/audit?${new URLSearchParams(params)}`, { orgId, signal })

export const auditFacets = (orgId: string, signal?: AbortSignal) => call<AuditFacets>('/v1/audit/facets', { orgId, signal })

export type SetupStatus = components['schemas']['SetupStatus']
export type Invitation = components['schemas']['Invitation']
export type InvitationInput = components['schemas']['InvitationInput']

export const getSetup = (orgId: string, signal?: AbortSignal) => call<SetupStatus>('/v1/setup', { orgId, signal })

export const completeSetup = (orgId: string) => call<SetupStatus>('/v1/setup/complete', { orgId, method: 'POST' })

export const listInvitations = (orgId: string, signal?: AbortSignal) => call<Invitation[]>('/v1/invitations', { orgId, signal })

export const createInvitation = (orgId: string, body: InvitationInput) => call<Invitation>('/v1/invitations', { orgId, method: 'POST', body })

export const revokeInvitation = (orgId: string, id: string) => call<void>(`/v1/invitations/${id}`, { orgId, method: 'DELETE' })

export type Dashboard = components['schemas']['Dashboard']
export type Tile = components['schemas']['Tile']
export type DashboardList = components['schemas']['DashboardList']

export const getDashboard = (orgId: string, signal?: AbortSignal) => call<Dashboard>('/v1/dashboard', { orgId, signal })

export const getDashboardList = (orgId: string, key: string, signal?: AbortSignal) =>
  call<DashboardList>(`/v1/dashboard/${encodeURIComponent(key)}`, { orgId, signal })

export type SubjectGroup = components['schemas']['SubjectGroup']
export type SubjectChoice = components['schemas']['SubjectChoice']
export type ChoiceResult = components['schemas']['ChoiceResult']
export type ChoiceImportReport = components['schemas']['ChoiceImportReport']
export type ChoiceCompleteness = components['schemas']['ChoiceCompleteness']

export const listSubjectChoices = (orgId: string, sectionId: string, on: string, signal?: AbortSignal) =>
  call<SubjectChoice[]>(`/v1/subject-choices?${new URLSearchParams({ sectionId, ...(on ? { on } : {}) })}`, { orgId, signal })

export const getChoiceCompleteness = (orgId: string, sectionId: string, on: string, signal?: AbortSignal) =>
  call<ChoiceCompleteness>(`/v1/sections/${sectionId}/choice-completeness?${new URLSearchParams(on ? { on } : {})}`, { orgId, signal })

export const assignSubjectChoices = (orgId: string, body: components['schemas']['SubjectChoiceInput']) =>
  call<ChoiceResult>('/v1/subject-choices', { orgId, method: 'POST', body })

export const endSubjectChoice = (orgId: string, id: string, on: string) =>
  call<void>(`/v1/subject-choices/${id}?${new URLSearchParams(on ? { on } : {})}`, { orgId, method: 'DELETE' })

export const copySubjectChoices = (orgId: string, sectionId: string) => call<ChoiceResult>('/v1/subject-choices/copy', { orgId, method: 'POST', body: { sectionId } })

/** Reads choices from a file; nothing changes unless apply is true. */
export async function importSubjectChoices(orgId: string, file: File, apply: boolean): Promise<ChoiceImportReport> {
  const form = new FormData()
  form.append('file', file)
  if (apply) form.append('apply', 'true')
  return call<ChoiceImportReport>('/v1/subject-choices/import', { orgId, method: 'POST', form })
}

export type Assessment = components['schemas']['Assessment']
export type AssessmentInput = components['schemas']['AssessmentInput']
export type MarksGridData = components['schemas']['MarksGrid']
export type GridCellData = components['schemas']['GridCell']
export type EvidenceOp = components['schemas']['EvidenceOp']
export type OpResult = components['schemas']['OpResult']
export type BulkInput = components['schemas']['BulkInput']
export type BulkResult = components['schemas']['BulkResult']
export type BulkWrite = components['schemas']['BulkWrite']
export type UndoResult = components['schemas']['UndoResult']
export type Layout = components['schemas']['Layout']
export type LayoutInput = components['schemas']['LayoutInput']
export type TableText = components['schemas']['TableText']
export type ParticipationInput = components['schemas']['ParticipationInput']
export type Period = components['schemas']['Period']

export const listAssessments = (orgId: string, params: Record<string, string>, signal?: AbortSignal) =>
  call<Assessment[]>(`/v1/assessments?${new URLSearchParams(params)}`, { orgId, signal })

export const createAssessment = (orgId: string, body: AssessmentInput) => call<Assessment>('/v1/assessments', { orgId, method: 'POST', body })

export const lockAssessment = (orgId: string, id: string) => call<Assessment>(`/v1/assessments/${id}/lock`, { orgId, method: 'POST' })

export const unlockAssessment = (orgId: string, id: string, reason: string) =>
  call<Assessment>(`/v1/assessments/${id}/unlock`, { orgId, method: 'POST', body: { reason } })

export const getMarksGrid = (orgId: string, id: string, sectionId: string, signal?: AbortSignal) =>
  call<MarksGridData>(`/v1/assessments/${id}/grid?${new URLSearchParams({ sectionId })}`, { orgId, signal })

export const setParticipation = (orgId: string, id: string, studentId: string, body: ParticipationInput) =>
  call<unknown>(`/v1/assessments/${id}/participation/${studentId}`, { orgId, method: 'PUT', body })

export const syncEvidence = (orgId: string, deviceId: string, ops: EvidenceOp[]) =>
  call<{ results: OpResult[] }>('/v1/sync/evidence', { orgId, method: 'POST', body: { deviceId, ops } })

export const applyBulk = (orgId: string, id: string, body: BulkInput) => call<BulkResult>(`/v1/assessments/${id}/bulk`, { orgId, method: 'POST', body })

export const listBulkWrites = (orgId: string, id: string, sectionId: string, signal?: AbortSignal) =>
  call<BulkWrite[]>(`/v1/assessments/${id}/bulk-writes?${new URLSearchParams({ sectionId })}`, { orgId, signal })

export const undoBulk = (orgId: string, id: string) => call<UndoResult>(`/v1/bulk-writes/${id}/undo`, { orgId, method: 'POST' })

export const marksTemplate = (orgId: string, id: string, sectionId: string, columns: string[], filename: string) =>
  download(orgId, `/v1/assessments/${id}/template.xlsx?${new URLSearchParams({ sectionId, columns: columns.join(',') })}`, filename)

/** Reads an uploaded spreadsheet as text for a preview; nothing is stored. */
export async function readTable(orgId: string, file: File): Promise<TableText> {
  const form = new FormData()
  form.append('file', file)
  return call<TableText>('/v1/tables/read', { orgId, method: 'POST', form })
}

export const resolveLayout = (orgId: string, scopeId: string, signal?: AbortSignal) =>
  call<Layout>(`/v1/layouts/resolve?${new URLSearchParams({ surface: 'entry_grid', scopeId })}`, { orgId, signal })

export const saveLayout = (orgId: string, body: LayoutInput) => call<Layout>('/v1/layouts/mine', { orgId, method: 'PUT', body })

export type OwnerOrg = components['schemas']['OwnerOrg']
export type OwnerOrgInput = components['schemas']['OwnerOrgInput']
export type OwnerGroup = components['schemas']['OwnerGroup']
export type MyGroup = components['schemas']['MyGroup']

export const listOwnerOrgs = (signal?: AbortSignal) => call<OwnerOrg[]>('/v1/owner/orgs', { signal })

export const createOwnerOrg = (body: OwnerOrgInput) => call<components['schemas']['OwnerOrgCreated']>('/v1/owner/orgs', { method: 'POST', body })

export const listOwnerGroups = (signal?: AbortSignal) => call<OwnerGroup[]>('/v1/owner/groups', { signal })

export const createOwnerGroup = (name: string) => call<OwnerGroup>('/v1/owner/groups', { method: 'POST', body: { name } })

export const setGroupMember = (groupId: string, orgId: string, member: boolean) =>
  call<OwnerGroup>(`/v1/owner/groups/${groupId}/members/${orgId}`, { method: member ? 'PUT' : 'DELETE' })

export const addGroupAdmin = (groupId: string, email: string) => call<OwnerGroup>(`/v1/owner/groups/${groupId}/admins`, { method: 'POST', body: { email } })

export const removeGroupAdmin = (groupId: string, email: string) =>
  call<OwnerGroup>(`/v1/owner/groups/${groupId}/admins?${new URLSearchParams({ email })}`, { method: 'DELETE' })

export const createOwnerDemo = () => call<OwnerGroup>('/v1/owner/demo', { method: 'POST' })

export const listMyGroups = (signal?: AbortSignal) => call<MyGroup[]>('/v1/groups', { signal })

export const getAccessMatrix = (signal?: AbortSignal) => call<components['schemas']['AccessMatrix']>('/v1/owner/access', { signal })

export type SchemeSummary = components['schemas']['SchemeSummary']
export type Scheme = components['schemas']['Scheme']
export type SchemeDefinition = components['schemas']['SchemeDefinition']
export type SchemeComponent = components['schemas']['SchemeComponent']
export type SchemeBand = components['schemas']['SchemeBand']
export type SchemePack = components['schemas']['SchemePack']
export type SchemeAssignment = components['schemas']['SchemeAssignment']
export type SchemeAssignmentInput = components['schemas']['SchemeAssignmentInput']
export type DryRun = components['schemas']['DryRun']
export type SectionResults = components['schemas']['SectionResults']
export type StudentResult = components['schemas']['StudentResult']
export type ResultExplanation = components['schemas']['ResultExplanation']
export type ResultDetail = components['schemas']['ResultDetail']
export type ResultComponent = components['schemas']['ResultComponent']
export type ResultEvent = components['schemas']['ResultEvent']

export const listSchemes = (orgId: string, signal?: AbortSignal) => call<SchemeSummary[]>('/v1/schemes', { orgId, signal })

export const getScheme = (orgId: string, id: string, signal?: AbortSignal) => call<Scheme>(`/v1/schemes/${id}`, { orgId, signal })

export const createScheme = (orgId: string, name: string, definition: SchemeDefinition) =>
  call<Scheme>('/v1/schemes', { orgId, method: 'POST', body: { name, definition } })

export const updateScheme = (orgId: string, id: string, name: string, definition: SchemeDefinition) =>
  call<Scheme>(`/v1/schemes/${id}`, { orgId, method: 'PUT', body: { name, definition } })

export const deleteScheme = (orgId: string, id: string) => call<void>(`/v1/schemes/${id}`, { orgId, method: 'DELETE' })

export const publishScheme = (orgId: string, id: string) =>
  call<components['schemas']['SchemeChange']>(`/v1/schemes/${id}/publish`, { orgId, method: 'POST' })

export const newSchemeVersion = (orgId: string, id: string) => call<Scheme>(`/v1/schemes/${id}/versions`, { orgId, method: 'POST' })

export const dryRunScheme = (orgId: string, id: string, body: components['schemas']['DryRunInput']) =>
  call<DryRun>(`/v1/schemes/${id}/dry-run`, { orgId, method: 'POST', body })

export const listSchemePacks = (orgId: string, signal?: AbortSignal) => call<SchemePack[]>('/v1/scheme-packs', { orgId, signal })

export const importSchemePack = (orgId: string, key: string) =>
  call<components['schemas']['SchemeImport']>(`/v1/scheme-packs/${encodeURIComponent(key)}/import`, { orgId, method: 'POST' })

export const listSchemeAssignments = (orgId: string, signal?: AbortSignal) => call<SchemeAssignment[]>('/v1/scheme-assignments', { orgId, signal })

export const assignScheme = (orgId: string, body: SchemeAssignmentInput) =>
  call<components['schemas']['SchemeAssignmentChange']>('/v1/scheme-assignments', { orgId, method: 'POST', body })

export const unassignScheme = (orgId: string, id: string) => call<void>(`/v1/scheme-assignments/${id}`, { orgId, method: 'DELETE' })

export const getSectionResults = (orgId: string, q: { sectionId: string; periodId: string; subjectId: string }, signal?: AbortSignal) =>
  call<SectionResults>(`/v1/results?${new URLSearchParams(q)}`, { orgId, signal })

export const explainResult = (orgId: string, q: { studentId: string; periodId: string; subjectId: string }, signal?: AbortSignal) =>
  call<ResultExplanation>(`/v1/results/explain?${new URLSearchParams(q)}`, { orgId, signal })

export const recomputeResults = (orgId: string, body: components['schemas']['RecomputeInput']) =>
  call<components['schemas']['RecomputeDone']>('/v1/results/recompute', { orgId, method: 'POST', body })

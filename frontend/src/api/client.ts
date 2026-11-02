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

type Options = { signal?: AbortSignal; orgId?: string; method?: string; body?: unknown; form?: FormData }

/** Calls the API; a non-2xx answer throws an ApiError. */
async function call<T>(path: string, { signal, orgId, method = 'GET', body, form }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = tokenGetter ? await tokenGetter() : null
  if (token) headers.Authorization = `Bearer ${token}`
  if (orgId) headers['X-Org-Id'] = orgId
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

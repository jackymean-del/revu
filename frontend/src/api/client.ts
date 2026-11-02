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

type Options = { signal?: AbortSignal; orgId?: string; method?: string; body?: unknown }

/** Calls the API; a non-2xx answer throws an ApiError. */
async function call<T>(path: string, { signal, orgId, method = 'GET', body }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = tokenGetter ? await tokenGetter() : null
  if (token) headers.Authorization = `Bearer ${token}`
  if (orgId) headers['X-Org-Id'] = orgId
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(BASE + path, { signal, method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
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
export type StaffSummary = components['schemas']['StaffSummary']

/** Structure resources share five operations (contracts/openapi.yaml, tag structure). */
export type StructurePath = 'branches' | 'years' | 'periods' | 'levels' | 'sections' | 'subjects' | 'level-subjects' | 'teaching-assignments'

export const listStructure = <T>(orgId: string, path: StructurePath, params: Record<string, string>, signal?: AbortSignal) =>
  call<T[]>(`/v1/${path}?${new URLSearchParams(params)}`, { orgId, signal })

export const createStructure = (orgId: string, path: StructurePath, body: unknown) => call<unknown>(`/v1/${path}`, { orgId, method: 'POST', body })

export const updateStructure = (orgId: string, path: StructurePath, id: string, body: unknown) =>
  call<unknown>(`/v1/${path}/${id}`, { orgId, method: 'PUT', body })

export const removeStructure = (orgId: string, path: StructurePath, id: string) => call<void>(`/v1/${path}/${id}`, { orgId, method: 'DELETE' })

export const restoreStructure = (orgId: string, path: StructurePath, id: string) =>
  call<unknown>(`/v1/${path}/${id}/restore`, { orgId, method: 'POST' })

export const listStaff = (orgId: string, signal?: AbortSignal) => call<StaffSummary[]>('/v1/staff', { orgId, signal })

import type { components } from './schema.gen'
import { toApiError } from './problem'

export type Health = components['schemas']['Health']
export type MyOrg = components['schemas']['MyOrg']
export type TerminologyDoc = components['schemas']['Terminology']

/** Base URL of the API. Empty in development, where Vite proxies /api and /v1. */
const BASE = import.meta.env.VITE_API_URL ?? ''

type Options = { signal?: AbortSignal; orgId?: string; method?: string; body?: unknown }

/** Calls the API; a non-2xx answer throws an ApiError. */
async function call<T>(path: string, { signal, orgId, method = 'GET', body }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (orgId) headers['X-Org-Id'] = orgId
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(BASE + path, { signal, method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  if (!res.ok) throw await toApiError(res)
  return (await res.json()) as T
}

export const getHealth = (signal?: AbortSignal) => call<Health>('/api/health', { signal })

export const listMyOrgs = (signal?: AbortSignal) => call<MyOrg[]>('/v1/me/orgs', { signal })

export const getTerminology = (orgId: string, signal?: AbortSignal) => call<TerminologyDoc>('/v1/terminology', { orgId, signal })

export const putTerminology = (orgId: string, body: TerminologyDoc) =>
  call<TerminologyDoc>('/v1/terminology', { orgId, method: 'PUT', body })

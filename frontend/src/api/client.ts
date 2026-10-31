import type { components } from './schema.gen'
import { toApiError } from './problem'

export type Health = components['schemas']['Health']

/** Base URL of the API. Empty in development, where Vite proxies /api. */
const BASE = import.meta.env.VITE_API_URL ?? ''

/** GET a JSON resource; a non-2xx answer throws an ApiError. */
async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(BASE + path, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw await toApiError(res)
  return (await res.json()) as T
}

export const getHealth = (signal?: AbortSignal) => get<Health>('/api/health', signal)

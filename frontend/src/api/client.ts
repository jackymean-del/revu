import type { components } from './schema.gen'

export type Health = components['schemas']['Health']

/** Base URL of the API. Empty in development, where Vite proxies /api. */
const BASE = import.meta.env.VITE_API_URL ?? ''

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const res = await fetch(`${BASE}/api/health`, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Server answered ${res.status}`)
  return (await res.json()) as Health
}

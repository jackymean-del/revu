import { useSyncExternalStore } from 'react'

/**
 * The academic year the whole app shows, chosen once at the top and kept
 * on this device for each institution. Empty means the latest year.
 */
const key = (orgId: string) => `revu.year.${orgId}`
const listeners = new Set<() => void>()
const memory = new Map<string, string>()

function read(orgId: string): string {
  if (memory.has(orgId)) return memory.get(orgId) ?? ''
  try {
    return localStorage.getItem(key(orgId)) ?? ''
  } catch {
    return ''
  }
}

export function chooseYear(orgId: string, yearId: string) {
  memory.set(orgId, yearId)
  try {
    localStorage.setItem(key(orgId), yearId)
  } catch {
    // Not kept past this visit; it still works now.
  }
  for (const l of listeners) l()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The year chosen at the top for this institution, or empty for the latest. */
export function useYearChoice(orgId: string): string {
  return useSyncExternalStore(subscribe, () => read(orgId), () => '')
}

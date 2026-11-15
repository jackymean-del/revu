const BASE = import.meta.env.VITE_API_URL ?? ''
const sent = new Set<string>()

/**
 * Tells our own server that a screen failed, so a fault on the live site is
 * seen without anyone reporting it. Only what places the fault is sent: the
 * message, the first lines of the stack and the path without its query.
 * Each different fault is sent once per visit, and sending never fails
 * loudly.
 */
export function reportError(error: unknown) {
  const e = error instanceof Error ? error : new Error(String(error))
  const key = `${e.message}@${location.pathname}`
  if (sent.has(key) || sent.size > 20) return
  sent.add(key)
  try {
    const body = JSON.stringify({ message: e.message.slice(0, 300), stack: (e.stack ?? '').slice(0, 1200), path: location.pathname, version: import.meta.env.VITE_APP_VERSION ?? '' })
    void fetch(`${BASE}/api/client-errors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined)
  } catch {
    // Nothing to do: a report that cannot be sent is not shown.
  }
}

/** Reports faults that no screen caught. */
export function reportUncaught() {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason))
}

import type { ErrorComponentProps } from '@tanstack/react-router'

/**
 * A screen that could not open says so, with one way forward, instead of
 * leaving the page blank. A newer version of revU is the usual cause.
 */
export function RouteError({ error }: ErrorComponentProps) {
  const stale = /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(error instanceof Error ? error.message : String(error))
  return (
    <div role="alert" className="mx-auto mt-10 max-w-lg space-y-3 rounded-2xl border border-line bg-white p-6 text-center">
      <p className="font-bold">{stale ? 'revU has been updated' : 'This screen could not open'}</p>
      <p className="text-sm text-muted">{stale ? 'Reload to open the newest version. Nothing you saved is lost.' : 'Reload to try again. If it happens again, tell your administrator what you were doing.'}</p>
      <button type="button" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  )
}

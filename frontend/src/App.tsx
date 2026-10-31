import { useQuery } from '@tanstack/react-query'
import { getHealth } from './api/client'
import { BrandLockup } from './components/BrandLockup'

type Tone = 'ok' | 'down' | 'wait'

function StatusRow({ label, tone, detail }: { label: string; tone: Tone; detail: string }) {
  const dot = tone === 'ok' ? 'bg-emerald-600' : tone === 'down' ? 'bg-red-600' : 'bg-amber-500'
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <span className="font-semibold">{label}</span>
      <span className="inline-flex items-center gap-2 text-sm text-muted" data-testid={`status-${label.toLowerCase()}`}>
        <span aria-hidden="true" className={`size-2.5 rounded-full ${dot}`} />
        {detail}
      </span>
    </div>
  )
}

/** Setup page: proves the app reaches the server and the server reaches PostgreSQL. */
export function App() {
  const health = useQuery({ queryKey: ['health'], queryFn: ({ signal }) => getHealth(signal), retry: 1, refetchInterval: 15000 })

  const server: [Tone, string] = health.isPending ? ['wait', 'Checking'] : health.isError ? ['down', 'Not reachable'] : ['ok', 'Running']
  const database: [Tone, string] = health.isPending
    ? ['wait', 'Checking']
    : health.data?.database
      ? ['ok', 'Connected']
      : ['down', health.isError ? 'Unknown' : 'Not connected']

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center border-b border-line bg-white px-6">
        <BrandLockup />
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-12">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-subtle">System check</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">revU is getting ready</h1>
        <p className="mt-2 text-muted">This page confirms the app can reach the server and the server can reach its database.</p>
        <section aria-live="polite" className="mt-6 rounded-xl border border-line bg-white px-5 py-1 shadow-sm">
          <StatusRow label="Server" tone={server[0]} detail={server[1]} />
          <StatusRow label="Database" tone={database[0]} detail={database[1]} />
        </section>
        <div className="mt-4 flex items-center justify-between text-sm text-subtle">
          <span>Version {health.data?.version ?? '-'}</span>
          <button
            type="button"
            onClick={() => health.refetch()}
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            disabled={health.isFetching}
          >
            {health.isFetching ? 'Checking' : 'Check again'}
          </button>
        </div>
      </main>
      <footer className="px-6 py-4 text-center text-xs text-subtle">
        by <b className="font-extrabold text-ink">bhusku</b> &middot; Heavy on craft. Full of energy.
      </footer>
    </div>
  )
}

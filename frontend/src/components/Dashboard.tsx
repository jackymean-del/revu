import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getDashboard, getDashboardList, type Tile } from '../api/client'
import { setupPiece, tileAction, tileLabel } from '../lib/dashboard'
import { useT } from '../lib/terminology/terms-context'

const chip: Record<Tile['status'], { text: string; className: string } | undefined> = {
  attention: { text: 'Needs attention', className: 'border-amber-300 bg-amber-50 text-amber-900' },
  ok: { text: 'All clear', className: 'border-line bg-mist text-brand-700' },
  info: undefined,
}

/**
 * The person's tiles (Part 76.3): a number, what it counts, whether it needs
 * doing, and, for those allowed to see names, the list behind the number.
 * Leaders can print the page as it stands.
 */
export function Dashboard({ orgId, orgName, canAct, canPrint }: { orgId: string; orgName: string; canAct: boolean; canPrint: boolean }) {
  const t = useT()
  const [open, setOpen] = useState<string | null>(null)
  const board = useQuery({ queryKey: ['dashboard', orgId], queryFn: ({ signal }) => getDashboard(orgId, signal), enabled: !!orgId })
  const list = useQuery({
    queryKey: ['dashboard', orgId, open],
    queryFn: ({ signal }) => getDashboardList(orgId, open!, signal),
    enabled: !!orgId && !!open,
  })

  if (board.isPending) return <p className="text-sm text-muted">Loading your numbers</p>
  if (board.isError) return <p role="alert" className="text-sm font-semibold text-red-700">{board.error.message}</p>
  const tiles = board.data.tiles
  if (tiles.length === 0) return null
  const current = tiles.find((x) => x.key === open)
  const action = current && canAct ? tileAction[current.key] : undefined

  return (
    <section aria-labelledby="numbers-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="numbers-heading" className="font-extrabold">
          At a glance
        </h2>
        {canPrint && (
          <button type="button" onClick={() => window.print()} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist print:hidden">
            Print
          </button>
        )}
      </div>
      <p className="hidden text-sm text-muted print:block">
        {orgName}, printed {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => {
          const label = tileLabel(t, tile.key, tile.count)
          const status = chip[tile.status]
          const body = (
            <>
              <span className="block text-3xl font-extrabold tabular-nums">{tile.count}</span>
              <span className="mt-1 block text-sm leading-snug text-muted">{label}</span>
              {status && <span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${status.className}`}>{status.text}</span>}
            </>
          )
          const box = `h-full w-full rounded-xl border bg-white p-4 text-left ${tile.status === 'attention' ? 'border-amber-300' : 'border-line'}`
          return (
            <li key={tile.key}>
              {tile.listable ? (
                <button
                  type="button"
                  aria-expanded={open === tile.key}
                  aria-controls="tile-list"
                  onClick={() => setOpen(open === tile.key ? null : tile.key)}
                  className={`${box} hover:border-brand focus-visible:outline-2 focus-visible:outline-brand ${open === tile.key ? 'ring-2 ring-brand' : ''}`}
                >
                  {body}
                </button>
              ) : (
                <div className={box}>{body}</div>
              )}
            </li>
          )
        })}
      </ul>
      {!tiles.some((x) => x.listable) && <p className="text-xs text-subtle print:hidden">Your role shows numbers only. Names stay with the staff who work with them.</p>}

      {current && (
        <div id="tile-list" role="region" aria-label={tileLabel(t, current.key, current.count)} className="rounded-xl border border-line bg-white p-4 print:hidden">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-extrabold">{tileLabel(t, current.key, current.count)}</h3>
            <button type="button" onClick={() => setOpen(null)} className="rounded-md px-2 py-1 text-sm font-semibold text-muted hover:bg-mist">
              Close
            </button>
          </div>
          {list.isPending ? (
            <p className="mt-2 text-sm text-muted">Loading</p>
          ) : list.isError ? (
            <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{list.error.message}</p>
          ) : list.data.rows.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing here.</p>
          ) : (
            <ul className="mt-2 max-h-96 divide-y divide-line overflow-y-auto text-sm">
              {list.data.rows.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 py-2">
                  <span className="font-semibold">{current.key === 'missing_setup' ? setupPiece(t, r.title) : r.title}</span>
                  {(r.detail || current.key === 'my_classes') && <span className="text-right text-muted">{r.detail || t('person.class_teacher')}</span>}
                </li>
              ))}
            </ul>
          )}
          {action && (
            <Link to={action.to} className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              {action.label}
            </Link>
          )}
        </div>
      )}
    </section>
  )
}

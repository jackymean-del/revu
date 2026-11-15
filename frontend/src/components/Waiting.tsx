import { Link } from '@tanstack/react-router'
import type { Waiting as Item } from '../api/client'
import { useWaiting } from '../lib/waiting'
import { Icon } from './Icon'

const ago = (since: string) => {
  if (!since) return ''
  const mins = Math.round((Date.now() - new Date(since).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

/**
 * Home's list of what waits on this person, each one a click from where it
 * is dealt with. It shows nothing when nothing waits.
 */
export function WaitingForYou() {
  const items = useWaiting()
  if (items.length === 0) return null
  return (
    <section aria-labelledby="waiting-heading" className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4">
      <h2 id="waiting-heading" className="font-extrabold">
        Waiting for you <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{items.length}</span>
      </h2>
      <ul className="mt-2 divide-y divide-amber-200/70">
        {items.map((w: Item, i) => (
          <li key={`${w.href}-${w.kind}-${i}`}>
            <Link to={w.href} className="flex items-center gap-3 py-2.5 hover:text-brand">
              <span className={`size-2 shrink-0 rounded-full ${w.kind.endsWith('returned') ? 'bg-red-500' : 'bg-amber-500'}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{w.title}</span>
                <span className="block truncate text-sm text-muted">{w.detail}</span>
              </span>
              <span className="shrink-0 text-xs text-subtle">{ago(w.since)}</span>
              <Icon name="arrow" size={16} className="shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

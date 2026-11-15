import { useEffect, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { listStudents } from '../api/client'
import { useT } from '../lib/terminology/terms-context'
import { usePaperAssessments } from '../pages/papers/assessments'
import { Icon } from './Icon'

export interface Place {
  to: string
  label: string
  hint?: string
}

interface Hit {
  group: string
  label: string
  hint: string
  href: string
}

const words = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean)
const has = (text: string, q: string[]) => q.every((w) => text.toLowerCase().includes(w))

/** True while Ctrl+K or Cmd+K is the keys pressed. */
const isShortcut = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'

/**
 * Search and jump: one box, opened from the menu or with Ctrl+K, that goes
 * straight to a page, an assessment's marks or its paper, or a person by
 * name. Everything it lists is something this person already may open.
 */
export function Search({ pages, compact }: { pages: Place[]; compact: boolean }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isShortcut(e)) return
      e.preventDefault()
      setOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        title="Search (Ctrl+K)"
        className={compact ? 'grid size-10 place-items-center rounded-lg text-muted hover:bg-mist' : 'flex w-full items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-left text-sm text-muted hover:bg-mist'}
      >
        <Icon name="search" size={compact ? 18 : 15} className="shrink-0" />
        {!compact && (
          <>
            <span className="flex-1">Search</span>
            <kbd className="rounded border border-line bg-white px-1 text-[10px] font-semibold text-subtle">Ctrl K</kbd>
          </>
        )}
      </button>
      {open && <Palette pages={pages} onClose={() => setOpen(false)} />}
    </>
  )
}

/** The box itself; its lists are fetched only once it is opened. */
function Palette({ pages, onClose }: { pages: Place[]; onClose: () => void }) {
  const t = useT()
  const router = useRouter()
  const { orgId, choices, sectionName } = usePaperAssessments()
  const [text, setText] = useState('')
  const [at, setAt] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  const q = words(text)
  const people = pages.some((p) => p.to === '/people')
  const found = useQuery({
    queryKey: ['search-students', orgId, text.trim().toLowerCase()],
    queryFn: ({ signal }) => listStudents(orgId, { q: text.trim(), limit: '6' }, signal),
    enabled: people && !!orgId && text.trim().length >= 2,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })

  const hits: Hit[] = []
  for (const p of pages.filter((p) => has(`${p.label} ${p.hint ?? ''}`, q)).slice(0, q.length ? 5 : 8)) hits.push({ group: 'Pages', label: p.label, hint: p.hint ?? '', href: p.to })
  if (q.length) {
    const exams = choices.filter((c) => has(`${c.subject} ${c.a.title} ${c.level} ${c.sections}`, q)).slice(0, 4)
    for (const c of exams) {
      for (const s of c.a.sectionIds.slice(0, 3)) hits.push({ group: 'Assessments', label: `${c.subject}, ${c.a.title}`, hint: `${sectionName(s)} · Marks`, href: `/marks?a=${encodeURIComponent(`${c.a.id}/${s}`)}` })
      hits.push({ group: 'Assessments', label: `${c.subject}, ${c.a.title}`, hint: `${c.level} · Question paper`, href: `/papers?a=${encodeURIComponent(c.a.id)}` })
    }
    if (text.trim().length >= 2)
      for (const s of found.data?.items ?? []) hits.push({ group: t('person.student', { count: 2 }), label: s.name, hint: s.admissionNo, href: `/people?q=${encodeURIComponent(s.admissionNo)}` })
  }
  const active = Math.min(at, Math.max(0, hits.length - 1))
  const go = (h?: Hit) => {
    if (!h) return
    onClose()
    router.history.push(h.href)
  }
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-ink/45 p-3 pt-[10vh] print:hidden" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Search" className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Icon name="search" size={17} className="shrink-0 text-muted" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={hits.length ? `search-hit-${active}` : undefined}
            aria-label="Search"
            placeholder="Find a page, an assessment or a name"
            className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none"
            value={text}
            onChange={(e) => (setText(e.target.value), setAt(0))}
            onKeyDown={(e) => {
              const move: Record<string, () => void> = {
                Escape: onClose,
                ArrowDown: () => setAt(Math.min(active + 1, hits.length - 1)),
                ArrowUp: () => setAt(Math.max(active - 1, 0)),
                Enter: () => go(hits[active]),
              }
              if (!move[e.key]) return
              e.preventDefault()
              move[e.key]()
            }}
          />
          <button type="button" onClick={onClose} className="rounded border border-line px-1.5 py-0.5 text-[11px] font-semibold text-muted hover:bg-canvas">
            Esc
          </button>
        </div>
        <ul ref={list} id="search-results" role="listbox" aria-label="Results" className="max-h-[60vh] overflow-y-auto p-1.5">
          {hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{found.isFetching ? 'Looking' : 'Nothing matches. Try fewer words.'}</li>}
          {hits.map((h, i) => (
            <li key={`${h.href}-${i}`} role="presentation">
              {(i === 0 || hits[i - 1].group !== h.group) && <p className="select-none px-2.5 pb-1 pt-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-subtle">{h.group}</p>}
              <button
                type="button"
                id={`search-hit-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setAt(i)}
                onClick={() => go(h)}
                className={`flex w-full items-baseline gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${i === active ? 'bg-mist text-brand' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{h.label}</span>
                <span className="shrink-0 text-xs text-muted">{h.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-3 py-1.5 text-[11px] text-subtle">Up and down to move, Enter to open, Esc to close.</p>
      </div>
    </div>
  )
}

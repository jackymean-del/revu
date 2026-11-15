import { useCallback, useEffect, useRef, useState } from 'react'
import { Ctx, type Later } from '../lib/undo'

interface Pending {
  id: number
  label: string
  run: () => void
  undo?: () => void
}

/** How long a removal can still be taken back. */
const WAIT = 6000

/**
 * Removals happen a few seconds after they are asked for, with Undo in the
 * meantime, instead of an "are you sure" before. Starting another, or
 * leaving the page, carries out the one waiting.
 */
export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const current = useRef<Pending | null>(null)
  const settle = useCallback(() => {
    window.clearTimeout(timer.current)
    const p = current.current
    current.current = null
    setPending(null)
    p?.run()
  }, [])
  const later = useCallback<Later>(
    (label, run, undo) => {
      settle()
      const p = { id: Date.now(), label, run, undo }
      current.current = p
      setPending(p)
      timer.current = window.setTimeout(settle, WAIT)
    },
    [settle],
  )
  // Leaving the page does what was asked rather than lose it.
  useEffect(() => {
    window.addEventListener('pagehide', settle)
    return () => window.removeEventListener('pagehide', settle)
  }, [settle])
  const takeBack = () => {
    window.clearTimeout(timer.current)
    current.current?.undo?.()
    current.current = null
    setPending(null)
  }
  return (
    <Ctx.Provider value={later}>
      {children}
      {pending && (
        <div role="status" className="fixed inset-x-3 bottom-4 z-[65] mx-auto flex max-w-md items-center gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-2xl print:hidden">
          <span className="min-w-0 flex-1">{pending.label}</span>
          <button type="button" onClick={takeBack} className="rounded-md px-2 py-1 font-bold text-amber-300 hover:bg-white/10">
            Undo
          </button>
        </div>
      )}
    </Ctx.Provider>
  )
}

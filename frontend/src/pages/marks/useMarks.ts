import { useCallback, useEffect, useRef, useState } from 'react'
import { syncEvidence, type GridCellData, type MarksGridData, type OpResult } from '../../api/client'
import type { CellValue } from '../../components/DataGrid/cells'
import { deviceId, drop, enqueue, newOpId, queued, type QueuedOp } from '../../lib/outbox'

const key = (s: string, c: string) => `${s}|${c}`

export type Conflict = { studentId: string; partId: string; mine: CellValue; theirs: GridCellData }
export type Failure = { studentId: string; partId: string; message: string }

const toCell = (g: GridCellData | undefined): CellValue | undefined => (g ? { state: g.state, ...(g.value ? { value: g.value } : {}) } : undefined)

/**
 * The cells of one grid as the person sees them: what the server holds,
 * with their own edits on top until each is saved. Edits go through the
 * outbox (Part 6.3) and are sent in order; when the network is down they
 * wait and go when it is back.
 */
export function useMarks(orgId: string, grid: MarksGridData | undefined) {
  const [server, setServer] = useState(new Map<string, GridCellData>())
  const [mine, setMine] = useState(new Map<string, { cell: CellValue; opId: string; mark: 'saving' | 'failed' | 'conflict' }>())
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [failures, setFailures] = useState<Failure[]>([])
  const [offline, setOffline] = useState(false)
  const [waiting, setWaiting] = useState(0)
  const sending = useRef(false)
  const again = useRef(false)
  const versions = useRef(new Map<string, number>())

  useEffect(() => {
    if (!grid) return
    const m = new Map<string, GridCellData>()
    for (const c of grid.cells) m.set(key(c.studentId, c.partId), c)
    versions.current = new Map([...m].map(([k, c]) => [k, c.version]))
    setServer(m)
  }, [grid])

  const apply = useCallback((op: QueuedOp, r: OpResult) => {
    const k = key(op.studentId, op.partId)
    if (r.outcome === 'applied' && r.cell) {
      versions.current.set(k, r.cell.version)
      setServer((s) => new Map(s).set(k, r.cell!))
    }
    setMine((m) => {
      const cur = m.get(k)
      if (!cur || cur.opId !== op.opId) return m
      const next = new Map(m)
      if (r.outcome === 'applied') next.delete(k)
      else next.set(k, { ...cur, mark: r.outcome === 'conflict' ? 'conflict' : 'failed' })
      return next
    })
    if (r.outcome === 'conflict' && r.cell) {
      setConflicts((c) => [...c.filter((x) => key(x.studentId, x.partId) !== k), { studentId: op.studentId, partId: op.partId, mine: { state: op.state, ...(op.value ? { value: op.value } : {}) }, theirs: r.cell! }])
    }
    if (r.outcome === 'refused') setFailures((f) => [...f, { studentId: op.studentId, partId: op.partId, message: r.message ?? 'Not saved.' }])
  }, [])

  const flush = useCallback(async () => {
    if (!orgId) return
    if (sending.current) {
      again.current = true
      return
    }
    sending.current = true
    try {
      for (;;) {
        const ops = (await queued(orgId)).slice(0, 100)
        setWaiting(ops.length)
        if (ops.length === 0) break
        const { results } = await syncEvidence(orgId, deviceId(), ops.map(({ orgId: _o, assessmentId: _a, seq: _s, ...op }) => op))
        await drop(results.map((r) => r.opId))
        results.forEach((r, i) => apply(ops[i], r))
        setOffline(false)
      }
    } catch {
      setOffline(true) // the edits stay queued and go when the network is back
    } finally {
      sending.current = false
      if (again.current) {
        again.current = false
        void flush()
      }
    }
  }, [orgId, apply])

  useEffect(() => {
    void flush()
    const retry = () => void flush()
    window.addEventListener('online', retry)
    const timer = window.setInterval(retry, 15000)
    return () => {
      window.removeEventListener('online', retry)
      window.clearInterval(timer)
    }
  }, [flush])

  const value = useCallback(
    (s: string, c: string): CellValue | undefined => mine.get(key(s, c))?.cell ?? toCell(server.get(key(s, c))),
    [mine, server],
  )

  const mark = useCallback((s: string, c: string) => mine.get(key(s, c))?.mark, [mine])

  /** Saves one cell: queued at once, sent in order, never lost if the network drops. */
  const save = useCallback(
    async (studentId: string, partId: string, cell: CellValue, baseVersion?: number) => {
      if (!grid) return
      const k = key(studentId, partId)
      const opId = newOpId()
      setMine((m) => new Map(m).set(k, { cell, opId, mark: 'saving' }))
      setConflicts((c) => c.filter((x) => key(x.studentId, x.partId) !== k))
      await enqueue({
        opId, orgId, assessmentId: grid.assessment.id, studentId, partId, state: cell.state, ...(cell.value ? { value: cell.value } : {}),
        baseVersion: baseVersion ?? versions.current.get(k) ?? 0,
      })
      void flush()
    },
    [grid, orgId, flush],
  )

  const keepMine = (c: Conflict) => void save(c.studentId, c.partId, c.mine, c.theirs.version)

  const takeTheirs = (c: Conflict) => {
    const k = key(c.studentId, c.partId)
    versions.current.set(k, c.theirs.version)
    setServer((s) => new Map(s).set(k, c.theirs))
    setMine((m) => {
      const next = new Map(m)
      next.delete(k)
      return next
    })
    setConflicts((x) => x.filter((y) => key(y.studentId, y.partId) !== k))
  }

  // Edits still being queued count too, so "All saved" never shows early.
  const unsent = Math.max(waiting, [...mine.values()].filter((m) => m.mark === 'saving').length)

  return { value, mark, save, conflicts, keepMine, takeTheirs, failures, clearFailures: () => setFailures([]), offline, waiting: unsent }
}

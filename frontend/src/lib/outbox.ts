/**
 * The offline outbox for marks (blueprint Part 6.3). Every edit is queued
 * here first with an op id and the version it was made on, then sent in
 * order. The server applies each once, however often it is sent, and
 * returns an edit whose cell moved on as a conflict, so nothing is
 * overwritten silently. The browser keeps only this queue; PostgreSQL holds
 * the marks. If the browser refuses storage, the queue lives in memory.
 */
import type { Dexie, Table } from 'dexie'
import type { EvidenceOp } from '../api/client'
import { OUTBOX_DB } from './outbox-name'

export type QueuedOp = EvidenceOp & { orgId: string; assessmentId: string; seq: number }

type OutboxDb = Dexie & { ops: Table<QueuedOp, string> }

let db: OutboxDb | null = null
let refused = false
let memory: QueuedOp[] = []
let seq = Date.now() * 1000

// Dexie loads with the first edit, so the grid draws without it.
async function store(): Promise<OutboxDb | null> {
  if (db || refused) return db
  try {
    const { Dexie } = await import('dexie')
    const d = new Dexie(OUTBOX_DB) as OutboxDb
    d.version(1).stores({ ops: 'opId, orgId, seq' })
    await d.open()
    db = d
  } catch {
    refused = true // private windows and blocked storage: the queue stays in memory from now on
  }
  return db
}

export const newOpId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '')

/** This browser's id, sent with each batch so receipts say where an edit came from. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem('revu-device')
    if (!id) {
      id = newOpId()
      localStorage.setItem('revu-device', id)
    }
    return id
  } catch {
    return 'unknown-device'
  }
}

export async function enqueue(op: Omit<QueuedOp, 'seq'>): Promise<void> {
  const item = { ...op, seq: ++seq }
  const d = await store()
  if (d) await d.ops.put(item)
  else memory.push(item)
}

/** Queued edits of an organisation, oldest first. */
export async function queued(orgId: string): Promise<QueuedOp[]> {
  const d = await store()
  const all = d ? await d.ops.where('orgId').equals(orgId).toArray() : memory.filter((o) => o.orgId === orgId)
  return all.sort((a, b) => a.seq - b.seq)
}

export async function drop(opIds: string[]): Promise<void> {
  const d = await store()
  if (d) await d.ops.bulkDelete(opIds)
  else memory = memory.filter((o) => !opIds.includes(o.opId))
}

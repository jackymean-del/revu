import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createStructure, listStructure, removeStructure, updateStructure, type Branch, type Level, type Section } from '../../api/client'
import { ApiError } from '../../api/problem'
import { useT } from '../../lib/terminology/terms-context'
import { parseNames, sectionNamesToAdd } from '../../lib/classes'

const input = 'rounded-md border border-line bg-white px-2 py-1 text-sm'
const button = 'rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist disabled:opacity-50'
const primary = 'rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

/**
 * Classes and their sections in one table: each class on a row with its
 * sections beside it, added several at a time ("A, B, C") and removed with
 * one click; a whole run of classes made in one line. Sections belong to
 * the chosen year and the main branch unless another is picked.
 */
export function ClassesTable({ orgId, canEdit, yearId, branches }: { orgId: string; canEdit: boolean; yearId: string; branches: Branch[] }) {
  const t = useT()
  const qc = useQueryClient()
  const levels = useQuery({ queryKey: ['structure', orgId, 'levels', {}], queryFn: ({ signal }) => listStructure<Level>(orgId, 'levels', {}, signal) })
  const sections = useQuery({
    queryKey: ['structure', orgId, 'sections', { yearId }],
    queryFn: ({ signal }) => listStructure<Section>(orgId, 'sections', { yearId }, signal),
    enabled: !!yearId,
  })
  const [branchId, setBranch] = useState('')
  const branch = branchId || branches[0]?.id || ''
  const [adding, setAdding] = useState<Record<string, string>>({})
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [run, setRun] = useState({ prefix: '', from: '1', to: '10', sections: 'A, B' })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)

  const list = [...(levels.data ?? [])].sort((a, b) => a.seq - b.seq || a.name.localeCompare(b.name))
  const ofLevel = (id: string) => (sections.data ?? []).filter((s) => s.levelId === id).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  const levelWord = t('group.level')
  const sectionWord = t('group.section', { count: 2, lower: true })

  async function act(work: () => Promise<string | void>) {
    setBusy(true)
    setNote(null)
    try {
      const text = await work()
      if (text) setNote({ text })
    } catch (e) {
      setNote({ text: e instanceof ApiError || e instanceof Error ? e.message : 'Not saved. Try again.', error: true })
    } finally {
      setBusy(false)
      await qc.invalidateQueries({ queryKey: ['structure', orgId] })
    }
  }

  const addSections = (level: Level, text: string) =>
    act(async () => {
      const names = sectionNamesToAdd(text, ofLevel(level.id).map((s) => s.name))
      for (const name of names) await createStructure(orgId, 'sections', { levelId: level.id, yearId, branchId: branch, name })
      setAdding((a) => ({ ...a, [level.id]: '' }))
      return names.length ? `Added ${names.join(', ')} to ${level.name}.` : 'Those are there already.'
    })

  const addRun = () =>
    act(async () => {
      const from = Number(run.from)
      const to = Number(run.to)
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to - from > 30) throw new Error('Give a run of up to 31 numbers, lowest first.')
      const prefix = run.prefix.trim() || levelWord
      const letters = parseNames(run.sections)
      let made = 0
      for (let n = from; n <= to; n++) {
        const name = `${prefix} ${n}`
        let level = list.find((l) => l.name.toLowerCase() === name.toLowerCase())
        if (!level) {
          level = (await createStructure(orgId, 'levels', { name, seq: n })) as Level
          made++
        }
        const have = (sections.data ?? []).filter((s) => s.levelId === level!.id).map((s) => s.name)
        for (const s of sectionNamesToAdd(letters.join(','), have)) await createStructure(orgId, 'sections', { levelId: level.id, yearId, branchId: branch, name: s })
      }
      return `${made} ${made === 1 ? levelWord.toLowerCase() : t('group.level', { count: 2, lower: true })} made, each with ${letters.join(', ') || 'no'} ${sectionWord}.`
    })

  if (levels.isPending) return <p className="text-sm text-muted">Loading</p>

  return (
    <div className="space-y-3">
      {canEdit && branches.length > 1 && (
        <label className="flex items-center gap-2 text-sm font-semibold">
          New {sectionWord} go to
          <select className={input} value={branch} onChange={(e) => setBranch(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {list.length === 0 && !canEdit && <p className="text-sm text-muted">Nothing here yet.</p>}

      {list.length > 0 && (
        <div className="overflow-auto rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="w-16 px-3 py-2">Order</th>
                <th scope="col" className="px-3 py-2">{levelWord}</th>
                <th scope="col" className="px-3 py-2">{t('group.section', { count: 2 })}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((l) => (
                <tr key={l.id} className="border-b border-line align-middle last:border-0">
                  <td className="px-3 py-2 tabular-nums text-muted">{l.seq}</td>
                  <th scope="row" className="px-3 py-2 text-left font-semibold">
                    {renaming?.id === l.id ? (
                      <form
                        className="flex gap-1"
                        onSubmit={(e) => {
                          e.preventDefault()
                          const name = renaming.name.trim()
                          if (name && name !== l.name) void act(async () => void (await updateStructure(orgId, 'levels', l.id, { name, seq: l.seq, stage: l.stage })))
                          setRenaming(null)
                        }}
                      >
                        <input aria-label={`New name for ${l.name}`} autoFocus className={input} value={renaming.name} onChange={(e) => setRenaming({ id: l.id, name: e.target.value })} />
                        <button type="submit" className={button}>
                          Save
                        </button>
                      </form>
                    ) : canEdit ? (
                      <button type="button" title="Rename" onClick={() => setRenaming({ id: l.id, name: l.name })} className="rounded px-1 text-left hover:bg-mist">
                        {l.name}
                      </button>
                    ) : (
                      l.name
                    )}
                  </th>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ofLevel(l.id).map((s) => (
                        <span key={s.id} className="inline-flex items-center gap-1 rounded-md bg-mist px-2 py-0.5 font-semibold text-brand">
                          {s.name}
                          {canEdit && (
                            <button
                              type="button"
                              aria-label={`Remove ${l.name} ${s.name}`}
                              disabled={busy}
                              onClick={() => void act(async () => (await removeStructure(orgId, 'sections', s.id), `Removed ${l.name} ${s.name}. It can be restored.`))}
                              className="rounded px-0.5 text-brand/60 hover:bg-white hover:text-red-700"
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                      {canEdit && yearId && (
                        <form
                          className="inline-flex"
                          onSubmit={(e) => {
                            e.preventDefault()
                            if ((adding[l.id] ?? '').trim()) void addSections(l, adding[l.id])
                          }}
                        >
                          <input
                            aria-label={`Add ${sectionWord} to ${l.name}`}
                            placeholder={ofLevel(l.id).length ? 'Add more' : 'A, B, C'}
                            className={`${input} w-28`}
                            value={adding[l.id] ?? ''}
                            onChange={(e) => setAdding((a) => ({ ...a, [l.id]: e.target.value }))}
                          />
                        </form>
                      )}
                      {!canEdit && ofLevel(l.id).length === 0 && <span className="text-muted">None</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && yearId && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line bg-white p-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault()
            void addRun()
          }}
        >
          <span className="w-full font-semibold">Add several at once</span>
          <label className="flex flex-col gap-1">
            Name
            <input aria-label="Name" className={`${input} w-28`} placeholder={levelWord} value={run.prefix} onChange={(e) => setRun({ ...run, prefix: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            From
            <input aria-label="From" inputMode="numeric" className={`${input} w-16`} value={run.from} onChange={(e) => setRun({ ...run, from: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            To
            <input aria-label="To" inputMode="numeric" className={`${input} w-16`} value={run.to} onChange={(e) => setRun({ ...run, to: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            {t('group.section', { count: 2 })} in each
            <input aria-label={`${t('group.section', { count: 2 })} in each`} className={`${input} w-32`} value={run.sections} onChange={(e) => setRun({ ...run, sections: e.target.value })} />
          </label>
          <button type="submit" className={primary} disabled={busy}>
            {busy ? 'Adding' : 'Add'}
          </button>
          <span className="w-full text-xs text-muted">
            For example {levelWord} 1 to 10 with {sectionWord} A, B. Ones already there are kept; only what is missing is added.
          </span>
        </form>
      )}

      {note && (
        <p role={note.error ? 'alert' : 'status'} className={`text-sm ${note.error ? 'font-semibold text-red-700' : 'text-muted'}`}>
          {note.text}
        </p>
      )}
    </div>
  )
}

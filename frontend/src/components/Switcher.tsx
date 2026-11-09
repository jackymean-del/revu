import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useOrg } from '../lib/org-context'
import { useT } from '../lib/terminology/terms-context'

/**
 * One place to change who you are acting as: the platform owner's console,
 * the groups you run, and, for an administrator, a preview of the
 * institution as another role. The server enforces the previewed role and
 * refuses changes, so the preview is exactly what that role sees.
 */
export function Switcher({ align = 'right' }: { align?: 'left' | 'right' }) {
  const t = useT()
  const { current, platformOwner, groups, previewing, preview, ownRoles } = useOrg()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const admin = ownRoles.includes('admin')

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  if (!platformOwner && groups.length === 0 && !admin) return null

  const roles = [
    { role: 'principal', label: t('person.principal') },
    { role: 'coordinator', label: 'Coordinator' },
    { role: 'teacher', label: t('person.teacher') },
    { role: 'class_teacher', label: t('person.class_teacher') },
    { role: 'viewer', label: 'View only' },
  ]
  const item = 'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-mist'
  const heading = 'px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-subtle'
  const pick = (role: string | null) => {
    preview(role)
    setOpen(false)
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
        className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-mist"
      >
        Switch
      </button>
      {open && (
        <div role="menu" aria-label="Switch" className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} z-40 mt-2 w-72 rounded-xl border border-line bg-white p-1.5 shadow-[0_8px_32px_rgba(19,17,30,0.12)]`}>
          {platformOwner && (
            <>
              <p className={heading}>Platform</p>
              <Link role="menuitem" to="/owner" className={item} onClick={() => setOpen(false)}>
                Owner console
              </Link>
            </>
          )}
          {groups.length > 0 && (
            <>
              <p className={heading}>Groups you run</p>
              {groups.map((g) => (
                <Link key={g.id} role="menuitem" to="/groups" className={item} onClick={() => setOpen(false)}>
                  {g.name}
                </Link>
              ))}
            </>
          )}
          {admin && current && (
            <>
              <p className={heading}>Preview {current.name} as</p>
              <button role="menuitemradio" aria-checked={!previewing} type="button" className={item} onClick={() => pick(null)}>
                Yourself (administrator)
                {!previewing && <span aria-hidden="true">✓</span>}
              </button>
              {roles.map((r) => (
                <button key={r.role} role="menuitemradio" aria-checked={previewing === r.role} type="button" className={item} onClick={() => pick(r.role)}>
                  {r.label}
                  {previewing === r.role && <span aria-hidden="true">✓</span>}
                </button>
              ))}
              {[t('person.guardian'), t('person.student')].map((label) => (
                <span key={label} role="menuitem" aria-disabled="true" className={`${item} cursor-default text-subtle hover:bg-transparent`}>
                  {label}
                  <span className="text-[11px]">with the family portal</span>
                </span>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Says plainly that this is a preview, and how to stop it. */
export function PreviewBanner() {
  const t = useT()
  const { previewing, preview } = useOrg()
  if (!previewing) return null
  const names: Record<string, string> = {
    principal: t('person.principal'),
    coordinator: 'Coordinator',
    teacher: t('person.teacher'),
    class_teacher: t('person.class_teacher'),
    viewer: 'View only',
  }
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-ink px-4 py-2 text-sm text-white print:hidden">
      <span>
        Previewing as <b>{names[previewing] ?? previewing}</b>. This is what that role sees; nothing can be changed in a preview.
      </span>
      <button type="button" onClick={() => preview(null)} className="rounded-md bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25">
        Stop preview
      </button>
    </div>
  )
}

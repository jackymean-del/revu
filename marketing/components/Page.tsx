import type { ReactNode } from 'react'
import { Chrome } from './Chrome'

/** A content page: a title band, then the body. */
export function Page({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <Chrome>
      <section className="bg-canvas">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-subtle">{eyebrow}</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight">{title}</h1>
          <div className="mt-4 max-w-2xl text-lg text-muted">{intro}</div>
        </div>
      </section>
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">{children}</div>
    </Chrome>
  )
}

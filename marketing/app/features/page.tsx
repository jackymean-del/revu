import type { Metadata } from 'next'
import { StatusTag } from '@/components/Chrome'
import { Page } from '@/components/Page'
import { AREAS } from '@/content/product'
import { demoHref } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Features: Marks, Results and Progress Reports',
  description: 'Setup in your own words, marks entry that never guesses, results you can explain, reports families read, dashboards by role, and privacy by default.',
}

export default function Features() {
  return (
    <Page
      eyebrow="Features"
      title="Everything from the first mark to the last report"
      intro={
        <>
          Each feature says whether it runs today <StatusTag status="live" /> or arrives during the pilot <StatusTag status="pilot" />.
        </>
      }
    >
      <nav aria-label="Areas" className="flex flex-wrap gap-2">
        {AREAS.map((a) => (
          <a key={a.id} href={`#${a.id}`} className="rounded-full border border-line px-3 py-1 text-sm font-semibold text-brand hover:bg-mist">
            {a.name}
          </a>
        ))}
      </nav>
      <div className="mt-10 space-y-14">
        {AREAS.map((a) => (
          <section key={a.id} id={a.id} aria-labelledby={`${a.id}-h`} className="scroll-mt-24">
            <h2 id={`${a.id}-h`} className="text-2xl font-extrabold">
              {a.name}
            </h2>
            <p className="mt-1 text-muted">{a.summary}</p>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2">
              {a.features.map((f) => (
                <li key={f.title} className="rounded-2xl border border-line p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold">{f.title}</h3>
                    <StatusTag status={f.status} />
                  </div>
                  <p className="mt-2 text-sm text-muted">{f.text}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-16 rounded-2xl bg-canvas p-8 text-center">
        <h2 className="text-2xl font-extrabold">See it with your own class lists</h2>
        <p className="mt-2 text-muted">A demo uses your structure and words, not a made-up school.</p>
        <a href={demoHref} className="mt-5 inline-block rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white hover:bg-ink/85">
          Book a demo
        </a>
      </div>
    </Page>
  )
}

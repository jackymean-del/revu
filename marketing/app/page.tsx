import Link from 'next/link'
import { Chrome, StatusTag } from '@/components/Chrome'
import { AREAS, FAQ, STEPS, WORDS } from '@/content/product'
import { demoHref } from '@/lib/site'

// Facts about the product, each one checkable in the app today.
const FACTS = [
  { value: '6 states', label: 'Scored, absent, exempt, not applicable, pending, not assessed. Never a silent zero.' },
  { value: '3 vocabularies', label: 'School, college or university words, and any of them renamed.' },
  { value: 'Offline-safe', label: 'Marks keep saving when the connection drops, and sync once.' },
  { value: 'One click', label: 'From any number on a dashboard to the list behind it.' },
]

/** A small picture of the entry grid: marks, codes and a pending cell, never a zero for absence. */
function GridPicture() {
  const rows = [
    ['1', 'Aarav Rao', '34', '18', '7.5'],
    ['2', 'Diya Sharma', 'AB', 'AB', 'NA'],
    ['3', 'Kabir Khan', '29', 'EX', '9'],
    ['4', 'Meera Iyer', '38', '19.5', '·'],
  ]
  return (
    <figure aria-label="Marks entry, with absent, exempt and pending kept apart from zero" className="rounded-2xl border border-line bg-white p-4 shadow-[0_20px_60px_rgba(19,17,30,0.10)]">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-bold">Unit test 1 · Mathematics</span>
        <span className="text-emerald-700">All saved</span>
      </div>
      <table className="w-full text-sm tabular-nums">
        <thead className="text-[11px] uppercase tracking-wide text-muted">
          <tr>
            <th className="pb-2 text-left">Roll</th>
            <th className="pb-2 text-left">Name</th>
            <th className="pb-2 text-right">Part A / 40</th>
            <th className="pb-2 text-right">Part B / 20</th>
            <th className="pb-2 text-right">Practical / 10</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(([roll, name, ...cells]) => (
            <tr key={roll}>
              <td className="py-2 text-muted">{roll}</td>
              <td className="py-2 font-semibold">{name}</td>
              {cells.map((c, i) => (
                <td key={i} className={`py-2 text-right ${c === 'AB' || c === 'EX' || c === 'NA' ? 'font-bold text-brand-700' : c === '·' ? 'text-subtle' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="mt-3 text-xs text-muted">AB is absent, EX exempt, NA not applicable, a dot still to enter. None of them counts as zero.</figcaption>
    </figure>
  )
}

const faqData = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
}

export default function Home() {
  return (
    <Chrome>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqData) }} />

      <section className="bg-canvas">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="inline-block rounded-full border border-line bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-muted">
              For schools, colleges and universities
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
              Every mark kept exactly. <span className="text-brand">Every report understood.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              revU records what staff award, keeps absent and exempt apart from zero, and turns the marks into results you can explain and progress reports families read,
              in your institution’s own words.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={demoHref} className="rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white hover:bg-ink/85">
                Book a demo
              </a>
              <Link href="/features" className="rounded-xl border border-line bg-white px-5 py-3 text-sm font-semibold text-brand hover:bg-mist">
                See what it does
              </Link>
            </div>
            <p className="mt-4 text-sm text-subtle">Enter once. Understand deeply. Support every person you teach.</p>
          </div>
          <GridPicture />
        </div>
      </section>

      <section aria-label="What revU guarantees" className="border-y border-line bg-white">
        <dl className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {FACTS.map((f) => (
            <div key={f.value}>
              <dt className="text-2xl font-extrabold text-brand">{f.value}</dt>
              <dd className="mt-1 text-sm text-muted">{f.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="how" className="text-3xl font-extrabold">
          From your spreadsheets to a report, in four steps
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-2xl border border-line bg-white p-5">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-mist text-sm font-extrabold text-brand-700">{s.n}</span>
              <h3 className="mt-3 font-extrabold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="areas" className="bg-paper">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="areas" className="text-3xl font-extrabold">
            What revU does
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            Marked <StatusTag status="live" /> when it runs today, <StatusTag status="pilot" /> when it arrives during the pilot.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {AREAS.map((a) => (
              <Link key={a.id} href={`/features#${a.id}`} className="group rounded-2xl border border-line bg-white p-5 transition hover:border-brand">
                <h3 className="font-extrabold group-hover:text-brand">{a.name}</h3>
                <p className="mt-1 text-sm text-muted">{a.summary}</p>
                <ul className="mt-4 space-y-2">
                  {a.features.slice(0, 3).map((f) => (
                    <li key={f.title} className="flex items-center justify-between gap-3 text-sm">
                      <span>{f.title}</span>
                      <StatusTag status={f.status} />
                    </li>
                  ))}
                </ul>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="words" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <h2 id="words" className="text-3xl font-extrabold">
              In your institution’s own words
            </h2>
            <p className="mt-3 text-muted">
              A school has sections and terms, a college divisions and semesters, a university batches and faculty members. revU speaks each one, on every screen,
              and you can rename any word to the one your staff already use.
            </p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">The same screens in three kinds of institution</caption>
              <thead className="bg-canvas text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">School</th>
                  <th className="px-4 py-3">College</th>
                  <th className="px-4 py-3">University</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {WORDS.map((w) => (
                  <tr key={w.concept}>
                    <td className="px-4 py-2.5">{w.school}</td>
                    <td className="px-4 py-2.5">{w.college}</td>
                    <td className="px-4 py-2.5">{w.university}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section aria-labelledby="privacy" className="bg-ink text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <h2 id="privacy" className="text-3xl font-extrabold">
              Data about children, treated like it
            </h2>
            <p className="mt-3 text-white/75">Privacy is how revU is built, not a setting.</p>
            <Link href="/security" className="mt-5 inline-block rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink hover:bg-mist">
              How we protect it
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              ['Each institution apart', 'Walled off in the database itself, and tested on every change.'],
              ['Confidential by default', 'Marks and remarks stay with the staff who own them.'],
              ['No access for bhusku', 'Our staff have no access to any institution’s records.'],
              ['No advertising, ever', 'No profiling, no tracking of children, no selling of data.'],
            ].map(([t, d]) => (
              <li key={t} className="rounded-2xl border border-white/15 p-5">
                <h3 className="font-bold">{t}</h3>
                <p className="mt-1 text-sm text-white/75">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="faq" className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 id="faq" className="text-3xl font-extrabold">
          Questions institutions ask
        </h2>
        <div className="mt-6 divide-y divide-line rounded-2xl border border-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="cursor-pointer list-none font-bold marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {f.q}
                  <span aria-hidden="true" className="text-brand transition group-open:rotate-45">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="bg-canvas">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-3xl font-extrabold">Join the pilot</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted">
            We are working with a small number of institutions through one term: setup, marks, results and a report card. Tell us about yours.
          </p>
          <a href={demoHref} className="mt-6 inline-block rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-white hover:bg-ink/85">
            Book a demo
          </a>
        </div>
      </section>
    </Chrome>
  )
}

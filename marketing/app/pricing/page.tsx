import type { Metadata } from 'next'
import { Page } from '@/components/Page'
import { demoHref } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Pricing: Join the Pilot',
  description: 'revU is in its pilot. Prices are set after it, from what revU actually costs to run, per enrolled person per year with a minimum per institution.',
}

const PILOT = [
  'Setup of your structure, words and people from your spreadsheets',
  'Marks entry for one term, by keyboard, upload or phone',
  'Results under your scheme, a marksheet and a report card, as each arrives',
  'A named contact at bhusku through the term',
]

const MODEL = [
  { t: 'Per enrolled person, per year', d: 'One price for each person you assess, with a minimum per institution.' },
  { t: 'Modules as you need them', d: 'Core assessment and reports first; analysis, group control and scan capture as additions.' },
  { t: 'Messages near cost', d: 'Messages to families passed on at about what they cost us.' },
]

export default function Pricing() {
  return (
    <Page
      eyebrow="Pricing"
      title="Join the pilot"
      intro="We set prices after the pilot, from what revU actually costs to run for real institutions, not from a guess. Pilot institutions hear first."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="pilot" className="rounded-2xl border-2 border-brand p-6">
          <h2 id="pilot" className="text-xl font-extrabold">
            The pilot
          </h2>
          <p className="mt-1 text-sm text-muted">A small number of institutions, one term each.</p>
          <ul className="mt-4 space-y-2 text-sm">
            {PILOT.map((p) => (
              <li key={p} className="flex gap-2">
                <span aria-hidden="true" className="text-brand">✓</span>
                {p}
              </li>
            ))}
          </ul>
          <a href={demoHref} className="mt-6 inline-block rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white hover:bg-ink/85">
            Ask to join
          </a>
        </section>
        <section aria-labelledby="after" className="rounded-2xl border border-line p-6">
          <h2 id="after" className="text-xl font-extrabold">
            After the pilot
          </h2>
          <p className="mt-1 text-sm text-muted">The options we are weighing. What we choose, and the numbers, come from the pilot.</p>
          <ul className="mt-4 space-y-4">
            {MODEL.map((m) => (
              <li key={m.t}>
                <h3 className="font-bold">{m.t}</h3>
                <p className="text-sm text-muted">{m.d}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="mt-8 text-sm text-muted">
        Paying by bank transfer or UPI instead of online is fine: an institution is never required to use a payment gateway.
      </p>
    </Page>
  )
}

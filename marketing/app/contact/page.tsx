import type { Metadata } from 'next'
import { Page } from '@/components/Page'
import { CONTACT, appHref, demoHref } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Contact and Demos',
  description: 'Book a demo of revU with your own structure, ask about the pilot, or get help with your account.',
}

const card = 'rounded-2xl border border-line p-6'

export default function Contact() {
  return (
    <Page eyebrow="Contact" title="Talk to us" intro="A person reads every message.">
      <div className="grid gap-4 md:grid-cols-3">
        <section className={card}>
          <h2 className="font-extrabold">Book a demo</h2>
          <p className="mt-2 text-sm text-muted">Tell us your institution, its size and how you hold marks today. We show revU with your own structure.</p>
          <a href={demoHref} className="mt-4 inline-block rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/85">
            Write to us
          </a>
        </section>
        <section className={card}>
          <h2 className="font-extrabold">Join the pilot</h2>
          <p className="mt-2 text-sm text-muted">One term, a small number of institutions, and a named contact at bhusku throughout.</p>
          <a href={`mailto:${CONTACT}?subject=${encodeURIComponent('revU pilot')}`} className="mt-4 inline-block font-semibold text-brand">
            Ask about the pilot
          </a>
        </section>
        <section className={card}>
          <h2 className="font-extrabold">Already using revU</h2>
          <p className="mt-2 text-sm text-muted">Sign in with the account you use for other bhusku apps, or write to us for help.</p>
          <a href={appHref('/sign-in')} className="mt-4 inline-block font-semibold text-brand">
            Sign in
          </a>
        </section>
      </div>
      <p className="mt-10 text-sm text-muted">
        Email{' '}
        <a href={`mailto:${CONTACT}`} className="font-semibold text-brand">
          {CONTACT}
        </a>
      </p>
    </Page>
  )
}

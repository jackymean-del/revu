import type { Metadata } from 'next'
import Link from 'next/link'
import { Page } from '@/components/Page'
import { CONTACT } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy and Security for Data About Children',
  description: 'How revU keeps each institution apart, keeps marks confidential by default, gives bhusku staff no access, and never advertises or profiles.',
}

const PARTS = [
  {
    h: 'Each institution apart',
    p: 'Every institution is its own tenant. The database itself refuses a request from one institution for another’s rows, and an automated test tries exactly that for every table on every change before it ships.',
  },
  {
    h: 'Confidential by default',
    p: 'Marks and remarks belong to the staff who teach the class and to the administrators. Coordinators and heads see counts and status unless an administrator gives them more, and a view-only role sees numbers only.',
  },
  {
    h: 'No access for bhusku',
    p: 'The people who run revU see each institution’s name and counts, never its records. Creating an institution for a client gives us no access to it.',
  },
  {
    h: 'Every change recorded',
    p: 'Each mark keeps its history: who changed it, when, and why, when a locked assessment is changed. Administrators see a history of changes across the institution.',
  },
  {
    h: 'Sign-in done properly',
    p: 'Sign-in runs on Clerk, shared with schedU, with email codes, Google and an institution’s own single sign-on. revU never stores a password.',
  },
  {
    h: 'No advertising, no profiling',
    p: 'No advertising, no profiling for marketing, no tracking of children. Product measurements carry no names, marks or remark text.',
  },
  {
    h: 'Staff approve every remark',
    p: 'Where revU drafts a remark, the draft is built from the evidence, checked, and shown to the member of staff who signs it. Nothing reaches a family until they approve it.',
  },
  {
    h: 'Who processes data',
    p: 'Railway runs the server and database, Cloudflare serves the app, and Clerk handles sign-in. The institution decides how its data is used; bhusku processes it on the institution’s behalf.',
  },
]

export default function Security() {
  return (
    <Page
      eyebrow="Privacy and security"
      title="Data about children, treated like it"
      intro="revU holds marks, remarks and progress for young people. Privacy is how it is built, not a setting someone has to find."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {PARTS.map((x) => (
          <section key={x.h} className="rounded-2xl border border-line p-5">
            <h2 className="font-extrabold">{x.h}</h2>
            <p className="mt-2 text-sm text-muted">{x.p}</p>
          </section>
        ))}
      </div>
      <p className="mt-10 text-sm text-muted">
        Questions from your data protection officer are welcome at{' '}
        <a href={`mailto:${CONTACT}`} className="font-semibold text-brand">
          {CONTACT}
        </a>
        . Read our{' '}
        <Link href="/privacy" className="font-semibold text-brand">
          privacy notice
        </Link>
        .
      </p>
    </Page>
  )
}

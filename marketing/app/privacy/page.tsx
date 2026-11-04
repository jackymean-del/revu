import type { Metadata } from 'next'
import { Page } from '@/components/Page'
import { CONTACT } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy Notice',
  description: 'What revU and bhusku hold, why, who it is shared with, and how to ask about or remove your data.',
}

const h = 'mt-10 text-xl font-extrabold first:mt-0'
const p = 'mt-3 text-muted'

export default function Privacy() {
  return (
    <Page
      eyebrow="Privacy"
      title="Privacy notice"
      intro="A plain summary of how revU handles personal data. Each institution also receives a data processing agreement before it enters any student’s data."
    >
      <article>
        <h2 className={h}>Who decides, who processes</h2>
        <p className={p}>
          An institution that uses revU decides why and how its staff’s and students’ data is used. bhusku, which makes revU, processes that data on the institution’s behalf,
          and only to run revU for it.
        </p>
        <h2 className={h}>What is held</h2>
        <p className={p}>
          For staff: name, email, role and the classes they teach. For students: what the institution enters, such as name, admission number, class, marks, remarks and family
          contacts. For visitors to this site: nothing beyond what a browser sends with every page; this site sets no tracking cookies.
        </p>
        <h2 className={h}>What it is used for</h2>
        <p className={p}>To record assessments, calculate results, produce reports and show the institution its own progress. Never for advertising or profiling, and never sold.</p>
        <h2 className={h}>Who it is shared with</h2>
        <p className={p}>Only the services that run revU: Railway (server and database), Cloudflare (serving the app) and Clerk (sign-in). Institutions are told before that list changes.</p>
        <h2 className={h}>Your rights</h2>
        <p className={p}>
          A student, family or member of staff can ask their institution to see, correct or remove their data, and the institution does it in revU. You can also write to us at{' '}
          <a href={`mailto:${CONTACT}`} className="font-semibold text-brand">
            {CONTACT}
          </a>
          , and we pass the request to the institution that holds the data.
        </p>
      </article>
    </Page>
  )
}

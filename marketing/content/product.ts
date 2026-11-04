/**
 * What revU does, said once and used on every page. Each item says whether
 * it is live today or arrives during the pilot (blueprint Part 66, tasks P0.4
 * to P0.7), so nothing here promises more than the product does. Copy
 * describes what staff can do and never leads with AI (REVU.md, Copy).
 */

export type Status = 'live' | 'pilot'

export type Feature = { title: string; text: string; status: Status }

export type Area = { id: string; name: string; summary: string; features: Feature[] }

export const AREAS: Area[] = [
  {
    id: 'setup',
    name: 'Set up in an afternoon',
    summary: 'Your structure, in your words, ready before the first assessment.',
    features: [
      { title: 'Guided setup', text: 'Year, terms, levels, classes and subjects in a few steps, by keyboard if you like.', status: 'live' },
      { title: 'Your own words', text: 'Choose school, college or university words, then rename anything. Every screen follows.', status: 'live' },
      { title: 'Class lists from a spreadsheet', text: 'Upload Excel or CSV. A report shows every row it cannot take, and nobody is created twice.', status: 'live' },
      { title: 'Staff by invitation', text: 'Invite by email. People join with the account they already use for other bhusku apps.', status: 'live' },
    ],
  },
  {
    id: 'marks',
    name: 'Marks that never guess',
    summary: 'Absent, exempt and not applicable are recorded as what they are. A blank is pending, never a zero.',
    features: [
      { title: 'Entry that keeps up', text: 'Type a whole class by keyboard: a mark, Enter, the next person. Totals, or one mark per part of the paper.', status: 'live' },
      { title: 'Spreadsheet in, any row order', text: 'Download a template, fill it in Excel, upload it. Rows match by admission number, with a preview and one-step undo.', status: 'live' },
      { title: 'On a phone, and offline', text: 'One person at a time on a number pad. Edits made offline wait and sync, and a clash with someone else asks which mark stays.', status: 'live' },
      { title: 'Row status and partial absence', text: 'Absent for the whole test, or for one practical only. Marks under a status are hidden, never deleted.', status: 'live' },
      { title: 'Optional choices', text: 'Second languages and electives with their rules. Each paper lists only the people who chose it.', status: 'live' },
    ],
  },
  {
    id: 'results',
    name: 'Results you can explain',
    summary: 'Your scheme, your board rules, and every total opens to the marks behind it.',
    features: [
      { title: 'Your own scheme', text: 'Weights, best-of rules, absent and exempt treatment, grades: set as data, not hard-coded.', status: 'pilot' },
      { title: 'Explain this number', text: 'Click any total to see the marks, the rule and the arithmetic that made it.', status: 'pilot' },
      { title: 'Marksheets and report cards', text: 'An Excel marksheet and a PDF report from your template, with your branding.', status: 'pilot' },
      { title: 'Reteach lists', text: 'For each class, who needs another look at what, worked out from the marks themselves.', status: 'pilot' },
    ],
  },
  {
    id: 'families',
    name: 'Progress families read',
    summary: 'One clear report a family can follow, reached by a link.',
    features: [
      { title: 'Remarks staff approve', text: 'revU drafts a remark from the evidence; the member of staff who signs it reviews and approves every one.', status: 'pilot' },
      { title: 'Delivered by link', text: 'Families open the published report from a secure link sent to them.', status: 'pilot' },
    ],
  },
  {
    id: 'leaders',
    name: 'Leaders see what needs doing',
    summary: 'Every number on a dashboard opens to the list behind it.',
    features: [
      { title: 'Dashboards by role', text: 'Missing contacts, unplaced people, marks still to enter, choices not made: exceptions first.', status: 'live' },
      { title: 'Groups of institutions', text: 'Several institutions under one name, each still separate, with their status side by side.', status: 'live' },
      { title: 'History of every change', text: 'Who changed what and when, with before and after.', status: 'live' },
    ],
  },
  {
    id: 'privacy',
    name: 'Private by default',
    summary: 'Data about children is treated like it.',
    features: [
      { title: 'Each institution apart', text: 'Every institution’s records are walled off in the database itself, and tested on every change.', status: 'live' },
      { title: 'Confidential by default', text: 'Marks and remarks stay with the staff who own them; leaders see what their role allows.', status: 'live' },
      { title: 'No access for bhusku', text: 'bhusku staff have no access to any institution’s records, marks or remarks.', status: 'live' },
    ],
  },
]

/** How the same screen reads in each kind of institution. Kept equal to the app's presets by content-verify.mts. */
export const WORDS: { concept: string; school: string; college: string; university: string }[] = [
  { concept: 'person.student', school: 'Student', college: 'Student', university: 'Learner' },
  { concept: 'group.section', school: 'Section', college: 'Division', university: 'Batch' },
  { concept: 'period.term', school: 'Term', college: 'Semester', university: 'Semester' },
  { concept: 'person.teacher', school: 'Teacher', college: 'Lecturer', university: 'Faculty member' },
  { concept: 'report.report_card', school: 'Report card', college: 'Marksheet', university: 'Grade sheet' },
]

export const STEPS = [
  { n: '1', title: 'Set up', text: 'Structure, words and people, from your own spreadsheets.' },
  { n: '2', title: 'Enter', text: 'Marks by keyboard, upload or phone, with every state kept.' },
  { n: '3', title: 'Check', text: 'Dashboards show what is missing before anyone has to ask.' },
  { n: '4', title: 'Report', text: 'Results under your scheme, and a report families understand.' },
]

/** Every answer is true of the product today, or says when it arrives. */
export const FAQ = [
  {
    q: 'Does revU decide marks or grades with AI?',
    a: 'No. Staff award every mark; revU records it exactly, keeps absent and exempt apart from zero, and calculates results by your own scheme with arithmetic you can inspect. AI is used only to draft remarks in the pilot, and a member of staff reviews and approves each one.',
  },
  {
    q: 'Does it fit a college or a university, not only a school?',
    a: 'Yes. Choose school, college or university words when you start, and rename any of them. Divisions, batches, semesters and faculty members all read the way your institution says them.',
  },
  {
    q: 'Can we bring our class lists and marks from Excel?',
    a: 'Yes. Class lists upload with a report of every row that cannot be taken. Marks upload from a template matched by admission number, so the row order never matters, with a preview before anything changes and a one-step undo.',
  },
  {
    q: 'What happens if the internet drops during entry?',
    a: 'Marks keep saving to the device and go up when the connection is back. If someone changed the same mark meanwhile, revU shows both and asks which one stays.',
  },
  {
    q: 'Who can see the marks?',
    a: 'By default, the staff who teach the class and the administrators. Leaders see counts and status unless they are given more. bhusku staff have no access to anything inside your institution.',
  },
  {
    q: 'What does it cost?',
    a: 'revU is in its pilot. Prices are set after the pilot from what it actually costs to run, as a price per enrolled person per year with a minimum per institution. Pilot institutions hear first.',
  },
]

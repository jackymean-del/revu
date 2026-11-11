import { expect, test, type Page, type Route } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-000000000012'
const scale = [
  { name: 'Beginner', min: 0 },
  { name: 'Developing', min: 40 },
  { name: 'Proficient', min: 60 },
  { name: 'Advanced', min: 80 },
]

function fakeApi(page: Page, roles = ['class_teacher']) {
  const sent: { path: string; body: unknown }[] = []
  const json = (r: Route, body: unknown, s = 200) => r.fulfill({ status: s, json: body })
  let report = {
    student: { id: 'st1', name: 'Asha Rao', admissionNo: 'A-1', rollNo: '1' },
    section: 'Grade 6 A', sectionId: 's6a', period: 'Term 1', periodId: 't1', scale,
    scores: [{ subjectId: 'math', subject: 'Mathematics', pct: 72, grade: 'B1', classPct: 61, trend: [60, 72] }], overall: 72,
    profile: [{ subjectId: 'math', subject: 'Mathematics', competencies: [{ id: 'c1', name: 'Problem solving', level: 3, pct: 72, marks: 4 }] }],
    blooms: [{ level: 'apply', pct: 72, classPct: 61, marks: 4 }],
    activities: [{ competencyId: 'a1', name: 'Music', subject: 'Activities', level: 0 }],
    strengths: [], focus: [], voices: { self: '', peer: '', parent: '', ambition: '' }, note: { text: '', status: '', fromAi: false }, canEdit: true,
  }
  void page.route('**/v1/me', (r) => json(r, { userId: 'user_1', orgs: [{ id: ORG, name: 'Hill View', preset: 'school', roles, setupDone: true, staffId: 'staff-1' }] }))
  void page.route('**/v1/terminology', (r) => json(r, { preset: 'school', overrides: [] }))
  void page.route('**/v1/setup', (r) =>
    json(r, { years: 1, periods: 1, levels: 1, sections: 1, subjects: 1, levelSubjects: 1, staff: 3, students: 2, invitations: 0, done: true, assessments: 1, marks: 9, schemes: 1, results: 9, reports: 0, papers: 0, assigned: 0 }),
  )
  void page.route(/\/v1\/years(\?.*)?$/, (r) => json(r, [{ id: 'y', label: '2026-27', startsOn: '2026-04-01', endsOn: '2027-03-31' }]))
  void page.route(/\/v1\/periods(\?.*)?$/, (r) => json(r, [{ id: 't1', yearId: 'y', name: 'Term 1', seq: 1, kind: 'term', startsOn: '2026-04-01', endsOn: '2026-09-30' }]))
  void page.route(/\/v1\/levels(\?.*)?$/, (r) => json(r, [{ id: 'l6', name: 'Grade 6', seq: 6 }]))
  void page.route(/\/v1\/sections(\?.*)?$/, (r) => json(r, [{ id: 's6a', name: 'A', levelId: 'l6', yearId: 'y', branchId: 'b' }]))
  void page.route(/\/v1\/teaching-assignments(\?.*)?$/, (r) => json(r, [{ id: 'ta', staffId: 'staff-1', sectionId: 's6a', subjectId: 'math' }]))
  void page.route(/\/v1\/(subjects|staff|subject-groups|branches)(\?.*)?$/, (r) => json(r, []))
  void page.route(/\/v1\/holistic\/class\?/, (r) =>
    json(r, {
      section: 'Grade 6 A', period: 'Term 1', scale, canEdit: true,
      students: [
        { id: 'st1', name: 'Asha Rao', admissionNo: 'A-1', rollNo: '1', overall: 72, note: '', rated: 0, voices: 0 },
        { id: 'st2', name: 'Ravi Kumar', admissionNo: 'A-2', rollNo: '2', overall: 55, note: '', rated: 0, voices: 0 },
      ],
      competencies: [{ id: 'c1', name: 'Problem solving', subject: 'Mathematics' }],
      cells: [[{ level: 3, pct: 72, marks: 4 }], [{ level: 0, pct: 50, marks: 2 }]],
      activities: [{ id: 'a1', name: 'Music', subject: 'Activities' }],
      summary: [{ id: 'c1', counts: [1, 0, 0, 1, 0] }],
    }),
  )
  void page.route(/\/v1\/holistic\/student\?/, (r) => json(r, report))
  void page.route('**/v1/holistic/student', (r) => {
    const body = r.request().postDataJSON()
    sent.push({ path: 'student', body })
    report = { ...report, activities: [{ ...report.activities[0], level: body.ratings[0].level }], voices: body.voices, note: { text: body.note.text, status: body.note.approve ? 'approved' : 'draft', fromAi: body.note.fromAi } }
    return json(r, report)
  })
  void page.route('**/v1/holistic/note-draft', (r) => {
    sent.push({ path: 'draft', body: r.request().postDataJSON() })
    return json(r, { text: 'Asha solves problems with care.' })
  })
  void page.route(/\/v1\/holistic\/html\?/, (r) => r.fulfill({ contentType: 'text/html', body: `<h1>Hill View</h1><p>${report.student.name}</p><p class="note">${report.note.status === 'approved' ? report.note.text : ''}</p>` }))
  return { sent }
}

test('the class heatmap, then a child: ratings, voices and an AI-drafted note approved by the teacher', async ({ page }) => {
  const api = fakeApi(page)
  await page.goto('/holistic')
  const map = page.getByRole('region', { name: 'Class heatmap' })
  await expect(map.getByRole('columnheader', { name: /Problem solving/ })).toBeVisible()
  await expect(map.getByRole('row', { name: /Asha Rao/ })).toContainText('●●●○')
  await expect(map.getByRole('row', { name: /Ravi Kumar/ }).getByTitle('Too little evidence: 2 marks')).toBeVisible()

  await map.getByRole('button', { name: /Asha Rao/ }).click()
  await expect(page).toHaveURL(/child=st1/)
  await expect(page.frameLocator('iframe').locator('h1')).toHaveText('Hill View')
  await page.getByLabel('Music rating').selectOption({ label: 'Proficient' })
  await page.getByLabel('Ambition').fill('To be a doctor.')
  await page.getByRole('button', { name: 'Draft with AI' }).click()
  await expect(page.getByLabel('Note for the family')).toHaveValue('Asha solves problems with care.')
  await expect(page.getByText('Drafted by AI from the levels')).toBeVisible()
  await page.getByRole('button', { name: 'Save and approve the note' }).click()
  await expect(page.getByRole('status')).toContainText('the note is approved')
  expect(api.sent.at(-1)).toEqual({
    path: 'student',
    body: { studentId: 'st1', periodId: 't1', ratings: [{ competencyId: 'a1', level: 3 }], voices: { self: '', peer: '', parent: '', ambition: 'To be a doctor.' }, note: { text: 'Asha solves problems with care.', approve: true, fromAi: true } },
  })
  await expect(page.frameLocator('iframe').locator('.note')).toHaveText('Asha solves problems with care.')
  // Next moves through the class without going back.
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL(/child=st2/)
})

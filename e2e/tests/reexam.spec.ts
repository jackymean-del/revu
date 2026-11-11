import { expect, test, type Page, type Route } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-000000000013'

function fakeApi(page: Page) {
  const sent: { path: string; body: unknown }[] = []
  const json = (r: Route, body: unknown, s = 200) => r.fulfill({ status: s, json: body })
  const sitter = (id: string, name: string, roll: string, pct: number | undefined, state: string, suggested: boolean, reason: string) => ({
    studentId: id, name, admissionNo: `A-${roll}`, rollNo: roll, sectionId: 's6a', section: 'Grade 6 A', pct, state, suggested, reason,
  })
  const summary = { id: 'rx', sourceId: 'pt1', title: 'Test 1, re-exam', sourceTitle: 'Test 1', subject: 'Mathematics', attempt: 2, heldOn: '', policy: 'higher', absentRule: 'keep', status: 'draft', sitting: 2, marked: 2, sectionIds: ['s6a'] }
  let detail = {
    ...summary,
    candidates: [
      { ...sitter('st1', 'Asha Rao', '1', 30, 'scored', true, 'Below 40%: 30%'), byHand: false, retake: sitter('st1', 'Asha Rao', '1', 50, 'scored', false, ''), before: { state: 'complete', pct: '30', grade: 'C' }, after: { state: 'complete', pct: '50', grade: 'B2' } },
      { ...sitter('st3', 'Meera Das', '3', 72, 'scored', true, 'Wants to improve'), byHand: true, retake: sitter('st3', 'Meera Das', '3', 60, 'scored', false, ''), before: { state: 'complete', pct: '72', grade: 'B1' }, after: { state: 'complete', pct: '72', grade: 'B1' } },
    ],
    changes: { up: 1, down: 0, same: 1, pending: 0 },
    canApprove: true,
    canPlan: true,
  }
  void page.route('**/v1/me', (r) => json(r, { userId: 'user_1', orgs: [{ id: ORG, name: 'Hill View', preset: 'school', roles: ['admin'], setupDone: true, staffId: 'staff-1' }] }))
  void page.route('**/v1/terminology', (r) => json(r, { preset: 'school', overrides: [] }))
  void page.route('**/v1/setup', (r) =>
    json(r, { years: 1, periods: 1, levels: 1, sections: 1, subjects: 1, levelSubjects: 1, staff: 3, students: 3, invitations: 0, done: true, assessments: 1, marks: 9, schemes: 1, results: 9, reports: 1, papers: 1, assigned: 1 }),
  )
  void page.route(/\/v1\/years(\?.*)?$/, (r) => json(r, [{ id: 'y', label: '2026-27', startsOn: '2026-04-01', endsOn: '2027-03-31' }]))
  void page.route(/\/v1\/levels(\?.*)?$/, (r) => json(r, [{ id: 'l6', name: 'Grade 6', seq: 6 }]))
  void page.route(/\/v1\/sections(\?.*)?$/, (r) => json(r, [{ id: 's6a', name: 'A', levelId: 'l6', yearId: 'y', branchId: 'b' }]))
  void page.route(/\/v1\/subjects(\?.*)?$/, (r) => json(r, [{ id: 'math', name: 'Mathematics', kind: 'academic' }]))
  void page.route(/\/v1\/(staff|subject-groups|periods|teaching-assignments|branches)(\?.*)?$/, (r) => json(r, []))
  void page.route(/\/v1\/assessments(\?.*)?$/, (r) =>
    json(r, [{ id: 'pt1', yearId: 'y', periodId: 'p', levelId: 'l6', subjectId: 'math', title: 'Test 1', kind: 'periodic_test', entryMode: 'total', status: 'open', sectionIds: ['s6a'], parts: [] }]),
  )
  void page.route('**/v1/reexams/preview', (r) => {
    sent.push({ path: 'preview', body: r.request().postDataJSON() })
    return json(r, {
      sourceId: 'pt1', title: 'Test 1', subject: 'Mathematics',
      sitters: [sitter('st1', 'Asha Rao', '1', 30, 'scored', true, 'Below 40%: 30%'), sitter('st2', 'Ravi Kumar', '2', undefined, 'absent', true, 'Absent'), sitter('st3', 'Meera Das', '3', 72, 'scored', false, '')],
    })
  })
  void page.route('**/v1/reexams', (r) => {
    if (r.request().method() === 'POST') {
      sent.push({ path: 'create', body: r.request().postDataJSON() })
      return json(r, detail, 201)
    }
    return json(r, [summary])
  })
  void page.route('**/v1/reexams/rx', (r) => json(r, detail))
  void page.route('**/v1/reexams/rx/*', (r) => {
    const step = r.request().url().split('/').pop()!
    sent.push({ path: step, body: null })
    detail = { ...detail, status: step === 'approve' ? 'approved' : 'applied' }
    return json(r, detail)
  })
  return { sent }
}

test('a re-exam from rules and a hand pick, previewed, approved and applied', async ({ page }) => {
  const api = fakeApi(page)
  await page.goto('/reexam')
  await expect(page.getByRole('link', { name: /Test 1, re-exam/ })).toContainText('Policy to approve')
  await page.getByRole('button', { name: 'Plan a re-exam' }).click()

  // The rules tick Asha (below 40%) and Ravi (absent); Meera is added by hand.
  await expect(page.getByRole('status').filter({ hasText: 'ticked' })).toContainText('2 of 3 ticked')
  await page.getByLabel('Ravi Kumar sits it').uncheck()
  await page.getByLabel('Meera Das sits it').check()
  await page.getByRole('button', { name: 'Make the re-exam for 2' }).click()
  await expect(page.getByRole('alert')).toHaveText('Say why for Meera Das.')
  await page.getByLabel('Why Meera Das sits it').fill('Wants to improve')
  await page.getByRole('button', { name: 'Make the re-exam for 2' }).click()
  await expect(page).toHaveURL(/id=rx/)
  expect(api.sent.find((s) => s.path === 'create')?.body).toMatchObject({
    sourceId: 'pt1', policy: 'higher', absentRule: 'keep',
    students: [{ studentId: 'st1', reason: 'Below 40%: 30%', byHand: false }, { studentId: 'st3', reason: 'Wants to improve', byHand: true }],
  })

  // Before and after under the policy, then approve and apply.
  await expect(page.getByRole('status').filter({ hasText: 'Under this policy' })).toContainText('1 up, 0 down, 1 the same')
  await expect(page.getByRole('row', { name: /Asha Rao/ })).toContainText('50% B2')
  await page.getByRole('button', { name: 'Approve the policy' }).click()
  await page.getByRole('button', { name: 'Apply to results' }).click()
  await expect(page.getByText('Counted in results').first()).toBeVisible()
  expect(api.sent.filter((s) => s.path === 'approve' || s.path === 'apply').map((s) => s.path)).toEqual(['approve', 'apply'])
})

import { expect, test, type Page, type Route } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-000000000008'
const SECTION = 'sec-6a'

const counts = {
  years: 1, periods: 2, levels: 3, sections: 6, subjects: 6, levelSubjects: 18, staff: 9, students: 240, invitations: 0, done: true,
  assessments: 1, marks: 0, schemes: 0, results: 0, reports: 0, papers: 0, assigned: 0,
}

function fakeApi(page: Page, roles: string[]) {
  const json = (r: Route, body: unknown, s = 200) => r.fulfill({ status: s, json: body })
  void page.route('**/v1/me', (r) => json(r, { userId: 'user_1', orgs: [{ id: ORG, name: 'Hill View School', preset: 'school', roles, setupDone: true, staffId: 'staff-1' }] }))
  void page.route('**/v1/terminology', (r) => json(r, { preset: 'school', overrides: [] }))
  void page.route('**/v1/setup', (r) => json(r, counts))
  void page.route('**/v1/dashboard', (r) => json(r, { tiles: [{ key: 'total_students', count: 240, status: 'info', listable: false }] }))
  void page.route(/\/v1\/years(\?.*)?$/, (r) => json(r, [{ id: 'y', label: '2026-27', startsOn: '2026-04-01', endsOn: '2027-03-31' }]))
  void page.route(/\/v1\/periods(\?.*)?$/, (r) => json(r, [{ id: 't1', yearId: 'y', name: 'Term 1', seq: 1, kind: 'term', startsOn: '2026-04-01', endsOn: '2026-09-30' }]))
  void page.route(/\/v1\/levels(\?.*)?$/, (r) => json(r, [{ id: 'l6', name: 'Grade 6', seq: 6 }]))
  void page.route(/\/v1\/sections(\?.*)?$/, (r) => json(r, [{ id: SECTION, name: 'A', levelId: 'l6', yearId: 'y', branchId: 'b' }]))
  void page.route(/\/v1\/subjects(\?.*)?$/, (r) => json(r, [{ id: 'math', name: 'Mathematics', kind: 'academic' }]))
  void page.route(/\/v1\/teaching-assignments(\?.*)?$/, (r) => json(r, [{ id: 'ta', staffId: 'staff-1', sectionId: SECTION, subjectId: 'math' }]))
  void page.route(/\/v1\/assessments(\?.*)?$/, (r) =>
    json(r, [
      {
        id: 'ut1', title: 'Unit test 1', kind: 'periodic_test', entryMode: 'sections', status: 'open', heldOn: '2026-07-10', yearId: 'y', periodId: 't1', levelId: 'l6',
        subjectId: 'math', sectionIds: [SECTION],
        parts: [{ id: 'pa', seq: 1, name: 'A', kind: 'main', maxMarks: '20', countsInTotal: true }, { id: 'pb', seq: 2, name: 'B', kind: 'main', maxMarks: '20', countsInTotal: true }],
      },
    ]),
  )
}

test('Home shows the steps in order and the one thing to do next', async ({ page }) => {
  fakeApi(page, ['admin'])
  await page.goto('/')
  // The steps in the order of the institution's own notes: master data
  // first, set up once, then the exam steps of every term.
  const master = page.getByRole('region', { name: 'Master', exact: true }).getByRole('listitem')
  const exams = page.getByRole('region', { name: 'Exam steps' }).getByRole('listitem')
  const title = (els: Element[]) => els.map((el) => el.querySelector('.text-base')?.textContent ?? '')
  expect(await master.evaluateAll(title)).toEqual(['Resources', 'Configuration', 'Create exam'])
  expect(await exams.evaluateAll(title)).toEqual(['Create question paper', 'Assign paper', 'Evaluate exam', 'Scheme', 'Reports and analysis', 'Re-exam'])
  await expect(master.nth(0)).toContainText('Done')
  await expect(exams.nth(0)).toContainText('Next')
  await expect(exams.nth(1)).toContainText('To do')
  await expect(exams.nth(5)).toContainText('When needed')
  // Reports and Re-exam work both ways, shown by the link between them.
  await expect(page.getByRole('img', { name: /Works both ways with Re-exam/ })).toBeVisible()
  // and re-exam marks go one way, into Evaluate exam.
  await expect(page.getByRole('img', { name: 'Re-exam marks go to Evaluate exam' })).toBeVisible()
  // The menu groups them the same way.
  const menu = page.getByRole('navigation', { name: 'Main' })
  await expect(menu.getByText('Master', { exact: true })).toBeVisible()
  await expect(menu.getByText('Exam steps')).toBeVisible()

  // One assessment and no paper or marks yet: the next step is its paper.
  const next = page.getByRole('region', { name: 'Next step' })
  await expect(next).toContainText('Make a question paper from a blueprint')
  await expect(next).toContainText('Exam step 1 of 6, Create question paper')
  await next.getByRole('link', { name: 'Start' }).click()
  await expect(page).toHaveURL(/\/papers$/)
  // The bar names the step.
  await expect(page.locator('main').getByText('Create question paper').first()).toBeVisible()
})

test('a step with several pages shows them as tabs, with the next step beside them', async ({ page }) => {
  fakeApi(page, ['admin'])
  await page.goto('/results')
  const tabs = page.getByRole('navigation', { name: 'Scheme' })
  await expect(tabs.getByRole('link')).toHaveText(['Results', 'Schemes'])
  await expect(tabs.getByRole('link', { name: 'Results' })).toHaveAttribute('aria-current', 'page')
  // Away from that step, the bar still says what is next.
  await page.getByRole('link', { name: /Next\s*Make a question paper/ }).click()
  await expect(page).toHaveURL(/\/papers$/)
  // The menu keeps one entry per step and marks the one open.
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Create question paper' })).toHaveAttribute('aria-current', 'page')
})

test('from the list of assessments, one click opens its marks', async ({ page }) => {
  fakeApi(page, ['teacher'])
  await page.goto('/exams')
  await expect(page.getByRole('heading', { name: 'Assessments', level: 1 })).toBeVisible()
  await expect(page.getByText('Grade 6 A · 2 parts · 2026-07-10')).toBeVisible()
  // The row's own link, not the bar's next step of the same name.
  await page.getByRole('listitem').filter({ hasText: 'Unit test 1' }).getByRole('link', { name: 'Enter marks' }).click()
  await expect(page).toHaveURL(/\/marks\?a=ut1%2Fsec-6a/)
  await expect(page.getByLabel('Exam')).toHaveValue('Unit test 1')
  await expect(page.getByLabel('Subject', { exact: true })).toHaveValue('ut1')
  await expect(page.getByLabel('Section', { exact: true })).toHaveValue('ut1/sec-6a')
})

test('on a phone the menu is a drawer behind a button', async ({ page }) => {
  fakeApi(page, ['admin'])
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/')
  const menu = page.getByRole('navigation', { name: 'Main' })
  await expect(menu).not.toBeInViewport()
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(menu).toBeInViewport()
  await menu.getByRole('link', { name: 'Scheme' }).click()
  await expect(page).toHaveURL(/\/results$/)
  await expect(menu).not.toBeInViewport()
})

test('Ctrl+K finds a page, an assessment or a name, and goes there', async ({ page }) => {
  fakeApi(page, ['admin'])
  void page.route(/\/v1\/students\?/, (r) =>
    r.fulfill({ json: { items: [{ id: 'st1', admissionNo: 'HV-0007', name: 'Asha Rao', status: 'active' }], nextCursor: '' } }),
  )
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
  await page.keyboard.press('Control+k')
  const box = page.getByRole('dialog', { name: 'Search' })
  await box.getByRole('combobox').fill('marks')
  await expect(box.getByRole('option').first()).toContainText('Evaluate exam')
  await box.getByRole('combobox').fill('math unit')
  await expect(box.getByRole('option').first()).toContainText('Mathematics, Unit test 1')
  await box.getByRole('combobox').press('Enter')
  await expect(page).toHaveURL(/\/marks\?a=ut1%2Fsec-6a/)
  await expect(box).toHaveCount(0)

  await page.getByRole('button', { name: 'Search' }).click()
  await box.getByRole('combobox').fill('asha')
  await box.getByRole('option', { name: /Asha Rao/ }).click()
  await expect(page).toHaveURL(/\/people\?q=HV-0007/)
})

test('what waits on a person is on Home, counted beside Home in the menu, a click from where it is dealt with', async ({ page }) => {
  fakeApi(page, ['coordinator'])
  void page.route('**/v1/waiting', (r) =>
    r.fulfill({
      json: [
        { kind: 'set_to_approve', title: 'Approve Set A', detail: 'Mathematics, Unit test 1 · Grade 6', href: '/papers?a=ut1&tab=sets&set=pA', since: new Date().toISOString() },
        { kind: 'blueprint_to_approve', title: 'Approve the blueprint', detail: 'Mathematics, Unit test 2 · Grade 6', href: '/papers?a=ut2&tab=blueprint', since: '' },
      ],
    }),
  )
  await page.goto('/')
  const box = page.getByRole('region', { name: /Waiting for you/ })
  await expect(box.getByRole('link')).toHaveCount(2)
  await expect(box.getByRole('link').first()).toContainText('Approve Set A')
  await expect(box.getByRole('link').first()).toContainText('just now')
  await expect(page.getByLabel('2 waiting for you')).toBeVisible()
  await box.getByRole('link', { name: /Approve Set A/ }).click()
  await expect(page).toHaveURL(/\/papers\?a=ut1&tab=sets&set=pA/)
})

test('nothing waiting shows nothing', async ({ page }) => {
  fakeApi(page, ['teacher'])
  void page.route('**/v1/waiting', (r) => r.fulfill({ json: [] }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
  await expect(page.getByRole('region', { name: /Waiting for you/ })).toHaveCount(0)
})

test('only the platform owner has the Switch menu; an administrator does not', async ({ page }) => {
  fakeApi(page, ['admin'])
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Switch' })).toHaveCount(0)
})

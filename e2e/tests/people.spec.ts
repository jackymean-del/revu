import { expect, test } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-000000000001'

// The import wizard: choose a file, read the report, import, see the result.
// The API is mocked; the real rules are proven by the Go tests on a database.
test('an administrator checks a class list, sees what cannot be imported, and imports the rest', async ({ page }) => {
  let uploaded = ''
  let applied = false
  await page.route('**/v1/me', (route) =>
    route.fulfill({ json: { userId: 'user_e2e', orgs: [{ id: ORG, name: 'Riverside Public School', preset: 'school', roles: ['admin'] }] } }),
  )
  await page.route('**/v1/terminology', (route) => route.fulfill({ json: { preset: 'school', overrides: [] } }))
  await page.route(/\/v1\/(years|levels|sections|staff|branches)(\?.*)?$/, (route) => route.fulfill({ json: [] }))
  await page.route(/\/v1\/students(\?.*)?$/, (route) => route.fulfill({ json: { items: [] } }))
  await page.route('**/v1/import-jobs', (route) => route.fulfill({ json: [] }))
  await page.route('**/v1/students/import', async (route) => {
    uploaded = route.request().postData() ?? ''
    await route.fulfill({
      status: 201,
      json: {
        id: 'job-1', fileName: 'class-6a.csv', rows: 3, create: 2, update: 0, unchanged: 0, rejected: 1,
        problems: [{ row: 4, admissionNo: 'A-3', name: '', reasons: ['name is missing'] }],
        columns: ['Admission number', 'Name'], unknownColumns: ['Colour'],
      },
    })
  })
  await page.route('**/v1/import-jobs/job-1/apply', (route) => {
    applied = true
    return route.fulfill({
      json: { id: 'job-1', fileName: 'class-6a.csv', status: 'applied', rows: 3, createdAt: '2026-11-02T10:00:00Z', summary: { created: 2, updated: 0, unchanged: 0, rejected: 1 } },
    })
  })

  await page.goto('/people')
  await page.getByRole('tab', { name: 'Import a class list' }).click()
  await expect(page.getByRole('button', { name: 'Check the file' })).toBeDisabled()
  await page.locator('input[type=file]').setInputFiles({
    name: 'class-6a.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Admission number,Name,Colour\nA-1,Asha,red\nA-2,Bilal,blue\nA-3,,green\n'),
  })
  await page.getByRole('button', { name: 'Check the file' }).click()

  await expect(page.getByText('Nothing has changed yet.')).toBeVisible()
  expect(uploaded).toContain('A-2,Bilal,blue')
  await expect(page.getByText('Will be added')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'name is missing' })).toBeVisible()
  await expect(page.getByText('Ignored: Colour')).toBeVisible()
  expect(applied).toBe(false)

  await page.getByRole('button', { name: 'Import 2 students' }).click()
  await expect(page.getByRole('heading', { name: 'Imported' })).toBeVisible()
  expect(applied).toBe(true)
})

test('the student form fields have names a screen reader can announce', async ({ page }) => {
  await page.route('**/v1/me', (route) =>
    route.fulfill({ json: { userId: 'user_e2e', orgs: [{ id: ORG, name: 'Lakeview University', preset: 'university', roles: ['admin'] }] } }),
  )
  await page.route('**/v1/terminology', (route) => route.fulfill({ json: { preset: 'university', overrides: [] } }))
  await page.route(/\/v1\/(years|levels|sections)(\?.*)?$/, (route) => route.fulfill({ json: [] }))
  await page.route(/\/v1\/students(\?.*)?$/, (route) => route.fulfill({ json: { items: [] } }))
  await page.goto('/people')
  // The university's words: learners and enrolment numbers.
  await expect(page.getByRole('tab', { name: 'Learners' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Enrolment number' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Date of birth' })).toBeVisible()
})

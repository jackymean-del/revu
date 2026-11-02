import { expect, test } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-000000000001'

const entries = [
  {
    id: 'e2', at: '2026-11-02T10:05:00Z', actorId: 'user_1', actorName: 'Asha Rao', action: 'update', entity: 'students',
    entityId: '01a19bae-0000-7000-8000-0000000000a1', requestId: 'req-2',
    before: { id: 'x', name: 'Ravi Kumar', admissionNo: 'A-001', dob: '' }, after: { id: 'x', name: 'Ravi K. Kumar', admissionNo: 'A-001', dob: '2014-06-21' },
  },
  { id: 'e1', at: '2026-11-02T10:00:00Z', action: 'sync', entity: 'memberships', after: { user: 'user_9', roles: ['teacher'] } },
]

test('an administrator reads who changed what, and opens one change', async ({ page }) => {
  const asked: string[] = []
  await page.route('**/v1/me', (route) =>
    route.fulfill({ json: { userId: 'user_1', orgs: [{ id: ORG, name: 'Riverside Public School', preset: 'school', roles: ['admin'] }] } }),
  )
  await page.route('**/v1/terminology', (route) => route.fulfill({ json: { preset: 'school', overrides: [] } }))
  await page.route('**/v1/audit/facets', (route) =>
    route.fulfill({ json: { entities: ['memberships', 'students'], actions: ['sync', 'update'], actors: [{ id: 'user_1', name: 'Asha Rao' }] } }),
  )
  await page.route(/\/v1\/audit\?.*$|\/v1\/audit$/, (route) => {
    const url = new URL(route.request().url())
    asked.push(url.search)
    const entity = url.searchParams.get('entity')
    return route.fulfill({ json: { items: entries.filter((e) => !entity || e.entity === entity) } })
  })

  await page.goto('/settings/history')
  await expect(page.getByRole('cell', { name: 'Changed students: Ravi K. Kumar' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Sign-in sync' })).toBeVisible()

  await page.getByRole('button', { name: 'Details' }).first().click()
  await expect(page.getByRole('cell', { name: 'Ravi Kumar', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '2014-06-21', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Date of birth', exact: true })).toBeVisible()
  await expect(page.getByText('Request req-2')).toBeVisible()

  // The filter names records in the school's words and narrows the list.
  await page.getByRole('combobox', { name: 'What' }).selectOption({ label: 'Students' })
  await expect(page.getByRole('cell', { name: 'Sign-in sync' })).toHaveCount(0)
  expect(asked.some((q) => q.includes('entity=students'))).toBe(true)
})

test('a teacher is told the history is for administrators', async ({ page }) => {
  await page.route('**/v1/me', (route) =>
    route.fulfill({ json: { userId: 'user_2', orgs: [{ id: ORG, name: 'Riverside Public School', preset: 'school', roles: ['teacher'] }] } }),
  )
  await page.route('**/v1/terminology', (route) => route.fulfill({ json: { preset: 'school', overrides: [] } }))
  await page.goto('/settings/history')
  await expect(page.getByText('Only an administrator or the principal can see the history.')).toBeVisible()
})

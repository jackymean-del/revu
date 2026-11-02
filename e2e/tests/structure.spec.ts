import { expect, test, type Route } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-000000000001'

// A small in-memory API for the structure screen: years and levels, with the
// server's refusal when something still uses an item.
test('an administrator adds a year and is told why a used item cannot go', async ({ page }) => {
  const years: Array<Record<string, unknown>> = []
  await page.route('**/v1/me', (route) =>
    route.fulfill({ json: { userId: 'user_e2e', orgs: [{ id: ORG, name: 'Riverside Public School', preset: 'school', roles: ['admin'] }] } }),
  )
  await page.route('**/v1/terminology', (route) => route.fulfill({ json: { preset: 'school', overrides: [] } }))
  await page.route(/\/v1\/(levels|branches|subjects|sections|periods)(\?.*)?$/, (route) => route.fulfill({ json: [] }))
  await page.route(/\/v1\/years(\/[^/?]+)?(\?.*)?$/, async (route: Route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      const y = { id: `0000000${years.length}-0000-7000-8000-000000000000`, ...req.postDataJSON() }
      years.push(y)
      return route.fulfill({ status: 201, json: y })
    }
    if (req.method() === 'DELETE') {
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        json: { type: 'about:blank', title: 'Conflict', status: 409, code: 'structure.in_use', detail: 'Still used by 2 sections. Remove or move those first.' },
      })
    }
    return route.fulfill({ json: years })
  })

  await page.goto('/settings/structure')
  await expect(page.getByRole('tab', { name: 'Academic years and terms' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('No academic years yet.')).toBeVisible()

  // Required fields are caught before anything is sent.
  await page.getByRole('button', { name: 'Add' }).first().click()
  await expect(page.getByText('Fill this in.').first()).toBeVisible()
  expect(years).toHaveLength(0)

  await page.getByRole('textbox', { name: 'New academic year: Label' }).fill('2026-27')
  await page.getByRole('textbox', { name: 'New academic year: Starts' }).fill('2026-04-01')
  await page.getByRole('textbox', { name: 'New academic year: Ends' }).fill('2027-03-31')
  await page.getByRole('button', { name: 'Add' }).first().click()
  await expect(page.getByRole('cell', { name: '2026-27' })).toBeVisible()
  expect(years[0]).toMatchObject({ label: '2026-27', startsOn: '2026-04-01', endsOn: '2027-03-31' })

  await page.getByRole('button', { name: 'Remove' }).first().click()
  await expect(page.getByRole('alert')).toHaveText('Still used by 2 sections. Remove or move those first.')
})

test('someone who is not an administrator sees the structure without editing controls', async ({ page }) => {
  await page.route('**/v1/me', (route) =>
    route.fulfill({ json: { userId: 'user_e2e', orgs: [{ id: ORG, name: 'Lakeview University', preset: 'university', roles: ['teacher'] }] } }),
  )
  await page.route('**/v1/terminology', (route) => route.fulfill({ json: { preset: 'university', overrides: [] } }))
  await page.route(/\/v1\/(years|levels|branches|subjects|sections|periods)(\?.*)?$/, (route) => route.fulfill({ json: [] }))
  await page.goto('/settings/structure')
  // The university's words, from the same screen code.
  await expect(page.getByRole('tab', { name: 'Programme years and batches' })).toBeVisible()
  await expect(page.getByText('Only an administrator can change the structure.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add' })).toHaveCount(0)
})

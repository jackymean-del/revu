import { expect, test } from '@playwright/test'

// Setup step: the app loads and reports what the server says about itself.
test('system check shows server and database state', async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', database: true, version: 'e2e' } }),
  )
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'revU is getting ready' })).toBeVisible()
  await expect(page.getByTestId('status-server')).toHaveText('Running')
  await expect(page.getByTestId('status-database')).toHaveText('Connected')
  await expect(page.getByText('Version e2e')).toBeVisible()
})

test('system check says so when the database is down', async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', database: false, version: 'e2e' } }),
  )
  await page.goto('/')
  await expect(page.getByTestId('status-database')).toHaveText('Not connected')
})

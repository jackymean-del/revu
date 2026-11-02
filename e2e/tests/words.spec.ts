import { expect, test } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-000000000001'

// AT-v1-03 in the browser: switching the starting set changes the words
// people read, and saving sends the institution's choice to the server.
test('an administrator switches to the university words and saves', async ({ page }) => {
  let saved: unknown = null
  await page.route('**/v1/me/orgs', (route) =>
    route.fulfill({ json: [{ id: ORG, name: 'Riverside Public School', preset: 'school', roles: ['admin'] }] }),
  )
  await page.route('**/v1/terminology', async (route) => {
    if (route.request().method() === 'PUT') {
      saved = route.request().postDataJSON()
      return route.fulfill({ json: saved })
    }
    return route.fulfill({ json: { preset: 'school', overrides: [] } })
  })

  await page.goto('/settings/words')
  const preview = page.getByText('Preview').locator('..')
  await expect(preview).toContainText('Grade 6, Section A')
  await expect(page.getByRole('status')).toHaveText('All changes saved')

  await page.getByText('Batch, Semester, Learner').click()
  await expect(preview).toContainText('Programme year 6, Batch A')
  await expect(preview).toContainText('32 learners')
  await expect(page.getByRole('status')).toHaveText('Unsaved changes')

  await page.getByRole('textbox', { name: 'A teaching group inside a stage, one' }).fill('Cohort')
  await page.getByRole('textbox', { name: 'A teaching group inside a stage, many' }).fill('Cohorts')
  await expect(preview).toContainText('Programme year 6, Cohort A')

  await page.getByRole('button', { name: 'Save words' }).click()
  await expect(page.getByRole('status')).toHaveText('All changes saved')
  expect(saved).toEqual({ preset: 'university', overrides: [{ key: 'group.section', one: 'Cohort', other: 'Cohorts' }] })
})

test('someone who is not an administrator reads the words but cannot change them', async ({ page }) => {
  await page.route('**/v1/me/orgs', (route) =>
    route.fulfill({ json: [{ id: ORG, name: 'Riverside Public School', preset: 'school', roles: ['teacher'] }] }),
  )
  await page.route('**/v1/terminology', (route) => route.fulfill({ json: { preset: 'college', overrides: [] } }))

  await page.goto('/settings/words')
  await expect(page.getByText('Only an administrator can change these words.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save words' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'A teaching group inside a stage, one' })).toBeDisabled()
})

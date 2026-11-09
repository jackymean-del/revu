import { expect, test, type Page } from '@playwright/test'

/**
 * iKids end to end, against a real server and database: no API is mocked.
 * Runs only when IKIDS=1, with the API on :8080 in development sign-in
 * (DEV_USER_ID) after "server seed" made iKids, and the app built without
 * Clerk on :4173. It walks the eight steps in order as an administrator,
 * from the home page's next step to a report card PDF.
 */
test.skip(!process.env.IKIDS, 'set IKIDS=1 with a seeded local server to run')
test.describe.configure({ mode: 'serial', timeout: 90_000 })

const errors: string[] = []

async function open(page: Page) {
  page.on('console', (m) => {
    // Playwright's own helpers are refused by the sandboxed report preview
    // when it looks inside; that message is the test's, not the app's.
    if (m.type() === 'error' && !/favicon|Blocked script execution in 'about:srcdoc'/.test(m.text())) errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  const picker = page.getByLabel('Working in')
  if (await picker.isVisible().catch(() => false)) await picker.selectOption({ label: 'iKids' })
  await expect(page.locator('main').getByText('iKids', { exact: true }).first()).toBeVisible()
}

test('iKids from the home page to a report card', async ({ page }) => {
  await open(page)
  const menu = page.getByRole('navigation', { name: 'Main' })

  // Home: the eight steps, the work so far, and one next step.
  const master = page.getByRole('region', { name: 'Master', exact: true }).getByRole('listitem')
  const exams = page.getByRole('region', { name: 'Exam steps' }).getByRole('listitem')
  await expect(master).toHaveCount(2)
  await expect(exams).toHaveCount(6)
  await expect(master.nth(0)).toContainText('400 students, 20 sections')
  await expect(exams.nth(2)).toContainText('Done')
  const next = page.getByRole('region', { name: 'Next step' })
  await expect(next).toBeVisible()
  const firstNext = (await next.locator('p').first().textContent()) ?? ''
  console.log(`  next step on arrival: ${firstNext}`)

  // 1 Resources: students and staff, classes and sections, choices.
  await menu.getByRole('link', { name: 'Resources' }).click()
  await expect(page).toHaveURL(/\/people$/)
  await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible()
  const bar = page.getByRole('navigation', { name: 'Resources' })
  await bar.getByRole('link', { name: 'Grades and sections' }).click()
  await expect(page.getByText('Class 10').first()).toBeVisible()
  await bar.getByRole('link', { name: 'Academic years and terms' }).click()
  await expect(page.getByText('2026-27').first()).toBeVisible()
  await bar.getByRole('link', { name: 'Subject choices' }).click()
  await expect(page.getByRole('heading', { name: 'Subject choices', level: 1 })).toBeVisible()

  // 2 Configuration: subjects, opened on the subjects tab.
  await menu.getByRole('link', { name: 'Configuration' }).click()
  await expect(page).toHaveURL(/\/settings\/subjects$/)
  await expect(page.getByText('Social Science').first()).toBeVisible()

  // 3 Create exam: the term's assessments, each one click from its marks.
  await menu.getByRole('link', { name: 'Create exam' }).click()
  await expect(page.getByRole('heading', { name: 'Assessments', level: 1 })).toBeVisible()
  const row = page.getByRole('listitem').filter({ hasText: 'Mathematics, Periodic test 1' }).first()
  await expect(row).toContainText('3 parts')

  // 5 Evaluate exam: the grid opens on that assessment with its marks.
  await row.getByRole('link', { name: 'Enter marks' }).click()
  await expect(page).toHaveURL(/\/marks\?a=/)
  await expect(page.getByRole('grid').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('grid').first()).toContainText('A')

  // 6 Scheme: results for a class, each explained, under the published scheme.
  await menu.getByRole('link', { name: 'Scheme' }).click()
  await expect(page).toHaveURL(/\/results$/)
  await page.getByLabel('Section').selectOption({ label: 'Class 10 A' })
  await page.getByLabel('Subject').selectOption({ label: 'Mathematics' })
  const explain = page.getByRole('button', { name: /How .+ was worked out/ }).first()
  await expect(explain).toBeVisible({ timeout: 20_000 })
  await explain.click()
  await expect(page.getByText('iKids scheme').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('navigation', { name: 'Scheme' }).getByRole('link', { name: 'Schemes' }).click()
  await expect(page.getByText('iKids scheme').first()).toBeVisible()

  // 8 Reports and analysis: the aggregate, the lists, the reteach list.
  await menu.getByRole('link', { name: 'Reports and analysis' }).click()
  await expect(page).toHaveURL(/\/analysis$/)
  await page.getByLabel('Grade', { exact: true }).selectOption({ label: 'Class 10' })
  await page.getByRole('group', { name: 'Sections' }).getByRole('button', { name: 'A', exact: true }).click()
  const aggregate = page.getByRole('region', { name: 'Aggregate' })
  await expect(aggregate.locator('tbody tr')).toHaveCount(20, { timeout: 20_000 })
  await expect(aggregate.getByRole('row', { name: /^Average/ })).toContainText('.')
  // The whole of Class 10, both sections, sorted by percentage.
  await page.getByRole('group', { name: 'Sections' }).getByRole('button', { name: 'All' }).click()
  await expect(aggregate.locator('tbody tr')).toHaveCount(40, { timeout: 20_000 })
  await aggregate.getByRole('columnheader', { name: '%' }).getByRole('button').click()
  await expect(aggregate.getByRole('columnheader', { name: '%' })).toHaveAttribute('aria-sort', 'descending')
  await page.getByRole('group', { name: 'Sections' }).getByRole('button', { name: 'A', exact: true }).click()
  await page.getByRole('tab', { name: 'Bands' }).click()
  await expect(page.getByRole('region', { name: 'Bands' })).toContainText('A1')
  await page.getByRole('tab', { name: 'Lists' }).click()
  await expect(page.getByRole('region', { name: 'Undertaking' })).toBeVisible()
  await page.getByRole('tab', { name: 'Reteach' }).click()
  await page.getByLabel('Assessment').selectOption({ label: 'Periodic test 1' })
  const reteach = page.getByRole('region', { name: 'Reteach' })
  await expect(reteach).toContainText('below mastery', { timeout: 20_000 })
  await expect(reteach).toContainText('Next: Periodic test 2')
  await page.getByRole('tab', { name: 'Aggregate' }).click()
  const workbook = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Excel workbook' }).click()
  expect((await workbook).suggestedFilename()).toMatch(/^analysis-Class-10-A-Term-1\.xlsx$/)

  // Report cards: a preview, then the PDF for one student.
  await page.getByRole('navigation', { name: 'Reports and analysis' }).getByRole('link', { name: 'Report cards' }).click()
  await page.getByLabel('Section').selectOption({ label: 'Class 10 A' })
  const preview = page.frameLocator('iframe[title^="Report of"]')
  await expect(preview.getByText('iKids').first()).toBeVisible({ timeout: 30_000 })
  const pdfButton = page.getByRole('button', { name: /^PDF for (?!the whole)/ })
  if (await pdfButton.isEnabled()) {
    const pdf = page.waitForEvent('download', { timeout: 60_000 })
    await pdfButton.click()
    expect((await pdf).suggestedFilename()).toMatch(/^report-IK-\d+\.pdf$/)
  }

  // Back home: with a report run made, the next step moves on.
  await menu.getByRole('link', { name: 'Home' }).click()
  await expect(page.getByRole('region', { name: 'Next step' })).toBeVisible()
  console.log(`  next step at the end: ${await page.getByRole('region', { name: 'Next step' }).locator('p').first().textContent()}`)
  expect(errors, errors.join('\n')).toEqual([])
})

test('iKids as a teacher and as a principal', async ({ page }) => {
  await open(page)
  // An administrator previews what each role sees; the server enforces it.
  await page.getByRole('button', { name: 'Switch' }).click()
  await page.getByRole('menuitemradio', { name: 'Teacher', exact: true }).click()
  await expect(page.getByText(/Previewing as/)).toBeVisible()
  const menu = page.getByRole('navigation', { name: 'Main' })
  await expect(menu.getByRole('link', { name: 'Resources' })).toHaveCount(0)
  await expect(menu.getByRole('link', { name: 'Evaluate exam' })).toBeVisible()
  await page.getByRole('button', { name: 'Stop preview' }).click()

  await page.getByRole('button', { name: 'Switch' }).click()
  await page.getByRole('menuitemradio', { name: 'Principal', exact: true }).click()
  await menu.getByRole('link', { name: 'Reports and analysis' }).click()
  await page.getByLabel('Grade', { exact: true }).selectOption({ label: 'Class 10' })
  await expect(page.getByText('Your role shows counts only')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Stop preview' }).click()
  expect(errors, errors.join('\n')).toEqual([])
})

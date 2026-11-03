import { expect, test, type Page } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-000000000002'

type Tile = { key: string; count: number; status: 'attention' | 'ok' | 'info'; listable: boolean }
type Row = { id: string; title: string; detail?: string }

/** Answers Home's calls with these tiles and the lists behind them. */
function fakeApi(page: Page, roles: string[], preset: string, tiles: Tile[], lists: Record<string, Row[]> = {}) {
  void page.route('**/v1/me', (r) => r.fulfill({ json: { userId: 'user_1', orgs: [{ id: ORG, name: 'Hill View', preset, roles, setupDone: true, staffId: 'staff-1' }] } }))
  void page.route('**/v1/terminology', (r) => r.fulfill({ json: { preset, overrides: [] } }))
  void page.route('**/v1/setup', (r) =>
    r.fulfill({ json: { years: 1, periods: 2, levels: 1, sections: 2, subjects: 1, levelSubjects: 1, staff: 3, students: 3, invitations: 1, done: true } }),
  )
  void page.route('**/v1/dashboard', (r) => r.fulfill({ json: { yearId: 'y', tiles } }))
  void page.route('**/v1/dashboard/*', (r) => {
    const key = new URL(r.request().url()).pathname.split('/').pop()!
    return r.fulfill({ json: { key, rows: lists[key] ?? [] } })
  })
}

const adminTiles: Tile[] = [
  { key: 'unplaced_students', count: 1, status: 'attention', listable: true },
  { key: 'no_contact', count: 2, status: 'attention', listable: true },
  { key: 'no_class_teacher', count: 1, status: 'attention', listable: true },
  { key: 'open_invitations', count: 1, status: 'info', listable: true },
  { key: 'staff_without_sign_in', count: 0, status: 'info', listable: true },
  { key: 'missing_setup', count: 0, status: 'ok', listable: true },
]

test('an administrator sees exceptions first and opens the list behind a number', async ({ page }) => {
  fakeApi(page, ['admin'], 'school', adminTiles, {
    no_contact: [
      { id: 's1', title: 'Leela', detail: 'A-003' },
      { id: 's2', title: 'Sam', detail: 'A-005' },
    ],
  })
  await page.goto('/')
  const tiles = page.getByRole('region', { name: 'At a glance' }).getByRole('listitem')
  await expect(tiles).toHaveCount(6)
  await expect(tiles.first()).toContainText('Student not in a section')
  await expect(tiles.first()).toContainText('Needs attention')
  await expect(tiles.last()).toContainText('Setup is complete')
  await expect(tiles.last()).toContainText('All clear')

  // AT-DB-01 on screen: the number and the list it opens agree.
  const contact = page.getByRole('button', { name: /2\s*Students with no parent/ })
  await contact.click()
  await expect(contact).toHaveAttribute('aria-expanded', 'true')
  const list = page.getByRole('region', { name: 'Students with no parent' })
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(list.getByRole('link', { name: 'Open People' })).toHaveAttribute('href', '/people')
  await list.getByRole('button', { name: 'Close' }).click()
  await expect(list).toHaveCount(0)

  // The print view leaves out the header and the buttons.
  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('banner')).toBeHidden()
  await expect(page.getByText(/Hill View, printed/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Print' })).toBeHidden()
})

test('the same tiles read in the university words', async ({ page }) => {
  fakeApi(page, ['admin'], 'university', adminTiles)
  await page.goto('/')
  await expect(page.getByRole('button', { name: /1\s*Learner not in a batch/ })).toBeVisible()
})

// AT-DB-03 and Part 77: view-only sees the numbers and no way into the names.
test('view-only sees counts only', async ({ page }) => {
  fakeApi(page, ['viewer'], 'school', [
    { key: 'total_students', count: 73, status: 'info', listable: false },
    { key: 'total_sections', count: 6, status: 'info', listable: false },
  ])
  await page.goto('/')
  await expect(page.getByText('73')).toBeVisible()
  await expect(page.getByRole('region', { name: 'At a glance' }).getByRole('button')).toHaveCount(0)
  await expect(page.getByText('Your role shows numbers only.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Print' })).toHaveCount(0)
})

test('on a phone the tiles sit two to a row with no sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  fakeApi(page, ['admin'], 'school', adminTiles)
  await page.goto('/')
  const tiles = page.getByRole('region', { name: 'At a glance' }).getByRole('listitem')
  await expect(tiles).toHaveCount(6)
  const [a, b, c] = await Promise.all([0, 1, 2].map((i) => tiles.nth(i).boundingBox()))
  expect(a!.y).toBe(b!.y)
  expect(c!.y).toBeGreaterThan(a!.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})

// A server that does not answer is never mistaken for belonging nowhere.
test('when the server cannot be reached, Home says so', async ({ page }) => {
  await page.route('**/v1/me', (r) => r.abort('connectionrefused'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'revU cannot be reached' })).toBeVisible()
  await expect(page.getByText(/do not belong to any/)).toHaveCount(0)
})

import { expect, test, type Page } from '@playwright/test'
import presets from '../../frontend/src/lib/terminology/presets.json' with { type: 'json' }

const ORG = '01a19bae-0000-7000-8000-000000000005'
const GROUP = '01a19bae-0000-7000-8000-0000000000g1'

/** Every word of every preset except the institution types themselves (School, College, University), which the owner picks from. */
const WORDS = [
  ...new Set(
    Object.values(presets.presets).flatMap((p) =>
      Object.entries(p)
        .filter(([k]) => k !== 'org.institution')
        .flatMap(([, f]) => [f.one, f.other]),
    ),
  ),
]
const presetWords = (text: string) => WORDS.filter((w) => new RegExp(String.raw`(?<!\p{L})${w}(?!\p{L})`, 'iu').test(text))

/** The platform owner, administrator of one demo institution, running one group. */
function fakeApi(page: Page) {
  const seen: { viewAs: (string | null)[]; created: unknown[] } = { viewAs: [], created: [] }
  void page.route('**/v1/me', (r) =>
    r.fulfill({
      json: {
        userId: 'user_owner', platformOwner: true, groups: [{ id: GROUP, name: 'Demo group' }],
        orgs: [{ id: ORG, name: 'Riverside Public School', preset: 'school', roles: ['admin'], setupDone: true, staffId: 'staff-1' }],
      },
    }),
  )
  void page.route('**/v1/terminology', (r) => r.fulfill({ json: { preset: 'school', overrides: [] } }))
  void page.route('**/v1/setup', (r) => r.fulfill({ json: { years: 1, periods: 2, levels: 1, sections: 1, subjects: 1, levelSubjects: 1, staff: 2, students: 3, invitations: 0, done: true } }))
  void page.route('**/v1/dashboard', (r) => {
    const as = r.request().headers()['x-view-as'] ?? null
    seen.viewAs.push(as)
    const tiles = as === 'viewer'
      ? [{ key: 'total_students', count: 72, status: 'info', listable: false }]
      : [{ key: 'no_contact', count: 2, status: 'attention', listable: true }]
    return r.fulfill({ json: { tiles } })
  })
  // The sample institutions load in the background: loading on the press, done on the next look.
  let demo = 'idle'
  void page.route('**/v1/owner/demo', (r) => {
    const now = demo
    if (r.request().method() === 'POST') demo = 'loading'
    else if (demo === 'loading') demo = 'done'
    return r.fulfill({ status: r.request().method() === 'POST' ? 202 : 200, json: { status: r.request().method() === 'POST' ? 'loading' : now, detail: '' } })
  })
  void page.route('**/v1/owner/orgs', (r) => {
    if (r.request().method() === 'POST') {
      seen.created.push(r.request().postDataJSON())
      return r.fulfill({ status: 201, json: { orgId: 'new-org', emailed: true } })
    }
    return r.fulfill({
      json: [
        { id: ORG, name: 'Riverside Public School', type: 'school', preset: 'school', createdAt: '2026-11-01T00:00:00Z', groupId: GROUP, groupName: 'Demo group', admins: 1, pendingAdmins: [], students: 72, staff: 8, demo: true },
        { id: 'client-1', name: 'Hill View College', type: 'college', preset: 'college', createdAt: '2026-11-03T00:00:00Z', admins: 0, pendingAdmins: ['head@hillview.test'], students: 0, staff: 0, demo: false },
      ],
    })
  })
  void page.route('**/v1/owner/access', (r) =>
    r.fulfill({
      json: {
        roles: ['admin', 'principal', 'coordinator', 'teacher', 'class_teacher', 'viewer'],
        rows: [{ action: 'evidence.enter', rules: ['allow', 'deny', 'by_grant', 'own_sections', 'own_sections', 'deny'] }],
      },
    }),
  )
  void page.route('**/v1/owner/groups', (r) => r.fulfill({ json: [{ id: GROUP, name: 'Demo group', admins: ['owner@bhusku.test'], orgIds: [ORG] }] }))
  void page.route('**/v1/groups', (r) =>
    r.fulfill({
      json: [{ id: GROUP, name: 'Demo group', institutions: [{ id: ORG, name: 'Riverside Public School', type: 'school', member: true, students: 72, sections: 6, assessments: 3, marksEntered: 140 }] }],
    }),
  )
  return seen
}

test('the owner switches to a preview of a role, and stops it', async ({ page }) => {
  const seen = fakeApi(page)
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Owner' })).toBeVisible()
  await page.getByRole('button', { name: 'Switch' }).click()
  const menu = page.getByRole('menu', { name: 'Switch' })
  await expect(menu.getByRole('menuitem', { name: 'Owner console' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: /Parent.*with the family portal/ })).toHaveAttribute('aria-disabled', 'true')
  await menu.getByRole('menuitemradio', { name: 'View only' }).click()

  // The banner says it is a preview; the menu shrinks to what view-only has; the server was asked as viewer.
  await expect(page.getByRole('status').filter({ hasText: 'Previewing as View only' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'People' })).toHaveCount(0)
  await expect(page.getByText('72')).toBeVisible()
  expect(seen.viewAs.at(-1)).toBe('viewer')

  await page.reload()
  await expect(page.getByText(/Previewing as View only/)).toBeVisible()
  await page.getByRole('button', { name: 'Stop preview' }).click()
  await expect(page.getByText(/Previewing as/)).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Resources' })).toBeVisible()
  expect(seen.viewAs.at(-1)).toBeNull()
})

test('the owner console lists institutions by counts and creates one', async ({ page }) => {
  const seen = fakeApi(page)
  await page.goto('/owner')
  await expect(page.getByRole('heading', { name: 'Owner console', level: 1 })).toBeVisible()
  const table = page.getByRole('region', { name: /Institutions/ })
  await expect(table.getByRole('row', { name: /Hill View College College 0 signed in, invited: head@hillview.test/ })).toBeVisible()
  await page.getByLabel('Name', { exact: true }).fill('Lakeside Academy')
  await page.getByLabel("Administrator's email").fill('principal@lakeside.test')
  await page.getByRole('button', { name: 'Create and invite' }).click()
  await expect(page.getByRole('status')).toContainText('principal@lakeside.test has an invitation by email')
  expect(seen.created).toEqual([{ name: 'Lakeside Academy', type: 'school', adminEmail: 'principal@lakeside.test' }])
})

test('a group page shows each institution by counts', async ({ page }) => {
  fakeApi(page)
  await page.goto('/groups')
  const card = page.getByRole('listitem').filter({ hasText: 'Riverside Public School' })
  await expect(card).toContainText('Marks entered140')
  await expect(card.getByRole('button', { name: 'Open' })).toBeVisible()
})

// Platform pages span every institution: no institution's vocabulary.
test('the owner and group pages use no preset vocabulary', async ({ page }) => {
  fakeApi(page)
  for (const path of ['/owner', '/groups']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const found = presetWords(await page.locator('main').innerText())
    expect(found, `${path} shows ${found.join(', ')}`).toEqual([])
  }
  expect(presetWords('Learners and staff, by section')).toEqual(expect.arrayContaining(['Learners', 'Section']))
})

test('from the owner console, one click opens an institution as a role', async ({ page }) => {
  const seen = fakeApi(page)
  await page.goto('/owner')
  const access = page.getByRole('region', { name: 'What each role can reach' })
  await expect(access.getByRole('row', { name: 'Enter marks Yes No With a grant Classes they teach Classes they teach No' })).toBeVisible()
  const views = page.getByRole('region', { name: 'See it as each role' })
  await views.getByRole('listitem').filter({ hasText: 'Riverside Public School' }).getByRole('button', { name: 'View only' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(/Previewing as View only/)).toBeVisible()
  expect(seen.viewAs.at(-1)).toBe('viewer')
})

test('the owner loads the sample institutions, which carries on in the background', async ({ page }) => {
  fakeApi(page)
  await page.goto('/owner')
  await page.getByRole('button', { name: 'Load the sample institutions' }).click()
  await expect(page.getByRole('button', { name: 'Loading the sample institutions' })).toBeDisabled()
  await expect(page.getByText('You can leave this page; it carries on.')).toBeVisible()
  await expect(page.getByText('Ready. Open one from the institution menu')).toBeVisible({ timeout: 15000 })
})

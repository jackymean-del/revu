import { expect, test, type Page, type Route } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-000000000001'

/** A small in-memory API holding what setup creates. */
function fakeApi(page: Page, roles: string[]) {
  const db: Record<string, Array<Record<string, unknown>>> = {
    years: [], periods: [], levels: [], sections: [], subjects: [], 'level-subjects': [], branches: [], invitations: [],
  }
  const state = { preset: 'school', done: false }
  let n = 0
  const id = () => `0000${String(++n).padStart(4, '0')}-0000-7000-8000-000000000000`
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body })

  void page.route('**/v1/me', (r) => json(r, { userId: 'user_1', orgs: [{ id: ORG, name: 'Hill View School', preset: state.preset, roles, setupDone: state.done, staffId: 'staff-1' }] }))
  void page.route('**/v1/terminology', (r) => {
    if (r.request().method() === 'PUT') state.preset = r.request().postDataJSON().preset
    return json(r, { preset: state.preset, overrides: [] })
  })
  void page.route('**/v1/setup', (r) =>
    json(r, {
      years: db.years.length, periods: db.periods.length, levels: db.levels.length, sections: db.sections.length, subjects: db.subjects.length,
      levelSubjects: db['level-subjects'].length, staff: 1, students: 0, invitations: db.invitations.length, done: state.done,
    }),
  )
  void page.route('**/v1/setup/complete', (r) => {
    state.done = true
    return json(r, { years: 1, periods: 0, levels: 0, sections: 0, subjects: 0, levelSubjects: 0, staff: 1, students: 0, invitations: 0, done: true })
  })
  void page.route(/\/v1\/(years|periods|levels|sections|subjects|level-subjects|branches|invitations|teaching-assignments)(\?.*)?$/, (r) => {
    const kind = new URL(r.request().url()).pathname.split('/').pop()!
    db[kind] ??= []
    if (r.request().method() === 'POST') {
      const item = { id: id(), ...r.request().postDataJSON(), status: 'pending', sent: true, createdAt: '2026-11-02T10:00:00Z' }
      db[kind].push(item)
      return json(r, item, 201)
    }
    return json(r, db[kind])
  })
  return { db, state }
}

/** Presses Tab until the focused element has this accessible name: keyboard only. */
async function tabTo(page: Page, name: string | RegExp) {
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab')
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return ''
      return el.getAttribute('aria-label') ?? (el.innerText || el.closest('label')?.innerText || '')
    })
    if (typeof name === 'string' ? label.trim() === name || label.trim().startsWith(name) : name.test(label)) return
  }
  throw new Error(`could not reach ${name} with Tab`)
}

// AT-v1-08 and AT-P-01: a new organisation reaches a year, terms, levels,
// sections and subjects, and invites staff, using the keyboard only.
test('an administrator sets up a new school with the keyboard only', async ({ page }) => {
  const { db, state } = fakeApi(page, ['admin'])
  await page.goto('/')
  // Home leads a new institution to the guided setup as its one next step.
  await expect(page.getByRole('heading', { name: 'Next step' })).toBeVisible()
  await expect(page.getByText('Set up your school in five short steps').first()).toBeVisible()
  await tabTo(page, 'Start')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { name: 'How you speak' })).toBeFocused()
  await tabTo(page, 'Continue')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { name: 'The academic year and its terms' })).toBeFocused()
  await tabTo(page, 'Add the academic year')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { name: 'Grades and sections' })).toBeFocused()
  await tabTo(page, 'To')
  await page.keyboard.press('Control+A')
  await page.keyboard.type('3')
  await tabTo(page, 'Add grades and sections')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { name: 'Subjects' })).toBeFocused()
  await tabTo(page, 'Add subjects')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { name: 'Invite staff' })).toBeFocused()
  await tabTo(page, 'Email 1')
  await page.keyboard.type('asha@hillview.test')
  await tabTo(page, 'Send invitations')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { name: 'All set' })).toBeFocused()
  await tabTo(page, 'Finish and go to Home')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()

  expect(db.years).toHaveLength(1)
  expect(db.periods.map((p) => p.name)).toEqual(['Term 1', 'Term 2'])
  expect(db.levels.map((l) => l.name)).toEqual(['Grade 1', 'Grade 2', 'Grade 3'])
  expect(db.sections).toHaveLength(6)
  expect(db.branches.map((b) => b.name)).toEqual(['Hill View School'])
  expect(db.subjects).toHaveLength(5)
  expect(db['level-subjects']).toHaveLength(15)
  expect(db.invitations.map((i) => [i.email, i.role])).toEqual([['asha@hillview.test', 'teacher']])
  expect(state.done).toBe(true)
})

test('a teacher sees Home with their classes and no settings', async ({ page }) => {
  const { db } = fakeApi(page, ['teacher'])
  db.levels.push({ id: 'l6', name: 'Grade 6', seq: 6 })
  db.sections.push({ id: 's6a', name: 'A', levelId: 'l6', yearId: 'y', branchId: 'b' })
  db.subjects.push({ id: 'math', name: 'Mathematics', kind: 'academic' })
  db['teaching-assignments'] = [{ id: 'ta1', staffId: 'staff-1', sectionId: 's6a', subjectId: 'math' }]
  void page.route('**/v1/dashboard', (r) =>
    r.fulfill({ json: { tiles: [{ key: 'my_classes', count: 1, status: 'info', listable: true }, { key: 'my_students', count: 0, status: 'info', listable: true }] } }),
  )
  void page.route('**/v1/dashboard/my_classes', (r) => r.fulfill({ json: { key: 'my_classes', rows: [{ id: 'ta1', title: 'Grade 6 A', detail: 'Mathematics' }] } }))
  await page.goto('/')
  // Keyboard users can jump past the header.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()

  await page.getByRole('button', { name: /1\s*Teaching assignment/ }).click()
  await expect(page.getByRole('region', { name: 'Teaching assignment' }).getByText('Grade 6 A')).toBeVisible()
  await expect(page.getByText('Mathematics')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Print' })).toHaveCount(0)
  const nav = page.getByRole('navigation', { name: 'Main' })
  // A teacher's menu: the steps they work in, by name; the numbers beside them are decoration.
  const names = ['Home', 'Create question paper', 'Assign paper', 'Evaluate exam', 'Scheme', 'Reports and analysis', 'System status']
  await expect(nav.getByRole('link')).toHaveCount(names.length)
  for (const name of names) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Getting started' })).toHaveCount(0)
})

import { expect, test, type Page } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-000000000003'
const SECTION = 'sec-6a'
const LANG = 'grp-lang'
const ACT = 'grp-act'

type Choice = { id: string; studentId: string; groupId: string; subjectId: string; effectiveFrom: string; source: string }
type Posted = { groupId: string; subjectId: string; studentIds: string[]; effectiveFrom?: string }

/** An in-memory API: one section, a language group (exactly one) and an activities group (one or two). */
function fakeApi(page: Page, roles: string[], preset = 'school') {
  const subjects = [
    { id: 'hin', name: 'Hindi', kind: 'academic' },
    { id: 'odi', name: 'Odia', kind: 'academic' },
    { id: 'art', name: 'Art', kind: 'co_curricular' },
    { id: 'mus', name: 'Music', kind: 'co_curricular' },
  ]
  const students = [
    { id: 'kiran', name: 'Kiran', admissionNo: 'A-2', status: 'active' },
    { id: 'leela', name: 'Leela', admissionNo: 'A-3', status: 'active' },
    { id: 'ravi', name: 'Ravi', admissionNo: 'A-1', status: 'active' },
  ]
  const groups = [
    { groupId: LANG, name: 'Second language', rule: 'exactly_one', minChoices: 1, maxChoices: 1, options: ['hin', 'odi'] },
    { groupId: ACT, name: 'Activities', rule: 'range', minChoices: 0, maxChoices: 2, options: ['art', 'mus'] },
  ]
  const choices: Choice[] = [{ id: 'c1', studentId: 'ravi', groupId: LANG, subjectId: 'hin', effectiveFrom: '2026-04-01', source: 'manual' }]
  const posted: Posted[] = []
  let n = 1

  void page.route('**/v1/me', (r) => r.fulfill({ json: { userId: 'user_1', orgs: [{ id: ORG, name: 'Hill View', preset, roles, setupDone: true, staffId: 'staff-1' }] } }))
  void page.route('**/v1/terminology', (r) => r.fulfill({ json: { preset, overrides: [] } }))
  void page.route(/\/v1\/years(\?.*)?$/, (r) => r.fulfill({ json: [{ id: 'y', label: '2026-27', startsOn: '2026-04-01', endsOn: '2027-03-31' }] }))
  void page.route(/\/v1\/levels(\?.*)?$/, (r) => r.fulfill({ json: [{ id: 'l6', name: 'Grade 6', seq: 6 }] }))
  void page.route(/\/v1\/sections(\?.*)?$/, (r) => r.fulfill({ json: [{ id: SECTION, name: 'A', levelId: 'l6', yearId: 'y', branchId: 'b' }] }))
  void page.route(/\/v1\/subjects(\?.*)?$/, (r) => r.fulfill({ json: subjects }))
  void page.route(/\/v1\/teaching-assignments(\?.*)?$/, (r) => r.fulfill({ json: [{ id: 'ta', staffId: 'staff-1', sectionId: SECTION }] }))
  void page.route(/\/v1\/students(\?.*)?$/, (r) => r.fulfill({ json: { items: students } }))
  void page.route(/\/v1\/sections\/[^/]+\/choice-completeness/, (r) =>
    r.fulfill({
      json: {
        sectionId: SECTION, on: '2026-11-02', students: students.length,
        groups: groups.map((g) => ({
          ...g,
          options: g.options.map((s) => ({ subjectId: s, students: choices.filter((c) => c.groupId === g.groupId && c.subjectId === s).length })),
          missing: students
            .map((st) => ({ studentId: st.id, name: st.name, chosen: choices.filter((c) => c.groupId === g.groupId && c.studentId === st.id).length }))
            .filter((m) => m.chosen < g.minChoices),
        })),
      },
    }),
  )
  void page.route(/\/v1\/subject-choices(\?.*)?$/, (r) => {
    if (r.request().method() !== 'POST') return r.fulfill({ json: choices })
    const body = r.request().postDataJSON() as Posted
    posted.push(body)
    const group = groups.find((g) => g.groupId === body.groupId)!
    let assigned = 0
    let changed = 0
    for (const id of body.studentIds) {
      const held = choices.filter((c) => c.studentId === id && c.groupId === body.groupId)
      if (group.maxChoices === 1 && held.length) {
        choices.splice(choices.indexOf(held[0]), 1)
        changed++
      } else assigned++
      choices.push({ id: `c${++n}`, studentId: id, groupId: body.groupId, subjectId: body.subjectId, effectiveFrom: body.effectiveFrom ?? '2026-04-01', source: 'manual' })
    }
    return r.fulfill({ json: { assigned, changed, unchanged: 0, skipped: 0 } })
  })
  return { posted, choices }
}

test('an administrator sees who has not chosen, and fills in choices one by one and in bulk', async ({ page }) => {
  const { posted } = fakeApi(page, ['admin'])
  await page.goto('/choices')
  await expect(page.getByRole('heading', { name: 'Subject choices', level: 1 })).toBeVisible()

  // AT-AP-02 on screen: the missing choices are named, never guessed.
  const missing = page.getByRole('region', { name: 'Choices missing' })
  await expect(missing).toContainText('Second language: Kiran, Leela')

  // A first choice is sent without a date: it applies from the start of the year.
  await page.getByLabel('Second language for Kiran').selectOption({ label: 'Odia' })
  await expect(page.getByRole('status')).toHaveText('1 chosen')
  expect(posted.at(-1)).toEqual({ groupId: LANG, subjectId: 'odi', studentIds: ['kiran'] })
  await expect(missing).toContainText('Second language: Leela')

  // A change carries the date it applies from.
  await page.getByLabel('Changes apply from').fill('2026-10-01')
  await page.getByLabel('Second language for Ravi').selectOption({ label: 'Odia' })
  await expect(page.getByRole('status')).toHaveText('1 changed')
  expect(posted.at(-1)).toEqual({ groupId: LANG, subjectId: 'odi', studentIds: ['ravi'], effectiveFrom: '2026-10-01' })

  // Several students at once.
  await page.getByLabel('Select Leela').check()
  await page.getByLabel('Subject group').selectOption({ label: 'Second language' })
  await page.getByLabel('Option', { exact: true }).selectOption({ label: 'Hindi' })
  await page.getByRole('button', { name: 'Give them this option' }).click()
  await expect(missing).toHaveCount(0)
  expect(posted.at(-1)?.studentIds).toEqual(['leela'])

  // A group with a range shows a box per option.
  const music = page.getByRole('row', { name: /Kiran/ }).getByRole('checkbox', { name: 'Music' })
  await music.click()
  await expect(music).toBeChecked()
  expect(posted.at(-1)).toEqual({ groupId: ACT, subjectId: 'mus', studentIds: ['kiran'] })
  await expect(page.getByRole('columnheader', { name: /Activities/ })).toContainText('Music 1')
})

test('a class teacher has Choices in the menu; the words follow the preset', async ({ page }) => {
  fakeApi(page, ['class_teacher'], 'university')
  await page.goto('/')
  // Choices sits in step 1, Resources, which for a class teacher opens on it.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Resources' }).click()
  await expect(page.getByRole('heading', { name: 'Course choices', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Second language for Kiran')).toBeVisible()
  // Importing is for leaders.
  await expect(page.getByRole('heading', { name: 'Import choices' })).toHaveCount(0)
})

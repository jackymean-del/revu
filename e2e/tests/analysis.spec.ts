import { expect, test, type Page, type Route } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-000000000007'
const SECTION = 'sec-6a'

const bands = ['A1', 'A2', 'B1', 'B2', 'C'].map((label, i) => ({ label, min_pct: ['90', '80', '70', '60', '0'][i] }))
const settings = {
  masteryPct: '40',
  reteachSharePct: '30',
  minEvidence: 5,
  ranges: ['40', '50', '60', '70', '80', '90'],
  lists: [
    { name: 'Undertaking', action: 'undertaking', on: 'subjects', belowPct: '60', atLeast: 2, showBelowPct: '70' },
    { name: 'Verbal warning', action: 'warning', on: 'subjects', belowPct: '70', atLeast: 1, showBelowPct: '70' },
  ],
  signoff: [],
}
const cell = (pct: string, band: string) => ({ state: 'complete', pct, band, value: pct, max: '100' })
const fullSummary = {
  access: 'full',
  basis: '',
  bases: [
    { code: '', name: 'Term result' },
    { code: 'W', name: 'Written paper' },
  ],
  bands,
  settings,
  subjects: [
    { id: 'math', name: 'Mathematics', access: 'full', max: '100', taking: 4, complete: 4, provisional: 0, blocked: 0, notAssessed: 0, average: '56.25', median: '56.25', highest: '85.00', lowest: '27.50', passed: 3, failed: 1, bands: [{ label: 'A2', count: 1 }, { label: 'B1', count: 1 }, { label: 'C', count: 2 }] },
    { id: 'sci', name: 'Science', access: 'full', max: '100', taking: 4, complete: 3, provisional: 0, blocked: 1, notAssessed: 0, average: '66.67', median: '55.00', highest: '95.00', lowest: '50.00', passed: 2, failed: 1, bands: [{ label: 'A1', count: 1 }, { label: 'C', count: 2 }] },
  ],
  students: [
    { id: 'ravi', name: 'Ravi Kumar', rollNo: '1', subjects: { math: cell('85.00', 'A2'), sci: cell('95.00', 'A1') }, total: { state: 'complete', value: '180', max: '200', pct: '90.00', band: 'A1' } },
    { id: 'kiran', name: 'Kiran Das', rollNo: '2', subjects: { math: cell('27.50', 'C'), sci: cell('50.00', 'C') }, total: { state: 'complete', value: '77.5', max: '200', pct: '38.75', band: 'C' } },
    { id: 'leela', name: 'Leela Rao', rollNo: '3', subjects: { math: cell('40.00', 'C'), sci: cell('55.00', 'C') }, total: { state: 'complete', value: '95', max: '200', pct: '47.50', band: 'C' } },
    { id: 'nikhil', name: 'Nikhil Jena', rollNo: '4', subjects: { math: cell('72.50', 'B1'), sci: { state: 'blocked' } }, total: { state: 'blocked' } },
  ],
  lists: [
    { rule: settings.lists[0], students: [{ studentId: 'kiran', name: 'Kiran Das', rollNo: '2', totalPct: '38.75', subjects: ['math', 'sci'] }, { studentId: 'leela', name: 'Leela Rao', rollNo: '3', totalPct: '47.50', subjects: ['math', 'sci'] }] },
    { rule: settings.lists[1], students: [] },
  ],
}

function fakeApi(page: Page, role: string, summary: unknown = fullSummary) {
  const saved: { reteach: unknown[]; settings?: unknown; basis?: string | null } = { reteach: [] }
  const json = (r: Route, body: unknown, s = 200) => r.fulfill({ status: s, json: body })
  void page.route('**/v1/me', (r) => json(r, { userId: 'user_1', orgs: [{ id: ORG, name: 'Hill View', preset: 'school', roles: [role], setupDone: true, staffId: 'staff-1' }] }))
  void page.route('**/v1/terminology', (r) => json(r, { preset: 'school', overrides: [] }))
  void page.route(/\/v1\/years(\?.*)?$/, (r) => json(r, [{ id: 'y', label: '2026-27', startsOn: '2026-04-01', endsOn: '2027-03-31' }]))
  void page.route(/\/v1\/periods(\?.*)?$/, (r) => json(r, [{ id: 't1', yearId: 'y', name: 'Term 1', seq: 1, kind: 'term', startsOn: '2026-04-01', endsOn: '2026-09-30' }]))
  void page.route(/\/v1\/levels(\?.*)?$/, (r) => json(r, [{ id: 'l6', name: 'Grade 6', seq: 6 }]))
  void page.route(/\/v1\/sections(\?.*)?$/, (r) => json(r, [{ id: SECTION, name: 'A', levelId: 'l6', yearId: 'y', branchId: 'b' }]))
  void page.route(/\/v1\/teaching-assignments(\?.*)?$/, (r) => json(r, [{ id: 'ta', staffId: 'staff-1', sectionId: SECTION, subjectId: 'math' }]))
  void page.route(/\/v1\/analysis\/summary\.xlsx/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: 'xlsx' }),
  )
  void page.route(/\/v1\/analysis\/summary\?/, (r) => {
    saved.basis = new URL(r.request().url()).searchParams.get('basis')
    return json(r, saved.basis ? { ...(summary as object), basis: saved.basis } : summary)
  })
  void page.route('**/v1/analysis/settings', (r) => {
    if (r.request().method() === 'PUT') {
      saved.settings = r.request().postDataJSON()
      return json(r, saved.settings)
    }
    return json(r, settings)
  })
  void page.route(/\/v1\/assessments(\?.*)?$/, (r) =>
    json(r, [
      { id: 'paper', title: 'Paper 1', status: 'open', entryMode: 'sections', kind: 'periodic_test', yearId: 'y', periodId: 't1', levelId: 'l6', subjectId: 'math', sectionIds: [SECTION], parts: [] },
      { id: 'test', title: 'Science test', status: 'open', entryMode: 'total', kind: 'periodic_test', yearId: 'y', periodId: 't1', levelId: 'l6', subjectId: 'sci', sectionIds: [SECTION], parts: [] },
    ]),
  )
  void page.route(/\/v1\/analysis\/assessment\?/, (r) => {
    const id = new URL(r.request().url()).searchParams.get('assessmentId')
    const base = { kind: 'periodic_test', parts: [], settings, students: [{ id: 'kiran', name: 'Kiran Das', rollNo: '2', score: { state: 'complete', value: '11', max: '40', pct: '27.50' } }] }
    if (id === 'test') return json(r, { ...base, id, title: 'Science test', entryMode: 'total', reteach: { available: false, reason: 'total_marks', items: [] } })
    return json(r, {
      ...base,
      id,
      title: 'Paper 1',
      entryMode: 'sections',
      reteach: {
        available: true,
        items: [
          { partId: 'pa', name: 'A', max: '20', mastery: { scored: 5, below: 2, sharePct: '40', flagged: true, enough: true }, students: ['Kiran Das', 'Leela Rao'], followUp: { assessmentId: 'oral', title: 'Oral', sharePct: '20', trend: 'improved' } },
          { partId: 'pb', name: 'B', max: '20', mastery: { scored: 5, below: 1, sharePct: '20', flagged: false, enough: true }, students: ['Kiran Das'] },
        ],
      },
    })
  })
  void page.route('**/v1/analysis/reteach', (r) => {
    saved.reteach.push(r.request().postDataJSON())
    return json(r, r.request().postDataJSON())
  })
  return saved
}

test('a class teacher reads the aggregate, the bands, the lists and the ranges, and downloads the workbook', async ({ page }) => {
  const saved = fakeApi(page, 'class_teacher')
  await page.goto('/analysis')
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Analysis' })).toBeVisible()

  const table = page.getByRole('region', { name: 'Aggregate' })
  await expect(table.getByRole('row', { name: /Kiran Das/ })).toContainText('27.50')
  await expect(table.getByRole('row', { name: /Nikhil Jena/ })).toContainText('Withheld')
  await expect(table.getByRole('row', { name: /^Average/ })).toContainText('56.25')
  // Ordered by total: Ravi first, Nikhil (withheld) last.
  await page.getByLabel('Total, highest first').check()
  const names = await table.locator('tbody th').allInnerTexts()
  expect(names.map((n) => n.replace(/^\d+\s*/, ''))).toEqual(['Ravi Kumar', 'Leela Rao', 'Kiran Das', 'Nikhil Jena'])

  await page.getByRole('tab', { name: 'Bands' }).click()
  await expect(page.getByRole('row', { name: /Science/ })).toContainText('1')

  await page.getByRole('tab', { name: 'Lists' }).click()
  const undertaking = page.getByRole('region', { name: 'Undertaking' })
  await expect(undertaking).toContainText('At least 2 subjects below 60%. Shows subjects below 70%.')
  await expect(undertaking.getByRole('row', { name: /Leela Rao/ })).toContainText('40.00')
  await expect(page.getByRole('region', { name: 'Verbal warning' })).toContainText('Nobody.')

  await page.getByRole('tab', { name: 'By range' }).click()
  await page.getByRole('button', { name: /Below 40%/ }).click()
  await expect(page.getByText('Kiran Das 38.75')).toBeVisible()
  await expect(page.getByText('1 with no number yet')).toBeVisible()

  await page.getByLabel('Based on').selectOption('W')
  await expect.poll(() => saved.basis).toBe('W')

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Excel workbook' }).click()
  expect((await download).suggestedFilename()).toBe('analysis-Grade-6-A-Term-1.xlsx')
})

test('a teacher marks a part of the paper for reteaching, and total-marks entry says why there is no list', async ({ page }) => {
  const saved = fakeApi(page, 'teacher')
  await page.goto('/analysis')
  await page.getByRole('tab', { name: 'Reteach' }).click()
  await expect(page.getByText('Teach again', { exact: true })).toHaveCount(1)
  await expect(page.getByText('Kiran Das, Leela Rao')).toBeVisible()
  await expect(page.getByText('Fewer below mastery')).toBeVisible()
  await page.getByRole('group', { name: 'Decision for A' }).getByRole('button', { name: 'Planned' }).click()
  await expect(page.getByRole('group', { name: 'Decision for A' }).getByRole('button', { name: 'Planned' })).toHaveAttribute('aria-pressed', 'true')
  expect(saved.reteach).toEqual([{ assessmentId: 'paper', sectionId: SECTION, partId: 'pa', status: 'planned' }])

  await page.getByLabel('Assessment').selectOption('test')
  await expect(page.getByText('This assessment takes one total mark')).toBeVisible()
})

test('an administrator reorders the lists and changes a rule', async ({ page }) => {
  const saved = fakeApi(page, 'admin')
  await page.goto('/analysis')
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByLabel('How many').first().fill('3')
  await page.getByRole('button', { name: 'Move down' }).first().click()
  await page.getByLabel('Boundaries, rising, separated by commas').fill('50, 40')
  await expect(page.getByText('Range boundaries are percentages between 0 and 100, rising.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  await page.getByLabel('Boundaries, rising, separated by commas').fill('35, 50, 75')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByRole('status')).toContainText('Saved')
  const s = saved.settings as typeof settings
  expect(s.lists.map((l) => l.name)).toEqual(['Verbal warning', 'Undertaking'])
  expect(s.lists[1].atLeast).toBe(3)
  expect(s.ranges).toEqual(['35', '50', '75'])
})

test('a principal sees counts only', async ({ page }) => {
  fakeApi(page, 'principal', { ...fullSummary, access: 'counts', students: [], lists: [], subjects: fullSummary.subjects.map((s) => ({ ...s, access: 'counts', average: undefined })) })
  await page.goto('/analysis')
  await expect(page.getByText('Your role shows counts only')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Bands' })).toBeVisible()
  await expect(page.getByText('Kiran Das')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Excel workbook' })).toHaveCount(0)
})

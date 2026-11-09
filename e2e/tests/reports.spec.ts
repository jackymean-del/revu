import { expect, test, type Page, type Route } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-000000000006'
const SECTION = 'sec-6a'

const config = {
  title: 'Progress report',
  sections: ['identity', 'marks', 'components', 'overall', 'legend', 'signoff'].map((key) => ({ key, on: true })),
  subjectOrder: [] as string[],
  signoff: ['person.class_teacher', 'person.principal', 'person.guardian'],
  paper: { size: 'A4', orientation: 'portrait' },
  booklet: false,
  padEven: true,
  qr: false,
}

function fakeApi(page: Page, role: string, opts: { pdf: boolean }) {
  const saved: { template?: unknown; branding?: unknown; pdf?: unknown } = {}
  const json = (r: Route, body: unknown, s = 200) => r.fulfill({ status: s, json: body })
  void page.route('**/v1/me', (r) => json(r, { userId: 'user_1', orgs: [{ id: ORG, name: 'Hill View', preset: 'school', roles: [role], setupDone: true, staffId: 'staff-1' }] }))
  void page.route('**/v1/terminology', (r) => json(r, { preset: 'school', overrides: [] }))
  void page.route(/\/v1\/years(\?.*)?$/, (r) => json(r, [{ id: 'y', label: '2026-27', startsOn: '2026-04-01', endsOn: '2027-03-31' }]))
  void page.route(/\/v1\/periods(\?.*)?$/, (r) => json(r, [{ id: 't1', yearId: 'y', name: 'Term 1', seq: 1, kind: 'term', startsOn: '2026-04-01', endsOn: '2026-09-30' }]))
  void page.route(/\/v1\/levels(\?.*)?$/, (r) => json(r, [{ id: 'l6', name: 'Grade 6', seq: 6 }]))
  void page.route(/\/v1\/sections(\?.*)?$/, (r) => json(r, [{ id: SECTION, name: 'A', levelId: 'l6', yearId: 'y', branchId: 'b' }]))
  void page.route(/\/v1\/subjects(\?.*)?$/, (r) =>
    json(r, [
      { id: 'math', name: 'Mathematics', kind: 'academic' },
      { id: 'eng', name: 'English', kind: 'academic' },
    ]),
  )
  void page.route(/\/v1\/level-subjects(\?.*)?$/, (r) => json(r, [{ id: 'ls1', levelId: 'l6', subjectId: 'math' }, { id: 'ls2', levelId: 'l6', subjectId: 'eng' }]))
  void page.route(/\/v1\/teaching-assignments(\?.*)?$/, (r) => json(r, [{ id: 'ta', staffId: 'staff-1', sectionId: SECTION }]))
  void page.route(/\/v1\/reports\/status/, (r) =>
    json(r, {
      students: [
        { id: 'st-1', name: 'Kiran Das', admissionNo: 'A-002', rollNo: '2' },
        { id: 'st-2', name: 'Leela Rao', admissionNo: 'A-003', rollNo: '3' },
      ],
      counts: { complete: 3, provisional: 1, blocked: 0, notAssessed: 0, stale: 0 },
      pdf: opts.pdf,
    }),
  )
  void page.route(/\/v1\/reports\/html/, (r) => {
    const who = new URL(r.request().url()).searchParams.get('studentId') === 'st-2' ? 'Leela Rao' : 'Kiran Das'
    return r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><section class="report"><h1>Hill View School</h1><p>${who}</p></section></body></html>` })
  })
  void page.route('**/v1/reports/pdf', (r) => {
    saved.pdf = r.request().postDataJSON()
    return r.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4 fake' })
  })
  void page.route('**/v1/report-template', (r) => {
    if (r.request().method() === 'PUT') {
      saved.template = r.request().postDataJSON()
      return json(r, { id: 'tpl', version: 2, config: (saved.template as { config: unknown }).config })
    }
    return json(r, { id: 'tpl', version: 1, config })
  })
  void page.route('**/v1/branding', (r) => {
    if (r.request().method() === 'PUT') {
      saved.branding = r.request().postDataJSON()
      return json(r, { version: 3, hasLogo: false, ...(saved.branding as object) })
    }
    return json(r, { version: 2, displayName: 'Hill View', hasLogo: false })
  })
  return saved
}

test('a class teacher previews each report and downloads the section as one PDF', async ({ page }) => {
  const saved = fakeApi(page, 'class_teacher', { pdf: true })
  await page.goto('/reports')
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Reports' })).toBeVisible()
  const preview = page.frameLocator('iframe[title="Report of Kiran Das"]')
  await expect(preview.getByText('Kiran Das')).toBeVisible()
  await page.getByRole('button', { name: 'Leela Rao' }).click()
  await expect(page.frameLocator('iframe[title="Report of Leela Rao"]').getByText('Leela Rao')).toBeVisible()
  // A class teacher does not design the template.
  await expect(page.getByRole('tab', { name: 'Report design' })).toHaveCount(0)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF for the whole section' }).click()
  expect((await download).suggestedFilename()).toBe('reports-Grade-6-A-Term-1.pdf')
  expect(saved.pdf).toEqual({ sectionId: SECTION, periodId: 't1' })
  await expect(page.getByRole('status')).toContainText('The PDF is downloaded')
})

test('without a PDF renderer, reports print from the browser', async ({ page }) => {
  fakeApi(page, 'admin', { pdf: false })
  await page.goto('/reports')
  await expect(page.getByRole('button', { name: 'PDF for the whole section' })).toBeDisabled()
  await expect(page.getByText('printing from the browser gives the same page')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Print from the browser' })).toBeEnabled()
})

test('an administrator orders subjects, sets the print options and the institution details', async ({ page }) => {
  const saved = fakeApi(page, 'admin', { pdf: true })
  await page.goto('/reports')
  await page.getByRole('tab', { name: 'Report design' }).click()
  // English comes first by name; move Mathematics up.
  await page.getByRole('button', { name: 'Move Mathematics up' }).click()
  await page.getByLabel('Paper').selectOption('A5')
  await page.getByLabel('Folded booklet').check()
  await page.getByLabel('QR code').check()
  await page.getByRole('checkbox', { name: 'Band legend', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Save the design' }).click()
  await expect(page.getByRole('status')).toContainText('Saved as version 2')
  const cfg = (saved.template as { config: typeof config }).config
  expect(cfg.subjectOrder).toEqual(['math', 'eng'])
  expect(cfg.paper).toEqual({ size: 'A5', orientation: 'portrait' })
  expect(cfg.booklet && cfg.qr).toBe(true)
  expect(cfg.sections.find((s) => s.key === 'legend')?.on).toBe(false)
  await expect(page.getByRole('checkbox', { name: 'Name and details (always shown)' })).toBeDisabled()

  await page.getByRole('tab', { name: 'Institution details' }).click()
  await page.getByLabel('Address').fill('Bhubaneswar, Odisha')
  await page.getByRole('button', { name: 'Save the details' }).click()
  await expect(page.getByRole('status')).toContainText('Saved')
  expect(saved.branding).toMatchObject({ displayName: 'Hill View', address: 'Bhubaneswar, Odisha' })
})

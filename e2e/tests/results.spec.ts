import { expect, test, type Page, type Route } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-000000000005'
const SECTION = 'sec-6a'

/** A worked result as the engine records it: 8.50 + 8.50 + 62.00 = 79.00. */
const detail = {
  state: 'complete', value: '79.00', max: '100', pct: '79.00', grade: 'B1', gradeDescriptor: 'Very good', passed: true, basis: 'full', expr: 'PT + NB + TE',
  working: ['PT + NB + TE = 8.50 + 8.50 + 62.00 = 79.0000', '79.00 of 100 = 79.00%', '79.00% is B1 (from 71%)'],
  rounding: { mode: 'half_up', places: 2, at: 'components' },
  components: [
    {
      code: 'PT', name: 'Periodic tests', aggregate: 'best_n:2', onAbsent: 'wait_makeup', state: 'complete', value: '8.50', max: '10', pct: '85.00',
      working: 'best 2 of 3: 80.00%, 90.00% = 85.00% of 10 = 8.50',
      events: [
        { assessmentId: 'p1', title: 'Periodic test 1', kind: 'periodic_test', heldOn: '2026-05-01', use: 'used', value: '32', max: '40', pct: '80.00', parts: [{ partId: 'x1', name: 'Total', state: 'scored', value: '32', max: '40', use: 'counted' }] },
        { assessmentId: 'p2', title: 'Periodic test 2', kind: 'periodic_test', heldOn: '2026-06-01', use: 'used', value: '36', max: '40', pct: '90.00', parts: [{ partId: 'x2', name: 'Total', state: 'scored', value: '36', max: '40', use: 'counted' }] },
        { assessmentId: 'p3', title: 'Periodic test 3', kind: 'periodic_test', heldOn: '2026-07-01', use: 'dropped', reason: 'not_in_best', value: '28', max: '40', pct: '70.00', parts: [{ partId: 'x3', name: 'Total', state: 'scored', value: '28', max: '40', use: 'counted' }] },
      ],
    },
    {
      code: 'NB', name: 'Notebook', aggregate: 'avg', onAbsent: 'exclude', state: 'complete', value: '8.50', max: '10', pct: '85.00', working: 'average of 80.00%, 90.00% = 85.00% of 10 = 8.50',
      events: [
        { assessmentId: 'p1', title: 'Periodic test 1', kind: 'periodic_test', use: 'used', value: '8', max: '10', pct: '80.00', parts: [] },
        { assessmentId: 'p2', title: 'Periodic test 2', kind: 'periodic_test', use: 'used', value: '9', max: '10', pct: '90.00', parts: [] },
        { assessmentId: 'p3', title: 'Periodic test 3', kind: 'periodic_test', use: 'left_out', reason: 'absent_excluded', parts: [] },
      ],
    },
    {
      code: 'TE', name: 'Term exam', aggregate: 'sum', onAbsent: 'wait_makeup', state: 'complete', value: '62.00', max: '80', pct: '77.50', working: '(62) of (80) = 77.50% of 80 = 62.00',
      events: [{ assessmentId: 't', title: 'Term exam', kind: 'term_end', use: 'used', value: '62', max: '80', pct: '77.50', parts: [] }],
    },
  ],
}

function fakeApi(page: Page, role: string) {
  const json = (r: Route, body: unknown, s = 200) => r.fulfill({ status: s, json: body })
  void page.route('**/v1/me', (r) => json(r, { userId: 'user_1', orgs: [{ id: ORG, name: 'Hill View', preset: 'school', roles: [role], setupDone: true, staffId: 'staff-1' }] }))
  void page.route('**/v1/terminology', (r) => json(r, { preset: 'school', overrides: [] }))
  void page.route(/\/v1\/years(\?.*)?$/, (r) => json(r, [{ id: 'y', label: '2026-27', startsOn: '2026-04-01', endsOn: '2027-03-31' }]))
  void page.route(/\/v1\/periods(\?.*)?$/, (r) => json(r, [{ id: 't1', yearId: 'y', name: 'Term 1', seq: 1, kind: 'term', startsOn: '2026-04-01', endsOn: '2026-09-30' }]))
  void page.route(/\/v1\/levels(\?.*)?$/, (r) => json(r, [{ id: 'l6', name: 'Grade 6', seq: 6 }]))
  void page.route(/\/v1\/sections(\?.*)?$/, (r) => json(r, [{ id: SECTION, name: 'A', levelId: 'l6', yearId: 'y', branchId: 'b' }]))
  void page.route(/\/v1\/subjects(\?.*)?$/, (r) => json(r, [{ id: 'math', name: 'Mathematics', kind: 'academic' }]))
  void page.route(/\/v1\/teaching-assignments(\?.*)?$/, (r) => json(r, [{ id: 'ta', staffId: 'staff-1', sectionId: SECTION, subjectId: 'math' }]))
  void page.route(/\/v1\/results\?/, (r) =>
    json(r, {
      access: role === 'coordinator' ? 'counts' : 'full',
      scheme: { id: 's1', name: 'Our scheme', version: 1 },
      components: [
        { code: 'PT', name: 'Periodic tests', max: '10' },
        { code: 'NB', name: 'Notebook', max: '10' },
        { code: 'TE', name: 'Term exam', max: '80' },
      ],
      counts: { complete: 1, provisional: 0, blocked: 1, notAssessed: 0, stale: 0 },
      rows:
        role === 'coordinator'
          ? []
          : [
              {
                studentId: 'st-1', name: 'Kiran', admissionNo: 'A-001', rollNo: '1', stale: false,
                result: { state: 'complete', value: '79.00', max: '100', pct: '79.00', grade: 'B1' },
                components: [
                  { code: 'PT', state: 'complete', value: '8.50' },
                  { code: 'NB', state: 'complete', value: '8.50' },
                  { code: 'TE', state: 'complete', value: '62.00' },
                ],
              },
              {
                studentId: 'st-2', name: 'Leela', admissionNo: 'A-002', rollNo: '2', stale: false,
                result: { state: 'blocked', reason: 'component_blocked:TE' },
                components: [{ code: 'PT', state: 'complete', value: '9.00' }, { code: 'NB', state: 'complete', value: '8.00' }, { code: 'TE', state: 'blocked' }],
              },
            ],
    }),
  )
  void page.route(/\/v1\/results\/explain/, (r) =>
    json(r, { studentId: 'st-1', name: 'Kiran', periodId: 't1', subjectId: 'math', scheme: { id: 's1', name: 'Our scheme', version: 1 }, stale: false, computedAt: '2026-11-04T10:00:00Z', detail }),
  )
}

test('a result opens to every mark, rule and step behind it', async ({ page }) => {
  fakeApi(page, 'teacher')
  await page.goto('/results')
  const table = page.getByRole('table')
  await expect(table.getByRole('row', { name: /Kiran/ })).toContainText('79.00')
  await expect(table.getByRole('row', { name: /Kiran/ })).toContainText('B1')
  // Absent waits for the makeup: no number, and the reason in words.
  const leela = table.getByRole('row', { name: /Leela/ })
  await expect(leela).toContainText('Withheld')
  await expect(leela).toContainText('Term exam has an absence waiting for a makeup mark')
  await expect(leela.getByRole('button', { name: /worked out/ })).toHaveCount(0)

  await table.getByRole('button', { name: "How Kiran's 79.00 was worked out" }).click()
  const panel = page.getByRole('dialog', { name: 'How this result was worked out' })
  await expect(panel).toContainText('PT + NB + TE = 8.50 + 8.50 + 62.00')
  await expect(panel).toContainText('Our scheme, version 1')
  await expect(panel).toContainText('Rounded half up to 2 decimal places')
  await expect(panel.getByRole('row', { name: /Periodic test 3/ }).first()).toContainText('Not among the best')
  await expect(panel).toContainText('Absent, left out')
  await expect(panel).toContainText('Average the best 2')
  await expect(page.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
})

test('a role that sees counts only gets no student results', async ({ page }) => {
  fakeApi(page, 'coordinator')
  await page.goto('/results')
  await expect(page.getByRole('list', { name: 'Counts' })).toContainText('Final')
  await expect(page.getByText('Your role shows how many results are in each state')).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
})

test('a board pack becomes a draft, and a bad expression is refused on its line', async ({ page }) => {
  fakeApi(page, 'admin')
  const definition = {
    schema: 1, rounding: { mode: 'half_up', places: 2, at: 'components' },
    components: detail.components.map((c) => ({ code: c.code, name: c.name, from: { kinds: [c.code === 'TE' ? 'term_end' : 'periodic_test'], part_kind: c.code === 'NB' ? 'additional' : 'main', ...(c.code === 'NB' ? { component_code: 'NB' } : {}) }, aggregate: c.code === 'PT' ? { fn: 'best_n', n: 2 } : { fn: c.code === 'NB' ? 'avg' : 'sum' }, scale_to: c.max, on_absent: c.onAbsent })),
    subject: { expr: 'PT + NB + TE', max: '100' },
  }
  const scheme = { id: 's9', familyId: 's9', name: 'Example board (fictional)', version: 1, status: 'draft', packKey: 'example-secondary@1', updatedAt: '2026-11-04T10:00:00Z', definition }
  let imported = false
  const json = (r: Route, body: unknown, s = 200) => r.fulfill({ status: s, json: body })
  void page.route('**/v1/scheme-packs', (r) => json(r, [{ key: 'example-secondary@1', name: 'Example board (fictional)', board: 'example', stage: 'secondary', version: 1, description: 'Periodic tests, a notebook and the term exam.', ...(imported ? { schemeId: 's9' } : {}) }]))
  void page.route('**/v1/scheme-packs/*/import', (r) => {
    imported = true
    return json(r, { scheme, created: true })
  })
  void page.route('**/v1/schemes', (r) => json(r, imported ? [scheme] : []))
  void page.route('**/v1/scheme-assignments', (r) => json(r, []))
  void page.route('**/v1/schemes/s9', (r) => {
    if (r.request().method() === 'PUT') {
      const body = r.request().postDataJSON() as { definition: { subject: { expr: string } } }
      if (body.definition.subject.expr.includes('pow'))
        return json(r, { type: 'about:blank', title: 'Invalid', status: 422, code: 'validation.failed', errors: [{ field: 'definition.subject.expr', code: 'invalid', message: 'at character 1: "pow" is not an allowed function.' }] }, 422)
      return json(r, { ...scheme, definition: body.definition })
    }
    return json(r, scheme)
  })

  await page.goto('/schemes')
  await page.getByRole('button', { name: 'Use this pack' }).click()
  await expect(page.getByRole('heading', { name: /Example board \(fictional\)/ })).toBeVisible()
  const expr = page.getByLabel('How the components combine')
  await expect(expr).toHaveValue('PT + NB + TE')
  await expr.fill('pow(PT, 2) + NB + TE')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByRole('region', { name: 'The result' })).toContainText('"pow" is not an allowed function')
  await expect(page.getByRole('status')).toContainText('fix the lines marked below')
})

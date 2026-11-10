import { expect, test, type Page, type Route } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-000000000009'

function fakeApi(page: Page) {
  const posted: { path: string; body: Record<string, unknown> }[] = []
  const imports: Record<string, string>[] = []
  const changes: unknown[] = []
  const json = (r: Route, body: unknown, s = 200) => r.fulfill({ status: s, json: body })
  const levels = [
    { id: 'l6', name: 'Grade 6', seq: 6 },
    { id: 'l7', name: 'Grade 7', seq: 7 },
  ]
  const sections = [{ id: 's6a', name: 'A', levelId: 'l6', yearId: 'y', branchId: 'b' }]
  void page.route('**/v1/me', (r) => json(r, { userId: 'user_1', orgs: [{ id: ORG, name: 'Hill View', preset: 'school', roles: ['admin'], setupDone: true, staffId: 'staff-1' }] }))
  void page.route('**/v1/terminology', (r) => json(r, { preset: 'school', overrides: [] }))
  void page.route('**/v1/setup', (r) =>
    json(r, { years: 1, periods: 2, levels: 2, sections: 1, subjects: 1, levelSubjects: 2, staff: 3, students: 40, invitations: 0, done: true, assessments: 1, marks: 9, schemes: 1, results: 9, reports: 1 }),
  )
  void page.route(/\/v1\/years(\?.*)?$/, (r) => json(r, [{ id: 'y', label: '2026-27', startsOn: '2026-04-01', endsOn: '2027-03-31' }]))
  void page.route(/\/v1\/branches(\?.*)?$/, (r) => json(r, [{ id: 'b', name: 'Main' }]))
  void page.route(/\/v1\/subjects(\?.*)?$/, (r) => json(r, [{ id: 'math', name: 'Mathematics', kind: 'academic' }]))
  void page.route(/\/v1\/(staff|subject-groups|periods|teaching-assignments)(\?.*)?$/, (r) => json(r, []))
  void page.route(/\/v1\/(levels|sections)(\?.*)?$/, (r) => {
    const path = new URL(r.request().url()).pathname.split('/').pop()!
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON()
      posted.push({ path, body })
      const made = { id: `${path}-${posted.length}`, ...body }
      ;(path === 'levels' ? levels : sections).push(made)
      return json(r, made, 201)
    }
    return json(r, path === 'levels' ? levels : sections)
  })
  void page.route('**/v1/syllabus/summary', (r) => json(r, [{ levelId: 'l6', subjectId: 'math', competencies: 2, lessons: 1, outcomes: 3 }]))
  void page.route(/\/v1\/syllabus\?/, (r) =>
    json(r, {
      kind: 'academic',
      competencies: [
        { id: 'k1', name: 'Disciplinary Knowledge', outcomes: 2 },
        { id: 'k2', name: 'Problem Solving', outcomes: 1 },
      ],
      lessons: [
        {
          id: 'les', seq: 1, name: 'Fractions',
          outcomes: [
            { id: 'o1', text: 'Identify proper fractions.', competencyId: 'k1', bloom: 'remember', bloomBy: 'suggested' },
            { id: 'o2', text: 'Compare fractions.', competencyId: 'k1', bloom: 'analyse', bloomBy: 'suggested' },
            { id: 'o3', text: 'Solve word problems.', competencyId: 'k2', bloom: 'apply', bloomBy: 'teacher' },
          ],
        },
      ],
      unplaced: [],
    }),
  )
  void page.route('**/v1/learning-outcomes/*', (r) => {
    changes.push(r.request().postDataJSON())
    return json(r, { id: 'o1', text: 'Identify proper fractions.', bloom: 'apply', bloomBy: 'teacher' })
  })
  void page.route('**/v1/syllabus/import', (r) => {
    const body = r.request().postData() ?? ''
    const field = (name: string) => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`).exec(body)?.[1] ?? ''
    imports.push({ apply: field('apply'), createSubjects: field('createSubjects') })
    const applied = field('apply') === 'true'
    return json(r, {
      shape: 'competencies', rows: 4, created: { subjects: applied ? 1 : 0, competencies: 2, lessons: 0, outcomes: 0 }, matched: { subjects: 0, competencies: 1, lessons: 0, outcomes: 0 },
      repeated: 1, noCompetency: 0, unknownSubjects: applied ? [] : ['Drums'], unknownLevels: [], problems: [], applied,
    })
  })
  return { posted, imports, changes }
}

test('classes and their sections in one table, several added at once', async ({ page }) => {
  const api = fakeApi(page)
  await page.goto('/settings/structure')
  const row6 = page.getByRole('row', { name: /Grade 6/ })
  await expect(row6).toContainText('A')
  await page.getByLabel('Add sections to Grade 6').fill('B, C')
  await page.getByLabel('Add sections to Grade 6').press('Enter')
  await expect(page.getByRole('status')).toContainText('Added B, C to Grade 6')
  expect(api.posted.map((p) => `${p.path}:${p.body.name}`)).toEqual(['sections:B', 'sections:C'])

  // A run of classes, each with its sections, in one line.
  await page.getByLabel('From', { exact: true }).fill('8')
  await page.getByLabel('To', { exact: true }).fill('9')
  await page.getByLabel('Sections in each').fill('A B')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('2 grades made, each with A, B sections')
  expect(api.posted.slice(2).map((p) => `${p.path}:${p.body.name}`)).toEqual(['levels:Grade 8', 'sections:A', 'sections:B', 'levels:Grade 9', 'sections:A', 'sections:B'])
})

test('the syllabus shows Bloom levels, takes a teacher change, and imports with a preview first', async ({ page }) => {
  const api = fakeApi(page)
  await page.goto('/settings/syllabus')
  await expect(page.getByRole('navigation', { name: 'Configuration' }).getByRole('link', { name: 'Syllabus' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('region', { name: 'Bloom levels' })).toContainText('Remember 1')
  await expect(page.getByRole('region', { name: 'Competencies' })).toContainText('Problem Solving')
  await page.locator('summary', { hasText: 'Fractions' }).click()
  await page.getByLabel('Bloom level of: Identify proper fractions.').selectOption('apply')
  await expect.poll(() => api.changes).toEqual([{ bloom: 'apply' }])

  await page.getByRole('button', { name: 'Import a file' }).click()
  await page.getByLabel('File', { exact: true }).setInputFiles({ name: 'competencies.csv', mimeType: 'text/csv', buffer: Buffer.from('competency,description,subject\nX,Y,Drums\n') })
  await page.getByRole('button', { name: 'Preview' }).click()
  const result = page.getByRole('region', { name: 'Import' }).getByRole('status')
  await expect(result).toContainText('4 rows of competencies. Would add 2 competencies. 1 already here.')
  await expect(result).toContainText('Not here: Drums')
  await page.getByLabel(/Create subjects that are not here yet/).check()
  await page.getByRole('button', { name: 'Preview' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(result).toContainText('Saved.')
  expect(api.imports).toEqual([
    { apply: 'false', createSubjects: 'false' },
    { apply: 'false', createSubjects: 'true' },
    { apply: 'true', createSubjects: 'true' },
  ])
})

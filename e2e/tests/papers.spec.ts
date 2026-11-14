import { expect, test, type Page, type Route } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-000000000011'

// One assessment of 4 marks, a lesson with an outcome, a bank of three
// questions, and a server that keeps what it is sent.
function fakeApi(page: Page) {
  const sent: { path: string; body: unknown }[] = []
  const json = (r: Route, body: unknown, s = 200) => r.fulfill({ status: s, json: body })
  const q = (id: string, qtype: string, marks: string, bloom: string, text: string, status = 'approved', source = 'typed') => ({
    id, levelId: 'l6', subjectId: 'math', lessonId: 'les', outcomeId: 'o1', bloom, qtype, marks, difficulty: 'easy', text, options: [], answer: 'A', source, status, used: 0,
  })
  const bank = [q('q1', 'Multiple choice', '1', 'remember', 'Which is larger, 1/2 or 1/3?'), q('q2', 'Multiple choice', '1', 'remember', 'Name a proper fraction.'), q('q3', 'Short answer', '2', 'apply', 'Add 1/4 and 1/2.')]
  let bp = { assessmentId: 'ut', taxonomy: 'bloom', status: 'draft', version: 1, comment: '', max: '4', rows: [] as unknown[], byLevel: [], byChapter: [], questions: 0, allocated: '0', remaining: '4', checks: [], exists: false }
  const item = (n: number, section: string, marks: string, level: string, question?: unknown) => ({ id: `i${n}`, seq: n, section, sectionId: section === 'Multiple choice' ? 'secA' : 'secB', chapter: 'Fractions', lessonId: 'les', level, marks, locked: false, question })
  let paper = {
    id: 'pA', assessmentId: 'ut', set: 'Set A', status: 'draft', taxonomy: 'bloom', blueprintVersion: 1, instructions: '', filled: 3, total: '4',
    items: [item(1, 'Multiple choice', '1', 'remember', bank[0]), item(2, 'Multiple choice', '1', 'remember', bank[1]), item(3, 'Short answer', '2', 'apply', bank[2])],
    sections: [
      { id: 'secA', seq: 1, title: 'Multiple choice', instructions: '', kind: 'core', print: true, questions: 2, marks: '2' },
      { id: 'secB', seq: 2, title: 'Short answer', instructions: '', kind: 'core', print: true, questions: 1, marks: '2' },
    ],
    bySection: [{ key: 'Multiple choice', wanted: '2', filled: '2', missing: 0 }, { key: 'Short answer', wanted: '2', filled: '2', missing: 0 }], byLevel: [], assignments: [] as unknown[],
  }
  let papers: unknown[] = []
  const summary = () => ({ id: paper.id, set: paper.set, status: paper.status, items: 3, filled: 3, blueprintVersion: 1 })

  void page.route('**/v1/me', (r) => json(r, { userId: 'user_1', orgs: [{ id: ORG, name: 'Hill View', preset: 'school', roles: ['admin'], setupDone: true, staffId: 'staff-1' }] }))
  void page.route('**/v1/terminology', (r) => json(r, { preset: 'school', overrides: [] }))
  void page.route('**/v1/setup', (r) =>
    json(r, { years: 1, periods: 1, levels: 1, sections: 1, subjects: 1, levelSubjects: 1, staff: 3, students: 2, invitations: 0, done: true, assessments: 1, marks: 0, schemes: 0, results: 0, reports: 0, papers: 0, assigned: 0 }),
  )
  void page.route(/\/v1\/years(\?.*)?$/, (r) => json(r, [{ id: 'y', label: '2026-27', startsOn: '2026-04-01', endsOn: '2027-03-31' }]))
  void page.route(/\/v1\/levels(\?.*)?$/, (r) => json(r, [{ id: 'l6', name: 'Grade 6', seq: 6 }]))
  void page.route(/\/v1\/sections(\?.*)?$/, (r) => json(r, [{ id: 's6a', name: 'A', levelId: 'l6', yearId: 'y', branchId: 'b' }]))
  void page.route(/\/v1\/subjects(\?.*)?$/, (r) => json(r, [{ id: 'math', name: 'Mathematics', kind: 'academic' }]))
  void page.route(/\/v1\/(staff|subject-groups|periods|teaching-assignments|branches)(\?.*)?$/, (r) => json(r, []))
  void page.route(/\/v1\/assessments(\?.*)?$/, (r) =>
    json(r, [{ id: 'ut', yearId: 'y', periodId: 'p', levelId: 'l6', subjectId: 'math', title: 'Unit test 3', kind: 'periodic_test', entryMode: 'total', status: 'open', sectionIds: ['s6a'], parts: [] }]),
  )
  void page.route(/\/v1\/syllabus\?/, (r) =>
    json(r, { kind: 'academic', competencies: [], unplaced: [], lessons: [{ id: 'les', seq: 1, name: 'Fractions', outcomes: [{ id: 'o1', text: 'Compare fractions.', bloom: 'analyse', bloomBy: 'suggested' }] }] }),
  )
  void page.route(/\/v1\/questions\?/, (r) => json(r, bank))
  void page.route('**/v1/questions/draft', (r) => {
    sent.push({ path: 'draft', body: r.request().postDataJSON() })
    const made = q('q9', 'Short answer', '2', 'apply', 'Subtract 1/3 from 1/2.', 'draft', 'ai')
    bank.push(made)
    return json(r, [made], 201)
  })
  void page.route('**/v1/assessments/ut/blueprint', (r) => {
    if (r.request().method() === 'PUT') {
      const body = r.request().postDataJSON()
      sent.push({ path: 'blueprint', body })
      bp = { ...bp, rows: body.rows, exists: true, allocated: '4', remaining: '0', questions: 3 }
    }
    return json(r, bp)
  })
  void page.route('**/v1/assessments/ut/blueprint/*', (r) => {
    const step = r.request().url().split('/').pop()!
    sent.push({ path: step, body: null })
    bp = { ...bp, status: step === 'submit' ? 'submitted' : 'approved' }
    return json(r, bp)
  })
  void page.route('**/v1/assessments/ut/papers', (r) => {
    if (r.request().method() === 'POST') {
      sent.push({ path: 'papers', body: r.request().postDataJSON() })
      papers = [summary()]
      return json(r, paper, 201)
    }
    return json(r, papers)
  })
  void page.route('**/v1/papers/pA', (r) => json(r, paper))
  void page.route('**/v1/papers/pA/order', (r) => {
    const body = r.request().postDataJSON()
    sent.push({ path: 'order', body })
    const ids: string[] = body.sections.flatMap((x: { itemIds: string[] }) => x.itemIds)
    paper = { ...paper, sections: body.sections.map((x: { id: string }, i: number) => ({ ...paper.sections.find((y) => y.id === x.id)!, seq: i + 1 })), items: ids.map((id, i) => ({ ...paper.items.find((y) => y.id === id)!, seq: i + 1 })) }
    return json(r, paper)
  })
  void page.route('**/v1/papers/pA/sections/*', (r) => {
    const body = r.request().postDataJSON()
    sent.push({ path: 'section', body })
    paper = { ...paper, sections: paper.sections.map((x) => (r.request().url().endsWith(x.id) ? { ...x, ...body } : x)) }
    return json(r, paper)
  })
  void page.route('**/v1/papers/pA/items', (r) => {
    const body = r.request().postDataJSON()
    sent.push({ path: 'item', body })
    const made = { ...q('q7', body.question.qtype, body.question.marks, 'apply', body.question.text), options: body.question.options }
    paper = { ...paper, filled: 4, items: [...paper.items, { ...item(4, 'Short answer', body.question.marks, '', made), sectionId: body.sectionId }] }
    return json(r, paper, 201)
  })
  void page.route('**/v1/paper-settings', (r) => json(r, { setNames: ['Set A', 'Set B'], custom: { name: 'Depth of knowledge', levels: ['Recall', 'Skill'] } }))
  void page.route(/\/v1\/papers\/pA\/html/, (r) => {
    const u = new URL(r.request().url())
    sent.push({ path: 'html', body: { key: u.searchParams.get('key'), space: u.searchParams.get('space') } })
    return r.fulfill({ contentType: 'text/html', body: `<h1>Hill View</h1><p>Set A</p>${u.searchParams.get('space') === 'true' ? '<div class="space"></div>' : ''}${u.searchParams.get('key') === 'true' ? '<div class="key">A</div>' : ''}` })
  })
  void page.route('**/v1/papers/pA/finalise', (r) => {
    sent.push({ path: 'finalise', body: r.request().postDataJSON() })
    paper = { ...paper, status: 'final' }
    papers = [summary()]
    return json(r, paper)
  })
  void page.route('**/v1/papers/pA/assignments', (r) => {
    const body = r.request().postDataJSON()
    sent.push({ path: 'assignments', body })
    paper = { ...paper, assignments: body.assignments }
    return json(r, paper)
  })
  return { sent }
}

test('a paper from blueprint to assigned: plan, approve, fill from the bank, finalise, give out', async ({ page }) => {
  const api = fakeApi(page)
  await page.goto('/papers')
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Create question paper/ })).toBeVisible()

  // The taxonomy can be Bloom, SOLO, the institution's own, or none.
  await expect(page.getByLabel('Taxonomy').locator('option')).toHaveText(["Bloom's taxonomy", 'SOLO taxonomy', 'Depth of knowledge', 'No taxonomy'])
  // Blueprint: one row per lesson; 2 recall questions of 1 mark each, and 1 of 2 applying.
  await page.getByRole('button', { name: 'One row per lesson (1)' }).click()
  await expect(page.getByLabel('Row 1 question type')).toHaveValue('Short answer')
  await expect(page.getByLabel('Row 1 question type').locator('option')).toContainText(['Multiple choice', 'Long answer', 'Other, type a name'])
  await page.getByLabel('Row 1 Remember questions').fill('2')
  await page.getByLabel('Row 1 Remember marks each').fill('1')
  await expect(page.getByRole('status').filter({ hasText: 'marks' })).toHaveText('2 marks still to allocate')
  await page.getByLabel('Row 1 Apply questions').fill('1')
  await page.getByLabel('Row 1 Apply marks each').fill('2')
  await expect(page.getByRole('status').filter({ hasText: 'allocated' })).toHaveText('Every mark allocated')
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await page.getByRole('button', { name: 'Approve' }).click()
  expect(api.sent.map((s) => s.path)).toEqual(['blueprint', 'submit', 'approve'])
  expect(api.sent[0].body).toEqual({ taxonomy: 'bloom', rows: [{ lessonId: 'les', chapter: 'Fractions', qtype: 'Short answer', cells: { remember: { questions: 2, marks: '1' }, apply: { questions: 1, marks: '2' } } }] })

  // The next step is named: the bank has no short recall questions yet.
  await expect(page.getByRole('button', { name: /^Next:/ })).toContainText('Add the 2 questions the blueprint still needs')
  await page.getByRole('button', { name: /Paper sets/ }).click()
  await page.getByRole('button', { name: 'Make Set A' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'slots' })).toContainText('3 of 3 slots filled · 4 marks · ready to finalise')

  // Section cards: the second moves up, is marked extra and not printed, and takes a typed question.
  const short = page.getByRole('region', { name: 'Short answer' })
  await short.getByRole('button', { name: 'Move Short answer up' }).click()
  await expect(page.getByRole('region', { name: /^(Short answer|Multiple choice)$/ }).first()).toHaveAccessibleName('Short answer')
  await short.getByRole('button', { name: /Short answer/ }).first().click()
  await short.getByLabel('Extra', { exact: true }).click()
  await expect(short.getByText('Extra, not counted')).toBeVisible()
  await short.getByLabel('Print', { exact: true }).click()
  await expect(short.getByText('Not printed')).toBeVisible()
  await short.getByRole('button', { name: 'Type a question' }).click()
  await short.getByLabel('Question type').selectOption('Match the following')
  await short.getByLabel('Marks').fill('2')
  await short.getByLabel('Question', { exact: true }).fill('Match each fraction to its decimal.')
  await short.getByLabel('Pair 1').fill('1/2 = 0.5')
  await short.getByLabel('Pair 2').fill('1/4 = 0.25')
  await short.getByRole('button', { name: 'Add question' }).click()
  await expect(short.getByText('Match each fraction to its decimal.')).toBeVisible()
  expect(api.sent.filter((s) => ['order', 'section', 'item'].includes(s.path))).toEqual([
    { path: 'order', body: { sections: [{ id: 'secB', itemIds: ['i3'] }, { id: 'secA', itemIds: ['i1', 'i2'] }] } },
    { path: 'section', body: { kind: 'extra' } },
    { path: 'section', body: { print: false } },
    { path: 'item', body: { sectionId: 'secB', question: { qtype: 'Match the following', marks: '2', text: 'Match each fraction to its decimal.', options: ['1/2 = 0.5', '1/4 = 0.25'], answer: '', spaceKind: 'auto', spaceSize: 0, optionCols: 0, optionBoxes: true, bits: [] } } },
  ])
  // The paper as it prints, beside the slots: with space to answer, then as the key.
  const preview = page.getByRole('complementary', { name: 'Print preview' })
  await expect(preview.frameLocator('iframe').locator('.space')).toHaveCount(1)
  await preview.getByLabel('Answer key').check()
  await expect(preview.frameLocator('iframe').locator('.key')).toHaveCount(1)
  expect(api.sent.filter((s) => s.path === 'html').at(-1)?.body).toEqual({ key: 'true', space: 'true' })
  // How marks are entered is not the paper's to say: that is the administrator's, on Evaluate exam.
  await expect(page.getByLabel('Marks are entered')).toHaveCount(0)
  await page.getByRole('button', { name: 'Finalise Set A' }).click()
  await expect.poll(() => api.sent.some((s) => s.path === 'finalise')).toBe(true)
  await expect(page.getByRole('button', { name: /Set A/ }).first()).toContainText('final')

  await page.getByRole('link', { name: /give each set to who sits it/ }).click()
  await expect(page).toHaveURL(/\/assign\?a=ut/)
  await page.getByLabel('Grade 6 A date').fill('2026-11-20')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  expect(api.sent.at(-1)).toEqual({ path: 'assignments', body: { assignments: [{ sectionId: 's6a', sitOn: '2026-11-20' }] } })
})

test('AI drafts what the blueprint still needs, as drafts to approve', async ({ page }) => {
  const api = fakeApi(page)
  await page.goto('/papers?a=ut&tab=questions')
  await expect(page.getByRole('region', { name: 'Question bank' })).toContainText('Add 1/4 and 1/2.')
  // Nothing is planned yet, so nothing is still needed.
  await expect(page.getByRole('region', { name: 'Still needed' })).toHaveCount(0)
  await page.goto('/papers?a=ut&tab=blueprint')
  await page.getByRole('button', { name: 'One row per lesson (1)' }).click()
  await page.getByLabel('Row 1 Apply questions').fill('2')
  await page.getByLabel('Row 1 Apply marks each').fill('2')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await page.getByRole('button', { name: /Questions/ }).click()
  const need = page.getByRole('region', { name: 'Still needed' })
  await expect(need).toContainText('1 × Short answer, 2 marks, Apply')
  await need.getByRole('button', { name: 'Draft with AI' }).click()
  // A draft does not count until approved, so the need stays until then.
  await expect(need).toContainText('1 drafted: check them in Drafts')
  expect(api.sent.find((s) => s.path === 'draft')?.body).toEqual({ levelId: 'l6', subjectId: 'math', lessonId: 'les', qtype: 'Short answer', bloom: 'apply', marks: '2', count: 1 })
  await page.getByRole('button', { name: /Drafts to check \(1\)/ }).click()
  await expect(page.getByRole('region', { name: 'Question bank' })).toContainText('AI draft')
})

test('an administrator names the sets and sets the institution own levels', async ({ page }) => {
  const api = fakeApi(page)
  void page.route('**/v1/paper-settings', (r) => {
    if (r.request().method() === 'PUT') {
      const body = r.request().postDataJSON()
      api.sent.push({ path: 'settings', body })
      return r.fulfill({ json: body })
    }
    return r.fulfill({ json: { setNames: ['Set A', 'Set B', 'Set C', 'Set D'], custom: { name: '', levels: [] } } })
  })
  await page.goto('/settings/papers')
  await page.getByLabel('Set names').fill('Red\nBlue')
  await page.getByLabel('Taxonomy name').fill('Depth of knowledge')
  await page.getByLabel('Levels').fill('Recall\nSkill\nStrategic')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status')).toContainText('Saved')
  expect(api.sent.at(-1)).toEqual({ path: 'settings', body: { setNames: ['Red', 'Blue'], custom: { name: 'Depth of knowledge', levels: ['Recall', 'Skill', 'Strategic'] } } })
})

test('a blueprint that cannot be saved says why, on the spot', async ({ page }) => {
  const api = fakeApi(page)
  await page.goto('/papers?a=ut&tab=blueprint')
  await page.getByRole('button', { name: 'Add a row' }).click()
  await page.getByLabel('Row 1 Analyse questions').fill('1')
  await page.getByLabel('Row 1 Analyse marks each').fill('4')
  // The chapter is still to choose: nothing is sent, and the reason is named.
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByRole('alert')).toContainText('Row 1: choose or type a chapter.')
  expect(api.sent.filter((s) => s.path === 'blueprint')).toHaveLength(0)

  // A refusal from the server shows what to fix, not only that something is wrong.
  await page.route('**/v1/assessments/ut/blueprint', (r) =>
    r.request().method() === 'PUT'
      ? r.fulfill({
          status: 422,
          contentType: 'application/problem+json',
          body: JSON.stringify({ type: 'about:blank', title: 'Unprocessable Entity', status: 422, code: 'validation.failed', detail: 'Some fields need attention.',
            errors: [{ field: 'rows', code: 'required', message: 'Row 1 needs a chapter and a question type.' }] }),
        })
      : r.fallback(),
  )
  await page.getByLabel('Row 1 chapter').selectOption('Fractions')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByRole('alert')).toHaveText('Row 1 needs a chapter and a question type.')
})

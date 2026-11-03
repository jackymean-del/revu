import { expect, test, type Page, type Route } from '@playwright/test'

const ORG = '01a19bae-0000-7000-8000-000000000004'
const ASSESSMENT = 'asmt-1'
const SECTION = 'sec-6a'

type Cell = { state: string; value?: string; version: number }
type Op = { opId: string; studentId: string; partId: string; state: string; value?: string; baseVersion: number }

/**
 * An in-memory marks API with the server's rules that matter here: versions
 * per cell, a conflict when an edit was made on an old version, row status,
 * bulk writes and their undo, and a personal layout.
 */
function fakeApi(page: Page, opts: { students?: number; parts?: number } = {}) {
  const students = Array.from({ length: opts.students ?? 6 }, (_, i) => ({
    id: `st-${i + 1}`, admissionNo: `A-${String(i + 1).padStart(3, '0')}`, name: `Pupil ${String(i + 1).padStart(2, '0')}`, rollNo: String(i + 1), applicable: true,
  }))
  const parts = Array.from({ length: opts.parts ?? 2 }, (_, i) => ({
    id: `p${i + 1}`, seq: i + 1, name: i === 0 ? 'Part A' : `Part ${String.fromCharCode(65 + i)}`, kind: 'main', countsInTotal: true, maxMarks: '20.00',
  }))
  const cells = new Map<string, Cell>()
  const status = new Map<string, string>()
  const ops: Op[] = []
  const receipts = new Map<string, unknown>()
  const bulks: { id: string; kind: string; cells: number; createdAt: string; undoneAt?: string; before: [string, Cell | undefined][] }[] = []
  const state = { offline: false, layout: { items: [] as unknown[], sort: [{ field: 'roll_no', direction: 'asc' }], personal: false }, savedLayouts: 0, conflictOn: '' }
  const json = (r: Route, body: unknown, s = 200) => r.fulfill({ status: s, json: body })
  const assessment = { id: ASSESSMENT, yearId: 'y', periodId: 't1', levelId: 'l6', subjectId: 'math', title: 'Unit test 1', kind: 'periodic_test', entryMode: 'sections', status: 'open', sectionIds: [SECTION], parts }

  void page.route('**/v1/me', (r) => json(r, { userId: 'user_1', orgs: [{ id: ORG, name: 'Hill View', preset: 'school', roles: ['teacher'], setupDone: true, staffId: 'staff-1' }] }))
  void page.route('**/v1/terminology', (r) => json(r, { preset: 'school', overrides: [] }))
  void page.route(/\/v1\/years(\?.*)?$/, (r) => json(r, [{ id: 'y', label: '2026-27', startsOn: '2026-04-01', endsOn: '2027-03-31' }]))
  void page.route(/\/v1\/levels(\?.*)?$/, (r) => json(r, [{ id: 'l6', name: 'Grade 6', seq: 6 }]))
  void page.route(/\/v1\/sections(\?.*)?$/, (r) => json(r, [{ id: SECTION, name: 'A', levelId: 'l6', yearId: 'y', branchId: 'b' }]))
  void page.route(/\/v1\/subjects(\?.*)?$/, (r) => json(r, [{ id: 'math', name: 'Mathematics', kind: 'academic' }]))
  void page.route(/\/v1\/teaching-assignments(\?.*)?$/, (r) => json(r, [{ id: 'ta', staffId: 'staff-1', sectionId: SECTION, subjectId: 'math' }]))
  void page.route(/\/v1\/assessments(\?.*)?$/, (r) => json(r, [assessment]))
  void page.route(/\/v1\/assessments\/[^/]+\/grid/, (r) =>
    json(r, {
      assessment, sectionId: SECTION, applicability: 'all', canEdit: true, canLock: false, canSetLeft: false,
      students: students.map((s) => ({ ...s, ...(status.get(s.id) ? { status: status.get(s.id) } : {}) })),
      cells: [...cells].map(([k, c]) => ({ studentId: k.split('|')[0], partId: k.split('|')[1], ...c })),
    }),
  )
  void page.route(/\/v1\/layouts\/resolve/, (r) => json(r, { surface: 'entry_grid', scopeId: ASSESSMENT, ...state.layout }))
  void page.route('**/v1/layouts/mine', (r) => {
    state.savedLayouts++
    state.layout = { ...(r.request().postDataJSON() as typeof state.layout), personal: true }
    return json(r, { surface: 'entry_grid', scopeId: ASSESSMENT, ...state.layout })
  })
  void page.route('**/v1/sync/evidence', (r) => {
    if (state.offline) return r.abort('internetdisconnected')
    const results = (r.request().postDataJSON() as { ops: Op[] }).ops.map((op) => {
      // A replayed op returns its first answer, as the server's receipts do.
      if (receipts.has(op.opId)) return receipts.get(op.opId)
      ops.push(op)
      const k = `${op.studentId}|${op.partId}`
      const now = cells.get(k)
      if (op.opId === state.conflictOn || (now?.version ?? 0) !== op.baseVersion) {
        state.conflictOn = ''
        const theirs = { state: 'scored', value: '19.00', version: (now?.version ?? 0) + 1 }
        cells.set(k, theirs)
        const res = { opId: op.opId, outcome: 'conflict', code: 'evidence.conflict', message: 'Changed', cell: { studentId: op.studentId, partId: op.partId, ...theirs } }
        receipts.set(op.opId, res)
        return res
      }
      const cell = { state: op.state, ...(op.value ? { value: op.value } : {}), version: (now?.version ?? 0) + 1 }
      cells.set(k, cell)
      const res = { opId: op.opId, outcome: 'applied', cell: { studentId: op.studentId, partId: op.partId, ...cell } }
      receipts.set(op.opId, res)
      return res
    })
    return json(r, { results })
  })
  void page.route(/\/v1\/assessments\/[^/]+\/participation\/[^/]+/, (r) => {
    const id = r.request().url().split('/').pop()!
    const s = (r.request().postDataJSON() as { status: string }).status
    if (s) status.set(id, s)
    else status.delete(id)
    return json(r, { assessmentId: ASSESSMENT, studentId: id, status: s })
  })
  void page.route('**/v1/tables/read', (r) => {
    const text = r.request().postDataBuffer()!.toString('utf8')
    const csv = text.slice(text.indexOf('Admission'), text.lastIndexOf('\r\n------'))
    const [header, ...rows] = csv.trim().split(/\r?\n/).map((l) => l.split(','))
    return json(r, { header, rows })
  })
  void page.route(/\/v1\/assessments\/[^/]+\/bulk-writes/, (r) => json(r, bulks.map(({ before: _b, ...b }) => b).reverse()))
  void page.route(/\/v1\/assessments\/[^/]+\/bulk$/, (r) => {
    const body = r.request().postDataJSON() as { kind: string; cells: { studentId: string; partId: string; state: string; value?: string }[] }
    const id = `bulk-${bulks.length + 1}`
    const before: [string, Cell | undefined][] = []
    for (const c of body.cells) {
      const k = `${c.studentId}|${c.partId}`
      before.push([k, cells.get(k)])
      cells.set(k, { state: c.state, ...(c.value ? { value: c.value } : {}), version: (cells.get(k)?.version ?? 0) + 1 })
    }
    bulks.push({ id, kind: body.kind, cells: body.cells.length, createdAt: '2026-11-03T10:00:00Z', before })
    return json(r, { id, applied: body.cells.length, refused: [] })
  })
  void page.route(/\/v1\/bulk-writes\/[^/]+\/undo/, (r) => {
    const b = bulks.find((x) => r.request().url().includes(`/${x.id}/`))!
    for (const [k, c] of b.before) {
      if (c) cells.set(k, { ...c, version: cells.get(k)!.version + 1 })
      else cells.set(k, { state: 'pending', version: cells.get(k)!.version + 1 })
    }
    b.undoneAt = '2026-11-03T10:01:00Z'
    return json(r, { restored: b.cells, kept: 0 })
  })
  return { ops, cells, state, students, status }
}

const cell = (page: Page, name: string, part: string) => page.getByRole('gridcell', { name: new RegExp(`^${name}, ${part}, out of`) })

test('a teacher enters marks by keyboard alone, and a wrong value stops where it is', async ({ page }) => {
  const { ops, cells } = fakeApi(page)
  await page.goto('/marks')
  await expect(page.getByRole('grid', { name: 'Mathematics, Unit test 1, Grade 6 A' })).toBeVisible()
  await cell(page, 'Pupil 01', 'Part A').click()

  // Register-style entry: type, Enter, next student.
  for (const v of ['12', '7.5', '20']) {
    await page.keyboard.type(v)
    await page.keyboard.press('Enter')
  }
  // Codes for the states, and Tab across.
  await page.keyboard.press('a')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('n')
  await page.keyboard.press('Tab')
  await page.keyboard.type('15')
  await page.keyboard.press('Tab')
  const got = (s: string, p: string) => cells.get(`${s}|${p}`)
  await expect.poll(() => [got('st-1', 'p1')?.value, got('st-2', 'p1')?.value, got('st-3', 'p1')?.value]).toEqual(['12', '7.5', '20'])
  await expect.poll(() => [got('st-4', 'p1')?.state, got('st-5', 'p1')?.state, got('st-5', 'p2')?.value]).toEqual(['absent', 'not_applicable', '15'])
  await expect(page.getByText('All saved')).toBeVisible()
  expect(ops.every((o) => o.opId.length >= 8)).toBe(true)

  // Above the maximum: refused on the spot, the cell keeps focus.
  await cell(page, 'Pupil 06', 'Part A').click()
  await page.keyboard.type('25')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alert')).toHaveText('Above the maximum of 20')
  await expect(cell(page, 'Pupil 06', 'Part A')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(got('st-6', 'p1')).toBeUndefined()
  await expect(cell(page, 'Pupil 06', 'Part A')).toHaveAttribute('aria-label', 'Pupil 06, Part A, out of 20: pending')
})

// AT-v2-07 on screen: offline edits wait, and a moved cell is never overwritten.
test('edits made offline wait and go later; a conflict asks which mark stays', async ({ page }) => {
  const { state, cells } = fakeApi(page)
  await page.goto('/marks')
  state.offline = true
  await cell(page, 'Pupil 01', 'Part A').click()
  await page.keyboard.type('11')
  await page.keyboard.press('Enter')
  await expect(page.getByText(/1 waiting to send: you are offline/)).toBeVisible()
  expect(cells.size).toBe(0)
  state.offline = false
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => cells.get('st-1|p1')?.value).toBe('11')
  await expect(page.getByText('All saved')).toBeVisible()

  // Someone else saved Pupil 02 meanwhile.
  cells.set('st-2|p1', { state: 'scored', value: '19.00', version: 1 })
  await page.keyboard.type('9')
  await page.keyboard.press('Enter')
  const panel = page.getByRole('region', { name: 'Changed by someone else' })
  await expect(panel).toContainText('Pupil 02, Part A: yours 9, now 19.00')
  await panel.getByRole('button', { name: 'Keep mine' }).click()
  await expect(panel).toHaveCount(0)
  await expect.poll(() => cells.get('st-2|p1')?.value).toBe('9')
})

// AT-GR-01, 02 and 04, AT-v2-09: upload by admission number, preview, apply, undo.
test('an uploaded template shows its changes first and undoes in one step', async ({ page }) => {
  const { cells } = fakeApi(page)
  await page.goto('/marks')
  await page.getByRole('button', { name: 'Upload' }).click()
  await page.getByLabel('Marks file').setInputFiles({
    name: 'marks.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Admission number,Name,Roll,Part A,Part B\r\nA-003,Pupil 03,3,14,AB\r\nA-001,Pupil 01,1,8,\r\nA-999,Nobody,9,5,5\r\n'),
  })
  const preview = page.getByRole('region', { name: 'Upload a filled template' })
  await expect(preview.getByText(/3 changes to apply, 1 unknown admission number, 4 not in the file/)).toBeVisible()
  await expect(preview.getByRole('row', { name: /Pupil 03 Part B blank AB/ })).toBeVisible()
  expect(cells.size).toBe(0)
  await preview.getByRole('button', { name: 'Apply 3' }).click()
  await expect(page.getByRole('status')).toContainText('3 applied')
  expect([cells.get('st-3|p1')?.value, cells.get('st-3|p2')?.state, cells.get('st-1|p1')?.value]).toEqual(['14', 'absent', '8'])
  await page.getByRole('button', { name: 'Undo last upload (3)' }).click()
  await expect(page.getByRole('status')).toContainText('Undone: 3 restored')
  expect(cells.get('st-3|p1')?.state).toBe('pending')
})

test('a row status locks the row; columns and sort are the person\'s own', async ({ page }) => {
  const { state, status } = fakeApi(page)
  await page.goto('/marks')
  page.on('dialog', (d) => void d.accept())
  await page.getByRole('button', { name: 'Actions for Pupil 02' }).click()
  await page.getByRole('region', { name: 'Actions for Pupil 02' }).getByRole('button', { name: 'Exempt' }).click()
  await expect(page.getByRole('row', { name: /Pupil 02 Exempt/ })).toBeVisible()
  expect(status.get('st-2')).toBe('exempt')
  await expect(cell(page, 'Pupil 02', 'Part A')).toHaveAttribute('aria-readonly', 'true')

  await page.getByRole('button', { name: 'Columns' }).click()
  await page.getByRole('region', { name: 'Columns' }).getByRole('checkbox', { name: 'Shown' }).first().uncheck()
  await expect(page.getByRole('columnheader', { name: /Part A/ })).toHaveCount(0)
  await page.getByLabel('Sort by').selectOption({ label: 'Name' })
  expect(state.savedLayouts).toBe(2)
  expect(state.layout.sort).toEqual([{ field: 'name', direction: 'asc' }])
})

// AT-v2-10: 60 students by 20 columns, every keystroke painted within 100 ms.
test('a 60 by 20 grid answers every keystroke within 100 ms', async ({ page }) => {
  fakeApi(page, { students: 60, parts: 20 })
  await page.goto('/marks')
  await cell(page, 'Pupil 01', 'Part A').click()
  await page.evaluate(() => {
    const w = window as unknown as { slowest: number }
    w.slowest = 0
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name.startsWith('key')) w.slowest = Math.max(w.slowest, e.duration)
    }).observe({ type: 'event', durationThreshold: 16, buffered: false } as PerformanceObserverInit)
  })
  for (let i = 0; i < 40; i++) {
    await page.keyboard.type(String(i % 20), { delay: 30 })
    await page.keyboard.press(i % 2 ? 'Enter' : 'Tab', { delay: 30 })
  }
  await expect(page.getByText('All saved')).toBeVisible()
  const slowest = await page.evaluate(() => (window as unknown as { slowest: number }).slowest)
  expect(slowest).toBeLessThan(100)
})

/**
 * Blueprint totals while typing, and sharing sets out. Run: npx tsx papers-verify.mts
 */
import type { components } from './src/api/schema.gen.ts'
import { bitsAlike, hundredths, marks, moveItem, moveSection, needs, remaining, share, toInput, totals } from './src/lib/papers.ts'
import { levelLabel, levelsOf, questionLevel } from './src/lib/taxonomy.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

ok(hundredths('0.1') + hundredths('0.2') === hundredths('0.3'), 'decimals add exactly')
ok(hundredths('4.5') === 450 && hundredths('12') === 1200 && hundredths('x') === 0 && hundredths('1.234') === 0, 'marks read as hundredths')
ok(marks(450) === '4.5' && marks(1200) === '12' && marks(1205) === '12.05' && marks(-50) === '-0.5', 'hundredths written back', marks(1205))
const rows: components['schemas']['BlueprintRow'][] = [
  { chapter: ' Fractions ', qtype: 'Short answer', cells: { apply: { questions: 2, marks: '2' }, understand: { questions: 1, marks: '4' }, create: { questions: 0, marks: '' } } },
  { chapter: 'Decimals', qtype: 'Multiple choice', cells: { remember: { questions: 10, marks: '0.5' } } },
]
const levels = levelsOf('bloom').map((l) => l.key)
const t = totals(rows, levels)
ok(t.rows[0].marks === 800, '2 questions of 2 marks and 1 of 4 make 8 marks', marks(t.rows[0].marks))
ok(t.questions === 13 && t.marks === 1300 && t.byLevel.remember.marks === 500, 'row, level and grand totals are questions times marks each')
ok(remaining('12', t.marks).text === '1 marks over the maximum' && remaining('20', t.marks).tone === 'short' && remaining('13', t.marks).tone === 'ok', 'what is left, in words')
const sent = toInput(rows)
ok(!('create' in sent[0].cells) && sent[0].chapter === 'Fractions', 'blank cells are not sent, words trimmed')

const q = (bloom: string, qtype: string, m: string, status = 'approved', lessonId = 'L1', solo?: string) =>
  ({ id: bloom + m, levelId: '', subjectId: '', lessonId, bloom, solo, qtype, marks: m, difficulty: 'medium', text: '', options: [], answer: '', source: 'typed', status, used: 0 }) as never
const n = needs([{ lessonId: 'L1', chapter: 'Fractions', qtype: 'Short answer', cells: { apply: { questions: 3, marks: '2' } } }],
  [q('apply', 'short answer', '2'), q('apply', 'Short answer', '2'), q('apply', 'Short answer', '2', 'draft'), q('apply', 'Short answer', '2', 'approved', 'L2')], 'bloom')
ok(n.length === 1 && n[0].count === 3 && n[0].have === 2 && n[0].marks === '2', 'needs count only approved questions that fit', JSON.stringify(n.map((x) => [x.marks, x.count, x.have])))
const solo = needs([{ chapter: 'Fractions', qtype: 'Short answer', cells: { relational: { questions: 1, marks: '2' } } }],
  [q('apply', 'Short answer', '2', 'approved', 'L1', 'relational'), q('apply', 'Short answer', '2', 'approved', 'L1', 'unistructural')], 'solo')
ok(solo[0].have === 1, 'a SOLO blueprint matches questions by their SOLO level')
ok(levelLabel('solo', 'extended') === 'Extended abstract' && levelsOf('custom', { setNames: [], custom: { name: 'DOK', levels: ['Recall', 'Skill'] } }).length === 2, 'SOLO and custom levels are named')
ok(questionLevel(q('apply', 'x', '1', 'approved', 'L1', 'relational'), 'none') === '', 'no taxonomy, no level')

const kids = [
  { id: 'a', name: 'Zara', admissionNo: 'IK-10', rollNo: '10' },
  { id: 'b', name: 'Aarav', admissionNo: 'IK-2', rollNo: '2' },
  { id: 'c', name: 'Meera', admissionNo: 'IK-1', rollNo: '1' },
  { id: 'd', name: 'Dev', admissionNo: 'IK-3' },
]
const alt = share(kids, ['A', 'B'], 'roll', 'alternate')
ok(alt.c === 'A' && alt.b === 'B' && alt.a === 'A' && alt.d === 'B', 'alternately by roll number, numbers as numbers, no roll number last', JSON.stringify(alt))
const blocks = share(kids, ['A', 'B'], 'name', 'blocks')
ok(blocks.b === 'A' && blocks.d === 'A' && blocks.c === 'B' && blocks.a === 'B', 'in equal blocks by name', JSON.stringify(blocks))
const three = Object.values(share(kids, ['A', 'B', 'C'], 'admission', 'alternate'))
ok(three.filter((s) => s === 'A').length === 2 && three.includes('C'), 'three sets alternately by admission number')

const ord = { sections: [{ id: 'A', itemIds: ['1', '2', '3'] }, { id: 'B', itemIds: ['4'] }] }
const flat = (o: typeof ord) => o.sections.map((x) => x.id + ':' + x.itemIds.join('')).join(' ')
ok(flat(moveSection(ord, {}, 'B', 'A')) === 'B:4 A:123', 'a section moves up', flat(moveSection(ord, {}, 'B', 'A')))
const tree = { sections: [{ id: 'A', itemIds: ['1'] }, { id: 'A1', itemIds: ['2'] }, { id: 'A2', itemIds: [] }, { id: 'B', itemIds: ['3'] }, { id: 'B1', itemIds: [] }] }
const up = { A1: 'A', A2: 'A', B1: 'B' }
ok(flat(moveSection(tree, up, 'B', 'A')) === 'B:3 B1: A:1 A1:2 A2:', 'a section moves with its sub-sections', flat(moveSection(tree, up, 'B', 'A')))
ok(flat(moveSection(tree, up, 'A', 'B1')) === 'B:3 B1: A:1 A1:2 A2:', 'dropped on a sub-section, it takes the place of the section above it')
ok(flat(moveSection(tree, up, 'A2', 'A1')) === 'A:1 A2: A1:2 B:3 B1:', 'a sub-section moves among its own')
ok(flat(moveSection(tree, up, 'A1', 'B1')) === flat(tree) && flat(moveSection(tree, up, 'A', 'A1')) === flat(tree), 'a sub-section stays in its section')
ok(flat(moveItem(ord, '1', 'A', 3)) === 'A:231 B:4', 'a question moves down within its section', flat(moveItem(ord, '1', 'A', 3)))
ok(flat(moveItem(ord, '1', 'A', 2)) === 'A:213 B:4', 'one place down', flat(moveItem(ord, '1', 'A', 2)))
ok(flat(moveItem(ord, '3', 'A', 0)) === 'A:312 B:4', 'and up')
ok(flat(moveItem(ord, '2', 'B', 0)) === 'A:13 B:24', 'a question moves to another section')
ok(flat(moveItem(ord, '9', 'B', 0)) === flat(ord) && flat(moveSection(ord, {}, 'A', 'Z')) === flat(ord), 'an impossible move changes nothing')

ok(bitsAlike([{ marks: '2' }, { marks: '2.0' }]) && !bitsAlike([{ marks: '2' }, { marks: '3' }]) && !bitsAlike([{ marks: '2' }]), 'bits all worth the same need no marks of their own')

console.log(fail ? `\n${fail} failed` : '\npaper helpers hold')
process.exit(fail ? 1 : 0)

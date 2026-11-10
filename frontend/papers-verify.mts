/**
 * Blueprint totals while typing. Run: npx tsx papers-verify.mts
 */
import type { components } from './src/api/schema.gen.ts'
import { hundredths, marks, needs, remaining, toInput, totals } from './src/lib/papers.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

ok(hundredths('0.1') + hundredths('0.2') === hundredths('0.3'), 'decimals add exactly')
ok(hundredths('4.5') === 450 && hundredths('12') === 1200 && hundredths('x') === 0 && hundredths('1.234') === 0, 'marks read as hundredths')
ok(marks(450) === '4.5' && marks(1200) === '12' && marks(1205) === '12.05' && marks(-50) === '-0.5', 'hundredths written back', marks(1205))
const rows: components['schemas']['BlueprintRow'][] = [
  { chapter: ' Fractions ', qtype: 'Short answer', cells: { apply: { questions: 2, marks: '6' }, understand: { questions: 1, marks: '4' }, create: { questions: 0, marks: '' } } },
  { chapter: 'Decimals', qtype: 'Multiple choice', cells: { remember: { questions: 10, marks: '10.5' } } },
]
const levels = ['remember', 'understand', 'apply', 'analyse', 'evaluate', 'create']
const t = totals(rows, levels)
ok(t.questions === 13 && t.marks === 2050 && t.rows[0].marks === 1000 && t.byLevel.remember.questions === 10, 'row, level and grand totals')
ok(remaining('20', t.marks).text === '0.5 marks over the maximum' && remaining('25', t.marks).tone === 'short' && remaining('20.5', t.marks).tone === 'ok', 'what is left, in words')
const sent = toInput(rows)
ok(!('create' in sent[0].cells) && sent[0].chapter === 'Fractions', 'blank cells are not sent, words trimmed')

const q = (bloom: string, qtype: string, m: string, status = 'approved', lessonId = 'L1') =>
  ({ id: bloom + m, levelId: '', subjectId: '', lessonId, bloom, qtype, marks: m, difficulty: 'medium', text: '', options: [], answer: '', source: 'typed', status, used: 0 }) as never
const n = needs([{ lessonId: 'L1', chapter: 'Fractions', qtype: 'Short answer', cells: { apply: { questions: 3, marks: '10' } } }],
  [q('apply', 'short answer', '3.33'), q('apply', 'Short answer', '3.34'), q('apply', 'Short answer', '3.33', 'draft'), q('apply', 'Short answer', '3.33', 'approved', 'L2')])
ok(n.length === 2 && n[0].marks === '3.33' && n[0].count === 2 && n[0].have === 1 && n[1].marks === '3.34' && n[1].have === 1,
  'needs share a cell as the paper does, and count only approved questions that fit', JSON.stringify(n.map((x) => [x.marks, x.count, x.have])))

console.log(fail ? `\n${fail} failed` : '\nblueprint helpers hold')
process.exit(fail ? 1 : 0)

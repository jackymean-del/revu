/**
 * Section names as people type them. Run: npx tsx classes-verify.mts
 */
import { parseNames, sectionNamesToAdd } from './src/lib/classes.ts'
import { bloomCounts, importSummary } from './src/lib/syllabus.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}
const j = (x: string[]) => x.join('|')

ok(j(parseNames('A, B, C')) === 'A|B|C', 'commas')
ok(j(parseNames('A B C')) === 'A|B|C', 'short names separated by spaces')
ok(j(parseNames('A;B\nC')) === 'A|B|C', 'semicolons and lines')
ok(j(parseNames('Rose Garden, Lotus')) === 'Rose Garden|Lotus', 'a long name with a space stays whole')
ok(j(parseNames(' a, A , b,, ')) === 'a|b', 'trimmed, no repeats, nothing empty')
ok(j(sectionNamesToAdd('A, B, C', ['b'])) === 'A|C', 'only what the class does not have')
ok(j(sectionNamesToAdd('', ['A'])) === '', 'nothing typed, nothing added')

const syl = { kind: 'academic' as const, competencies: [], unplaced: [{ id: '1', text: 'x', bloom: 'apply' as const, bloomBy: 'suggested' as const }],
  lessons: [{ id: 'l', seq: 1, name: 'L', outcomes: [{ id: '2', text: 'y', bloom: 'remember' as const, bloomBy: 'teacher' as const }, { id: '3', text: 'z', bloom: 'apply' as const, bloomBy: 'suggested' as const }] }] }
const c = bloomCounts(syl)
ok(c.apply === 2 && c.remember === 1 && c.create === 0, 'Bloom counts include outcomes in no lesson')
const report = { shape: 'outcomes' as const, rows: 5, created: { subjects: 0, competencies: 1, lessons: 1, outcomes: 4 }, matched: { subjects: 0, competencies: 0, lessons: 0, outcomes: 1 },
  repeated: 1, noCompetency: 1, unknownSubjects: [], unknownLevels: [], problems: [], applied: false }
ok(importSummary(report) === '5 rows of learning outcomes. Would add 4 learning outcomes, 1 lessons, 1 competencies. 1 already here.', 'preview in one sentence', importSummary(report))

console.log(fail ? `\n${fail} failed` : '\nclass and syllabus helpers hold')
process.exit(fail ? 1 : 0)

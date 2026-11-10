/**
 * Words and small helpers for the syllabus screen. The server suggests every
 * Bloom level (internal/syllabus); this only names them and counts them.
 */
import type { components } from '../api/schema.gen'

export type Bloom = components['schemas']['Bloom']
type Syllabus = components['schemas']['Syllabus']

/** The six Bloom levels, lowest first, as a teacher reads them. */
export const BLOOMS: { key: Bloom; label: string; hint: string }[] = [
  { key: 'remember', label: 'Remember', hint: 'recall facts: identify, list, define' },
  { key: 'understand', label: 'Understand', hint: 'explain ideas: describe, discuss, summarise' },
  { key: 'apply', label: 'Apply', hint: 'use it: solve, calculate, demonstrate' },
  { key: 'analyse', label: 'Analyse', hint: 'take apart: compare, differentiate, classify' },
  { key: 'evaluate', label: 'Evaluate', hint: 'judge: justify, assess, argue' },
  { key: 'create', label: 'Create', hint: 'make something new: design, compose, plan' },
]

/** How many outcomes of a syllabus sit at each Bloom level. */
export function bloomCounts(s: Syllabus): Record<Bloom, number> {
  const out = Object.fromEntries(BLOOMS.map((b) => [b.key, 0])) as Record<Bloom, number>
  for (const o of [...s.lessons.flatMap((l) => l.outcomes), ...s.unplaced]) out[o.bloom]++
  return out
}

/** A report in one sentence, for the import preview. */
export function importSummary(r: components['schemas']['SyllabusImportReport']): string {
  const kind = { competencies: 'competencies', outcomes: 'learning outcomes', workbook: 'an outcomes workbook' }[r.shape]
  const made = r.created
  const parts = [
    made.outcomes && `${made.outcomes} learning outcomes`,
    made.lessons && `${made.lessons} lessons`,
    made.competencies && `${made.competencies} competencies`,
    made.subjects && `${made.subjects} subjects`,
  ].filter(Boolean)
  const verb = r.applied ? 'Added' : 'Would add'
  return `${r.rows} rows of ${kind}. ${parts.length ? `${verb} ${parts.join(', ')}.` : 'Nothing new.'}${r.repeated ? ` ${r.repeated} already here.` : ''}`
}

/**
 * Helpers for the analysis screens that are not about drawing them. The
 * server works out every number (internal/scheme); these only sort, group
 * and say in words what it sent. Percentages arrive as decimal strings and
 * are compared in hundredths, so 39.995 never becomes 40 here.
 */
import type { components } from '../api/schema.gen'

type S = components['schemas']
export type Summary = S['AnalysisSummary']
export type Settings = S['AnalysisSettings']
export type Rule = S['AnalysisRule']
export type Cell = S['AnalysisCell']
export type StudentRow = S['AnalysisStudent']
export type AssessmentView = S['AssessmentAnalysis']
export type ReteachItem = S['ReteachItem']
export type ReteachStatus = NonNullable<ReteachItem['status']>

/** A decimal percentage in ten-thousandths of a percent, or null when it is not a number. */
export function hundredths(pct: string | undefined): number | null {
  if (!pct || !/^\d{1,3}(\.\d{1,4})?$/.test(pct)) return null
  const [whole, frac = ''] = pct.split('.')
  return Number(whole) * 10000 + Number(frac.padEnd(4, '0'))
}

/** True when pct is a number below limit. */
export function below(pct: string | undefined, limit: string): boolean {
  const p = hundredths(pct)
  const l = hundredths(limit)
  return p !== null && l !== null && p < l
}

export interface Range {
  label: string
  lo: string
  hi: string
}

/** The ranges the boundaries make: below the first, between each pair, and the last to 100 (included). */
export function ranges(bounds: string[]): Range[] {
  const edges = ['0', ...bounds, '100']
  const out: Range[] = []
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i]
    const hi = edges[i + 1]
    out.push({ label: i === 0 ? `Below ${hi}%` : i === edges.length - 2 ? `${lo}% and above` : `${lo}% to below ${hi}%`, lo, hi })
  }
  return out
}

/** Which range pct falls in, or -1 for no number. The top range includes 100. */
export function rangeIndex(pct: string | undefined, rs: Range[]): number {
  const p = hundredths(pct)
  if (p === null) return -1
  for (let i = 0; i < rs.length; i++) {
    const lo = hundredths(rs[i].lo)!
    const hi = hundredths(rs[i].hi)!
    if (p >= lo && (p < hi || (i === rs.length - 1 && p <= hi))) return i
  }
  return -1
}

/** A rule in plain words, as the lists show it. */
export function describeRule(r: Rule, noun: { one: string; many: string }): string {
  const show = `Shows ${noun.many} below ${r.showBelowPct}%.`
  if (r.on === 'overall') return `Overall result below ${r.belowPct}%. ${show}`
  return `${r.atLeast === 1 ? `Any one ${noun.one}` : `At least ${r.atLeast} ${noun.many}`} below ${r.belowPct}%. ${show}`
}

export const ACTION: Record<Rule['action'], string> = {
  undertaking: 'Undertaking',
  warning: 'Warning',
  retest: 'Retest',
  support: 'Support',
}

export const RETEACH_STATUS: Record<ReteachStatus, string> = {
  planned: 'Planned',
  done: 'Done',
  not_needed: 'Not needed',
}

export const TREND: Record<NonNullable<S['ReteachFollowUp']['trend']>, string> = {
  improved: 'Fewer below mastery',
  unchanged: 'No change',
  worse: 'More below mastery',
}

/** What the aggregate can be sorted by: a column, or a subject by its id. */
export type SortKey = 'roll' | 'name' | 'admission' | 'section' | 'total' | `subject:${string}`
export interface Sort {
  key: SortKey
  dir: 'asc' | 'desc'
}

const text = (a: string | undefined, b: string | undefined) => (a ?? '').localeCompare(b ?? '', undefined, { numeric: true, sensitivity: 'base' })

/**
 * Rows sorted by one column, the whole row moving together. Numbers sort
 * by their exact value; a row with no number (withheld, absent, not
 * assessed) goes last whichever way, so the top of the list is always the
 * real highest or lowest. Ties fall back to section, then roll number.
 */
export function sortRows(rows: StudentRow[], sort: Sort): StudentRow[] {
  const flip = sort.dir === 'asc' ? 1 : -1
  const place = (a: StudentRow, b: StudentRow) => text(a.section, b.section) || text(a.rollNo, b.rollNo) || text(a.name, b.name)
  const number = (r: StudentRow) =>
    sort.key === 'total' ? hundredths(r.total?.pct) : sort.key.startsWith('subject:') ? hundredths(r.subjects[sort.key.slice(8)]?.pct) : null
  return [...rows].sort((a, b) => {
    switch (sort.key) {
      case 'roll':
        return flip * place(a, b)
      case 'name':
        return flip * text(a.name, b.name) || place(a, b)
      case 'admission':
        return flip * text(a.admissionNo, b.admissionNo) || place(a, b)
      case 'section':
        return flip * (text(a.section, b.section) || text(a.rollNo, b.rollNo)) || text(a.name, b.name)
      default: {
        const x = number(a)
        const y = number(b)
        if (x === null && y === null) return place(a, b)
        if (x === null) return 1
        if (y === null) return -1
        return flip * (x - y) || place(a, b)
      }
    }
  })
}

/** Clicking a column: a new column starts highest first for numbers and A to Z for words; the same column flips. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: key === 'total' || key.startsWith('subject:') ? 'desc' : 'asc' }
}

/** A cell as the tables show it: the percentage, or the state in words. */
export function cellText(cell: Cell | undefined): string {
  if (!cell) return ''
  if (cell.pct) return cell.state === 'provisional' ? `${cell.pct} (P)` : cell.pct
  return { complete: '-', provisional: 'Provisional', blocked: 'Withheld', not_assessed: 'Not assessed' }[cell.state]
}

/** Checks a settings form before saving; returns the first problem, or ''. */
export function checkSettings(s: Settings): string {
  const pct = (x: string) => /^\d{1,3}(\.\d{1,2})?$/.test(x) && hundredths(x)! <= 1000000
  if (!pct(s.masteryPct) || !pct(s.reteachSharePct)) return 'Give percentages from 0 to 100.'
  if (!Number.isInteger(s.minEvidence) || s.minEvidence < 1 || s.minEvidence > 100) return 'Give a number of marks from 1 to 100.'
  if (s.ranges.length === 0) return 'Give at least one range boundary.'
  for (let i = 0; i < s.ranges.length; i++) {
    const r = s.ranges[i]
    if (!pct(r) || r === '0' || r === '100' || (i > 0 && hundredths(r)! <= hundredths(s.ranges[i - 1])!)) return 'Range boundaries are percentages between 0 and 100, rising.'
  }
  for (const r of s.lists) {
    if (!r.name.trim()) return 'Each list needs a name.'
    if (!pct(r.belowPct) || !pct(r.showBelowPct)) return 'Each list needs percentages from 0 to 100.'
    if (r.on === 'subjects' && (r.atLeast < 1 || r.atLeast > 30)) return 'Each list needs a count from 1 to 30.'
  }
  return ''
}

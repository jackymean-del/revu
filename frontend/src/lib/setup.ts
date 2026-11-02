/**
 * The arithmetic behind the setup steps: a sensible first year, terms that
 * cover it without gaps or overlaps, a run of levels, and section names.
 * Every suggestion is shown and can be changed before anything is saved.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))

export type YearDraft = { label: string; startsOn: string; endsOn: string }

/**
 * The academic year that is under way on `today`, starting on the first of
 * `startMonth` (1 to 12; April by default, as in Indian schools).
 */
export function defaultYear(today: Date, startMonth = 4): YearDraft {
  const m = startMonth - 1
  const y = today.getUTCMonth() >= m ? today.getUTCFullYear() : today.getUTCFullYear() - 1
  const start = utc(y, m, 1)
  const end = utc(y + 1, m, 0) // the day before the next start
  const label = start.getUTCFullYear() === end.getUTCFullYear() ? String(y) : `${y}-${String(end.getUTCFullYear()).slice(2)}`
  return { label, startsOn: iso(start), endsOn: iso(end) }
}

export type TermDraft = { name: string; startsOn: string; endsOn: string }

/**
 * Splits a year into `n` terms of whole months, each ending the day before
 * the next begins and the last ending with the year.
 */
export function splitTerms(startsOn: string, endsOn: string, n: number, word: string): TermDraft[] {
  const start = new Date(startsOn + 'T00:00:00Z')
  const end = new Date(endsOn + 'T00:00:00Z')
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1
  const out: TermDraft[] = []
  let cursor = start
  for (let i = 0; i < n; i++) {
    const take = Math.round((months * (i + 1)) / n) - Math.round((months * i) / n)
    const next = utc(cursor.getUTCFullYear(), cursor.getUTCMonth() + take, cursor.getUTCDate())
    const last = i === n - 1 ? end : new Date(next.getTime() - 86_400_000)
    out.push({ name: `${word} ${i + 1}`, startsOn: iso(cursor), endsOn: iso(last) })
    cursor = next
  }
  return out
}

/** "Grade 1" to "Grade 12", with their order. */
export function levelRun(prefix: string, from: number, to: number): { name: string; seq: number }[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to || to - from > 30) return []
  return Array.from({ length: to - from + 1 }, (_, i) => ({ name: `${prefix.trim()} ${from + i}`.trim(), seq: from + i }))
}

/** "a, B ,c,,b" becomes ["A", "B", "C"]: trimmed, upper-cased when one letter, without repeats. */
export function sectionNames(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(/[,;\n]/)) {
    const s = raw.trim()
    const name = s.length === 1 ? s.toUpperCase() : s
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase())
      out.push(name)
    }
  }
  return out
}

/** Subjects most institutions of each kind start with; any can be left out or added to. */
export const suggestedSubjects: Record<string, string[]> = {
  school: ['English', 'Hindi', 'Mathematics', 'Science', 'Social Science', 'Computer Science', 'Art', 'Physical Education'],
  college: ['English', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Accountancy', 'Computer Science'],
  university: ['Communication Skills', 'Mathematics', 'Physics', 'Chemistry', 'Economics', 'Computer Science', 'Management', 'Environmental Studies'],
}

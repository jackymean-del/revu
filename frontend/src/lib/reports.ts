/**
 * Helpers for the report design screen that are not about drawing it. The
 * server renders every report; these only arrange the template.
 */
import type { components } from '../api/schema.gen'

type SectionKey = components['schemas']['ReportSection']['key']

/** How each report section reads in the designer. */
export const SECTION_LABEL: Record<SectionKey, string> = {
  identity: 'Name and details (always shown)',
  marks: 'Results table',
  components: 'Parts of each result',
  overall: 'Overall result',
  legend: 'Band legend',
  signoff: 'Sign-off lines',
}

/** Moves one item a place up (-1) or down (+1); unchanged at an end. */
export function moveItem<T>(list: T[], i: number, by: -1 | 1): T[] {
  const j = i + by
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** Subjects in the template's order; those it does not list follow by name, as the server orders them. */
export function orderSubjects<T extends { id: string; name: string }>(subjects: T[], order: string[]): T[] {
  const rank = (id: string) => {
    const i = order.indexOf(id)
    return i < 0 ? order.length : i
  }
  return [...subjects].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name))
}

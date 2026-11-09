/**
 * Words and helpers for schemes and results that are not about drawing
 * them. The server computes every number (internal/scheme); this file only
 * says in plain words what the engine recorded, and helps the editor build
 * a definition. Nothing here does arithmetic on marks.
 */
import type { components } from '../api/schema.gen'

type S = components['schemas']
export type Definition = S['SchemeDefinition']
export type Component = S['SchemeComponent']
export type ResultState = S['ResultCell']['state']
export type ComponentState = S['ResultComponent']['state']
export type EventUse = S['ResultEvent']['use']
export type PartUse = S['ResultPart']['use']
export type Policy = Component['on_absent']
export type Aggregate = Component['aggregate']['fn']

/** How a result's state reads, with the tone of its badge. */
export const STATE: Record<ResultState, { label: string; tone: 'ok' | 'warn' | 'stop' | 'quiet'; help: string }> = {
  complete: { label: 'Final', tone: 'ok', help: 'Every part is in.' },
  provisional: { label: 'Provisional', tone: 'warn', help: 'Some marks are still to come. Kept off published reports unless an administrator releases it.' },
  blocked: { label: 'Withheld', tone: 'stop', help: 'No number until the reason below is resolved.' },
  not_assessed: { label: 'Not assessed', tone: 'quiet', help: 'Nothing to count yet.' },
}

export const COMPONENT_STATE: Record<ComponentState, string> = {
  complete: 'Complete',
  provisional: 'Still to come',
  blocked: 'Withheld',
  left_out: 'Left out',
  not_assessed: 'Not held yet',
}

export const POLICY: Record<Policy, string> = {
  wait_makeup: 'Withhold until a makeup mark',
  zero: 'Count it as zero, marked as policy',
  exclude: 'Leave it out and scale the rest',
  carry_forward: 'Carry the last mark forward',
}

export const AGGREGATE: Record<Aggregate, string> = {
  sum: 'Add the marks',
  avg: 'Average the percentages',
  best_n: 'Average the best',
  max: 'Keep the highest',
  min: 'Keep the lowest',
}

export const PART_USE: Record<PartUse, string> = {
  counted: 'counted',
  zero: 'absent, counted as 0',
  left_out: 'left out',
  pending: 'still to enter',
  absent: 'absent',
}

/** "best_n:2" reads as "Average the best 2". */
export function aggregateText(stored: string): string {
  const [fn, n] = stored.split(':')
  if (fn === 'best_n') return `Average the best ${n}`
  return AGGREGATE[fn as Aggregate] ?? stored
}

/** Why an assessment counted the way it did. */
export function eventText(use: EventUse, reason = '', carriedFromTitle = ''): string {
  switch (use) {
    case 'used':
      if (reason === 'absent_zero') return 'Counted, an absent part as 0 by the scheme'
      if (reason === 'absent_excluded') return 'Counted, an absent part left out'
      return 'Counted'
    case 'dropped':
      return { not_in_best: 'Not among the best', not_highest: 'Not the highest', not_lowest: 'Not the lowest' }[reason] ?? 'Not counted'
    case 'carried':
      return carriedFromTitle ? `Absent, the mark of ${carriedFromTitle} carried forward` : 'Absent, the last mark carried forward'
    case 'left_out':
      return (
        { exempt: 'Exempt, left out', not_applicable: 'Not applicable, left out', left: 'Left before it, left out', absent_excluded: 'Absent, left out' }[reason] ?? 'Left out'
      )
    case 'pending':
      return 'Still to enter'
    case 'blocked':
      return reason === 'nothing_to_carry' ? 'Absent, with no earlier mark to carry forward' : 'Absent, waiting for a makeup mark'
  }
}

/**
 * Why a result has no final number, in words. names maps component codes
 * to their names.
 */
export function reasonText(reason: string | undefined, names: Record<string, string>): string {
  if (!reason) return ''
  const [kind, codes = ''] = reason.split(':')
  const list = codes
    .split(',')
    .filter(Boolean)
    .map((c) => names[c] ?? c)
    .join(', ')
  switch (kind) {
    case 'component_blocked':
      return `Withheld: ${list} has an absence waiting for a makeup mark.`
    case 'pending':
      return `Still to come: ${list}.`
    case 'choice_missing':
      return 'No choice is recorded in this group of options, so no result is guessed.'
    case 'no_evidence':
      return 'No assessment has been held yet.'
    case 'all_left_out':
      return 'Every part was left out, so there is nothing to count.'
    case 'left_out':
      return 'Left out of this result.'
    case 'scheme_invalid':
    case 'scheme_divides_by_zero':
      return 'The scheme cannot work this out. An administrator needs to correct it.'
    default:
      return reason
  }
}

export const BASIS: Record<NonNullable<S['ResultDetail']['basis']>, string> = {
  full: 'Every part counted.',
  renormalised: 'A part was left out, so the rest were scaled up to the full maximum.',
  so_far: 'Out of the parts held so far.',
}

/** A blank scheme to start from: one component, every assessment's total. */
export function blankScheme(): Definition {
  return {
    schema: 1,
    rounding: { mode: 'half_up', places: 2, at: 'components' },
    components: [newComponent('T', 'Total')],
    subject: { expr: 'T', max: '100' },
  }
}

export function newComponent(code: string, name: string): Component {
  return {
    code,
    name,
    from: { kinds: ['periodic_test', 'midterm', 'term_end'], part_kind: 'main' },
    aggregate: { fn: 'sum' },
    scale_to: '100',
    on_absent: 'wait_makeup',
  }
}

/** The next free code: C1, C2, ... */
export function nextCode(def: Definition): string {
  const taken = new Set(def.components.map((c) => c.code))
  for (let i = 1; ; i++) if (!taken.has(`C${i}`)) return `C${i}`
}

/**
 * Field errors from the server, keyed by the definition path they name
 * ("components[1].scale_to"), so the editor shows each beside its field.
 */
export function errorsByPath(fields: { field: string; message: string }[] | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const f of fields ?? []) {
    const path = f.field === 'definition' ? '' : f.field.replace(/^definition\./, '')
    ;(out[path] ??= []).push(f.message)
  }
  return out
}

/** Errors at a path and anything under it. */
export function errorsUnder(errors: Record<string, string[]>, path: string): string[] {
  return Object.entries(errors)
    .filter(([p]) => p === path || p.startsWith(path + '.') || p.startsWith(path + '['))
    .flatMap(([, m]) => m)
}

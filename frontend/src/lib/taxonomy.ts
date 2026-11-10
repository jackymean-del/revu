/**
 * The taxonomies a blueprint can be planned in: Bloom, SOLO, the
 * institution's own levels (set by an administrator in Configuration), or
 * none. The server checks every level; this names them for people.
 */
import type { components } from '../api/schema.gen'
import { BLOOMS } from './syllabus'

export type Taxonomy = 'bloom' | 'solo' | 'custom' | 'none'
type Settings = components['schemas']['PaperSettings']
type Question = components['schemas']['Question']

export interface Level {
  key: string
  label: string
  hint?: string
}

/** The five SOLO levels, lowest first (Biggs and Collis). */
export const SOLO: Level[] = [
  { key: 'prestructural', label: 'Prestructural', hint: 'misses the point' },
  { key: 'unistructural', label: 'Unistructural', hint: 'one relevant idea: identify, name, follow a procedure' },
  { key: 'multistructural', label: 'Multistructural', hint: 'several ideas, separately: describe, list, combine' },
  { key: 'relational', label: 'Relational', hint: 'ideas linked: explain, compare, relate, apply' },
  { key: 'extended', label: 'Extended abstract', hint: 'taken further: generalise, hypothesise, create' },
]

/** The levels of a taxonomy, lowest first; one unnamed level with none. */
export function levelsOf(t: Taxonomy, s?: Settings): Level[] {
  switch (t) {
    case 'bloom':
      return BLOOMS.map((b) => ({ key: b.key, label: b.label, hint: b.hint }))
    case 'solo':
      return SOLO
    case 'custom':
      return (s?.custom.levels ?? []).map((l) => ({ key: l, label: l }))
    default:
      return [{ key: '', label: 'Questions' }]
  }
}

/** A taxonomy's name as people read it. */
export function taxonomyName(t: Taxonomy, s?: Settings): string {
  return { bloom: "Bloom's taxonomy", solo: 'SOLO taxonomy', custom: s?.custom.name || 'Your own levels', none: 'No taxonomy' }[t]
}

/** A level's label, or the key itself when it is not one of the list. */
export const levelLabel = (t: Taxonomy, key: string | undefined, s?: Settings) => (key ? (levelsOf(t, s).find((l) => l.key === key)?.label ?? key) : '')

/** The level a question carries in a taxonomy. */
export function questionLevel(q: Question, t: Taxonomy): string {
  return t === 'bloom' ? q.bloom : t === 'solo' ? (q.solo ?? '') : t === 'custom' ? (q.customLevel ?? '') : ''
}

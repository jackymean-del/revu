/**
 * Terminology: every institution word revU shows comes from t(key). The key
 * list and the school, college and university presets live in
 * presets.json, which the server embeds too (npm run gen:terms), so the app,
 * PDFs and emails always agree.
 *
 * Lookup order: an override for the branch, then for the organisation, then
 * the organisation's preset, then the school preset. A key that does not
 * exist is a type error, so a typo fails the build instead of showing a blank.
 */
import data from './presets.json'

export type Forms = { one: string; other: string }
export type TermKey = keyof typeof data.keys
export type Preset = 'school' | 'college' | 'university'

export const PRESETS: readonly Preset[] = ['school', 'college', 'university']
export const TERM_KEYS = Object.keys(data.keys) as TermKey[]
export const describe = (key: TermKey): string => data.keys[key]

// Every preset must name every key; a missing one fails type checking here.
export const presets: Record<Preset, Record<TermKey, Forms>> = data.presets

/** An institution's own word for a key. branchId null covers the organisation. */
export type Override = { key: string; branchId?: string | null; one: string; other: string }

export type Terminology = { preset: string; overrides: Override[] }

export type TOptions = {
  /** Picks the plural form when not 1. */
  count?: number
  /** For use inside a sentence: "Add a section". Acronyms keep their case. */
  lower?: boolean
}

const isPreset = (p: string): p is Preset => (PRESETS as readonly string[]).includes(p)

const lowerWords = (s: string) => s.replace(/\p{L}+/gu, (w) => (w.length > 1 && w[1] === w[1].toUpperCase() ? w : w.toLowerCase()))

/** Resolves the forms of a key, applying the lookup order above. */
export function resolve(src: Terminology, key: TermKey, branchId: string | null = null): Forms {
  if (branchId) {
    const b = src.overrides.find((o) => o.key === key && o.branchId === branchId)
    if (b) return b
  }
  const org = src.overrides.find((o) => o.key === key && !o.branchId)
  if (org) return org
  return presets[isPreset(src.preset) ? src.preset : 'school'][key]
}

export type T = (key: TermKey, opts?: TOptions) => string

/** Builds t() for one organisation, and optionally one branch. */
export function makeT(src: Terminology, branchId: string | null = null): T {
  return (key, opts = {}) => {
    const forms = resolve(src, key, branchId)
    const word = (opts.count ?? 1) === 1 ? forms.one : forms.other
    return opts.lower ? lowerWords(word) : word
  }
}

/** "a section", "an academic year": the article for a word inside a sentence. */
export const withArticle = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`)

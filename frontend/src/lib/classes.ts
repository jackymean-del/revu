/**
 * Reading section names as people type them: "A, B, C", "A;B", one per
 * line, or "A B C". Spaces separate names only when every piece is short
 * (up to two characters), so a name such as "Rose Garden" stays whole.
 * Trimmed, without repeats, in the order typed.
 */
export function parseNames(text: string): string[] {
  const out: string[] = []
  for (const part of text.split(/[,;\n]+/)) {
    const pieces = part.trim().split(/\s+/).filter(Boolean)
    const names = pieces.length > 1 && pieces.every((p) => p.length <= 2) ? pieces : [part.trim()]
    for (const n of names) if (n && !out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n)
  }
  return out
}

/** The names in text that a class does not have yet, in the order typed. */
export function sectionNamesToAdd(text: string, have: string[]): string[] {
  const taken = new Set(have.map((h) => h.toLowerCase()))
  return parseNames(text).filter((n) => !taken.has(n.toLowerCase()))
}

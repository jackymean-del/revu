/**
 * How holistic levels look: a word, a tone and dots, the same as the
 * printed report (internal/holistic page.go). Levels themselves are worked
 * out by the server from tagged marks.
 */

/** The four tones, lowest to highest; a scale of another length spreads over them. */
export const TONES = [
  { bg: '#fdecea', fg: '#9f1d14' },
  { bg: '#fff4db', fg: '#8a5a00' },
  { bg: '#e3f2fd', fg: '#0b5394' },
  { bg: '#e6f4ea', fg: '#1e6b35' },
]

/** The tone of a level (1 the lowest) on a scale of n levels; grey for too little evidence. */
export function tone(level: number, n: number): { bg: string; fg: string } {
  if (level < 1) return { bg: '#f3f3f6', fg: '#5a5870' }
  if (n <= 1) return TONES[0]
  return TONES[Math.round(((level - 1) * (TONES.length - 1)) / (n - 1))]
}

/** Filled and empty dots for a level, as the print shows them. */
export const dots = (level: number, n: number) => (level < 1 ? '' : '●'.repeat(level) + '○'.repeat(Math.max(0, n - level)))

/** Opens a printable page in a new tab and prints it; the tab opens first so no popup blocker stops it. */
export async function printPage(load: () => Promise<string>) {
  const w = window.open('', '_blank')
  const html = await load()
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
}

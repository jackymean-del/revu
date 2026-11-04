/**
 * The marketing site's own rules, checked on the built pages (out/) the way
 * a visitor and a search engine see them. Run after `npm run build`:
 *   npx tsx content-verify.mts
 *
 * - No em dash anywhere (house style).
 * - No page title or heading leads with AI: copy says what staff can do.
 * - Titles fit a search result (at most 65 characters).
 * - Every link inside the site reaches a page or a section that exists, and
 *   every link to the app goes to the app's own address.
 * - The sitemap lists exactly the pages in app/.
 * - The "own words" table says what the app's presets say.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { PAGES } from './content/pages.ts'
import { WORDS } from './content/product.ts'
import { APP_URL } from './lib/site.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

const walk = (dir: string, keep: (f: string) => boolean): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (n === 'node_modules' || n === '.next') return []
    return statSync(p).isDirectory() ? walk(p, keep) : keep(p) ? [p] : []
  })

if (!existsSync('out/index.html')) {
  console.log('FAIL no build found - run `npm run build` first')
  process.exit(1)
}

// Pages as built: route -> html.
const html = new Map(
  walk('out', (f) => f.endsWith('.html')).map((f) => {
    const r = '/' + relative('out', f).split(sep).join('/').replace(/(^|\/)index\.html$/, '').replace(/\.html$/, '')
    return [r === '/' ? '/' : r.replace(/\/$/, ''), readFileSync(f, 'utf8')] as const
  }),
)
const text = (s: string) => s.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&')

// The checks, each also run on a planted case so a broken check cannot pass.
const DASH = String.fromCharCode(0x2014)
const emDash = (s: string) => s.includes(DASH)
const titleOf = (s: string) => /<title>([^<]*)<\/title>/.exec(s)?.[1] ?? ''
const headings = (s: string) => [...s.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/g)].map((m) => text(m[1]).trim())
const leadsWithAI = (s: string) => /^\W*(ai|a\.i\.)\b/i.test(s) || /\bAI[- ](powered|driven|first|generated)\b/i.test(s)
const links = (s: string) => [...s.matchAll(/href="([^"]+)"/g)].map((m) => m[1])

ok(emDash(`a ${DASH} b`) && leadsWithAI('AI-powered report cards') && !leadsWithAI('Staff approve every remark'), 'the checks catch planted cases')

const sources = walk('.', (f) => /\.(tsx?|mts|css|md)$/.test(f))
const dashed = sources.filter((f) => emDash(readFileSync(f, 'utf8')))
ok(dashed.length === 0, 'no em dash in the site sources', dashed.join(', '))
const builtDashed = [...html].filter(([, s]) => emDash(text(s))).map(([r]) => r)
ok(builtDashed.length === 0, 'no em dash on any built page', builtDashed.join(', '))

for (const [route, page] of html) {
  if (route === '/404' || route === '/_not-found') continue
  const title = titleOf(page)
  ok(title.length > 0 && title.length <= 65, `${route}: title fits a search result`, `${title.length}: ${title}`)
  const ai = [title, ...headings(page)].filter(leadsWithAI)
  ok(ai.length === 0, `${route}: no title or heading leads with AI`, ai.join(' | '))
}

// Links inside the site and to the app.
const ids = new Map([...html].map(([r, s]) => [r, new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]))
const broken: string[] = []
const strayApp: string[] = []
for (const [route, page] of html) {
  for (const href of links(page)) {
    if (href.startsWith('/_next/') || href.startsWith('mailto:') || /\.(svg|png|ico|xml|txt|woff2)(\?|$)/.test(href)) continue
    if (/^https?:\/\/(www\.)?revu\.bhusku\.com\/(sign-in|sign-up)/.test(href)) strayApp.push(`${route} -> ${href}`)
    if (href.startsWith('http')) continue
    const [path, hash] = href.split('#')
    const target = path === '' ? route : path.replace(/\/$/, '') || '/'
    if (!html.has(target)) broken.push(`${route} -> ${href}`)
    else if (hash && !ids.get(target)?.has(hash)) broken.push(`${route} -> ${href} (no such section)`)
  }
}
ok(broken.length === 0, 'every link inside the site reaches a page or section', broken.join(', '))
ok(strayApp.length === 0, `sign-in and sign-up links go to ${APP_URL}`, strayApp.join(', '))
ok([...html.values()].some((s) => s.includes(`${APP_URL}/sign-in`)), 'the site links to the app')

// The sitemap lists exactly the pages.
const routes = walk('app', (f) => f.endsWith(`${sep}page.tsx`)).map((f) => '/' + relative('app', f).split(sep).slice(0, -1).join('/'))
const norm = (r: string) => (r === '/' ? '/' : r.replace(/\/$/, ''))
ok(JSON.stringify(routes.map(norm).sort()) === JSON.stringify([...PAGES].sort()), 'the sitemap lists exactly the pages in app/', routes.join(', '))

// The own-words table matches the app, when the app is beside this folder.
const presetsFile = join('..', 'frontend', 'src', 'lib', 'terminology', 'presets.json')
if (existsSync(presetsFile)) {
  const presets = JSON.parse(readFileSync(presetsFile, 'utf8')).presets as Record<string, Record<string, { one: string }>>
  const wrong = WORDS.filter((w) => (['school', 'college', 'university'] as const).some((k) => presets[k]?.[w.concept]?.one !== w[k]))
  ok(wrong.length === 0, "the own-words table says what the app's presets say", wrong.map((w) => w.concept).join(', '))
} else {
  console.log('skip the presets are not beside this folder (Cloudflare builds it alone)')
}

if (fail) {
  console.log(`\n${fail} failed`)
  process.exit(1)
}
console.log('\nthe site holds')

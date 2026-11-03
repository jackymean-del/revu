/**
 * Performance budget: the JavaScript a route needs before it can draw stays
 * under 200 KB gzip. Run after `npx vite build`: npx tsx bundle-verify.mts
 *
 * "Initial" means the entry script in dist/index.html plus every chunk it
 * preloads. Each screen loaded with import() is a route: its budget is the
 * initial JavaScript plus its own chunk and every chunk that chunk imports
 * statically. Code a screen loads later with import() (the offline store,
 * charts) does not count until it is asked for.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGET = 200 * 1024
const DIST = 'dist'
let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.log('FAIL no build found - run `npx vite build` first')
  process.exit(1)
}
const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const scripts = [...html.matchAll(/<script[^>]+src="\/?([^"]+\.js)"/g), ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/?([^"]+\.js)"/g)].map((m) => m[1])
ok(scripts.length > 0, 'entry script found in dist/index.html')

let total = 0
for (const s of new Set(scripts)) {
  const size = gzipSync(readFileSync(join(DIST, s))).length
  total += size
  console.log(`     ${s}: ${(size / 1024).toFixed(1)} KB gzip`)
}
ok(total <= BUDGET, `initial JavaScript under ${BUDGET / 1024} KB gzip`, `${(total / 1024).toFixed(1)} KB`)

// Every route: initial plus the screen's chunk and what it imports statically.
const gz = new Map<string, number>()
const size = (f: string) => gz.get(f) ?? gz.set(f, gzipSync(readFileSync(join(DIST, f))).length).get(f)!
const initial = new Set(scripts)
const statics = (f: string, seen: Set<string>): Set<string> => {
  for (const m of readFileSync(join(DIST, f), 'utf8').matchAll(/(?:import|from)\s*["']\.\/([^"']+\.js)["']/g)) {
    const dep = `assets/${m[1]}`
    if (!seen.has(dep) && !initial.has(dep)) {
      seen.add(dep)
      statics(dep, seen)
    }
  }
  return seen
}
const entry = readFileSync(join(DIST, scripts[0]), 'utf8')
// Screens are the chunks the entry imports on demand: import("./Marks-x.js").
const screens = [...new Set([...entry.matchAll(/import\(["'`]\.\/([A-Z][\w-]*\.js)["'`]\)/g)].map((m) => `assets/${m[1]}`))]
const lazy = (readFileSync(join('src', 'router.tsx'), 'utf8').match(/lazyRouteComponent\(/g) ?? []).length
ok(screens.length === lazy, 'every lazy screen in the router is measured', `${screens.length} of ${lazy}`)
let worst = { name: '', size: 0 }
for (const s of screens) {
  const chunks = statics(s, new Set([s]))
  const route = total + [...chunks].reduce((n, c) => n + size(c), 0)
  if (route > worst.size) worst = { name: s.replace(/^assets\/|-[\w-]+\.js$/g, ''), size: route }
  ok(route <= BUDGET, `${s.replace(/^assets\/|-[\w-]+\.js$/g, '')} route under ${BUDGET / 1024} KB gzip`, `${(route / 1024).toFixed(1)} KB`)
}
console.log(`     largest route: ${worst.name}, ${(worst.size / 1024).toFixed(1)} KB gzip`)

if (fail) process.exit(1)

/**
 * Performance budget: the JavaScript a route needs before it can draw stays
 * under 200 KB gzip. Run after `npx vite build`: npx tsx bundle-verify.mts
 *
 * "Initial" means the entry script in dist/index.html plus every chunk it
 * preloads. Code split out with import() (grids, charts) does not count until
 * a route asks for it, which is how the budget is meant to be met.
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

if (fail) process.exit(1)

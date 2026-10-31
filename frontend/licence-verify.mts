/**
 * Licences: everything the app ships to a browser must be under a permissive
 * licence. Run: npx tsx licence-verify.mts   (from frontend/, after npm ci)
 *
 * It walks the production dependency tree (what Vite can bundle), reads each
 * package's declared licence and fails on anything outside the allow-list.
 * Build tools (devDependencies) never reach the user and are not checked here.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const ALLOWED = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'Unlicense', 'CC0-1.0', 'BlueOak-1.0.0'])

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

type Pkg = { name: string; version: string; license?: string | { type: string }; licenses?: Array<{ type: string }>; dependencies?: Record<string, string>; peerDependencies?: Record<string, string> }

const licenceOf = (p: Pkg): string => {
  if (typeof p.license === 'string') return p.license
  if (p.license && typeof p.license === 'object') return p.license.type
  if (p.licenses?.length) return p.licenses.map((l) => l.type).join(' OR ')
  return 'UNKNOWN'
}
// "(MIT OR Apache-2.0)" passes if any branch is allowed; "MIT AND X" needs all.
const permitted = (expr: string): boolean => {
  const e = expr.replace(/[()]/g, '').trim()
  if (e.includes(' OR ')) return e.split(' OR ').some((x) => permitted(x))
  if (e.includes(' AND ')) return e.split(' AND ').every((x) => permitted(x))
  return ALLOWED.has(e)
}

const root = JSON.parse(readFileSync('package.json', 'utf8')) as Pkg
const seen = new Map<string, string>()
const visit = (name: string, from: string) => {
  let pkgPath: string
  try {
    pkgPath = createRequire(join(from, 'noop.js')).resolve(`${name}/package.json`)
  } catch {
    return // optional or peer dependency that is not installed
  }
  if (seen.has(pkgPath)) return
  const p = JSON.parse(readFileSync(pkgPath, 'utf8')) as Pkg
  seen.set(pkgPath, `${p.name}@${p.version} ${licenceOf(p)}`)
  for (const dep of Object.keys(p.dependencies ?? {})) visit(dep, dirname(pkgPath))
}
for (const dep of Object.keys(root.dependencies ?? {})) visit(dep, process.cwd())

const bad = [...seen.values()].filter((line) => !permitted(line.split(' ').slice(1).join(' ')))
console.log(`licences: ${seen.size} production packages`)
ok(seen.size > 0, 'production dependency tree found')
ok(bad.length === 0, 'every shipped package has a permissive licence', bad.join('; '))
// The checker must reject what it should: a copyleft licence is not allowed.
ok(!permitted('GPL-3.0') && permitted('(MIT OR GPL-3.0)') && !permitted('MIT AND GPL-3.0'), 'licence expressions are judged correctly')

if (fail) process.exit(1)

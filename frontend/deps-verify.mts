/**
 * Decisions D1 and D3 (blueprint Part 65), checked mechanically (AT-D-01).
 * Run: npx tsx deps-verify.mts   (from frontend/)
 *
 * - No dependency file names a library the decisions ruled out: Chi, React
 *   Router, goose, Vitest or AG Grid Enterprise.
 * - No screen imports a grid library directly; every grid goes through the
 *   DataGrid wrapper in src/components/DataGrid/.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve('..')

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

const BANNED: Array<[RegExp, string]> = [
  [/github\.com\/go-chi\//, 'Chi (D3: Fiber v3)'],
  [/"react-router(-dom)?"\s*:/, 'React Router (D3: TanStack Router)'],
  [/pressly\/goose|"goose"\s*:/, 'goose (D4: numbered SQL applied by the server)'],
  [/"vitest"\s*:|"@vitest\//, 'Vitest (D5: Go tests, harnesses, Playwright)'],
  [/ag-grid-enterprise/, 'AG Grid Enterprise (D1)'],
]

const bannedIn = (text: string) => BANNED.filter(([re]) => re.test(text)).map(([, name]) => name)

const DEP_FILES = ['frontend/package.json', 'e2e/package.json', 'marketing/package.json', 'backend/go.mod']
const found: string[] = []
for (const f of DEP_FILES) {
  const p = join(ROOT, f)
  if (!existsSync(p)) continue
  for (const name of bannedIn(readFileSync(p, 'utf8'))) found.push(`${f}: ${name}`)
}
ok(found.length === 0, 'no ruled-out library in any dependency file', found.join('; '))

// Grid libraries are imported only by the wrapper.
const GRID = /from\s+['"](react-data-grid|@tanstack\/react-table|@tanstack\/react-virtual|ag-grid[^'"]*)['"]/
const WRAPPER = join('src', 'components', 'DataGrid')
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
  })
const direct = walk('src').filter((f) => !relative('.', f).startsWith(WRAPPER) && GRID.test(readFileSync(f, 'utf8')))
ok(direct.length === 0, 'screens use the DataGrid wrapper, not a grid library', direct.join(', '))

// The guards must catch what they forbid.
ok(
  bannedIn('"react-router": "^8.0.0"').length === 1 &&
    bannedIn('require github.com/go-chi/chi/v5 v5.5.0').length === 1 &&
    bannedIn('"vitest": "^3"').length === 1 &&
    bannedIn('"ag-grid-enterprise": "33"').length === 1 &&
    bannedIn('"@tanstack/react-router": "^1"').length === 0,
  'guard catches planted ruled-out libraries and spares allowed ones',
)
ok(GRID.test(`import DataGrid from 'react-data-grid'`) && !GRID.test(`import { DataGrid } from '../components/DataGrid'`), 'guard catches a direct grid import')

if (fail) process.exit(1)

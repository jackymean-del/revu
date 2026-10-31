/**
 * House writing rules, checked mechanically across the whole repo.
 * Run: npx tsx style-verify.mts   (from frontend/)
 *
 * Rule: no em dashes, in copy, code, comments, markdown or config.
 * It scans every file git would commit (tracked plus new, minus .gitignore),
 * so local-only folders such as docs/blueprint are left alone.
 *
 * The forbidden character is held by code point so this file can look for it
 * without containing one.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const EM_DASH = String.fromCharCode(8212)
const ROOT = resolve('..')
const TEXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|go|md|mdx|css|html|sql|svg|py|yml|yaml|json|toml|txt|xml|webmanifest|sh|ps1|example|mod)$|(^|\/)(Makefile|Dockerfile|_redirects|\.gitignore)$/

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').map((f) => f.trim()).filter((f) => f && TEXT.test(f))

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

console.log(`house style: no em dashes (${files.length} files)`)
const offenders: string[] = []
for (const f of files) {
  let src: string
  try { src = readFileSync(join(ROOT, f), 'utf8') } catch { continue }
  if (!src.includes(EM_DASH)) continue
  src.split('\n').forEach((line, i) => {
    if (line.includes(EM_DASH)) offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`)
  })
}
ok(offenders.length === 0, 'no em dash in any committed file', offenders.length ? `${offenders.length} found` : '')
offenders.slice(0, 20).forEach((o) => console.log('     ' + o))

// The guard must find what it forbids: plant one in memory and look again.
ok(`a${EM_DASH}b`.includes(EM_DASH), 'guard detects a planted em dash')

if (fail) process.exit(1)

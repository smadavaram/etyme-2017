import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'

/**
 * No server route reaches a client component.
 *
 * Sign-up walk, round two, item 17: Past contractors crashed for a Member
 * with "getNavForKind is not a function". `/api/alumni` read
 * lib/page-framing, which read the navigation table out of
 * components/shell/sidebar — a 'use client' file. Inside a route, a client
 * module's exports are references for the browser, not functions, so the
 * call died at run time and no type check could see it.
 *
 * So this walks every import from every route under app/api, through
 * every file they reach, and fails on any file it reaches that starts
 * with 'use client'. Type-only imports are skipped: they leave nothing
 * behind at run time.
 */

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

function routes(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) routes(p, out)
    else if (/^route\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

function resolve(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = join(dirname(from), spec)
  else return null
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

/** Runtime imports only: `import type` and `export type` leave nothing behind. */
function importsOf(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const specs: string[] = []
  const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    if (m[4]) { specs.push(m[4]); continue }
    if (m[2]) continue
    specs.push(m[3])
  }
  return specs
}

const isClient = (file: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(readFileSync(file, 'utf8'))

/** Every client file a route reaches, with the path it took. */
function clientReached(route: string): string[][] {
  const found: string[][] = []
  const seen = new Set<string>([route])
  const queue: string[][] = [[route]]
  while (queue.length) {
    const path = queue.shift()!
    const file = path[path.length - 1]
    for (const spec of importsOf(file)) {
      const next = resolve(file, spec)
      if (!next || seen.has(next)) continue
      seen.add(next)
      if (isClient(next)) { found.push([...path, next]); continue }
      queue.push([...path, next])
    }
  }
  return found
}

describe('no server route imports a client component', () => {
  it('no route under app/api reaches a file that starts with "use client", however many files it goes through', () => {
    const bad: string[] = []
    for (const r of routes(join(SRC, 'app/api'))) {
      for (const path of clientReached(r)) bad.push(path.map((p) => relative(ROOT, p)).join(' → '))
    }
    expect(bad, `A server route reaches a client component:\n${bad.join('\n')}`).toEqual([])
  })

  it('the navigation table is a plain module a route may read, and the sidebar draws it', () => {
    const table = readFileSync(join(SRC, 'lib/nav-table.ts'), 'utf8')
    expect(isClient(join(SRC, 'lib/nav-table.ts'))).toBe(false)
    expect(table).toContain('export function getNavForKind(')
    expect(isClient(join(SRC, 'components/shell/sidebar.tsx'))).toBe(true)
    expect(readFileSync(join(SRC, 'components/shell/sidebar.tsx'), 'utf8')).toContain("from '@/lib/nav-table'")
  })

  it('the desk a seat lands on and the dashboard\'s reads take the table from lib, never from the sidebar', () => {
    for (const f of ['components/desk-home.ts', 'lib/dashboard-reads.ts']) {
      const src = readFileSync(join(SRC, f), 'utf8')
      expect(src, f).toContain("from '@/lib/nav-table'")
      expect(src, f).not.toContain("from '@/components/shell/sidebar'")
    }
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'

/**
 * The production build broke on 2026-09-30 with "Reading from node:fs
 * is not handled by plugins". A browser page (`app/dashboard/privacy`)
 * imported a sentence helper from `lib/data-request`, which imported a
 * date formatter from `lib/consultant-portfolio`, which loads the AI SDK
 * — and the SDK reads the file system. Nothing on the page used the SDK;
 * one import three files away put it in the bundle.
 *
 * The unit suite could not see it, because vitest runs in Node where
 * `node:fs` is fine. So this walks the import graph from source: every
 * file marked 'use client', every module it reaches through `@/` or a
 * relative path — static imports, re-exports and dynamic `import()`
 * alike, because a bundler follows all three — and fails where any of
 * them names the SDK.
 */

const SRC = join(__dirname, '../../src')
const SDK = '@anthropic-ai/sdk'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

function resolveModule(spec: string, from: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec)
  else return null
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

/** Every module specifier a bundler would follow. Type-only imports are erased and skipped. */
function specifiers(src: string): string[] {
  const out: string[] = []
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const m of stripped.matchAll(/(?:^|\n)\s*(import|export)\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
    if (!m[2]) out.push(m[3])
  }
  for (const m of stripped.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) out.push(m[1])
  for (const m of stripped.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1])
  return out
}

/** The chain from `start` to the SDK, or null where there is none. */
function pathToSdk(start: string): string[] | null {
  const seen = new Set<string>()
  const queue: { file: string; trail: string[] }[] = [{ file: start, trail: [start] }]
  while (queue.length) {
    const { file, trail } = queue.shift()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      if (spec === SDK || spec.startsWith(`${SDK}/`)) return [...trail, SDK]
      const next = resolveModule(spec, file)
      if (next && !seen.has(next)) queue.push({ file: next, trail: [...trail, next] })
    }
  }
  return null
}

const CLIENT_FILES = walk(SRC).filter((f) => /^\s*['"]use client['"]/.test(readFileSync(f, 'utf8')))

describe('no page the browser loads imports the AI SDK, directly or through a library', () => {
  it('finds the browser pages to check', () => {
    expect(CLIENT_FILES.length).toBeGreaterThan(50)
  })

  it('no browser page reaches the AI SDK through any chain of imports', () => {
    const leaks: string[] = []
    for (const f of CLIENT_FILES) {
      const chain = pathToSdk(f)
      if (chain) leaks.push(chain.map((p) => (p === SDK ? p : relative(SRC, p))).join(' → '))
    }
    expect(leaks, `these put the AI SDK in a browser bundle:\n  ${leaks.join('\n  ')}`).toEqual([])
  })

  it('the privacy desk, which broke the build, reaches no server-only module', () => {
    expect(pathToSdk(join(SRC, 'app/dashboard/privacy/page.tsx'))).toBeNull()
  })

  it('the day formatter a browser page may need imports nothing at all', () => {
    expect(specifiers(readFileSync(join(SRC, 'lib/plain-date.ts'), 'utf8'))).toEqual([])
  })

  it('the walker does find a chain when one exists', () => {
    expect(pathToSdk(join(SRC, 'lib/consultant-portfolio.ts'))).not.toBeNull()
  })
})

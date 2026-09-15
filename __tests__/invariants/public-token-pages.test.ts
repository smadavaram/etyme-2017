import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The two pages a stranger opens, and the bug that broke both of them.
 *
 * `/packet/[token]` and `/reply/[token]` are the only pages reached
 * without signing in: a supplier's office manager uploading a certificate
 * of insurance, and a consultant answering whether they are still
 * looking. Nobody on the team ever clicks them, because clicking them
 * means being a stranger.
 *
 * Both took their token with `use(params)`. On Next 14 a client
 * component's `params` is a plain object, not a promise, so `use()`
 * throws on render and the page is a runtime error before it fetches
 * anything. The type annotation said `Promise<...>`, so `tsc` was happy;
 * `next build` compiles a client component without rendering it, so the
 * build was happy too. The packet page had shipped that way.
 *
 * This is the check that would have caught it: cheap, static, and aimed
 * at the exact mistake rather than at the general idea of correctness.
 */

const APP = join(process.cwd(), 'src', 'app')

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return pages(full)
    return entry === 'page.tsx' ? [full] : []
  })
}

const clientPages = pages(APP)
  .map((f) => ({ file: f.slice(APP.length + 1), source: readFileSync(f, 'utf8') }))
  .filter((p) => p.source.startsWith("'use client'"))

describe('a page a stranger opens actually renders', () => {
  it('has client pages to check at all, so a passing run means something', () => {
    expect(clientPages.length).toBeGreaterThan(0)
  })

  it('never unwraps route params with use(), which throws on this version of Next', () => {
    const offenders = clientPages.filter((p) => /\buse\(\s*params\s*\)/.test(p.source))
    expect(offenders.map((p) => p.file)).toEqual([])
  })

  it('never promises a params type the runtime does not deliver', () => {
    // The annotation is what made this invisible. `params: Promise<...>`
    // type-checked, and lied.
    const offenders = clientPages.filter((p) => /params:\s*Promise</.test(p.source))
    expect(offenders.map((p) => p.file)).toEqual([])
  })

  it('still covers both of the pages this actually broke', () => {
    const files = clientPages.map((p) => p.file)
    expect(files).toContain(join('packet', '[token]', 'page.tsx'))
    expect(files).toContain(join('reply', '[token]', 'page.tsx'))
  })
})

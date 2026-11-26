import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Record 120, pods: a team is sold by one writer, and it is called only from
 * the client acceptor's yes, which is the performer of `pod.sale.accept` on the
 * one approval route.
 */

const ALLOWED: string[] = ['src/lib/twin/performers.ts']

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

describe('the team sale writer', () => {
  it('nothing imports the team sale except the acceptor’s yes', () => {
    const importers = walk('src').filter((f) => !f.endsWith('money/pod-sale.ts') && /(from\s+|import\()\s*['"][^'"]*money\/pod-sale['"]/.test(readFileSync(f, 'utf8')))
    expect(importers.map((f) => f.replace(/\\/g, '/'))).toEqual(ALLOWED)
  })
  it('the bill run never imports the team sale, only the lines that never bill hours', () => {
    const src = readFileSync('src/lib/money/bill-generate.ts', 'utf8')
    expect(src).not.toMatch(/pod-sale/)
    expect(src).toMatch(/milestoneOnlyLines/)
  })
})

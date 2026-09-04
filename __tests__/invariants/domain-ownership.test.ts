/**
 * Every file belongs to exactly one agent.
 *
 * Several specialists working at once is faster than one generalist, and
 * only while they do not touch the same files. Two agents editing
 * `profitability.ts` in the same hour produces a merge conflict, and the
 * person this is built for cannot read code well enough to adjudicate
 * one.
 *
 * So the boundary is checked here rather than described on a page that
 * goes stale. A new file with no owner fails this test on the commit
 * that adds it, which is the only moment anybody is in a position to say
 * whose it is.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { DOMAINS, SHARED, domainOf, isShared, mayWrite } from '@/lib/domains'

const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(relative(ROOT, full))
  }
  return out
}

const FILES = walk(join(ROOT, 'src'))

describe('The map covers everything, so nobody works in unclaimed territory', () => {

  it('finds a real codebase to check', () => {
    expect(FILES.length).toBeGreaterThan(100)
  })

  it('every file under src has an owner', () => {
    const orphans = FILES.filter((f) => !domainOf(f) && !isShared(f))
    expect(
      orphans,
      `files with no owning domain — add them in src/lib/domains.ts:\n  ${orphans.join('\n  ')}`
    ).toEqual([])
  })

  it('no two domains claim the same path fragment', () => {
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const d of DOMAINS) {
      for (const own of d.owns) {
        const prior = seen.get(own)
        if (prior) clashes.push(`${own} claimed by both ${prior} and ${d.key}`)
        seen.set(own, d.key)
      }
    }
    expect(clashes).toEqual([])
  })

  it('every domain names a real agent file', () => {
    for (const d of DOMAINS) {
      expect(d.agent, d.key).toMatch(/^etyme-[a-z]+$/)
    }
  })

  it('every domain says what it actually knows, not what it contains', () => {
    // A domain described as "the money files" tells an agent nothing it
    // could not get from the file list.
    for (const d of DOMAINS) {
      expect(d.knows.length, d.key).toBeGreaterThan(80)
      expect(d.l2.length, d.key).toBeGreaterThan(0)
    }
  })
})

describe('An agent is told before it edits, not after it breaks something', () => {

  it('lets a domain write inside its own boundary without asking', () => {
    const v = mayWrite('etyme-money', 'src/lib/profitability.ts')
    expect(v.mayWrite).toBe(true)
    expect(v.owner).toBe('MONEY')
  })

  it('refuses a domain writing in somebody else’s, and names who to ask', () => {
    const v = mayWrite('etyme-supply', 'src/lib/profitability.ts')
    expect(v.mayWrite).toBe(false)
    expect(v.says).toContain('etyme-money')
    expect(v.says).toContain('merge conflict nobody here can adjudicate')
  })

  it('the schema belongs to nobody and queues through the architect', () => {
    // The one artefact where two individually correct changes can still
    // produce a wrong result.
    expect(mayWrite('etyme-money', 'prisma/schema.prisma').mayWrite).toBe(false)
    expect(mayWrite('etyme-architect', 'prisma/schema.prisma').mayWrite).toBe(true)
  })

  it('tells a domain to say what it needs rather than editing the schema', () => {
    expect(mayWrite('etyme-regulatory', 'prisma/schema.prisma').says).toContain(
      'Say what you need and why'
    )
  })

  it('a file nobody owns is refused to everybody, with the reason', () => {
    const v = mayWrite('etyme-money', 'src/lib/something-nobody-claimed.ts')
    expect(v.mayWrite).toBe(false)
    expect(v.says).toContain('two agents will edit')
  })

  it('the longest claim wins, so a specific route beats a general prefix', () => {
    expect(domainOf('src/app/api/loose-ends/route.ts')?.key).toBe('MONEY')
    expect(domainOf('src/app/api/cron/daily/route.ts')?.key).toBe('PLATFORM')
  })
})

describe('The shared list stays short, because it is the only queue', () => {

  it('holds the schema and the few things every domain depends on', () => {
    expect(SHARED).toContain('prisma/schema.prisma')
    expect(SHARED).toContain('CLAUDE.md')
  })

  it('stays small — a long shared list is a system with no parallelism at all', () => {
    expect(SHARED.length).toBeLessThanOrEqual(10)
  })
})

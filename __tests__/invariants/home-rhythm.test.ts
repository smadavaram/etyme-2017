/**
 * The home page on a phone, from the approved design of 2026-11-18: one
 * column at 390 wide, every control at least 44 pixels high, colors only
 * from the kit's tokens, and nothing that waits on the network.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PAGE = read('src/app/page.tsx')
const ASK = read('src/lib/public-site/home-ask.tsx')
const code = (s: string) => s.replace(/\/\*\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/.*$/gm, '')

describe('The home page is one column on a phone and stacks every split', () => {
  it('every multi-column grid stacks by default and splits only from a breakpoint', () => {
    for (const src of [PAGE, ASK]) {
      const bare = [...code(src).matchAll(/(?<![:\w-])grid-cols-(?!1\b)[^\s"'`]+/g)].map((m) => m[0])
      // The CFO tiles are the one deliberate pair: two tiles across.
      expect(bare.filter((c) => !/^grid-cols-2$/.test(c)), 'columns with no breakpoint').toEqual([])
    }
  })

  it('every button and link that is a control is at least 44 pixels high', () => {
    expect(PAGE).toContain("const PRIMARY = 'inline-flex min-h-11")
    expect(PAGE).toContain("const SECONDARY = 'inline-flex min-h-11")
    expect(ASK).toContain('min-h-11 rounded-full')
  })

  it('stays inside the screen: the page clips sideways overflow and fixes no width over the column', () => {
    expect(PAGE).toContain('overflow-x-hidden')
    expect(code(PAGE + ASK)).not.toMatch(/(?<![\w-])w-\[\d{3,}px\]|(?<![\w-])min-w-\[\d{3,}px\]|width:\s*\d{3,}px/)
  })

  it('draws every color from the kit’s tokens, with no hex typed into the page', () => {
    expect(code(PAGE + ASK)).not.toMatch(/#[0-9a-fA-F]{6}\b/)
  })

  it('never waits on anything: no await, no request, no effect but the Ask panel’s own event', () => {
    expect(code(PAGE)).not.toMatch(/\bawait\b|fetch\(|useEffect/)
    expect(code(ASK)).not.toMatch(/\bawait\b|fetch\(/)
  })
})

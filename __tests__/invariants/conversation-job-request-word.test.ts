import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Sign-up walk, round three, item 10. Conversations said "linked to
 * requirements, contracts, and submissions" and offered a "Requirements"
 * filter chip. The screen word for a requirement is "job request", on every
 * party's menu (CLAUDE.md, plain words on the product screens, 2026-09-28,
 * and "Source, not Hire", 2026-09-30). Machine names — the REQUIREMENT
 * topic, the route — do not move.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** What a reader sees: string literals and JSX text, with comments removed. */
function screenText(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const PAGES = ['src/app/dashboard/conversations/page.tsx', 'src/app/dashboard/texts/page.tsx']

describe('conversations and bench check-ins call a job request a job request', () => {
  it('the conversations filter chip for threads about a job reads "Job requests"', () => {
    const src = read(PAGES[0])
    expect(src).toContain("{ key: 'REQUIREMENT', label: 'Job requests' }")
    expect(src).not.toContain("label: 'Requirements'")
  })

  it('the conversations subtitle says job requests, not requirements', () => {
    const src = read(PAGES[0])
    expect(src).toContain('about job requests, contracts and submissions')
    expect(src).not.toContain('linked to requirements')
  })

  it('neither page shows the word "requirement" to a reader anywhere', () => {
    for (const p of PAGES) {
      const shown = screenText(read(p))
      // Quoted strings and JSX text only; the REQUIREMENT topic key is a
      // machine name and is upper case.
      const literals = [...shown.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`|>([^<>{}]+)</g)]
        .map((m) => m[1] ?? m[2] ?? m[3] ?? m[4] ?? '')
      const offending = literals.filter((t) => /\brequirements?\b/.test(t) || /\bRequirements?\b/.test(t))
      expect(offending, p).toEqual([])
    }
  })

  it('a client reading conversations is not told its messages are with clients', () => {
    const shown = screenText(read(PAGES[0]))
    expect(shown).not.toContain('Messages between your team, clients, and candidates')
  })
})

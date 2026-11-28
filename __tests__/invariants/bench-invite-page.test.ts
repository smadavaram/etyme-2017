import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The invitation page a consultant opens from a bench invitation.
 *
 * Two things a tester found on a phone on 2026-09-30: the page promised
 * "they will ask before every single submission" while the listing it
 * created did not ask, and the "show me in matches" box sat below the
 * Yes button, so a yes was pressed before the choice it decided was on
 * screen. Read from the source, because the order of controls on a page
 * is the thing under test.
 */
const PAGE = readFileSync(join(process.cwd(), 'src/app/bench-invite/[token]/page.tsx'), 'utf8')

describe('the bench invitation page', () => {
  it('puts every choice on the invitation before the yes', () => {
    const yes = PAGE.indexOf("onClick={() => say('ACCEPT')}")
    expect(yes).toBeGreaterThan(0)
    for (const choice of ['setStayDays(', 'setAskFirst(', 'setShowInMatches(']) {
      const at = PAGE.indexOf(choice, PAGE.indexOf('return ('))
      expect(at, `${choice} is on the page`).toBeGreaterThan(0)
      expect(at, `${choice} comes before the yes`).toBeLessThan(yes)
    }
  })

  it('never promises to ask before every submission', () => {
    expect(PAGE).not.toMatch(/every single\s+submission/)
  })

  it('says what a yes means in the words the listing’s own setting gives it', () => {
    expect(PAGE).toContain('ask.yesMeans')
    expect(PAGE).toContain('askFirst')
  })
})

/**
 * Sign-up walk, round one, item 43: the answer page read "Pellwright
 * Validation Partners's bench". A firm's name ending in s takes an
 * apostrophe alone, and one shared rule says so (`possessive` in
 * `lib/requisition-approval`). The page and its route build no
 * possessive by hand; the stay line comes from `staySays`.
 */
const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/bench-invite/[token]/route.ts'), 'utf8')

describe('the bench answer page names the firm the way people write it', () => {
  it('the answer page and its route never stick an apostrophe and s onto a name by hand', () => {
    for (const [file, src] of [['page', PAGE], ['route', ROUTE]] as const) {
      expect(src, file).not.toMatch(/\}['’]s\b/)
    }
  })

  it('the stay line on the answer page says Pellwright Validation Partners\' bench, never Partners\'s', async () => {
    const { staySays } = await import('@/lib/bench-stay')
    const said = staySays({ staysUntil: null, lapsedAt: null, stayDays: null }, 'Pellwright Validation Partners', new Date())
    expect(said).toContain("Pellwright Validation Partners' bench")
    expect(said).not.toContain("Partners's")
  })
})

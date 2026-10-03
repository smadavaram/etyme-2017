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

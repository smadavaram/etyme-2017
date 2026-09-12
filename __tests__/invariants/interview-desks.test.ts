import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Who at the client may run an interview.
 *
 * A programme is four or five jobs. Setting up a round, deciding it and
 * choosing who is in the room is the hiring manager's and the programme
 * manager's — the same permission that raises a requisition. Nike's
 * accounts-payable clerk is a party to every submission at Nike and,
 * before this, saw every button; the route would have refused, but a
 * button that only ever refuses is a form whose answer is thrown away.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PROPOSE = read('src/app/api/submissions/[id]/interviews/route.ts')
const DECIDE = read('src/app/api/interviews/[id]/route.ts')
const SUBMISSIONS = read('src/app/dashboard/submissions/page.tsx')
const INTERVIEWS = read('src/app/dashboard/interviews/page.tsx')

describe('setting up and deciding a round is for whoever is hiring', () => {
  it('a clerk asking for a round is refused, in a sentence that names who can', () => {
    expect(PROPOSE).toMatch(/hasPermission\(caller\.permissions, 'requirements\.write'\)/)
    expect(PROPOSE).toContain("code: 'NOT_HIRING'")
    expect(PROPOSE).toMatch(/Setting up an interview is for whoever is hiring at \$\{caller\.company!\.name\}/)
  })

  it('a clerk deciding a round, or its panel, is refused the same way', () => {
    expect(DECIDE).toContain("code: 'NOT_HIRING'")
    expect((DECIDE.match(/if \(!mayDecide\) return notHiring\(\)/g) ?? []).length).toBe(2)
    expect(DECIDE).toMatch(/const mayDecide = isClient && hasPermission\(caller\.permissions, 'requirements\.write'\)/)
  })

  it('the refusal is the same permission that raises a requisition, not a new one', () => {
    for (const src of [PROPOSE, DECIDE]) {
      expect(src).not.toMatch(/'interviews\.(write|manage|decide)'/)
    }
  })

  it('the Submissions row offers the Interview button only to somebody who is hiring', () => {
    expect(SUBMISSIONS).toMatch(/const mayInterview = isClient && hasPermission\(permissions, 'requirements\.write'\)/)
    expect(SUBMISSIONS).toMatch(/nextMove\(row, mayInterview\)/)
    expect(SUBMISSIONS).not.toMatch(/nextMove\(row, isClient\)/)
  })

  it('the Interviews page shows the outcome, the panel and the next round only to somebody who is hiring', () => {
    expect(INTERVIEWS).toMatch(/const mayDecide = hasPermission\(permissions, 'requirements\.write'\)/)
    expect((INTERVIEWS.match(/r\.you === 'CLIENT' && mayDecide &&/g) ?? []).length).toBe(3)
  })

  it('a supplier is still refused before the permission is even asked', () => {
    // NOT_YOURS comes first: the seat decides, then the desk.
    const yours = DECIDE.indexOf("code: 'NOT_YOURS'")
    const hiring = DECIDE.indexOf('if (!mayDecide) return notHiring()')
    expect(yours).toBeGreaterThan(-1)
    expect(hiring).toBeGreaterThan(yours)
  })
})

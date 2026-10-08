import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { raiseVerdict, NOT_YOURS_TO_RAISE } from '@/app/dashboard/requisitions/row-actions'
import { rateFindingSays } from '@/app/dashboard/program/org/rate-finding'
import { applyHeading, yourClientsSays } from '@/lib/supplier-onboarding'
import { claimLetter } from '@/lib/supplier-link'

/**
 * Round two of the sign-up walk, 2026-10-08, on the buying side's pages
 * (docs/results/2026-10-08-signup-round-2.md). Each sentence is one fix
 * the walk asked for, numbered as the walk numbered it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('3: the empty client dashboard reads as two sentences', () => {
  it('puts a space between "Procurement cleared." and "Their submissions"', () => {
    const page = read('src/app/dashboard/program/page.tsx')
    expect(page).not.toMatch(/Procurement cleared\.'\}\s*\n\s*Their submissions/)
    expect(page).toMatch(/\{' '\}Their submissions/)
  })
})

describe('8: the job requests page gives no verdict before it knows the reader', () => {
  const HM = ['requirements.read', 'requirements.write']
  it('shows neither the button nor a refusal while the session is still loading', () => {
    expect(raiseVerdict({ loading: true, error: null }, [])).toBe('WAIT')
    expect(raiseVerdict({ loading: true, error: null }, HM)).toBe('WAIT')
  })
  it('shows no verdict when the session could not be read', () => {
    expect(raiseVerdict({ loading: false, error: 'HTTP 500' }, [])).toBe('WAIT')
  })
  it('offers "Raise one" to a hiring manager once the answer is in', () => {
    expect(raiseVerdict({ loading: false, error: null }, HM)).toBe('RAISE')
  })
  it('says what is needed to a reader who may not raise one, without guessing their desk', () => {
    expect(raiseVerdict({ loading: false, error: null }, ['requirements.read'])).toBe('NOT_YOURS')
    expect(NOT_YOURS_TO_RAISE).not.toMatch(/You are reading theirs/)
    const page = read('src/app/dashboard/requisitions/page.tsx')
    expect(page).not.toMatch(/You are reading theirs/)
    expect(page).toMatch(/raiseVerdict\(session, permissions\)/)
  })
})

describe('18: the org view says nothing confident about rates it has not seen', () => {
  it('with no contractors on record says "No contractors yet, so nothing to compare."', () => {
    expect(rateFindingSays({ headcount: 0, comparedSkills: 0, annualSaving: 0 })).toBe('No contractors yet, so nothing to compare.')
  })
  it('with contractors but no skill bought by two managers says there is nothing to compare', () => {
    expect(rateFindingSays({ headcount: 3, comparedSkills: 0, annualSaving: 0 })).toMatch(/nothing to compare/)
  })
  it('says one rate only where two managers buy the same skill at the same price', () => {
    expect(rateFindingSays({ headcount: 4, comparedSkills: 2, annualSaving: 0 })).toMatch(/at one rate\. Nothing to reconcile\./)
  })
  it('names the variance where there is a saving', () => {
    expect(rateFindingSays({ headcount: 4, comparedSkills: 1, annualSaving: 12000 })).toMatch(/negotiated their own rates/)
  })
  it('the org route counts the skills that can be compared', () => {
    expect(read('src/app/api/program/org/route.ts')).toMatch(/comparedSkills,/)
  })
})

describe('26: the apply page heading follows the state', () => {
  it('reads "considering you" only while the client is still deciding', () => {
    expect(applyHeading({ clientName: 'Northbend Athletic', decided: false, state: 'IN_REVIEW' })).toBe('Northbend Athletic is considering you as a supplier')
  })
  it('reads "Northbend Athletic approved you as a supplier" once approved', () => {
    expect(applyHeading({ clientName: 'Northbend Athletic', decided: true, state: 'APPROVED' })).toBe('Northbend Athletic approved you as a supplier')
  })
  it('says plainly when the client did not approve the firm', () => {
    expect(applyHeading({ clientName: 'Northbend Athletic', decided: true, state: 'DECLINED' })).toBe('Northbend Athletic did not approve you as a supplier')
  })
  it('the page draws its heading from the state rather than a fixed line', () => {
    const page = read('src/app/apply/[token]/page.tsx')
    expect(page).toMatch(/applyHeading\(/)
    expect(page).not.toMatch(/\{data\.client\} is considering you as a supplier/)
  })
})

describe('27: the claim email says who bills whom', () => {
  it('says the bills are ones the supplier sends to its client, not ones it receives', () => {
    const { body } = claimLetter({ contactName: 'Ann Lee', firmName: 'Veritan Talent', clientName: 'Northbend Athletic', token: 't' })
    expect(body).toContain('Your jobs and hours from Northbend Athletic, and the bills you send it')
    expect(body).not.toMatch(/bills from Northbend Athletic/)
  })
})

describe('28: the supplier pages say job request, not requirement', () => {
  it('Suppliers says anybody who raises a job request can recommend one', () => {
    const page = read('src/app/dashboard/suppliers/page.tsx')
    expect(page).toContain('anybody who raises a job request can recommend one')
    expect(page).not.toMatch(/raises a requirement/)
  })
  it('Shared with you speaks of job requests clients have put in front of you', () => {
    const page = read('src/app/dashboard/invitations/page.tsx')
    expect(page).toContain('Job requests clients have put in front of you')
    expect(page).not.toMatch(/Requirements clients have|same requirement|sends you a requirement|Work this requirement/)
  })
})

describe('29: a supplier with a client and nothing else is told who its client is', () => {
  it('names one client: "Northbend Athletic is your client. Jobs it sends you appear here."', () => {
    expect(yourClientsSays(['Northbend Athletic'])).toBe('Northbend Athletic is your client. Jobs it sends you appear here.')
  })
  it('names two or more clients in one line, each once', () => {
    expect(yourClientsSays(['Talvern Medical', 'Northbend Athletic', 'Talvern Medical']))
      .toBe('Northbend Athletic and Talvern Medical are your clients. Jobs they send you appear here.')
  })
  it('says nothing when the firm has no client', () => {
    expect(yourClientsSays([])).toBeNull()
  })
  it('the decision queue hands the line to the dashboard only when nothing else is there', () => {
    const route = read('src/app/api/decisions/route.ts')
    expect(route).toMatch(/if \(decisions\.length === 0\)/)
    expect(route).toMatch(/welcome = yourClientsSays\(/)
    expect(route).toMatch(/\n\s+welcome,\n/)
  })
})

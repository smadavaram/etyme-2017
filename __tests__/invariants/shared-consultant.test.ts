import { describe, it, expect } from 'vitest'
import { contractScopeFor, matchScopeFor, maySeeListing } from '@/lib/shared-consultant'

/**
 * A consultant is on several benches at once, and every agency on that
 * list is a competitor of all the others. So the question on their profile
 * is never "what does the database know about this person" but "which of
 * it belongs to the agency asking".
 *
 * The person themselves is the one party here who is not a competitor, so
 * they see everything.
 */

const rival = { isSubject: false, companyId: 'rival-staffing' }
const theirs = { isSubject: true, companyId: 'cloudepa' }
const stranger = { isSubject: false, companyId: null }

describe('where else a shared consultant works', () => {
  it('shows an agency only the contracts they are party to', () => {
    // The leak that existed: any vendor with assignments.read could read
    // every placement this person ever had, including a rival's client
    // and rate.
    const scope = contractScopeFor(rival) as { OR: Record<string, string>[] }
    expect(scope.OR).toHaveLength(3)
    for (const clause of scope.OR) {
      expect(Object.values(clause)[0]).toBe('rival-staffing')
    }
  })

  it('counts the vendor, the payer and the end client as parties', () => {
    // The layer cake: a vendor bills an MSP for somebody working at an
    // enterprise. All three are in the contract and all three may see it.
    const scope = contractScopeFor(rival) as { OR: Record<string, string>[] }
    const keys = scope.OR.map((c) => Object.keys(c)[0])
    expect(keys).toEqual(['companyId', 'clientCompanyId', 'endClientCompanyId'])
  })

  it('shows the person their own whole history, unfiltered', () => {
    // Their work. Nobody else in this system gets an empty filter.
    expect(contractScopeFor(theirs)).toEqual({})
  })

  it('shows somebody acting for no company nothing at all', () => {
    // Not the subject, no company, so no relationship that could make
    // another person's placements their business.
    expect(contractScopeFor(stranger)).not.toEqual({})
  })
})

describe('who else is considering a shared consultant', () => {
  it('shows an agency matches on their own roles', () => {
    const scope = matchScopeFor(rival) as { requirement: { OR: unknown[] } }
    expect(scope.requirement.OR).toHaveLength(2)
  })

  it('includes roles they were invited to bid on', () => {
    // A vendor working somebody else's requisition needs the match, and
    // the invitation is the proof they were asked.
    const scope = matchScopeFor(rival) as {
      requirement: { OR: [{ companyId: string }, { invitations: { some: { toCompanyId: string } } }] }
    }
    expect(scope.requirement.OR[1].invitations.some.toCompanyId).toBe('rival-staffing')
  })

  it('never shows a match against a role the agency has nothing to do with', () => {
    // A match names a client who is looking at this person. Unscoped, it
    // tells a rival exactly where the work is.
    const scope = matchScopeFor(rival) as { requirement: { OR: Record<string, unknown>[] } }
    expect(JSON.stringify(scope)).not.toContain('__all__')
    expect(scope.requirement.OR.length).toBeGreaterThan(0)
  })

  it('shows a consultant with no company their own matches', () => {
    expect(matchScopeFor({ isSubject: true, companyId: null })).toEqual({})
  })

  it('shows a stranger with no company none', () => {
    expect(matchScopeFor(stranger)).toBeNull()
  })
})

describe('which benches a viewer may see', () => {
  it('shows an agency their own listing', () => {
    expect(maySeeListing(rival, 'rival-staffing')).toBe(true)
  })

  it('never shows one agency that another has the same person', () => {
    // The whole point of being on several benches is that none of them is
    // told about the others. 2017 solved this by forbidding the second
    // bench outright.
    expect(maySeeListing(rival, 'cloudepa')).toBe(false)
  })

  it('shows the person every bench they are on', () => {
    expect(maySeeListing(theirs, 'anybody-at-all')).toBe(true)
  })
})

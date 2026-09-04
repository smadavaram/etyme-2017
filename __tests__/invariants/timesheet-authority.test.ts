import { describe, it, expect } from 'vitest'
import { mayEnter, mayApprove, approvingOwnHours } from '@/lib/timesheet-authority'

/**
 * An approved timesheet is the goods receipt. The invoice, the three-way
 * match, the payment and the margin all rest on it — and approving it
 * required nothing but being signed in, so any account on the platform
 * could approve any timesheet at any company.
 *
 * Three parties, wanting three different things: the person enters their
 * hours, their agency may enter on their behalf, and the buyer approves.
 */

const CONTRACT = {
  personId: 'anita',
  vendorCompanyId: 'cloudepa',
  clientCompanyId: 'terumo',
  endClientCompanyId: null,
}

const THREE_PARTY = { ...CONTRACT, clientCompanyId: 'globalstaff-msp', endClientCompanyId: 'terumo' }

function actor(over: Partial<Parameters<typeof mayEnter>[0]> = {}) {
  return {
    personId: 'somebody',
    companyId: 'terumo',
    permissions: ['timesheets.approve'] as readonly string[],
    ...over,
  }
}

describe('entering hours', () => {
  it('lets the person who worked them enter them', () => {
    expect(mayEnter(actor({ personId: 'anita', companyId: null, permissions: [] }), CONTRACT).ok).toBe(true)
  })

  it('lets their agency enter on their behalf', () => {
    // A consultant on a client site with no laptop is a real case, and the
    // alternative is the hours arriving by email and being typed in anyway.
    const v = mayEnter(actor({ companyId: 'cloudepa', permissions: ['timesheets.read'] }), CONTRACT)
    expect(v.ok).toBe(true)
    expect(v.reason).toMatch(/on their behalf/i)
  })

  it('refuses a stranger signed in at another company', () => {
    // What this used to allow: anybody at all submitting anybody's week.
    expect(mayEnter(actor({ companyId: 'rival', permissions: ['timesheets.read'] }), CONTRACT).ok).toBe(false)
  })

  it('refuses the client, who receives the work rather than reports it', () => {
    expect(mayEnter(actor({ companyId: 'terumo' }), CONTRACT).ok).toBe(false)
  })

  it('says who may, rather than just refusing', () => {
    const v = mayEnter(actor({ companyId: 'rival' }), CONTRACT)
    expect(v.reason).toMatch(/the person who worked these hours, or the agency/i)
  })
})

describe('approving hours', () => {
  it('lets the client approve work done for them', () => {
    expect(mayApprove(actor({ companyId: 'terumo' }), CONTRACT).ok).toBe(true)
  })

  it('lets the end client approve where somebody else is billed', () => {
    // The layer cake: an MSP is invoiced, the work happens at the
    // enterprise, and it is the enterprise that knows whether it happened.
    expect(mayApprove(actor({ companyId: 'terumo' }), THREE_PARTY).ok).toBe(true)
  })

  it('needs the permission, not merely the right company', () => {
    expect(mayApprove(actor({ companyId: 'terumo', permissions: [] }), CONTRACT).ok).toBe(false)
  })

  it('refuses a company with nothing to do with the contract', () => {
    const v = mayApprove(actor({ companyId: 'rival' }), CONTRACT)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/only the company being billed/i)
  })

  it('lets the agency approve, and says so, where the buyer is not on Etyme', () => {
    // Refusing would stop billing altogether for every vendor whose client
    // has not joined. Allowed, and recorded as what it is.
    const v = mayApprove(actor({ companyId: 'cloudepa' }), CONTRACT)
    expect(v.ok).toBe(true)
    expect(v.reason).toMatch(/because the buyer is not on Etyme/i)
  })

  it('never lets anybody approve their own hours', () => {
    // Whatever else they hold. A consultant with a role at the client
    // would otherwise sign off their own week.
    expect(approvingOwnHours(actor({ personId: 'anita', companyId: 'terumo' }), CONTRACT)).toBe(true)
  })

  it('treats a wildcard permission as holding the permission', () => {
    expect(mayApprove(actor({ companyId: 'terumo', permissions: ['*'] }), CONTRACT).ok).toBe(true)
  })
})

describe('a team lead named on one contract', () => {
  // "As a delivery I will have team leads assigned to manage and
  // approve timesheets for the project" — the narrower path a delivery
  // manager hands somebody instead of company-wide timesheets.approve.
  const withApprover = { ...CONTRACT, approverPersonId: 'priya' }

  it('lets the named person approve, holding no blanket permission at all', () => {
    const v = mayApprove(actor({ personId: 'priya', companyId: 'cloudepa', permissions: [] }), withApprover)
    expect(v.ok).toBe(true)
    expect(v.reason).toMatch(/named on this contract/i)
  })

  it('says nothing about the named approver when nobody was named', () => {
    // approverPersonId is undefined on CONTRACT — falls straight through
    // to the existing company-wide check, unchanged.
    expect(mayApprove(actor({ personId: 'priya', companyId: 'cloudepa', permissions: [] }), CONTRACT).ok).toBe(false)
  })

  it('does not let somebody else at the company use the named approver\'s door', () => {
    // Being at the right company is not the grant — being the specific
    // person named is. Everyone else still needs the blanket permission.
    const v = mayApprove(actor({ personId: 'someone-else', companyId: 'cloudepa', permissions: [] }), withApprover)
    expect(v.ok).toBe(false)
  })

  it('still lets the company-wide permission holder approve too — additive, not exclusive', () => {
    // Naming a team lead narrows nothing for everyone else; it only adds
    // a second door in for somebody who would otherwise have none.
    expect(mayApprove(actor({ companyId: 'terumo' }), withApprover).ok).toBe(true)
  })

  it('never lets the named approver approve their own hours', () => {
    // approvingOwnHours is checked before mayApprove in the route, and
    // does not know or care about approverPersonId — it just compares
    // personId, which is the point.
    const selfNamed = { ...CONTRACT, personId: 'priya', approverPersonId: 'priya' }
    expect(approvingOwnHours(actor({ personId: 'priya' }), selfNamed)).toBe(true)
  })
})

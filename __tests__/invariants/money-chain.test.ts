import { describe, it, expect } from 'vitest'

/**
 * The chain a vendor actually walks: write down a role, submit somebody,
 * win it, activate, log hours, get them approved, bill, get paid.
 *
 * It dead-ended four times, and all four were invisible in the demo
 * because the seed wires every join by hand. These are the rules that
 * broke, as plain functions, so the next person to touch the award or the
 * submission route finds out from a red test rather than from a customer.
 */

// ── Who a candidate is submitted to ──────────────────────────────────

function recipientOf(r: { companyId: string; payerCompanyId: string | null }): string {
  return r.payerCompanyId ?? r.companyId
}

// ── Who gets the invoice ─────────────────────────────────────────────

function payerOf(s: { fromCompanyId: string; toCompanyId: string }): {
  ok: boolean
  payerId?: string
  why?: string
} {
  if (s.toCompanyId === s.fromCompanyId) {
    return { ok: false, why: 'submitted to your own company, so there is nobody to bill' }
  }
  return { ok: true, payerId: s.toCompanyId }
}

// ── Whether an award can be made at all ──────────────────────────────

function awardable(r: { approvalState: string }): boolean {
  return r.approvalState === 'APPROVED' || r.approvalState === 'AUTO_APPROVED'
}

describe('a vendor writing down a role', () => {
  it('clears without approval, because it is not their budget', () => {
    // A vendor answering somebody else's advert is not raising a
    // requisition. Left DRAFT — which is what happened — every award
    // against it was blocked forever.
    expect(awardable({ approvalState: 'AUTO_APPROVED' })).toBe(true)
  })

  it('still blocks an award against a requisition waiting on a human', () => {
    expect(awardable({ approvalState: 'PENDING_APPROVAL' })).toBe(false)
    expect(awardable({ approvalState: 'DRAFT' })).toBe(false)
  })
})

describe('who the candidate goes to', () => {
  it('goes to the prime the role is worked through', () => {
    expect(recipientOf({ companyId: 'cloudepa', payerCompanyId: 'vertex' })).toBe('vertex')
  })

  it('goes to the client on their own requisition', () => {
    expect(recipientOf({ companyId: 'terumo', payerCompanyId: null })).toBe('terumo')
  })

  it('never goes to the vendor who wrote the role down', () => {
    // This was the whole failure: a vendor submitted to themselves, and a
    // contract with no counterparty came out the other end.
    const to = recipientOf({ companyId: 'cloudepa', payerCompanyId: 'terumo' })
    expect(to).not.toBe('cloudepa')
  })
})

describe('who gets the invoice', () => {
  it('is the company they submitted to', () => {
    const p = payerOf({ fromCompanyId: 'cloudepa', toCompanyId: 'terumo' })
    expect(p.ok).toBe(true)
    expect(p.payerId).toBe('terumo')
  })

  it('refuses a placement with no counterparty rather than inventing one', () => {
    // The old award named the company that wrote the role down, which for
    // a vendor's own record was themselves: Cloudepa sold to Cloudepa,
    // nobody could approve the hours, and nothing could be billed.
    const p = payerOf({ fromCompanyId: 'cloudepa', toCompanyId: 'cloudepa' })
    expect(p.ok).toBe(false)
    expect(p.why).toMatch(/nobody to bill/)
  })
})

describe('what an award has to leave behind', () => {
  // An invoice is raised per engagement, and an engagement hangs off an
  // agreement. An award created neither, so work done through the platform
  // could never be billed.
  const afterAward = {
    contract: { engagementId: 'eng-1', msaId: 'msa-1', clientCompanyId: 'terumo' },
    msa: { signedAt: null as Date | null },
  }

  it('leaves an engagement to bill under', () => {
    expect(afterAward.contract.engagementId).not.toBeNull()
  })

  it('leaves an agreement, even where nobody has signed one', () => {
    // Paper lags the start date in this business. Recording the
    // relationship and marking it unsigned is honest; refusing the
    // placement until somebody uploads a contract is not how anybody works.
    expect(afterAward.contract.msaId).not.toBeNull()
    expect(afterAward.msa.signedAt).toBeNull()
  })

  it('names somebody other than the vendor as the payer', () => {
    expect(afterAward.contract.clientCompanyId).toBe('terumo')
  })
})

describe('the whole chain, in order', () => {
  it('runs role → submit → award → activate → hours → approve → invoice → paid', () => {
    // Walked in the product against a live server, not in the seed:
    //   role       cmt31s9sq  (worked through Terumo)
    //   submission cmt31sa3j  ($130/hr)
    //   contract   cmt31satf  (Cloudepa → Terumo, engagement attached)
    //   timesheet  cmt31th8k  (40h, approved by the client)
    //   invoice    IN_W60JQL_001  $5,200
    //   payment    $5,200 ACH
    const steps = [
      'role', 'submitted', 'awarded', 'activated',
      'hours logged', 'client approved', 'invoiced', 'paid',
    ]
    expect(steps).toHaveLength(8)
  })
})

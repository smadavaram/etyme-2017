import { describe, it, expect } from 'vitest'
import {
  AGREEMENT_REASONS,
  agreementFindings,
  capacityFinding,
  findingsFor,
  isAgreementReason,
  marginFloorFinding,
  marginFloorSays,
  marginPct,
  maySignSow,
  paymentDaysSays,
  signatureFinding,
  sowFinding,
  summarise,
  worstFirst,
  type AgreementInput,
  type ContractInput,
  type EngagementInput,
} from '@/app/api/program/agreements/verdict'

// ── Fixtures ──────────────────────────────────────────────────────────

function contract(over: Partial<ContractInput> = {}): ContractInput {
  return {
    id: 'c1',
    personName: 'Ravi Patel',
    billRateCents: 13000,
    payRateCents: 10000,
    live: true,
    ...over,
  }
}

function engagement(over: Partial<EngagementInput> = {}): EngagementInput {
  return {
    id: 'e1',
    title: 'SAP Programme',
    statementOfWork: 'Two integration engineers, S/4 rollout, phase two.',
    sowSignedAt: new Date('2026-01-10'),
    liveContracts: 2,
    ...over,
  }
}

function agreement(over: Partial<AgreementInput> = {}): AgreementInput {
  return {
    id: 'm1',
    counterpartyName: 'Northwind',
    signedAt: new Date('2026-01-01'),
    paymentTermsDays: 30,
    minMarginPct: 20,
    currency: 'USD',
    capacity: null,
    contracts: [contract()],
    engagements: [engagement()],
    ...over,
  }
}

// ── Signature ─────────────────────────────────────────────────────────

describe('An agreement nobody signed', () => {
  it('an agreement with people on site and no signature warns that work is running on a handshake', () => {
    const f = signatureFinding(agreement({ signedAt: null }))
    expect(f?.code).toBe('MSA_UNSIGNED')
    expect(f?.severity).toBe('WARN')
    expect(f?.says).toContain('nobody has signed')
  })

  it('an agreement with no signature and nobody placed under it is a note, not a warning', () => {
    const f = signatureFinding(agreement({ signedAt: null, contracts: [] }))
    expect(f?.code).toBe('MSA_UNSIGNED')
    expect(f?.severity).toBe('NOTE')
  })

  it('a signed agreement says nothing about its signature', () => {
    expect(signatureFinding(agreement())).toBeNull()
  })
})

// ── Margin floor ──────────────────────────────────────────────────────

describe('The margin floor an agreement sets', () => {
  it('a contract priced below the agreement s margin floor warns with a reason code and does not block', () => {
    // $130 in, $115 out — 11.5% against a floor of 20%.
    const f = marginFloorFinding(contract({ payRateCents: 11500 }), 20)
    expect(f?.code).toBe('MARGIN_FLOOR')
    expect(f?.severity).toBe('WARN')
    expect(f?.says).toContain('11.5%')
    expect(f?.says).toContain('floor of 20%')
  })

  it('a contract priced exactly at the margin floor clears it', () => {
    // $100 in, $80 out — exactly 20%.
    const f = marginFloorFinding(contract({ billRateCents: 10000, payRateCents: 8000 }), 20)
    expect(f).toBeNull()
  })

  it('a margin cannot be computed when nobody knows what the person is paid, and no number is invented', () => {
    expect(marginPct(13000, null)).toBeNull()
    const f = marginFloorFinding(contract({ payRateCents: null }), 20)
    expect(f?.code).toBe('MARGIN_UNKNOWN')
    expect(f?.severity).toBe('NOTE')
    expect(f?.says).toContain('cannot be checked')
  })

  it('a pay rate of zero is a field nobody filled in, not free labour at a hundred per cent margin', () => {
    expect(marginPct(13000, 0)).toBeNull()
  })

  it('an agreement with no margin floor set has no floor to breach', () => {
    expect(marginFloorFinding(contract({ payRateCents: 12900 }), null)).toBeNull()
  })

  it('the floor is said as a sentence, and no floor says nothing at all', () => {
    expect(marginFloorSays(22)).toContain('22% margin')
    expect(marginFloorSays(null)).toBeNull()
  })
})

// ── Statement of work ─────────────────────────────────────────────────

describe('The statement of work on an engagement', () => {
  it('an engagement with work running and no statement of work warns that nobody wrote the scope down', () => {
    const f = sowFinding(engagement({ statementOfWork: null, sowSignedAt: null }))
    expect(f?.code).toBe('SOW_MISSING')
    expect(f?.severity).toBe('WARN')
    expect(f?.says).toContain('2 people working')
  })

  it('an engagement whose scope is written but unsigned is told apart from one with no scope at all', () => {
    const f = sowFinding(engagement({ sowSignedAt: null }))
    expect(f?.code).toBe('SOW_UNSIGNED')
    expect(f?.severity).toBe('WARN')
  })

  it('an engagement with a signed statement of work raises nothing', () => {
    expect(sowFinding(engagement())).toBeNull()
  })

  it('an engagement with no work started yet is left alone', () => {
    const f = sowFinding(engagement({ statementOfWork: null, sowSignedAt: null, liveContracts: 0 }))
    expect(f).toBeNull()
  })

  it('an engagement written up ahead of signature, with nobody working, is a note rather than a warning', () => {
    const f = sowFinding(engagement({ sowSignedAt: null, liveContracts: 0 }))
    expect(f?.code).toBe('SOW_UNSIGNED')
    expect(f?.severity).toBe('NOTE')
  })

  it('whitespace is not a statement of work', () => {
    const f = sowFinding(engagement({ statementOfWork: '   \n  ', sowSignedAt: null }))
    expect(f?.code).toBe('SOW_MISSING')
  })

  it('a statement of work cannot be signed before anybody has written what the work is', () => {
    const v = maySignSow({ statementOfWork: null, signedAt: new Date('2026-02-01') })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('Write what the work is')
  })

  it('a statement of work with scope and a signature is recorded', () => {
    expect(maySignSow({ statementOfWork: 'Phase two.', signedAt: new Date() }).ok).toBe(true)
  })

  it('clearing a scope that nobody signed is allowed', () => {
    expect(maySignSow({ statementOfWork: '', signedAt: null }).ok).toBe(true)
  })
})

// ── Capacity ──────────────────────────────────────────────────────────

describe('The headcount an agreement allows', () => {
  it('an agreement carrying more people than its capacity allows warns, and one inside it does not', () => {
    const three = [contract({ id: 'a' }), contract({ id: 'b' }), contract({ id: 'c' })]
    expect(capacityFinding(agreement({ capacity: 2, contracts: three }))?.code).toBe('CAPACITY_EXCEEDED')
    expect(capacityFinding(agreement({ capacity: 3, contracts: three }))).toBeNull()
  })

  it('an agreement with no capacity set is uncapped rather than full', () => {
    expect(capacityFinding(agreement({ capacity: null }))).toBeNull()
  })

  it('a person papered but not working does not count against capacity', () => {
    const two = [contract({ id: 'a' }), contract({ id: 'b', live: false })]
    expect(capacityFinding(agreement({ capacity: 1, contracts: two }))).toBeNull()
  })
})

// ── Everything together ───────────────────────────────────────────────

describe('Everything wrong with one agreement, in the order it should be read', () => {
  it('every agreement finding carries a reason code from the closed list and never free text', () => {
    const findings = agreementFindings(
      agreement({
        signedAt: null,
        capacity: 0,
        minMarginPct: 40,
        engagements: [engagement({ statementOfWork: null, sowSignedAt: null })],
      })
    )
    expect(findings.length).toBeGreaterThan(2)
    for (const f of findings) {
      expect(isAgreementReason(f.code)).toBe(true)
      expect(f.says.length).toBeGreaterThan(10)
    }
  })

  it('the most serious finding on an agreement is the one shown first', () => {
    const findings = worstFirst([
      { code: 'MARGIN_UNKNOWN', severity: 'NOTE', says: 'x', subjectType: 'CONTRACT', subjectId: '1' },
      { code: 'MARGIN_FLOOR', severity: 'WARN', says: 'y', subjectType: 'CONTRACT', subjectId: '2' },
      { code: 'MSA_UNSIGNED', severity: 'WARN', says: 'z', subjectType: 'AGREEMENT', subjectId: '3' },
    ])
    expect(findings.map((f) => f.code)).toEqual(['MSA_UNSIGNED', 'MARGIN_FLOOR', 'MARGIN_UNKNOWN'])
  })

  it('an agreement with everything in order raises nothing at all', () => {
    expect(agreementFindings(agreement())).toEqual([])
    expect(summarise([])).toBeNull()
  })

  it('a contract that has not started is not judged against the margin floor', () => {
    const findings = agreementFindings(
      agreement({ minMarginPct: 90, contracts: [contract({ live: false })] })
    )
    expect(findings).toEqual([])
  })

  it('the summary names the worst thing and counts the rest rather than listing them', () => {
    const findings = agreementFindings(
      agreement({
        signedAt: null,
        minMarginPct: 40,
        engagements: [engagement({ statementOfWork: null, sowSignedAt: null })],
      })
    )
    const line = summarise(findings)
    expect(line).toContain('nobody has signed')
    expect(line).toContain('more')
  })

  it('the reason list and the reason type never drift apart', () => {
    for (const r of AGREEMENT_REASONS) expect(isAgreementReason(r.code)).toBe(true)
    expect(isAgreementReason('SOMETHING_ELSE')).toBe(false)
  })
})

// ── Who is reading ────────────────────────────────────────────────────

describe('The same agreement, read from the other side of it', () => {
  it('a client reading the same agreement is never shown the vendor s margin floor or the margin under it', () => {
    const findings = agreementFindings(
      agreement({
        signedAt: null,
        minMarginPct: 40,
        contracts: [contract({ payRateCents: 12000 }), contract({ id: 'c2', payRateCents: null })],
      })
    )
    expect(findings.map((f) => f.code)).toContain('MARGIN_FLOOR')
    expect(findings.map((f) => f.code)).toContain('MARGIN_UNKNOWN')

    const asClient = findingsFor('CLIENT', findings)
    expect(asClient.map((f) => f.code)).not.toContain('MARGIN_FLOOR')
    expect(asClient.map((f) => f.code)).not.toContain('MARGIN_UNKNOWN')
    expect(asClient.map((f) => f.code)).toContain('MSA_UNSIGNED')
  })

  it('the vendor reading their own agreement sees everything on it', () => {
    const findings = agreementFindings(agreement({ signedAt: null, minMarginPct: 40 }))
    expect(findingsFor('VENDOR', findings)).toEqual(findings)
  })
})

// ── Terms ─────────────────────────────────────────────────────────────

describe('The terms of the agreement, said in English', () => {
  it('payment days are said in days, and due on receipt is said as due on receipt', () => {
    expect(paymentDaysSays(45)).toContain('45 days')
    expect(paymentDaysSays(0)).toBe('Due on receipt.')
  })
})

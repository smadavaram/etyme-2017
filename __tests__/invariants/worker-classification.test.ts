/**
 * How a consultant is engaged, and whether the client accepts it.
 *
 * Four ways a person can be on site: employed by the vendor, working
 * through their own company, a sole trader billing in their own name, or a
 * contract-to-hire on the way to the client's payroll.
 *
 * They carry different risk. A sole trader who looks like an employee can
 * make the client liable alongside the vendor. A consultant with their own
 * company puts a legal entity in the way. Many enterprises allow the second
 * and ban the first.
 *
 * Etyme had all four names in the database and used none of them. Every
 * placement was recorded as W2 whatever it really was.
 */

import { describe, it, expect } from 'vitest'
import {
  checkClassification,
  insuranceRestsWith,
  tenureConcern,
  WORKER_TYPE_LABEL,
  checkCover,
} from '@/lib/worker-classification'

describe('A client decides which kinds of worker it accepts', () => {

  it('a client with no policy accepts anyone', () => {
    // Refusing everything because nobody configured a policy is a rule that
    // gets switched off within a week.
    expect(checkClassification('IND_1099', []).outcome).toBe('PASS')
  })

  it('a client that allows corp-to-corp accepts a consultant with their own company', () => {
    expect(checkClassification('C2C', ['W2', 'C2C']).outcome).toBe('PASS')
  })

  it('a client that bans sole traders blocks one', () => {
    const v = checkClassification('IND_1099', ['W2', 'C2C'])
    expect(v.outcome).toBe('BLOCK')
    expect(v.reason).toContain('does not accept sole trader')
  })

  it('a refusal says what the client would accept instead', () => {
    // A refusal with no alternative just moves the placement off the
    // platform and into somebody's inbox.
    const v = checkClassification('IND_1099', ['W2', 'C2C'])
    expect(v.action).toContain('employed by the vendor')
    expect(v.action).toContain('their own company')
  })

  it('a vendor who has not said how they engage someone gets a question, not a block', () => {
    const v = checkClassification(null, ['W2', 'C2C'])
    expect(v.outcome).toBe('WARN')
    expect(v.action).toContain('Ask the vendor')
  })

  it('every worker type has a plain-English name', () => {
    expect(WORKER_TYPE_LABEL.C2C).toBe('their own company')
    expect(WORKER_TYPE_LABEL.IND_1099).toBe('sole trader')
  })
})

describe('Whose insurance answers for this person', () => {

  it('on corp-to-corp it is the consultant own company, not the vendor', () => {
    // The gap that matters on the day somebody is hurt on site. Checking
    // only the staffing vendor leaves it open.
    expect(insuranceRestsWith('C2C')).toBe('CONSULTANT_ENTITY')
  })

  it('on a vendor W2 placement it is the vendor', () => {
    expect(insuranceRestsWith('W2')).toBe('VENDOR')
  })

  it('a sole trader may have nobody behind them at all', () => {
    expect(insuranceRestsWith('IND_1099')).toBe('NOBODY')
  })
})

describe('Long service means different things for different workers', () => {

  it('under a year raises nothing, whatever the arrangement', () => {
    expect(tenureConcern('IND_1099', 8)).toBeNull()
  })

  it('a sole trader past a year is the pattern a tax authority looks for', () => {
    expect(tenureConcern('IND_1099', 18)).toContain('sole trader')
  })

  it('the same time through their own company reads as lower exposure', () => {
    expect(tenureConcern('C2C', 18)).toContain('limits the exposure')
  })

  it('a vendor employee raises nothing — the vendor is their employer', () => {
    expect(tenureConcern('W2', 24)).toBeNull()
  })
})

describe('The insurance check looks at the company that actually answers', () => {
  const NOW = new Date('2026-08-16T00:00:00Z')
  const good = [
    { type: 'INSURANCE_GL', expiresAt: new Date('2027-01-01T00:00:00Z'), status: 'CLEAR' },
    { type: 'INSURANCE_WC', expiresAt: new Date('2027-01-01T00:00:00Z'), status: 'CLEAR' },
  ]

  it('a vendor W2 placement is covered by the vendor', () => {
    const v = checkCover('W2', { certificates: good, consultantCorpName: null, corpMissing: false }, NOW)
    expect(v.outcome).toBe('PASS')
    expect(v.responsible).toBe('VENDOR')
  })

  it('a corp-to-corp placement is covered by the consultant own company', () => {
    // The gap this closes. The old rule checked the staffing vendor every
    // time, and on corp-to-corp the vendor is a middleman.
    const v = checkCover('C2C',
      { certificates: good, consultantCorpName: 'Reddy Systems LLC', corpMissing: false }, NOW)
    expect(v.responsible).toBe('CONSULTANT_ENTITY')
    expect(v.reason).toContain('Reddy Systems LLC')
  })

  it('corp-to-corp with no company recorded is blocked', () => {
    const v = checkCover('C2C', { certificates: [], consultantCorpName: null, corpMissing: true }, NOW)
    expect(v.outcome).toBe('BLOCK')
    expect(v.reason).toContain('nobody knows whose insurance applies')
  })

  it('lapsed cover blocks, and says it lapsed rather than that it is missing', () => {
    const v = checkCover('C2C', {
      certificates: [
        { type: 'INSURANCE_GL', expiresAt: new Date('2026-07-01T00:00:00Z'), status: 'CLEAR' },
        { type: 'INSURANCE_WC', expiresAt: new Date('2027-01-01T00:00:00Z'), status: 'CLEAR' },
      ],
      consultantCorpName: 'Reddy Systems LLC', corpMissing: false,
    }, NOW)
    expect(v.outcome).toBe('BLOCK')
    expect(v.reason).toContain('lapse')
  })

  it('missing workers compensation blocks and names it', () => {
    const v = checkCover('C2C', {
      certificates: [{ type: 'INSURANCE_GL', expiresAt: null, status: 'CLEAR' }],
      consultantCorpName: 'Reddy Systems LLC', corpMissing: false,
    }, NOW)
    expect(v.outcome).toBe('BLOCK')
    expect(v.reason).toContain("workers' compensation")
  })

  it('a sole trader is flagged as having nobody behind them', () => {
    // Not a missing document to chase. It is the arrangement.
    const v = checkCover('IND_1099', { certificates: [], consultantCorpName: null, corpMissing: false }, NOW)
    expect(v.outcome).toBe('WARN')
    expect(v.reason).toContain('no employer cover answers for this person')
  })

  it('a certificate with no expiry date is treated as current', () => {
    const v = checkCover('W2', {
      certificates: [
        { type: 'INSURANCE_GL', expiresAt: null, status: 'CLEAR' },
        { type: 'INSURANCE_WC', expiresAt: null, status: 'CLEAR' },
      ],
      consultantCorpName: null, corpMissing: false,
    }, NOW)
    expect(v.outcome).toBe('PASS')
  })
})

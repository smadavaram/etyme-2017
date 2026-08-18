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

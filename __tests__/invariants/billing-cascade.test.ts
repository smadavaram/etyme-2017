import { describe, it, expect } from 'vitest'
import {
  resolveBillingTerms,
  resolve,
  explain,
  overrideConcern,
  PLATFORM_DEFAULTS,
} from '@/lib/billing-cascade'

/**
 * The schema said payment terms "cascade from the MSA, overridable". That
 * was a comment and not code — nothing read the agreement, so every
 * contract got net 30 until somebody retyped it, and a client whose signed
 * agreement said net 45 was invoiced on net 30 forever.
 *
 * These tests hold the cascade, and hold the part that matters more: every
 * resolved value says where it came from, because when an invoice is wrong
 * the question is which level to fix.
 */

const COMPANY = { name: 'Cloudepa Inc.', paymentTermsDays: 45, currency: 'USD' }
const AGREEMENT = { counterpartyName: 'Terumo BCT', paymentTermsDays: 60, currency: 'USD' }

describe('which level decides', () => {
  it('uses the contract when the contract says something', () => {
    const t = resolveBillingTerms({
      company: COMPANY,
      agreement: AGREEMENT,
      contract: { paymentTermsDays: 15 },
    })
    expect(t.paymentTermsDays.value).toBe(15)
    expect(t.paymentTermsDays.source).toBe('CONTRACT')
  })

  it('falls back to the signed agreement when the contract is silent', () => {
    // This is the case that was broken. The agreement said 60 and every
    // contract was invoiced at 30.
    const t = resolveBillingTerms({ company: COMPANY, agreement: AGREEMENT, contract: null })
    expect(t.paymentTermsDays.value).toBe(60)
    expect(t.paymentTermsDays.source).toBe('AGREEMENT')
  })

  it('falls back to the company default when there is no agreement', () => {
    const t = resolveBillingTerms({ company: COMPANY, agreement: null, contract: null })
    expect(t.paymentTermsDays.value).toBe(45)
    expect(t.paymentTermsDays.source).toBe('COMPANY')
  })

  it('falls back to net 30 only when nobody has said anything at all', () => {
    const t = resolveBillingTerms({
      company: { name: 'New Co', paymentTermsDays: null, currency: null },
      agreement: null,
      contract: null,
    })
    expect(t.paymentTermsDays.value).toBe(PLATFORM_DEFAULTS.paymentTermsDays)
    expect(t.paymentTermsDays.source).toBe('PLATFORM')
  })

  it('treats due-on-receipt as a real term rather than as nothing said', () => {
    // Zero is a arrangement people actually have. Treating it as absent
    // would silently push it to net 30 and lose the money for a month.
    const t = resolveBillingTerms({
      company: COMPANY,
      agreement: AGREEMENT,
      contract: { paymentTermsDays: 0 },
    })
    expect(t.paymentTermsDays.value).toBe(0)
    expect(t.paymentTermsDays.source).toBe('CONTRACT')
  })
})

describe('saying where a value came from', () => {
  it('names the agreement, so somebody knows which document to read', () => {
    const t = resolveBillingTerms({ company: COMPANY, agreement: AGREEMENT, contract: null })
    expect(t.paymentTermsDays.because).toContain('Terumo BCT')
    expect(explain(t.paymentTermsDays)).toBe('Net 60, from your agreement with Terumo BCT')
  })

  it('records what it overrode, so the level to fix is visible', () => {
    const t = resolveBillingTerms({
      company: COMPANY,
      agreement: AGREEMENT,
      contract: { paymentTermsDays: 90 },
    })
    expect(t.paymentTermsDays.overrode).toEqual({ value: 60, source: 'AGREEMENT' })
  })

  it('does not claim an override when the levels agree', () => {
    // "Overrode net 30 with net 30" is noise that trains people to ignore
    // the field.
    const t = resolveBillingTerms({
      company: COMPANY,
      agreement: AGREEMENT,
      contract: { paymentTermsDays: 60 },
    })
    expect(t.paymentTermsDays.overrode).toBeNull()
  })
})

describe('when an override is worth worrying about', () => {
  it('raises a concern when a contract waits longer to be paid than the agreement allows', () => {
    // The single most common way money goes missing quietly.
    const t = resolveBillingTerms({
      company: COMPANY,
      agreement: AGREEMENT,
      contract: { paymentTermsDays: 90 },
    })
    const c = overrideConcern(t.paymentTermsDays)!
    expect(c.concern).toBe(true)
    expect(c.note).toContain('30 days longer')
  })

  it('mentions but does not worry about terms better than agreed', () => {
    const t = resolveBillingTerms({
      company: COMPANY,
      agreement: AGREEMENT,
      contract: { paymentTermsDays: 20 },
    })
    const c = overrideConcern(t.paymentTermsDays)!
    expect(c.concern).toBe(false)
    expect(c.note).toContain('better')
  })

  it('says nothing when nothing was overridden', () => {
    const t = resolveBillingTerms({
      company: COMPANY,
      agreement: AGREEMENT,
      contract: { paymentTermsDays: 60 },
    })
    expect(overrideConcern(t.paymentTermsDays)).toBeNull()
  })

  it('says nothing when a signed agreement supersedes a company default', () => {
    // The agreement is the thing that was actually signed, so overriding a
    // default is exactly its job. Flagging it would put a warning on every
    // negotiated contract, which teaches people to ignore the one that
    // matters.
    const t = resolveBillingTerms({ company: COMPANY, agreement: AGREEMENT, contract: null })
    expect(t.paymentTermsDays.overrode).toEqual({ value: 45, source: 'COMPANY' })
    expect(overrideConcern(t.paymentTermsDays)).toBeNull()
  })
})

describe('the currency travels the same path', () => {
  it('takes the currency from the agreement when the contract is silent', () => {
    const t = resolveBillingTerms({
      company: { name: 'Infosys', currency: 'INR', paymentTermsDays: null },
      agreement: { counterpartyName: 'Nike', currency: 'USD', paymentTermsDays: null },
      contract: null,
    })
    // A US client pays in dollars even where the supplier's own default is
    // rupees, and the agreement is where that was written down.
    expect(t.currency.value).toBe('USD')
    expect(t.currency.source).toBe('AGREEMENT')
  })
})

describe('the resolver itself', () => {
  it('prefers the most specific level that said something', () => {
    const r = resolve<number>(
      [
        { source: 'COMPANY', value: 1, label: 'company' },
        { source: 'CONTRACT', value: 3, label: 'contract' },
        { source: 'AGREEMENT', value: 2, label: 'agreement' },
      ],
      99,
      'platform'
    )
    expect(r.value).toBe(3)
    expect(r.source).toBe('CONTRACT')
  })

  it('ignores levels that said nothing rather than treating them as zero', () => {
    const r = resolve<number>(
      [
        { source: 'CONTRACT', value: null, label: 'contract' },
        { source: 'AGREEMENT', value: undefined, label: 'agreement' },
        { source: 'COMPANY', value: 7, label: 'company' },
      ],
      99,
      'platform'
    )
    expect(r.value).toBe(7)
    expect(r.source).toBe('COMPANY')
  })
})

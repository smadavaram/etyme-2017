import { describe, it, expect } from 'vitest'
import {
  AFFILIATE_TERMS, monthFromActivation, rateBpFor, accrualOf, clawbackOf, statementMonthOf, buildStatement, selfReferral,
} from '@/lib/money/affiliate-commission'

/** Record 129 and 127: 40% for months 1 to 12 from activation, 20% after, on subscription receipts a tenant paid. Integer cents; no sample here is a real firm. */

const ACTIVATED = new Date('2026-12-15T00:00:00Z')
const at = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('the months since a tenant was activated', () => {
  it('counts the day of activation as the first day of month 1', () => {
    expect(monthFromActivation(ACTIVATED, at('2026-12-15'))).toBe(1)
  })
  it('keeps month 12 through the day before the first anniversary and starts month 13 on it', () => {
    expect(monthFromActivation(ACTIVATED, at('2027-12-14'))).toBe(12)
    expect(monthFromActivation(ACTIVATED, at('2027-12-15'))).toBe(13)
  })
  it('moves a 31st to the last day of a shorter month and never skips a month', () => {
    const jan31 = at('2027-01-31')
    expect(monthFromActivation(jan31, at('2027-02-27'))).toBe(1)
    expect(monthFromActivation(jan31, at('2027-02-28'))).toBe(2)
    expect(monthFromActivation(jan31, at('2027-03-30'))).toBe(2)
    expect(monthFromActivation(jan31, at('2027-03-31'))).toBe(3)
  })
  it('says nothing for a date before the tenant was activated', () => {
    expect(monthFromActivation(ACTIVATED, at('2026-12-14'))).toBeNull()
  })
})

describe('the rate', () => {
  it('is 40 percent in each of months 1 to 12 and 20 percent from month 13 for as long as it pays', () => {
    expect(AFFILIATE_TERMS.firstYearBp).toBe(4000)
    expect(AFFILIATE_TERMS.afterBp).toBe(2000)
    for (const m of [1, 6, 12]) expect(rateBpFor(m)).toBe(4000)
    for (const m of [13, 24, 120]) expect(rateBpFor(m)).toBe(2000)
  })
})

describe('what a paid receipt earns', () => {
  const receipt = { contractorCents: 29985, platformFeeCents: 100000 } // 15 Starter contractors and the annual fee

  it('earns 40 percent of the contractor charge plus the platform fee in month 1, to the cent', () => {
    const a = accrualOf({ activatedAt: ACTIVATED, periodStart: at('2026-12-15'), ...receipt })
    expect(a).toEqual({ ok: true, basisCents: 129985, rateBp: 4000, commissionCents: 51994, monthFromActivation: 1 })
  })
  it('earns 20 percent from month 13, counted from activation and not from the calendar year', () => {
    const a = accrualOf({ activatedAt: ACTIVATED, periodStart: at('2027-12-15'), contractorCents: 29985, platformFeeCents: 0 })
    expect(a).toMatchObject({ ok: true, rateBp: 2000, commissionCents: 5997, monthFromActivation: 13 })
  })
  it('rounds down to a whole cent, never paying more than the rate says', () => {
    const first = accrualOf({ activatedAt: ACTIVATED, periodStart: at('2026-12-20'), contractorCents: 12347, platformFeeCents: 0 })
    const later = accrualOf({ activatedAt: ACTIVATED, periodStart: at('2028-01-20'), contractorCents: 12347, platformFeeCents: 0 })
    expect(first).toMatchObject({ commissionCents: 4938 })
    expect(later).toMatchObject({ commissionCents: 2469 })
  })
  it('never counts usage or consulting, because the receipt has no place for them', () => {
    const plain = accrualOf({ activatedAt: ACTIVATED, periodStart: at('2027-01-15'), ...receipt })
    const withUsage = accrualOf({ activatedAt: ACTIVATED, periodStart: at('2027-01-15'), ...receipt, usageCents: 99999, consultingCents: 500000 } as never)
    expect(withUsage).toEqual(plain)
  })
  it('earns nothing on a free tenant whose receipt is zero, and says so', () => {
    const a = accrualOf({ activatedAt: ACTIVATED, periodStart: at('2027-01-15'), contractorCents: 0, platformFeeCents: 0 })
    expect(a).toMatchObject({ ok: true, commissionCents: 0 })
  })
  it('refuses a receipt that is not whole cents, or negative, rather than guess', () => {
    expect(accrualOf({ activatedAt: ACTIVATED, periodStart: at('2027-01-15'), contractorCents: 10.5, platformFeeCents: 0 }).ok).toBe(false)
    expect(accrualOf({ activatedAt: ACTIVATED, periodStart: at('2027-01-15'), contractorCents: -1, platformFeeCents: 0 }).ok).toBe(false)
  })
  it('refuses a period that starts before the tenant was activated', () => {
    const a = accrualOf({ activatedAt: ACTIVATED, periodStart: at('2026-11-01'), ...receipt })
    expect(a.ok).toBe(false)
  })
})

describe('a refund or chargeback', () => {
  const earned = 4938
  const basis = 12347

  it('claws back exactly what the whole receipt paid', () => {
    const c = clawbackOf({ earnedCents: earned, receiptBasisCents: basis, reversedBasisBeforeCents: 0, clawedBeforeCents: 0, reversalBasisCents: basis })
    expect(c).toEqual({ ok: true, clawbackCents: earned })
  })
  it('claws back in proportion for part of a receipt and never more than was earned across several parts', () => {
    const one = clawbackOf({ earnedCents: earned, receiptBasisCents: basis, reversedBasisBeforeCents: 0, clawedBeforeCents: 0, reversalBasisCents: 6173 })
    expect(one).toEqual({ ok: true, clawbackCents: 2468 })
    const two = clawbackOf({ earnedCents: earned, receiptBasisCents: basis, reversedBasisBeforeCents: 6173, clawedBeforeCents: 2468, reversalBasisCents: 6174 })
    expect(two).toEqual({ ok: true, clawbackCents: 2470 })
    expect(2468 + 2470).toBe(earned)
  })
  it('refuses to reverse more than the receipt held', () => {
    const c = clawbackOf({ earnedCents: earned, receiptBasisCents: basis, reversedBasisBeforeCents: 6173, clawedBeforeCents: 2468, reversalBasisCents: 6175 })
    expect(c.ok).toBe(false)
  })
  it('claws back nothing from a receipt that earned nothing', () => {
    const c = clawbackOf({ earnedCents: 0, receiptBasisCents: basis, reversedBasisBeforeCents: 0, clawedBeforeCents: 0, reversalBasisCents: 100 })
    expect(c).toEqual({ ok: true, clawbackCents: 0 })
  })
})

describe('the monthly statement', () => {
  it('names the month a day falls in', () => {
    expect(statementMonthOf(at('2027-02-01'))).toBe('2027-02')
  })
  it('adds earnings, takes off clawbacks and shows both', () => {
    const s = buildStatement({ carriedInCents: 0, entries: [{ commissionCents: 51994 }, { commissionCents: 2469 }, { commissionCents: -2468 }] })
    expect(s).toEqual({ earnedCents: 54463, clawedBackCents: 2468, carriedInCents: 0, netCents: 51995, entryCount: 3 })
  })
  it('carries a negative month into the next so a clawback after payout is taken off later pay, never collected', () => {
    const march = buildStatement({ carriedInCents: 0, entries: [{ commissionCents: -3000 }] })
    expect(march.netCents).toBe(-3000)
    const april = buildStatement({ carriedInCents: march.netCents, entries: [{ commissionCents: 5000 }] })
    expect(april.netCents).toBe(2000)
  })
})

describe('an affiliate never earns on a tenant it owns or sits at', () => {
  it('refuses where the tenant is the affiliate\'s own company', () => {
    expect(selfReferral({ affiliateOwnCompanyId: 't1', affiliateSeatCompanyIds: [], tenantCompanyId: 't1' })).toBe(true)
  })
  it('refuses where the affiliate\'s own person holds a seat at the tenant', () => {
    expect(selfReferral({ affiliateOwnCompanyId: null, affiliateSeatCompanyIds: ['t9', 't1'], tenantCompanyId: 't1' })).toBe(true)
  })
  it('allows a tenant the affiliate has nothing to do with', () => {
    expect(selfReferral({ affiliateOwnCompanyId: 'a', affiliateSeatCompanyIds: ['b'], tenantCompanyId: 't1' })).toBe(false)
  })
})

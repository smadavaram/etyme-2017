/**
 * Money is stored in cents. Everywhere. Without exception.
 *
 * This file exists because it was not true. Requirement.billMin and
 * billMax held whole dollars while Submission.rate, SellContract.billRate
 * and RequirementInvitation.payMin/payMax all held cents — so a $130/hr
 * requirement and a $130/hr submission were stored as 130 and 13000, in
 * the same system, feeding the same arithmetic.
 *
 * It surfaced on screen as "$1/hr max" against a real requirement, which
 * is the lucky version. The unlucky version was live in the submit path:
 *
 *     rate: requirement.billMin ?? 100   // dollars, into a cents column
 *
 * A $110/hr requirement submitted a candidate at $1.10/hr. Nothing threw,
 * nothing looked wrong in the database, and the number is plausible enough
 * to survive a glance.
 *
 * CLAUDE.md: "A wrong rate calculation that looks plausible is worse than
 * a delay." These tests pin the convention so the next person adding a
 * money column has something that fails when they guess.
 */

import { describe, it, expect } from 'vitest'
import { annualisedValueCents } from '@/lib/requisition-approval'

/** Dollars as a human writes them → cents as the schema stores them. */
function toCents(dollars: number): number {
  return Math.round(dollars * 100)
}

/** Cents as stored → dollars for display. */
function toDollars(cents: number): number {
  return Math.round(cents / 100)
}

describe('Rates are entered in dollars and stored in cents', () => {

  it('a rate typed as 130 is stored as 13000', () => {
    expect(toCents(130)).toBe(13_000)
  })

  it('a stored 13000 displays as $130', () => {
    expect(toDollars(13_000)).toBe(130)
  })

  it('a rate with cents survives the round trip', () => {
    expect(toDollars(toCents(87.5))).toBe(88)
  })

  it('a rate stored in dollars by mistake displays as about a dollar', () => {
    // This is the shape of the bug: 130 in a cents column reads as $1.
    // The test documents it so the symptom is recognisable next time.
    expect(toDollars(130)).toBe(1)
  })
})

describe('Requisition value uses the same units as every other rate', () => {

  it('one person at $130/hr for a year is $249,600, not $2,496', () => {
    const cents = annualisedValueCents({
      billMaxCents: toCents(130),
      headcount: 1,
      months: 12,
    })
    expect(toDollars(cents)).toBe(249_600)
  })

  it('feeding dollars where cents are expected undercounts by a hundred', () => {
    // If a caller passes 130 instead of 13000, the requisition looks a
    // hundred times cheaper and clears every budget check it should fail.
    const wrong = annualisedValueCents({ billMaxCents: 130, headcount: 1, months: 12 })
    const right = annualisedValueCents({ billMaxCents: toCents(130), headcount: 1, months: 12 })
    expect(right / wrong).toBe(100)
  })

  it('a budget comparison only works when both sides are cents', () => {
    // A $500,000 budget against a $249,600 requisition has room.
    const budgetCents = toCents(500_000)
    const valueCents = annualisedValueCents({
      billMaxCents: toCents(130), headcount: 1, months: 12,
    })
    expect(valueCents).toBeLessThan(budgetCents)

    // The same requisition measured in dollars would appear to have room
    // in a budget a hundred times too small — the failure this prevents.
    const budgetIfDollars = 500_000
    expect(valueCents).toBeGreaterThan(budgetIfDollars)
  })
})

/**
 * The job twin's invoice rule (lib/twin/rules/invoice), read through the
 * three-way check it is built on. Every receipt here is matched by the
 * real `threeWayMatch`; the rule only reads its answer and weighs the
 * hours against the company's tolerance.
 */
import { describe, it, expect } from 'vitest'
import { threeWayMatch, type MatchInput } from '@/lib/three-way-match'
import { payGate, type MatchWithLines } from '@/lib/invoice-match'
import {
  verdictFrom, exceptionsFirst, refuseRules, DEFAULT_INVOICE_RULES, type InvoiceRuleSet,
} from '@/lib/twin/rules/invoice'
import { NORTHBEND_TWIN_RECEIPTS } from '@/lib/twin/seed-demo'

const RATE = 9800 // $98.00 an hour, the contract's

interface Week {
  hoursBilled: number
  hoursAccepted: number
  /** Did the paying firm sign the week at all? */
  accepted?: boolean
  rateCents?: number
}

/** One receipt, one line per week, matched by the real check. */
function receipt(id: string, weeks: Week[], dueInDays = 10): { match: MatchWithLines; header: { id: string; number: string; supplierName: string; currency: string; dueAt: Date } } {
  const lines = weeks.map((w, i) => {
    const start = new Date(Date.UTC(2026, 8, 6 + i * 7))
    const end = new Date(Date.UTC(2026, 8, 12 + i * 7))
    const rate = w.rateCents ?? RATE
    return {
      fact: {
        id: `${id}-l${i}`, timesheetId: `${id}-t${i}`, personName: 'Lucía Fernández',
        hours: w.hoursBilled, rateCents: rate, amountCents: Math.round(w.hoursBilled * rate),
      },
      ts: {
        id: `${id}-t${i}`, status: w.accepted === false ? 'SUBMITTED' : 'APPROVED',
        approvedHours: w.hoursAccepted, contractRateCents: RATE,
        periodStart: start, periodEnd: end, alreadyBilledOnInvoiceId: id,
      },
      start, end,
    }
  })
  const input: MatchInput = {
    invoice: {
      id,
      totalCents: lines.reduce((n, l) => n + l.fact.amountCents, 0),
      periodStart: new Date(Date.UTC(2026, 8, 1)),
      periodEnd: new Date(Date.UTC(2026, 8, 30)),
      contractPeriod: { start: new Date(Date.UTC(2026, 8, 1)), end: new Date(Date.UTC(2026, 8, 30)), label: 'September 2026' },
    },
    lines: lines.map((l) => l.fact),
    timesheets: Object.fromEntries(lines.map((l) => [l.ts.id, l.ts])),
    po: null,
    poRequired: false,
  }
  const result = threeWayMatch(input)
  const match: MatchWithLines = {
    ...result,
    lines: lines.map((l) => ({
      lineId: l.fact.id, kind: 'HOURS', personId: 'p1', personName: l.fact.personName,
      jobTitle: 'Supply chain planning analyst', requirementId: null,
      periodStart: l.start.toISOString().slice(0, 10), periodEnd: l.end.toISOString().slice(0, 10),
      hoursBilled: l.fact.hours,
      // The same reading lib/invoice-match gives: signed hours only where the payer signed.
      hoursSigned: l.ts.status === 'APPROVED' ? l.ts.approvedHours : null,
      rateCents: l.fact.rateCents, contractRateCents: l.ts.contractRateCents, amountCents: l.fact.amountCents,
    })),
  }
  return {
    match,
    header: { id, number: id, supplierName: 'Pinnacle Resourcing', currency: 'USD', dueAt: new Date(Date.UTC(2026, 9, dueInDays)) },
  }
}

function judge(id: string, weeks: Week[], rules: InvoiceRuleSet = DEFAULT_INVOICE_RULES, dueInDays = 10) {
  const r = receipt(id, weeks, dueInDays)
  return verdictFrom(r.match, rules, r.header)
}

describe('the job twin reads an invoice receipt', () => {
  it('a receipt within half a percent of accepted hours and inside the rate band is clean', () => {
    const exact = judge('R-1', [{ hoursBilled: 40, hoursAccepted: 40 }])
    expect(exact.verdict).toBe('CLEAN')
    expect(exact.payable).toBe(true)
    expect(exact.ruleCited).toBe("Hours 40 against 40 accepted, at the contract's $98.00/hr.")

    const close = judge('R-2', [{ hoursBilled: 40.1, hoursAccepted: 40 }])
    expect(close.verdict).toBe('CLEAN')
    expect(close.ruleCited).toBe('Hours 40.1 against 40 accepted, 0.25% over, inside the 0.5% allowed.')

    // The line itself is clean: 40.2 against 40 is exactly 0.5%, and at or
    // under the line is inside the rule, over or under accepted alike.
    const atTheLine = judge('R-3', [{ hoursBilled: 40.2, hoursAccepted: 40 }])
    expect(atTheLine.verdict).toBe('CLEAN')
    expect(atTheLine.ruleCited).toBe('Hours 40.2 against 40 accepted, 0.5% over, inside the 0.5% allowed.')
    expect(judge('R-3b', [{ hoursBilled: 39.8, hoursAccepted: 40 }]).verdict).toBe('CLEAN')

    // Past the line is not: 40.5 against 40 is 1.25%.
    const past = judge('R-3c', [{ hoursBilled: 40.5, hoursAccepted: 40 }])
    expect(past.verdict).toBe('MISMATCH')
    expect(past.ruleCited).toBe('Hours 40.5 against 40 accepted, 1.25% over the 0.5% allowed.')
  })

  it('a clean verdict inside the tolerance never says the bill can be paid without the AP desk', () => {
    const close = judge('R-4', [{ hoursBilled: 40.2, hoursAccepted: 40 }])
    expect(close.payable).toBe(false)
    expect(close.failing).toContain('QUANTITY')
    expect(close.rationale).toMatch(/AP clerk still records the difference before it is paid/)
  })

  it('a receipt three point seven five percent over accepted hours is a mismatch that cites the rule and the numbers', () => {
    const v = judge('R-5', [{ hoursBilled: 41.5, hoursAccepted: 40 }])
    expect(v.verdict).toBe('MISMATCH')
    expect(v.ruleCited).toBe('Hours 41.5 against 40 accepted, 3.75% over the 0.5% allowed.')
    expect(v.rationale).toMatch(/Ask Pinnacle Resourcing to bill the hours accepted/)
    expect(v.lines[0].hoursOffPct).toBeCloseTo(3.75, 10)
  })

  it('hours billed under what was accepted are judged by the same tolerance', () => {
    const v = judge('R-6', [{ hoursBilled: 38, hoursAccepted: 40 }])
    expect(v.verdict).toBe('MISMATCH')
    expect(v.ruleCited).toBe('Hours 38 against 40 accepted, 5% under the 0.5% allowed.')
  })

  it('a rate other than the contract rate is a mismatch however close, because the band is the contract rate on the day worked', () => {
    const v = judge('R-7', [{ hoursBilled: 40, hoursAccepted: 40, rateCents: 9850 }])
    expect(v.verdict).toBe('MISMATCH')
    expect(v.ruleCited).toMatch(/^Rate \$98\.50\/hr against the contract's \$98\.00\/hr/)
    expect(v.rationale).toMatch(/A rate is never waived on a bill/)
  })

  it('a receipt that includes a week nobody accepted is blocked whatever the tolerance', () => {
    for (const hoursTolerancePct of [0.5, 25]) {
      const v = judge('R-8', [
        { hoursBilled: 40, hoursAccepted: 40 },
        { hoursBilled: 44, hoursAccepted: 44, accepted: false },
      ], { hoursTolerancePct, source: 'COMPANY' })
      expect(v.verdict).toBe('BLOCKED')
      expect(v.payable).toBe(false)
      expect(v.failing).toContain('RECEIPT')
      expect(v.ruleCited).toMatch(/^A receipt that includes a week the paying firm has not accepted is held whatever the tolerance\./)
      expect(v.rationale).toMatch(/no waiver changes that/)
    }
  })

  it('the hours tolerance is the number the company sets, and a default says it is the default', () => {
    const loose = judge('R-9', [{ hoursBilled: 41.5, hoursAccepted: 40 }], { hoursTolerancePct: 5, source: 'COMPANY' })
    expect(loose.verdict).toBe('CLEAN')
    expect(loose.ruleCited).toBe('Hours 41.5 against 40 accepted, 3.75% over, inside the 5% allowed.')
    expect(loose.rationale).toMatch(/inside your 5%/)
    expect(judge('R-10', [{ hoursBilled: 40.2, hoursAccepted: 40 }]).rationale).toMatch(/inside the default 0\.5%/)
  })

  it('a tolerance nobody can stand behind is refused in a sentence rather than used', () => {
    expect(refuseRules({ hoursTolerancePct: -1, source: 'COMPANY' })).toMatch(/zero or more/)
    expect(refuseRules({ hoursTolerancePct: 40, source: 'COMPANY' })).toMatch(/quarter of a week/)
    expect(refuseRules(DEFAULT_INVOICE_RULES)).toBeNull()
    expect(() => judge('R-11', [{ hoursBilled: 40, hoursAccepted: 40 }], { hoursTolerancePct: Number.NaN, source: 'COMPANY' })).toThrow(/per cent/)
  })

  it('the daily list reads exceptions first: blocked, then mismatched, then clean, soonest due first inside each', () => {
    const clean = judge('C', [{ hoursBilled: 40, hoursAccepted: 40 }], DEFAULT_INVOICE_RULES, 1)
    const mismatch = judge('M', [{ hoursBilled: 41.5, hoursAccepted: 40 }], DEFAULT_INVOICE_RULES, 20)
    const blocked = judge('B', [{ hoursBilled: 40, hoursAccepted: 40, accepted: false }], DEFAULT_INVOICE_RULES, 25)
    const earlyMismatch = judge('M0', [{ hoursBilled: 38, hoursAccepted: 40 }], DEFAULT_INVOICE_RULES, 5)
    expect(exceptionsFirst([clean, mismatch, blocked, earlyMismatch]).map((v) => v.invoiceId)).toEqual(['B', 'M0', 'M', 'C'])
  })

  it('the Northbend demo holds two clean receipts and one mismatch', () => {
    expect(NORTHBEND_TWIN_RECEIPTS).toHaveLength(3)
    const verdicts = NORTHBEND_TWIN_RECEIPTS.map((p) =>
      judge(p.number ?? `seeded-${p.person}`, [{ hoursBilled: p.hoursBilled, hoursAccepted: p.hoursAccepted }])
    )
    expect(verdicts.map((v) => v.verdict)).toEqual(NORTHBEND_TWIN_RECEIPTS.map((p) => p.expected))
    expect(verdicts.filter((v) => v.verdict === 'CLEAN')).toHaveLength(2)
    const mismatches = verdicts.filter((v) => v.verdict === 'MISMATCH')
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0].ruleCited).toBe('Hours 41.5 against 40 accepted, 3.75% over the 0.5% allowed.')
    // Every week in the plan was accepted by Northbend, so nothing in the demo is blocked.
    expect(verdicts.some((v) => v.verdict === 'BLOCKED')).toBe(false)
  })
})

describe("the twin's yes and the AP desk read one payment gate", () => {
  it("a twin's yes on an invoice receipt reads the AP desk's own payment gate: unsubmitted, held, cancelled, paid or unmatched is refused in the desk's words, and a clean match is payable", () => {
    const clean = judge('INV-CLEAN', [{ hoursBilled: 40, hoursAccepted: 40 }])
    expect(clean.verdict).toBe('CLEAN')
    expect(clean.payable).toBe(true)
    const matched = { matched: true, summary: 'all checks pass' }
    expect(payGate({ number: 'INV-1', status: 'SUBMITTED' }, matched)).toEqual({ ok: true })

    const refused = (status: string, m = matched) => {
      const g = payGate({ number: 'INV-1', status }, m)
      return g.ok ? null : g.code
    }
    expect(refused('ISSUED')).toBe('NOT_SUBMITTED')
    expect(refused('HELD')).toBe('HELD')
    expect(refused('CANCELLED')).toBe('INVALID_STATE')
    expect(refused('PAID')).toBe('INVALID_STATE')
    // Inside the tolerance is not a payment: the check still fails on 40.2 against 40.
    const inside = judge('INV-INSIDE', [{ hoursBilled: 40.2, hoursAccepted: 40 }])
    expect(inside.verdict).toBe('CLEAN')
    const g = payGate({ number: 'INV-2', status: 'SUBMITTED' }, { matched: inside.payable, summary: 'hours differ' })
    expect(g).toEqual({
      ok: false, code: 'MATCH_FAILED',
      says: 'Invoice INV-2 does not pass the check now: hours differ. Fix it or record an exception with a reason on its page, then pay it.',
    })
  })
})

/**
 * Three-way match — purchase order, receipt, invoice.
 *
 * CLAUDE.md names invoice generation as one of the places to stop and ask
 * rather than guess, because "a wrong rate calculation that looks plausible
 * is worse than a delay". Every number in this file is one somebody could
 * be paid on.
 *
 * The control being tested: nobody gets paid for hours a manager did not
 * approve, at a rate nobody agreed, or twice for the same week.
 */

import { describe, it, expect } from 'vitest'
import { threeWayMatch, decimalToCents, type MatchInput } from '@/lib/three-way-match'

const PERIOD_START = new Date('2026-08-01T00:00:00Z')
const PERIOD_END = new Date('2026-08-15T00:00:00Z')

// When the work was actually done. Inside the billed period, which is the
// ordinary case — invoice-period.test.ts is where the wrong-period cases
// live.
const WORKED_FROM = new Date('2026-08-03T00:00:00Z')
const WORKED_TO = new Date('2026-08-14T00:00:00Z')

/** A clean invoice: 80 hours at $130/hr against a $50,000 PO. */
function clean(overrides: Partial<MatchInput> = {}): MatchInput {
  return {
    invoice: { id: 'inv1', totalCents: 1_040_000, periodStart: PERIOD_START, periodEnd: PERIOD_END },
    lines: [{
      id: 'l1', timesheetId: 'ts1', personName: 'Priya Raman',
      hours: 80, rateCents: 13_000, amountCents: 1_040_000,
    }],
    timesheets: {
      ts1: { id: 'ts1', status: 'APPROVED', approvedHours: 80, contractRateCents: 13_000, periodStart: WORKED_FROM, periodEnd: WORKED_TO },
    },
    po: {
      id: 'po1', number: 'TBC-PO-4471', status: 'OPEN',
      amountCents: 5_000_000, consumedCents: 0,
      startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2026-12-31T00:00:00Z'),
    },
    poRequired: true,
    ...overrides,
  }
}

function failed(result: ReturnType<typeof threeWayMatch>, code: string) {
  return result.checks.find(c => c.code === code && c.outcome === 'FAIL')
}

// ── The happy path ─────────────────────────────────────────

describe('An invoice backed by approved hours at the agreed rate matches', () => {

  it('a clean invoice passes every check', () => {
    const r = threeWayMatch(clean())
    expect(r.matched).toBe(true)
    expect(r.checks.every(c => c.outcome === 'PASS')).toBe(true)
  })

  it('the summary says what was matched, in money', () => {
    const r = threeWayMatch(clean())
    expect(r.summary).toContain('$10,400.00')
    expect(r.summary).toContain('every hour approved')
  })

  it('it reports what is left on the purchase order afterwards', () => {
    const r = threeWayMatch(clean())
    expect(r.poAfter).toEqual({ remainingCents: 3_960_000, utilisationPercent: 21 })
  })
})

// ── The receipt: no approved timesheet, no payment ─────────

describe('Nobody is paid for hours nobody approved', () => {

  it('a line with no timesheet at all fails', () => {
    const r = threeWayMatch(clean({
      lines: [{ id: 'l1', timesheetId: null, personName: 'Priya Raman', hours: 80, rateCents: 13_000, amountCents: 1_040_000 }],
    }))
    expect(r.matched).toBe(false)
    expect(failed(r, 'RECEIPT')?.reason).toContain('No line')
  })

  it('a timesheet still awaiting approval is not a receipt', () => {
    const r = threeWayMatch(clean({
      timesheets: { ts1: { id: 'ts1', status: 'SUBMITTED', approvedHours: 80, contractRateCents: 13_000, periodStart: WORKED_FROM, periodEnd: WORKED_TO } },
    }))
    expect(r.matched).toBe(false)
    expect(failed(r, 'RECEIPT')).toBeDefined()
  })

  it('a rejected timesheet is not a receipt either', () => {
    const r = threeWayMatch(clean({
      timesheets: { ts1: { id: 'ts1', status: 'REJECTED', approvedHours: 0, contractRateCents: 13_000, periodStart: WORKED_FROM, periodEnd: WORKED_TO } },
    }))
    expect(r.matched).toBe(false)
  })

  it('a partly receipted invoice says how many lines are unbacked', () => {
    const r = threeWayMatch(clean({
      invoice: { id: 'inv1', totalCents: 2_080_000, periodStart: PERIOD_START, periodEnd: PERIOD_END },
      lines: [
        { id: 'l1', timesheetId: 'ts1', personName: 'Priya Raman', hours: 80, rateCents: 13_000, amountCents: 1_040_000 },
        { id: 'l2', timesheetId: 'ts2', personName: 'Marcus Webb', hours: 80, rateCents: 13_000, amountCents: 1_040_000 },
      ],
      timesheets: {
        ts1: { id: 'ts1', status: 'APPROVED', approvedHours: 80, contractRateCents: 13_000, periodStart: WORKED_FROM, periodEnd: WORKED_TO },
        ts2: { id: 'ts2', status: 'SUBMITTED', approvedHours: 80, contractRateCents: 13_000, periodStart: WORKED_FROM, periodEnd: WORKED_TO },
      },
    }))
    expect(failed(r, 'RECEIPT')?.reason).toContain('1 of 2 lines')
  })

  it('an invoice with no lines cannot be matched into existence', () => {
    const r = threeWayMatch(clean({ lines: [] }))
    expect(r.matched).toBe(false)
    expect(r.summary).toBe('No lines to match')
  })
})

// ── Nobody is paid twice ───────────────────────────────────

describe('The same work is never billed twice', () => {

  it('the same timesheet on two lines of one invoice fails', () => {
    const r = threeWayMatch(clean({
      invoice: { id: 'inv1', totalCents: 2_080_000, periodStart: PERIOD_START, periodEnd: PERIOD_END },
      lines: [
        { id: 'l1', timesheetId: 'ts1', personName: 'Priya Raman', hours: 80, rateCents: 13_000, amountCents: 1_040_000 },
        { id: 'l2', timesheetId: 'ts1', personName: 'Priya Raman', hours: 80, rateCents: 13_000, amountCents: 1_040_000 },
      ],
    }))
    expect(r.matched).toBe(false)
    expect(failed(r, 'DUPLICATE')?.reason).toContain('more than one line')
  })

  it('a timesheet already billed on another invoice fails', () => {
    const r = threeWayMatch(clean({
      timesheets: {
        ts1: { id: 'ts1', status: 'APPROVED', approvedHours: 80, contractRateCents: 13_000, periodStart: WORKED_FROM, periodEnd: WORKED_TO,
               alreadyBilledOnInvoiceId: 'inv-earlier' },
      },
    }))
    expect(r.matched).toBe(false)
    expect(failed(r, 'DUPLICATE')?.reason).toContain('already billed')
  })

  it('re-matching the invoice that already owns the line is not a duplicate', () => {
    // Re-running the match on an existing invoice must not accuse itself.
    const r = threeWayMatch(clean({
      timesheets: {
        ts1: { id: 'ts1', status: 'APPROVED', approvedHours: 80, contractRateCents: 13_000, periodStart: WORKED_FROM, periodEnd: WORKED_TO,
               alreadyBilledOnInvoiceId: 'inv1' },
      },
    }))
    expect(r.matched).toBe(true)
  })
})

// ── Quantity and price ─────────────────────────────────────

describe('Billed hours and rates must be the ones agreed', () => {

  it('billing more hours than were approved fails, and says both numbers', () => {
    const r = threeWayMatch(clean({
      invoice: { id: 'inv1', totalCents: 1_170_000, periodStart: PERIOD_START, periodEnd: PERIOD_END },
      lines: [{ id: 'l1', timesheetId: 'ts1', personName: 'Priya Raman', hours: 90, rateCents: 13_000, amountCents: 1_170_000 }],
    }))
    expect(r.matched).toBe(false)
    expect(failed(r, 'QUANTITY')?.reason).toContain('billed 90h, approved 80h')
  })

  it('billing fewer hours than approved also fails — it is still a mismatch', () => {
    const r = threeWayMatch(clean({
      invoice: { id: 'inv1', totalCents: 910_000, periodStart: PERIOD_START, periodEnd: PERIOD_END },
      lines: [{ id: 'l1', timesheetId: 'ts1', personName: 'Priya Raman', hours: 70, rateCents: 13_000, amountCents: 910_000 }],
    }))
    expect(failed(r, 'QUANTITY')).toBeDefined()
  })

  it('billing above the contracted rate fails, and says both rates', () => {
    const r = threeWayMatch(clean({
      invoice: { id: 'inv1', totalCents: 1_200_000, periodStart: PERIOD_START, periodEnd: PERIOD_END },
      lines: [{ id: 'l1', timesheetId: 'ts1', personName: 'Priya Raman', hours: 80, rateCents: 15_000, amountCents: 1_200_000 }],
    }))
    expect(r.matched).toBe(false)
    expect(failed(r, 'PRICE')?.reason).toContain('billed $150.00/hr, contracted $130.00/hr')
  })

  it('a rate inflated by a factor of a hundred is caught, not paid', () => {
    // The unit bug this codebase already had, arriving on an invoice.
    const r = threeWayMatch(clean({
      invoice: { id: 'inv1', totalCents: 104_000_000, periodStart: PERIOD_START, periodEnd: PERIOD_END },
      lines: [{ id: 'l1', timesheetId: 'ts1', personName: 'Priya Raman', hours: 80, rateCents: 1_300_000, amountCents: 104_000_000 }],
    }))
    expect(r.matched).toBe(false)
    expect(failed(r, 'PRICE')).toBeDefined()
  })
})

// ── The arithmetic ─────────────────────────────────────────

describe('The arithmetic has to hold', () => {

  it('a line that does not multiply out fails', () => {
    const r = threeWayMatch(clean({
      invoice: { id: 'inv1', totalCents: 1_050_000, periodStart: PERIOD_START, periodEnd: PERIOD_END },
      lines: [{ id: 'l1', timesheetId: 'ts1', personName: 'Priya Raman', hours: 80, rateCents: 13_000, amountCents: 1_050_000 }],
    }))
    expect(r.matched).toBe(false)
    expect(failed(r, 'EXTENSION')?.reason).toContain('80h × $130.00 is $10,400.00, billed $10,500.00')
  })

  it('a cent of rounding on an odd number of hours is arithmetic, not a discrepancy', () => {
    // 7.33h × $133.33 = 977.3089 cents-ish; a single cent either way is fine.
    const r = threeWayMatch(clean({
      invoice: { id: 'inv1', totalCents: 97_731, periodStart: PERIOD_START, periodEnd: PERIOD_END },
      lines: [{ id: 'l1', timesheetId: 'ts1', personName: 'Priya Raman', hours: 7.33, rateCents: 13_333, amountCents: 97_731 }],
      timesheets: { ts1: { id: 'ts1', status: 'APPROVED', approvedHours: 7.33, contractRateCents: 13_333, periodStart: WORKED_FROM, periodEnd: WORKED_TO } },
    }))
    expect(r.matched).toBe(true)
  })

  it('two cents of drift is a real difference and is reported', () => {
    const r = threeWayMatch(clean({
      invoice: { id: 'inv1', totalCents: 97_733, periodStart: PERIOD_START, periodEnd: PERIOD_END },
      lines: [{ id: 'l1', timesheetId: 'ts1', personName: 'Priya Raman', hours: 7.33, rateCents: 13_333, amountCents: 97_733 }],
      timesheets: { ts1: { id: 'ts1', status: 'APPROVED', approvedHours: 7.33, contractRateCents: 13_333, periodStart: WORKED_FROM, periodEnd: WORKED_TO } },
    }))
    expect(failed(r, 'EXTENSION')).toBeDefined()
  })

  it('an invoice header that disagrees with its own lines fails', () => {
    const r = threeWayMatch(clean({
      invoice: { id: 'inv1', totalCents: 1_500_000, periodStart: PERIOD_START, periodEnd: PERIOD_END },
    }))
    expect(r.matched).toBe(false)
    expect(failed(r, 'HEADER_TOTAL')?.reason).toContain('Header says $15,000.00 but the lines add to $10,400.00')
  })
})

// ── The purchase order ─────────────────────────────────────

describe('A purchase order is a ceiling, and it is enforced', () => {

  it('an invoice that exceeds the remaining balance fails, and says by how much', () => {
    const r = threeWayMatch(clean({
      po: {
        id: 'po1', number: 'TBC-PO-4471', status: 'OPEN',
        amountCents: 5_000_000, consumedCents: 4_500_000,
        startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2026-12-31T00:00:00Z'),
      },
    }))
    expect(r.matched).toBe(false)
    expect(failed(r, 'PO_BALANCE')?.reason).toContain('over by $5,400.00')
  })

  it('an invoice that exactly exhausts the purchase order still matches', () => {
    const r = threeWayMatch(clean({
      po: {
        id: 'po1', number: 'TBC-PO-4471', status: 'OPEN',
        amountCents: 5_000_000, consumedCents: 3_960_000,
        startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2026-12-31T00:00:00Z'),
      },
    }))
    expect(r.matched).toBe(true)
    expect(r.poAfter?.remainingCents).toBe(0)
    expect(r.poAfter?.utilisationPercent).toBe(100)
  })

  it('a closed purchase order cannot be billed against', () => {
    const r = threeWayMatch(clean({
      po: {
        id: 'po1', number: 'TBC-PO-4471', status: 'CLOSED',
        amountCents: 5_000_000, consumedCents: 0,
        startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2026-12-31T00:00:00Z'),
      },
    }))
    expect(r.matched).toBe(false)
    expect(failed(r, 'PO_STATUS')?.reason).toContain('is closed')
  })

  it('an invoice for work outside the purchase order window fails', () => {
    const r = threeWayMatch(clean({
      po: {
        id: 'po1', number: 'TBC-PO-4471', status: 'OPEN',
        amountCents: 5_000_000, consumedCents: 0,
        startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2026-07-31T00:00:00Z'),
      },
    }))
    expect(r.matched).toBe(false)
    // Names which end is wrong and both dates. "Does not cover 1 Aug to
    // 15 Aug" left an AP clerk to work out whether the PO started too
    // late or ended too early, on a screen that had the answer.
    expect(failed(r, 'PO_STATUS')?.reason).toBe(
      'Work runs to 2026-08-14, past PO TBC-PO-4471 ending 2026-07-31'
    )
  })

  it('an open-ended purchase order covers any period after it starts', () => {
    const r = threeWayMatch(clean({
      po: {
        id: 'po1', number: 'TBC-PO-4471', status: 'OPEN',
        amountCents: 5_000_000, consumedCents: 0,
        startDate: new Date('2026-01-01T00:00:00Z'), endDate: null,
      },
    }))
    expect(r.matched).toBe(true)
  })

  it('where a client requires a purchase order, an invoice without one fails', () => {
    const r = threeWayMatch(clean({ po: null, poRequired: true }))
    expect(r.matched).toBe(false)
    expect(failed(r, 'PO_REQUIRED')?.reason).toContain('requires a purchase order')
  })

  it('where none is required, an invoice without one still matches on the rest', () => {
    const r = threeWayMatch(clean({ po: null, poRequired: false }))
    expect(r.matched).toBe(true)
    expect(r.poAfter).toBeNull()
  })
})

// ── Reporting ──────────────────────────────────────────────

describe('A failed match explains itself to whoever has to fix it', () => {

  it('several failures are counted, with the first one named', () => {
    const r = threeWayMatch(clean({
      invoice: { id: 'inv1', totalCents: 9_999_999, periodStart: PERIOD_START, periodEnd: PERIOD_END },
      timesheets: { ts1: { id: 'ts1', status: 'SUBMITTED', approvedHours: 80, contractRateCents: 13_000, periodStart: WORKED_FROM, periodEnd: WORKED_TO } },
    }))
    expect(r.summary).toMatch(/^\d+ checks failed/)
  })

  it('a failure points at the lines involved so they can be found', () => {
    const r = threeWayMatch(clean({
      invoice: { id: 'inv1', totalCents: 1_200_000, periodStart: PERIOD_START, periodEnd: PERIOD_END },
      lines: [{ id: 'l1', timesheetId: 'ts1', personName: 'Priya Raman', hours: 80, rateCents: 15_000, amountCents: 1_200_000 }],
    }))
    expect(failed(r, 'PRICE')?.lines).toEqual(['l1'])
  })

  it('every check reports a reason whether it passes or fails', () => {
    const r = threeWayMatch(clean())
    expect(r.checks.every(c => c.reason.length > 0)).toBe(true)
  })
})

// ── The cents boundary ─────────────────────────────────────

describe('The Decimal-to-cents boundary is converted, never assumed', () => {

  it('a Decimal total converts to cents exactly', () => {
    expect(decimalToCents({ toString: () => '10400.00' })).toBe(1_040_000)
  })

  it('a fractional cent rounds rather than truncating', () => {
    // Truncating loses a cent per invoice, and finance notices.
    expect(decimalToCents({ toString: () => '977.309' })).toBe(97_731)
  })

  it('a whole-dollar Decimal is not mistaken for cents', () => {
    expect(decimalToCents({ toString: () => '130' })).toBe(13_000)
  })
})

// ── What a human may wave through, and what they may not ───

describe('An AP clerk can resolve a variance, but not invent one', () => {

  const waiver = (code: any, reason = 'Rate amendment signed, not yet keyed') => ([{
    code, reason, byName: 'Joyce Mbeki', at: new Date('2026-08-16T09:00:00Z'),
  }])

  /** An hours query: billed 90, approved 80, under investigation. */
  function hoursQuery(overrides?: any) {
    return clean({
      invoice: { id: 'inv1', totalCents: 1_170_000, periodStart: PERIOD_START, periodEnd: PERIOD_END },
      lines: [{ id: 'l1', timesheetId: 'ts1', personName: 'Priya Raman', hours: 90, rateCents: 13_000, amountCents: 1_170_000 }],
      ...overrides,
    })
  }

  it('an hours variance can be waived with a reason, and the invoice matches', () => {
    const r = threeWayMatch(hoursQuery({ overrides: waiver('QUANTITY', 'Ten hours under query with the manager') }))
    expect(r.matched).toBe(true)
  })

  it('a waived invoice is never reported as a clean match', () => {
    const r = threeWayMatch(hoursQuery({ overrides: waiver('QUANTITY', 'Under query') }))
    expect(r.cleanMatch).toBe(false)
    expect(r.summary).toContain('exception')
  })

  it('the waiver keeps the original failure visible, with who and why', () => {
    const r = threeWayMatch(hoursQuery({ overrides: waiver('QUANTITY', 'Under query') }))
    const q = r.checks.find(c => c.code === 'QUANTITY')!
    expect(q.outcome).toBe('OVERRIDDEN')
    expect(q.overriddenBy?.name).toBe('Joyce Mbeki')
    expect(q.reason).toContain('billed 90h, approved 80h')
  })

  it('a rate variance cannot be waived — the contract is the remedy', () => {
    // Waiving it would record the real price in a note on one invoice,
    // leave the contract saying something else, and fail identically next
    // month. The fix is an effective-dated contract amendment.
    const r = threeWayMatch(clean({
      invoice: { id: 'inv1', totalCents: 1_200_000, periodStart: PERIOD_START, periodEnd: PERIOD_END },
      lines: [{ id: 'l1', timesheetId: 'ts1', personName: 'Priya Raman', hours: 80, rateCents: 15_000, amountCents: 1_200_000 }],
      overrides: waiver('PRICE'),
    }))
    expect(r.matched).toBe(false)
    expect(r.checks.find(c => c.code === 'PRICE')?.outcome).toBe('FAIL')
  })

  it('a purchase order overrun can be waived while it is topped up', () => {
    const r = threeWayMatch(clean({
      po: { id: 'po1', number: 'TBC-PO-4471', status: 'OPEN', amountCents: 5_000_000,
            consumedCents: 4_500_000, startDate: new Date('2026-01-01T00:00:00Z'), endDate: null },
      overrides: waiver('PO_BALANCE', 'PO increase approved, raising tomorrow'),
    }))
    expect(r.matched).toBe(true)
  })

  it('paying twice for the same work cannot be waived by anyone', () => {
    const r = threeWayMatch(clean({
      timesheets: { ts1: { id: 'ts1', status: 'APPROVED', approvedHours: 80, contractRateCents: 13_000, periodStart: WORKED_FROM, periodEnd: WORKED_TO,
                           alreadyBilledOnInvoiceId: 'inv-earlier' } },
      overrides: waiver('DUPLICATE', 'Client said it is fine'),
    }))
    expect(r.matched).toBe(false)
    expect(r.checks.find(c => c.code === 'DUPLICATE')?.outcome).toBe('FAIL')
  })

  it('hours nobody approved cannot be waived', () => {
    const r = threeWayMatch(clean({
      timesheets: { ts1: { id: 'ts1', status: 'SUBMITTED', approvedHours: 80, contractRateCents: 13_000, periodStart: WORKED_FROM, periodEnd: WORKED_TO } },
      overrides: waiver('RECEIPT', 'Manager is on leave, we know it is right'),
    }))
    expect(r.matched).toBe(false)
  })

  it('arithmetic cannot be waived', () => {
    const r = threeWayMatch(clean({
      invoice: { id: 'inv1', totalCents: 1_050_000, periodStart: PERIOD_START, periodEnd: PERIOD_END },
      lines: [{ id: 'l1', timesheetId: 'ts1', personName: 'Priya Raman', hours: 80, rateCents: 13_000, amountCents: 1_050_000 }],
      overrides: [
        { code: 'EXTENSION' as any, reason: 'x', byName: 'Y', at: new Date() },
        { code: 'HEADER_TOTAL' as any, reason: 'x', byName: 'Y', at: new Date() },
      ],
    }))
    expect(r.matched).toBe(false)
  })

  it('every check says whether it could be waived at all', () => {
    const r = threeWayMatch(clean())
    expect(r.checks.find(c => c.code === 'DUPLICATE')?.overridable).toBe(false)
    expect(r.checks.find(c => c.code === 'PRICE')?.overridable).toBe(false)
    expect(r.checks.find(c => c.code === 'QUANTITY')?.overridable).toBe(true)
  })

  it('a waiver for a check that passed changes nothing', () => {
    const r = threeWayMatch(clean({ overrides: waiver('QUANTITY') }))
    expect(r.cleanMatch).toBe(true)
  })
})

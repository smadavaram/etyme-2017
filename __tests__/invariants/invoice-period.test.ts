import { describe, it, expect } from 'vitest'
import { threeWayMatch, OVERRIDABLE, type MatchInput } from '@/lib/three-way-match'

/**
 * An invoice must match the timesheets and the purchase order **for the
 * period it is billing**.
 *
 * The engine checked five of those six words. It confirmed the hours were
 * approved, that they matched, that the rate was right, that the
 * arithmetic added up and that nothing was billed twice — and never once
 * asked whether the work was done in the period being billed.
 *
 * So an August invoice could carry a July timesheet and go green on every
 * check. Revenue lands in the wrong month, and the purchase order that
 * covered August pays for work done before it was raised.
 *
 * The PO check had the same hole from the other side: it compared the
 * invoice's header period to the PO, not the dates the work was actually
 * done.
 */

const AUG = { start: new Date('2026-08-01'), end: new Date('2026-08-31') }

function input(over: Partial<MatchInput> = {}): MatchInput {
  return {
    invoice: {
      id: 'inv-1',
      totalCents: 520_000,
      periodStart: AUG.start,
      periodEnd: AUG.end,
    },
    lines: [
      {
        id: 'l1',
        timesheetId: 'ts1',
        personName: 'Anita Desai',
        hours: 40,
        rateCents: 13000,
        amountCents: 520_000,
      },
    ],
    timesheets: {
      ts1: {
        id: 'ts1',
        status: 'APPROVED',
        approvedHours: 40,
        contractRateCents: 13000,
        periodStart: new Date('2026-08-10'),
        periodEnd: new Date('2026-08-16'),
        alreadyBilledOnInvoiceId: 'inv-1',
      },
    },
    po: null,
    poRequired: false,
    ...over,
  }
}

function check(r: ReturnType<typeof threeWayMatch>, code: string) {
  return r.checks.find((c) => c.code === code)
}

describe('is the work in the period being billed', () => {
  it('passes a timesheet inside the invoice period', () => {
    expect(check(threeWayMatch(input()), 'PERIOD')!.outcome).toBe('PASS')
  })

  it('fails a July timesheet on an August invoice', () => {
    // Every other check goes green on this: the hours were approved, they
    // match, the rate is right, the arithmetic adds up, nothing is billed
    // twice. Only the period is wrong, and it is the whole invoice.
    const r = threeWayMatch(
      input({
        timesheets: {
          ts1: {
            ...input().timesheets.ts1,
            periodStart: new Date('2026-07-06'),
            periodEnd: new Date('2026-07-12'),
          },
        },
      })
    )
    expect(check(r, 'RECEIPT')!.outcome).toBe('PASS')
    expect(check(r, 'QUANTITY')!.outcome).toBe('PASS')
    expect(check(r, 'PRICE')!.outcome).toBe('PASS')
    expect(check(r, 'PERIOD')!.outcome).toBe('FAIL')
    expect(r.matched).toBe(false)
  })

  it('says how far out it is, so somebody can tell a late timesheet from a mistake', () => {
    const r = threeWayMatch(
      input({
        timesheets: {
          ts1: {
            ...input().timesheets.ts1,
            periodStart: new Date('2026-02-02'),
            periodEnd: new Date('2026-02-08'),
          },
        },
      })
    )
    expect(check(r, 'PERIOD')!.reason).toMatch(/Anita Desai/)
    expect(check(r, 'PERIOD')!.reason).toMatch(/2026-02-02 to 2026-02-08/)
  })

  it('passes a week that straddles the month end, because most weeks do', () => {
    // A weekly timesheet for Mon 27 July to Sun 2 August is ordinary and
    // correct. A check that failed it would be switched off by the second
    // month.
    const r = threeWayMatch(
      input({
        timesheets: {
          ts1: {
            ...input().timesheets.ts1,
            periodStart: new Date('2026-07-27'),
            periodEnd: new Date('2026-08-02'),
          },
        },
      })
    )
    expect(check(r, 'PERIOD')!.outcome).toBe('PASS')
    expect(check(r, 'PERIOD')!.reason).toMatch(/straddle/)
  })

  it('is overridable, because a late timesheet is a real thing that happens', () => {
    // A timesheet approved after the cut-off is legitimately billed on the
    // next invoice. That is a commercial variance AP resolves daily, not
    // an arithmetic fault.
    expect(OVERRIDABLE.PERIOD).toBe(true)
  })

  it('honours the override once somebody has recorded a reason', () => {
    const late = {
      timesheets: {
        ts1: {
          ...input().timesheets.ts1,
          periodStart: new Date('2026-07-06'),
          periodEnd: new Date('2026-07-12'),
        },
      },
    }
    const r = threeWayMatch({
      ...input(late),
      overrides: [
        { code: 'PERIOD', reason: 'Approved after the July cut-off.', byName: 'Kate Rowe', at: new Date() },
      ],
    })
    expect(check(r, 'PERIOD')!.outcome).toBe('OVERRIDDEN')
    expect(r.matched).toBe(true)
    expect(r.cleanMatch).toBe(false)
  })

  it('says nothing when a line has no timesheet, because RECEIPT already said it', () => {
    const r = threeWayMatch(input({ lines: [{ ...input().lines[0], timesheetId: null }] }))
    expect(check(r, 'RECEIPT')!.outcome).toBe('FAIL')
    expect(check(r, 'PERIOD')).toBeUndefined()
  })
})

describe('does the purchase order cover the work, not just the invoice', () => {
  const po = {
    id: 'po-1',
    number: 'PO-88213',
    status: 'OPEN',
    amountCents: 4_000_000,
    consumedCents: 0,
    startDate: new Date('2026-08-01'),
    endDate: new Date('2026-12-31'),
  }

  it('passes when the work was done inside the PO window', () => {
    expect(check(threeWayMatch(input({ po, poRequired: true })), 'PO_STATUS')!.outcome).toBe('PASS')
  })

  it('fails work done before the PO was raised, even when the invoice period fits', () => {
    // This is the hole from the other side. The invoice header says
    // August, the PO starts in August, so the old check passed — while the
    // work being billed was done in July and nobody authorised it.
    const r = threeWayMatch(
      input({
        po,
        poRequired: true,
        timesheets: {
          ts1: {
            ...input().timesheets.ts1,
            periodStart: new Date('2026-07-20'),
            periodEnd: new Date('2026-07-26'),
          },
        },
      })
    )
    const c = check(r, 'PO_STATUS')!
    expect(c.outcome).toBe('FAIL')
    expect(c.reason).toMatch(/2026-07-20/)
  })

  it('fails work done after the PO ended', () => {
    const r = threeWayMatch(
      input({
        po: { ...po, endDate: new Date('2026-08-15') },
        poRequired: true,
        timesheets: {
          ts1: {
            ...input().timesheets.ts1,
            periodStart: new Date('2026-08-24'),
            periodEnd: new Date('2026-08-30'),
          },
        },
      })
    )
    expect(check(r, 'PO_STATUS')!.outcome).toBe('FAIL')
  })

  it('falls back to the invoice period when no line has a timesheet', () => {
    const r = threeWayMatch(
      input({
        po: { ...po, startDate: new Date('2026-09-01') },
        poRequired: true,
        lines: [{ ...input().lines[0], timesheetId: null }],
        timesheets: {},
      })
    )
    expect(check(r, 'PO_STATUS')!.outcome).toBe('FAIL')
  })

  it('still accepts an open-ended PO', () => {
    const r = threeWayMatch(input({ po: { ...po, endDate: null }, poRequired: true }))
    expect(check(r, 'PO_STATUS')!.outcome).toBe('PASS')
  })
})

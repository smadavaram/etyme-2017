import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  whatTheRungBills, receiptFor, type RungWeek, type Signature, type Worked,
} from '@/lib/money/rung-billing'
import {
  weeksAwaitingPayer, notAcceptedSays, type PayableWeek,
} from '@/lib/money/payers-acceptance'
import { matchVendorBill, exceptionQueue } from '@/lib/three-way-match'
import { proposeRun, type PayableBill } from '@/lib/ap-delay'

/**
 * What each rung of a chain may bill, and when. The founder, 2026-09-28
 * (CLAUDE.md, "What each rung may bill, and when"):
 *
 *   1. A firm bills only the hours the firm above it accepted.
 *   2. A firm bills upward on the client's signature, without waiting for
 *      the rungs below it to accept.
 *   3. A week the paying firm has not accepted blocks the invoice receipt
 *      that includes it. No "approve anyway with a reason".
 *
 * Northbend Athletic ← Computer Systems ← CloudEPA, Helena Marsh. Her
 * week of September 14 is filed once, on CloudEPA's contract.
 */

const D = (s: string) => new Date(`${s}T00:00:00.000Z`)
const DAYS = { '2026-09-14': 8, '2026-09-15': 8, '2026-09-16': 8, '2026-09-17': 8, '2026-09-18': 8 }

const NORTHBEND: Signature = { companyId: 'northbend', role: 'CLIENT_APPROVAL', hours: 40 }
const CS = (hours: number, over: Partial<Signature> = {}): Signature => ({ companyId: 'cs', role: 'PASS_THROUGH', hours, ...over })
const CLOUDEPA = (hours: number): Signature => ({ companyId: 'cloudepa', role: 'EMPLOYER_ACCEPTANCE', hours })

const CHAIN = { companyId: 'cloudepa', clientCompanyId: 'cs', endClientCompanyId: 'northbend' }

function week(signed: Signature[], over: Partial<RungWeek> = {}): RungWeek {
  return {
    periodStart: D('2026-09-14'),
    periodEnd: D('2026-09-18'),
    totalHours: 40,
    personName: 'Helena Marsh',
    hoursContract: CHAIN,
    assertions: signed,
    ...over,
  }
}

const STRAIGHT: Worked = { partial: false, overtimeHours: 0, pendingHours: 0, bankedHours: 0 }

/** CloudEPA billing Computer Systems: the payer is Computer Systems. */
const cloudepaBills = (w: RungWeek, worked: Worked = STRAIGHT, afterHours: number | null = 40) =>
  whatTheRungBills({ payerCompanyId: 'cs', payerName: 'Computer Systems', week: w, worked, afterHours })

/** Computer Systems billing Northbend: the payer is the client. */
const csBills = (w: RungWeek, worked: Worked = STRAIGHT) =>
  whatTheRungBills({ payerCompanyId: 'northbend', payerName: 'Northbend Athletic', week: w, worked, afterHours: 40 })

describe('a firm bills only the hours the firm above it accepted', () => {
  it('CloudEPA bills Computer Systems for the thirty-eight hours Computer Systems accepted, not the forty Helena worked', () => {
    const r = cloudepaBills(week([NORTHBEND, CS(38)]))
    expect(r.kind).toBe('ACCEPTED')
    expect(r.kind === 'ACCEPTED' && r.hours).toBe(38)
    expect(r.kind === 'ACCEPTED' && r.says).toBe(
      'Computer Systems accepted 38 of the 40 hours in Helena Marsh’s week of September 14, so it bills 38.'
    )
  })

  it('CloudEPA bills the week as worked, overtime and all, where Computer Systems accepted every hour', () => {
    expect(cloudepaBills(week([NORTHBEND, CS(40)])).kind).toBe('AS_WORKED')
    expect(
      cloudepaBills(week([NORTHBEND, CS(45)], { totalHours: 45 }), { ...STRAIGHT, overtimeHours: 5 }).kind
    ).toBe('AS_WORKED')
  })

  it('CloudEPA’s own acceptance of what it pays Helena is not Computer Systems’ acceptance, so it bills nothing on it', () => {
    const r = cloudepaBills(week([NORTHBEND, CLOUDEPA(40)]))
    expect(r.kind).toBe('WAITING')
  })

  it('a week Computer Systems has not accepted is left off CloudEPA’s bill, in a sentence naming the firm, the person and the week', () => {
    const r = cloudepaBills(week([NORTHBEND]))
    expect(r).toEqual({
      kind: 'WAITING',
      says:
        'Computer Systems has not accepted Helena Marsh’s week of September 14, so it is not on this bill. ' +
        'A firm bills only the hours the firm above it accepted; it bills once Computer Systems has.',
    })
  })

  it('the top of a chain bills the client’s signed week exactly as it always has, whatever the rungs below accepted', () => {
    expect(csBills(week([NORTHBEND, CS(38)])).kind).toBe('AS_WORKED')
    expect(csBills(week([NORTHBEND])).kind).toBe('AS_WORKED')
  })

  it('a direct placement bills exactly as it always has', () => {
    const direct = week([NORTHBEND], { hoursContract: { companyId: 'veritan', clientCompanyId: 'northbend', endClientCompanyId: null } })
    expect(csBills(direct).kind).toBe('AS_WORKED')
  })
})

describe('where the accepted number cannot be priced without a guess, the week is left off and said', () => {
  it('thirty-eight hours accepted of a forty-five hour week that went over the overtime line is left off rather than guessed at', () => {
    const r = cloudepaBills(week([NORTHBEND, CS(43)], { totalHours: 45 }), { ...STRAIGHT, overtimeHours: 5 })
    expect(r.kind).toBe('HELD')
    expect(r.kind === 'HELD' && r.says).toMatch(
      /^Computer Systems accepted 43 of the 45 hours in Helena Marsh’s week of September 14, and the week goes over the overtime line\. Nothing records whether the difference came off the ordinary hours or the overtime/
    )
  })

  it('an undecided or banked hour over the line holds the week the same way', () => {
    expect(cloudepaBills(week([NORTHBEND, CS(40)], { totalHours: 44 }), { ...STRAIGHT, pendingHours: 4 }).kind).toBe('HELD')
    expect(cloudepaBills(week([NORTHBEND, CS(40)], { totalHours: 44 }), { ...STRAIGHT, bankedHours: 4 }).kind).toBe('HELD')
  })

  it('accepting more hours than the overtime line on a straight week is left off rather than guessed at', () => {
    expect(cloudepaBills(week([NORTHBEND, CS(42)]), STRAIGHT, 40).kind).toBe('HELD')
    expect(cloudepaBills(week([NORTHBEND, CS(42)]), STRAIGHT, null).kind).toBe('ACCEPTED')
  })

  it('a reduced week that crosses the edge of the bill is left off rather than guessed at', () => {
    const r = cloudepaBills(week([NORTHBEND, CS(38)]), { ...STRAIGHT, partial: true })
    expect(r.kind).toBe('HELD')
    expect(r.kind === 'HELD' && r.says).toMatch(/the week crosses the edge of this bill\. Nothing records which days the difference came off/)
  })

  it('an acceptance covering only some of the week’s days is left off rather than guessed at', () => {
    const partOfIt = CS(24, { coversFrom: D('2026-09-14'), coversTo: D('2026-09-16') })
    expect(cloudepaBills(week([NORTHBEND, partOfIt])).kind).toBe('HELD')
    expect(cloudepaBills(week([NORTHBEND, CS(16), CS(24)])).kind).toBe('HELD')
  })
})

describe('a firm bills upward on the client’s signature', () => {
  it('the receipt behind Computer Systems’ bill to Northbend is Northbend’s signature, before Computer Systems or CloudEPA has accepted anything', () => {
    const r = receiptFor('northbend', week([NORTHBEND]))
    expect(r).toEqual({ signed: true, hours: 40, straight: false })
  })

  it('the receipt behind CloudEPA’s bill to Computer Systems is Computer Systems’ signature and nobody else’s', () => {
    expect(receiptFor('cs', week([NORTHBEND, CLOUDEPA(40)])).signed).toBe(false)
    expect(receiptFor('cs', week([NORTHBEND, CS(38)]))).toEqual({ signed: true, hours: 38, straight: true })
  })

  it('a bill with no signature from the firm it is addressed to has no receipt', () => {
    expect(receiptFor('northbend', week([])).signed).toBe(false)
  })

  it('bill generation reads the payer’s signature, and the three-way check reads it too, never the timesheet’s status', () => {
    const generate = readFileSync(join(process.cwd(), 'src/app/api/invoices/generate/route.ts'), 'utf8')
    const match = readFileSync(join(process.cwd(), 'src/lib/invoice-match.ts'), 'utf8')
    expect(generate).toContain('whatTheRungBills(')
    expect(match).toContain('receiptFor(')
    expect(match).not.toMatch(/status:\s*l\.timesheet\.status,/)
  })
})

describe('a week the paying firm has not accepted blocks the invoice receipt that includes it', () => {
  const CS_BUY = 'cs-buys-from-cloudepa'
  const CS_LINKS = [{ buyContractId: CS_BUY, sellContractId: 'cs-sells-to-northbend', effectiveFrom: D('2026-03-01'), effectiveTo: null }]
  const payable = (start: string, signed: { companyId: string; role: string; hours: number; rateCents: number }[]): PayableWeek => ({
    id: `week-${start}`,
    personName: 'Helena Marsh',
    periodStart: D(start),
    periodEnd: new Date(D(start).getTime() + 4 * 86_400_000),
    days: DAYS,
    sellContract: { ...CHAIN, buyLinks: [] },
    assertions: signed,
  })
  const csAccepts = { companyId: 'cs', role: 'PASS_THROUGH', hours: 40, rateCents: 11800 }

  it('the refusal names the week and who must accept it', () => {
    const waiting = weeksAwaitingPayer({ payerCompanyId: 'cs', buyContractId: CS_BUY, payerLinks: CS_LINKS, weeks: [payable('2026-09-14', [])] })
    expect(notAcceptedSays('Computer Systems', waiting, 'record')).toBe(
      'Computer Systems has not accepted Helena Marsh’s week of September 14. Accept it first, then record this invoice.'
    )
  })

  it('an accepted week beside one that is not still blocks the invoice, and names only the one that is not', () => {
    const waiting = weeksAwaitingPayer({
      payerCompanyId: 'cs', buyContractId: CS_BUY, payerLinks: CS_LINKS,
      weeks: [payable('2026-09-07', [csAccepts]), payable('2026-09-14', [])],
    })
    expect(waiting.map((w) => w.id)).toEqual(['week-2026-09-14'])
  })

  it('two weeks nobody has accepted are named together, and the sentence asks for both', () => {
    const waiting = weeksAwaitingPayer({
      payerCompanyId: 'cs', buyContractId: CS_BUY, payerLinks: CS_LINKS,
      weeks: [payable('2026-09-14', []), payable('2026-09-07', [])],
    })
    expect(notAcceptedSays('Computer Systems', waiting, 'pay')).toBe(
      'Computer Systems has not accepted Helena Marsh’s weeks of September 7 and September 14. Accept them first, then pay this invoice.'
    )
  })

  it('a week the buy contract was not in force for is not this invoice’s business and blocks nothing', () => {
    const ended = [{ ...CS_LINKS[0], effectiveTo: D('2026-09-01') }]
    const waiting = weeksAwaitingPayer({ payerCompanyId: 'cs', buyContractId: CS_BUY, payerLinks: ended, weeks: [payable('2026-09-14', [])] })
    expect(waiting).toEqual([])
  })

  it('no signature can waive it: the week fails the receipt check, and a waiver on the receipt check is ignored', () => {
    const says = 'Computer Systems has not accepted Helena Marsh’s week of September 14. Accept it first, then pay this invoice.'
    const result = matchVendorBill({
      bill: { id: 'b', number: 'CE-1', totalCents: 4_720_00, currency: 'USD', periodStart: D('2026-09-07'), periodEnd: D('2026-09-20'), hours: 80, rateCents: 11800 },
      // One week accepted, one not: the quantity alone would have been waivable.
      accepted: { hours: 40, contractRateCents: 11800, firstDay: D('2026-09-07'), lastDay: D('2026-09-11'), count: 1 },
      po: null,
      poRequired: false,
      notAccepted: says,
      overrides: [{ code: 'RECEIPT', reason: 'Approve anyway', byName: 'A clerk', at: D('2026-09-21') }],
    })
    const receipt = result.checks.find((c) => c.code === 'RECEIPT')!
    expect(receipt).toMatchObject({ outcome: 'FAIL', overridable: false, reason: says })
    expect(result.matched).toBe(false)

    const [queued] = exceptionQueue(
      [{ id: 'b', reference: 'CE-1', counterparty: 'CloudEPA', currency: 'USD', amountCents: 4_720_00, receivedAt: D('2026-09-21'), result }],
      D('2026-09-22')
    )
    expect(queued.hardFailures).toContain('RECEIPT')
    expect(queued.says).toMatch(/Nobody can wave this through/)
  })

  it('an invoice over a week nobody accepted never goes into a payment run, whatever its status says', () => {
    const bill: PayableBill = {
      id: 'b', number: 'CE-1', vendorCompanyId: 'cloudepa', vendorName: 'CloudEPA', currency: 'USD',
      totalCents: 4_720_00, paidCents: 0, dueAt: D('2026-09-20'), status: 'APPROVED',
      notAccepted: 'Computer Systems has not accepted Helena Marsh’s week of September 14. Accept it first, then pay this invoice.',
    }
    const run = proposeRun([bill], 'USD', D('2026-09-30'))
    expect(run.lines).toEqual([])
    expect(run.excluded[0]).toMatchObject({ reason: 'WEEK_NOT_ACCEPTED', says: bill.notAccepted })
  })

  it('the invoice-receipt route refuses the week at intake and at payment, rather than recording it as disputed', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/ap/bills/route.ts'), 'utf8')
    expect(route.match(/code: 'WEEK_NOT_ACCEPTED'/g)?.length).toBe(2)
    expect(route).toContain('notAccepted,')
  })
})

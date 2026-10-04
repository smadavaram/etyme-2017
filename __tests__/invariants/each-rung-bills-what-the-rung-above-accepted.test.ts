import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  whatTheRungBills, receiptFor, type RungWeek, type Signature, type Worked,
} from '@/lib/money/rung-billing'
import { acceptedDays, billableInPeriod, type DayBands, type Period } from '@/lib/periods'
import type { Decision, OvertimePolicy } from '@/lib/overtime'
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
 * Northbend Athletic ← Computer Systems ← Techpeple, Helena Marsh. Her
 * week of September 14 is filed once, on Techpeple's contract.
 */

const D = (s: string) => new Date(`${s}T00:00:00.000Z`)
const DAYS = { '2026-09-14': 8, '2026-09-15': 8, '2026-09-16': 8, '2026-09-17': 8, '2026-09-18': 8 }

const NORTHBEND: Signature = { companyId: 'northbend', role: 'CLIENT_APPROVAL', hours: 40 }
const CS = (hours: number, over: Partial<Signature> = {}): Signature => ({ companyId: 'cs', role: 'PASS_THROUGH', hours, ...over })
const TECHPEPLE = (hours: number): Signature => ({ companyId: 'techpeple', role: 'EMPLOYER_ACCEPTANCE', hours })

const CHAIN = { companyId: 'techpeple', clientCompanyId: 'cs', endClientCompanyId: 'northbend' }

function week(signed: Signature[], over: Partial<RungWeek> = {}): RungWeek {
  return {
    periodStart: D('2026-09-14'),
    periodEnd: D('2026-09-18'),
    totalHours: 40,
    days: DAYS,
    personName: 'Helena Marsh',
    hoursContract: CHAIN,
    assertions: signed,
    ...over,
  }
}

const STRAIGHT: Worked = { partial: false, overtimeHours: 0, pendingHours: 0, bankedHours: 0 }

/** Techpeple billing Computer Systems: the payer is Computer Systems. */
const techpepleBills = (w: RungWeek, worked: Worked = STRAIGHT, afterHours: number | null = 40) =>
  whatTheRungBills({ payerCompanyId: 'cs', payerName: 'Computer Systems', week: w, worked, afterHours })

/** Computer Systems billing Northbend: the payer is the client. */
const csBills = (w: RungWeek, worked: Worked = STRAIGHT) =>
  whatTheRungBills({ payerCompanyId: 'northbend', payerName: 'Northbend Athletic', week: w, worked, afterHours: 40 })

describe('a firm bills only the hours the firm above it accepted', () => {
  it('Techpeple bills Computer Systems for the thirty-eight hours Computer Systems accepted, not the forty Helena worked', () => {
    const r = techpepleBills(week([NORTHBEND, CS(38)]))
    expect(r.kind).toBe('CUT')
    expect(r.kind === 'CUT' && r.accepted).toEqual({ hours: 38, from: null, to: null })
    expect(r.kind === 'CUT' && r.says).toBe(
      'Computer Systems accepted 38 of the 40 hours in Helena Marsh’s week of September 14, so it bills 38.'
    )
  })

  it('Techpeple bills the week as worked, overtime and all, where Computer Systems accepted every hour', () => {
    expect(techpepleBills(week([NORTHBEND, CS(40)])).kind).toBe('AS_WORKED')
    expect(
      techpepleBills(week([NORTHBEND, CS(45)], { totalHours: 45 }), { ...STRAIGHT, overtimeHours: 5 }).kind
    ).toBe('AS_WORKED')
  })

  it('Techpeple’s own acceptance of what it pays Helena is not Computer Systems’ acceptance, so it bills nothing on it', () => {
    const r = techpepleBills(week([NORTHBEND, TECHPEPLE(40)]))
    expect(r.kind).toBe('WAITING')
  })

  it('a week Computer Systems has not accepted is left off Techpeple’s bill, in a sentence naming the firm, the person and the week', () => {
    const r = techpepleBills(week([NORTHBEND]))
    expect(r).toEqual({
      kind: 'WAITING',
      says:
        'Computer Systems has not accepted Helena Marsh’s week of September 14, so it is not on this bill. ' +
        'A firm bills only the hours the firm above it accepted; it bills once Computer Systems has.',
    })
  })

  it('the top of a chain bills the week as worked where the client signed every hour, whatever the rungs below accepted', () => {
    expect(csBills(week([NORTHBEND, CS(38)])).kind).toBe('AS_WORKED')
    expect(csBills(week([NORTHBEND])).kind).toBe('AS_WORKED')
  })

  it('the top rung is covered too: Northbend signs thirty-eight of forty, and Computer Systems bills Northbend for thirty-eight', () => {
    const r = csBills(week([{ ...NORTHBEND, hours: 38 }]))
    expect(r).toEqual({
      kind: 'CUT',
      accepted: { hours: 38, from: null, to: null },
      says: 'Northbend Athletic accepted 38 of the 40 hours in Helena Marsh\u2019s week of September 14, so it bills 38.',
    })
  })

  it('a direct placement bills the hours the client signed, because the client is the firm above it', () => {
    const direct = (hours: number) =>
      week([{ ...NORTHBEND, hours }], { hoursContract: { companyId: 'veritan', clientCompanyId: 'northbend', endClientCompanyId: null } })
    expect(csBills(direct(40)).kind).toBe('AS_WORKED')
    const r = csBills(direct(38))
    expect(r.kind === 'CUT' && r.accepted.hours).toBe(38)
  })

  it('a week the client has not signed is left off the bill to the client, in the same sentence', () => {
    expect(csBills(week([CS(40)]))).toEqual({
      kind: 'WAITING',
      says:
        'Northbend Athletic has not accepted Helena Marsh\u2019s week of September 14, so it is not on this bill. ' +
        'A firm bills only the hours the firm above it accepted; it bills once Northbend Athletic has.',
    })
  })
})

// ── Rule 4: when fewer hours are accepted than were worked ────────────
//
// The founder, 2026-09-29: the cut comes off overtime first, and off the
// later bill first. A partial acceptance covering only some days is
// priced on the days it covers. Priced by the same call generation and
// the three-way check both make — `billableInPeriod` with the payer's
// acceptance — so these read the money, not just the verdict.

const RATE = 11800
const LINE: OvertimePolicy = { afterHours: 40, multiplierBps: 15_000 }
const SEPTEMBER: Period = { start: D('2026-09-01'), end: D('2026-09-30'), label: 'September 2026' }
const NINES = { '2026-09-14': 9, '2026-09-15': 9, '2026-09-16': 9, '2026-09-17': 9, '2026-09-18': 9 }
const premium = (hours = 5): Decision => ({ weekOf: '2026-09-14', treatment: 'PREMIUM', appliedBps: 15_000, overtimeHours: hours })
const banked: Decision = { weekOf: '2026-09-14', treatment: 'TIME_OFF', appliedBps: 0, overtimeHours: 5, accrualBps: 10_000 }

const sheetOf = (days: Record<string, number>, leaveDays: Record<string, number> = {}) => ({
  id: 'helena-week',
  periodStart: D(Object.keys(days).sort()[0]),
  periodEnd: D(Object.keys(days).sort().slice(-1)[0]),
  days,
  leaveDays,
  totalHours: Object.values(days).reduce((n, h) => n + h, 0),
})

/** What the rung bills for the week: the verdict, then the days priced by it. */
function priced(days: Record<string, number>, signed: Signature, decisions: Decision[] = [], leaveDays: Record<string, number> = {}) {
  const sheet = sheetOf(days, leaveDays)
  const r = techpepleBills(week([NORTHBEND, signed], { days, totalHours: sheet.totalHours, periodStart: sheet.periodStart, periodEnd: sheet.periodEnd }), STRAIGHT, 40)
  if (r.kind !== 'CUT') throw new Error(`expected a cut, got ${r.kind}`)
  return { rung: r, billed: billableInPeriod(sheet, SEPTEMBER, 'END', RATE, LINE, decisions, r.accepted)! }
}

describe('fewer hours accepted than worked: the cut comes off overtime first', () => {
  it('forty-two hours accepted of a forty-five hour week with five over the line bills forty ordinary and two overtime', () => {
    const { billed } = priced(NINES, CS(42), [premium()])
    expect(billed.split.regularHours).toBe(40)
    expect(billed.split.overtimeHours).toBe(2)
    expect(billed.hours).toBe(42)
    // 40 × $118, plus 2 × $118 at time and a half — each band rounded once.
    expect(billed.value.totalCents).toBe(40 * RATE + Math.round(2 * RATE * 1.5))
  })

  it('a cut larger than the overtime takes all of it, then the rest off ordinary hours from the last day backward', () => {
    const { billed } = priced(NINES, CS(38), [premium()])
    expect(billed.split.overtimeHours).toBe(0)
    expect(billed.split.regularHours).toBe(38)
    expect(billed.value.totalCents).toBe(38 * RATE)
    // Friday held four ordinary hours and the five over the line; the
    // seven cut took the five, then two of Friday's four.
    const days = acceptedDays(
      [
        { day: '2026-09-14', week: '2026-09-14', regular: 9, leave: 0, over: 0 },
        { day: '2026-09-15', week: '2026-09-14', regular: 9, leave: 0, over: 0 },
        { day: '2026-09-16', week: '2026-09-14', regular: 9, leave: 0, over: 0 },
        { day: '2026-09-17', week: '2026-09-14', regular: 9, leave: 0, over: 0 },
        { day: '2026-09-18', week: '2026-09-14', regular: 4, leave: 0, over: 5 },
      ],
      { hours: 38, from: null, to: null }
    )
    expect(days.map((d) => [d.day, d.regular, d.over])).toEqual([
      ['2026-09-14', 9, 0], ['2026-09-15', 9, 0], ['2026-09-16', 9, 0], ['2026-09-17', 9, 0], ['2026-09-18', 2, 0],
    ])
  })

  it('hours over the line that survive the cut and nobody has decided are left off the bill and counted, as on a week accepted whole', () => {
    const { billed } = priced(NINES, CS(42))
    expect(billed.split.regularHours).toBe(40)
    expect(billed.pendingHours).toBe(2)
    expect(billed.hours).toBe(40)
    expect(billed.value.totalCents).toBe(40 * RATE)
  })

  it('hours over the line that survive the cut and were banked as time off are billed by nobody, as on a week accepted whole', () => {
    const { billed } = priced(NINES, CS(42), [banked])
    expect(billed.split.bankedHours).toBe(2)
    expect(billed.hours).toBe(40)
    expect(billed.value.totalCents).toBe(40 * RATE)
  })

  it('the week’s own overtime decision still prices the hours left over the line, though it was made about all five', () => {
    const { billed } = priced(NINES, CS(43), [premium(5)])
    expect(billed.split.overtimeHours).toBe(3)
    expect(billed.weeksBilled).toEqual(['2026-09-14'])
  })

  it('paid leave is cut only after the hours worked on the same day, and never before an hour over the line', () => {
    // Monday to Thursday worked at eleven and a quarter, Friday on leave:
    // five hours over the line on Thursday, eight of leave on Friday.
    const days = { '2026-09-14': 11.25, '2026-09-15': 11.25, '2026-09-16': 11.25, '2026-09-17': 11.25, '2026-09-18': 8 }
    const { billed } = priced(days, CS(50), [premium()], { '2026-09-18': 8 })
    expect(billed.split.overtimeHours).toBe(2)
    expect(billed.split.leaveHours).toBe(8)
    expect(billed.split.regularHours).toBe(40)
  })
})

describe('fewer hours accepted than worked: the cut comes off the later bill first', () => {
  // Monday 31 August to Friday 4 September: one day in August, four in September.
  const straddling = (over = 0): DayBands[] => [
    { day: '2026-08-31', week: '2026-08-31', regular: 8, leave: 0, over: 0 },
    { day: '2026-09-01', week: '2026-08-31', regular: 8, leave: 0, over: 0 },
    { day: '2026-09-02', week: '2026-08-31', regular: 8, leave: 0, over: 0 },
    { day: '2026-09-03', week: '2026-08-31', regular: 8, leave: 0, over: 0 },
    { day: '2026-09-04', week: '2026-08-31', regular: 8 - over, leave: 0, over },
  ]

  it('a cut on a week crossing the bill’s edge comes off the later bill’s days first', () => {
    const days = acceptedDays(straddling(), { hours: 30, from: null, to: null })
    expect(days.map((d) => [d.day, d.regular])).toEqual([
      ['2026-08-31', 8], ['2026-09-01', 8], ['2026-09-02', 8], ['2026-09-03', 6], ['2026-09-04', 0],
    ])
  })

  it('the earlier bill’s day is cut only once every later day is gone', () => {
    const days = acceptedDays(straddling(), { hours: 5, from: null, to: null })
    expect(days.map((d) => [d.day, d.regular])).toEqual([
      ['2026-08-31', 5], ['2026-09-01', 0], ['2026-09-02', 0], ['2026-09-03', 0], ['2026-09-04', 0],
    ])
  })

  it('where the week’s overtime sits on the earlier bill’s days, overtime still comes off first', () => {
    const days: DayBands[] = [
      { day: '2026-09-28', week: '2026-09-28', regular: 14, leave: 0, over: 0 },
      { day: '2026-09-29', week: '2026-09-28', regular: 14, leave: 0, over: 0 },
      { day: '2026-09-30', week: '2026-09-28', regular: 12, leave: 0, over: 2 },
      { day: '2026-10-01', week: '2026-09-28', regular: 0, leave: 8, over: 0 },
      { day: '2026-10-02', week: '2026-09-28', regular: 0, leave: 8, over: 0 },
    ]
    const cut = acceptedDays(days, { hours: 55, from: null, to: null })
    expect(cut.map((d) => [d.day, d.regular, d.leave, d.over])).toEqual([
      ['2026-09-28', 14, 0, 0], ['2026-09-29', 14, 0, 0], ['2026-09-30', 12, 0, 0],
      ['2026-10-01', 0, 8, 0], ['2026-10-02', 0, 7, 0],
    ])
  })

  it('the same cut on the same week is allocated the same way every time, whatever order the days arrive in', () => {
    const once = acceptedDays(straddling(2), { hours: 33, from: null, to: null })
    const again = acceptedDays([...straddling(2)].reverse(), { hours: 33, from: null, to: null })
    expect(again).toEqual(once)
    expect(once.map((d) => [d.day, d.regular, d.over])).toEqual([
      ['2026-08-31', 8, 0], ['2026-09-01', 8, 0], ['2026-09-02', 8, 0], ['2026-09-03', 8, 0], ['2026-09-04', 1, 0],
    ])
  })
})

describe('a partial acceptance is priced on the days it covers', () => {
  const MON_TO_WED = { coversFrom: D('2026-09-14'), coversTo: D('2026-09-16') }

  it('a partial acceptance bills the days it covers', () => {
    const { rung, billed } = priced(DAYS, CS(24, MON_TO_WED))
    expect(rung.accepted).toEqual({ hours: 24, from: '2026-09-14', to: '2026-09-16' })
    expect(rung.says).toBe(
      'Computer Systems accepted 24 hours of Helena Marsh’s week of September 14, for September 14 to September 16 only, ' +
        'so it bills 24 on those days and nothing for the rest of the week.'
    )
    expect(billed.hours).toBe(24)
    expect(billed.value.totalCents).toBe(24 * RATE)
  })

  it('a partial acceptance of fewer hours than its days hold takes the cut off its own last day', () => {
    const { billed } = priced(DAYS, CS(20, MON_TO_WED))
    expect(billed.hours).toBe(20)
    expect(billed.value.totalCents).toBe(20 * RATE)
  })

  it('a partial acceptance on a week over the line keeps the week judged whole, so its overtime is still overtime and is cut first', () => {
    // Thursday and Friday of a 45-hour week: nine ordinary on Thursday,
    // four ordinary and five over the line on Friday. Sixteen of the
    // eighteen accepted: the two come off the overtime.
    const { billed } = priced(NINES, CS(16, { coversFrom: D('2026-09-17'), coversTo: D('2026-09-18') }), [premium()])
    expect(billed.split.regularHours).toBe(13)
    expect(billed.split.overtimeHours).toBe(3)
    expect(billed.value.totalCents).toBe(13 * RATE + Math.round(3 * RATE * 1.5))
  })

  it('at the top of a chain, a client signing only some of the days bills those days the same way', () => {
    const r = csBills(week([{ ...NORTHBEND, hours: 24, ...MON_TO_WED }]))
    expect(r.kind === 'CUT' && r.accepted).toEqual({ hours: 24, from: '2026-09-14', to: '2026-09-16' })
  })
})

describe('what rule 4 does not reach is still left off and said, rather than guessed at', () => {
  it('two acceptances from the payer on one week are left off, because nothing says which governs', () => {
    const r = techpepleBills(week([NORTHBEND, CS(16), CS(24)]))
    expect(r).toEqual({
      kind: 'HELD',
      says:
        'Computer Systems has more than one acceptance standing on Helena Marsh’s week of September 14, and nothing says which ' +
        'of them governs, so the week is left off this bill rather than guessed at. It bills once Computer Systems withdraws all but one.',
    })
  })

  it('more hours accepted than worked, on a week with an overtime line past which they would fall, is left off', () => {
    expect(techpepleBills(week([NORTHBEND, CS(42)]), STRAIGHT, 40).kind).toBe('HELD')
    expect(techpepleBills(week([NORTHBEND, CS(47)], { totalHours: 45 }), { ...STRAIGHT, overtimeHours: 5 }).kind).toBe('HELD')
  })

  it('more hours accepted than worked on a straight, whole week is billed straight, as it was before', () => {
    const r = techpepleBills(week([NORTHBEND, CS(42)]), STRAIGHT, null)
    expect(r.kind === 'STRAIGHT' && r.hours).toBe(42)
  })

  it('more hours accepted than were worked on only some of the days is left off', () => {
    const r = techpepleBills(week([NORTHBEND, CS(30, { coversFrom: D('2026-09-14'), coversTo: D('2026-09-16') })]))
    expect(r.kind).toBe('HELD')
    expect(r.kind === 'HELD' && r.says).toMatch(/more than the 24 worked on them/)
  })
})

describe('a firm bills upward on the client’s signature', () => {
  it('the receipt behind Computer Systems’ bill to Northbend is Northbend’s signature, before Computer Systems or Techpeple has accepted anything', () => {
    const r = receiptFor('northbend', week([NORTHBEND]))
    expect(r).toEqual({ signed: true, hours: 40, straight: false, cut: null })
  })

  it('Computer Systems’ bill to Northbend is checked against the thirty-eight hours Northbend signed, priced on the days with the two cut, not the forty filed', () => {
    expect(receiptFor('northbend', week([{ ...NORTHBEND, hours: 38 }]))).toEqual({
      signed: true, hours: 38, straight: false, cut: { hours: 38, from: null, to: null },
    })
  })

  it('the receipt behind Techpeple’s bill to Computer Systems is Computer Systems’ signature and nobody else’s', () => {
    expect(receiptFor('cs', week([NORTHBEND, TECHPEPLE(40)])).signed).toBe(false)
    expect(receiptFor('cs', week([NORTHBEND, CS(38)]))).toMatchObject({ signed: true, hours: 38, cut: { hours: 38 } })
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
  const CS_BUY = 'cs-buys-from-techpeple'
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
      [{ id: 'b', reference: 'CE-1', counterparty: 'Techpeple', currency: 'USD', amountCents: 4_720_00, receivedAt: D('2026-09-21'), result }],
      D('2026-09-22')
    )
    expect(queued.hardFailures).toContain('RECEIPT')
    expect(queued.says).toMatch(/Nobody can wave this through/)
  })

  it('an invoice over a week nobody accepted never goes into a payment run, whatever its status says', () => {
    const bill: PayableBill = {
      id: 'b', number: 'CE-1', vendorCompanyId: 'techpeple', vendorName: 'Techpeple', currency: 'USD',
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

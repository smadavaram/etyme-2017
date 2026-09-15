import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { billableInPeriod, periodFor, type Period, type Terms } from '@/lib/periods'
import { policyOf, splitWeeks, valueOf, mayChange, type Decision } from '@/lib/overtime'
import { threeWayMatch } from '@/lib/three-way-match'

/**
 * What an invoice may bill for a week that went over the line.
 *
 * The invoice used to answer this itself: it read the multiplier off the
 * contract and multiplied. A 45-hour week at $100 billed $4,750 and
 * nobody had agreed to the $750 — not the client, not the approver, not
 * anybody. Overtime is a decision now, so the invoice's job is to read
 * the decision and price from it, and to leave off entirely anything
 * nobody has answered.
 *
 * The arithmetic lives in `billableInPeriod`, which restricts the weekly
 * split to the days a billing period may bill and hands the pricing to
 * `valueOf`. There is no rate multiplication anywhere in the route.
 */

const RATE = 10_000 // $100.00/hr in cents
const OT = { afterHours: 40, multiplierBps: 15_000 }

/** A run of days from a Monday. */
const week = (from: string, hours: number[]): Record<string, number> => {
  const out: Record<string, number> = {}
  const d = new Date(`${from}T00:00:00.000Z`)
  hours.forEach((h, i) => {
    const day = new Date(d)
    day.setUTCDate(d.getUTCDate() + i)
    out[day.toISOString().slice(0, 10)] = h
  })
  return out
}

const decided = (
  weekOf: string,
  treatment: Decision['treatment'],
  appliedBps: number,
  overtimeHours: number
): Decision => ({ weekOf, treatment, appliedBps, overtimeHours })

const sheet = (
  days: Record<string, number>,
  leaveDays: Record<string, number> = {}
) => {
  const dates = Object.keys(days).sort()
  return {
    id: 'ts-1',
    periodStart: new Date(`${dates[0]}T00:00:00.000Z`),
    periodEnd: new Date(`${dates[dates.length - 1]}T00:00:00.000Z`),
    days,
    leaveDays,
    totalHours: Object.values(days).reduce((n, h) => n + h, 0),
  }
}

/** September 2026, the way a monthly contract on the calendar bills it. */
const SEPTEMBER: Period = periodFor(new Date('2026-09-15T00:00:00.000Z'), {
  frequency: 'MONTHLY',
  anchor: 'CALENDAR',
  straddle: 'SPLIT',
  startedOn: new Date('2026-01-01T00:00:00.000Z'),
} as Terms)

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const ROUTE = 'src/app/api/invoices/generate/route.ts'

describe('what an invoice may bill for a week that went over the line', () => {

  it('an invoice prices a week from the decision, never from the contract multiplier', () => {
    const days = week('2026-09-07', [9, 9, 9, 9, 9])

    // The contract offers time and a half. The approver signed double
    // time for this one week, which is the number that must reach the
    // invoice.
    const doubled = billableInPeriod(
      sheet(days), SEPTEMBER, 'SPLIT', RATE, OT,
      [decided('2026-09-07', 'PREMIUM', 20_000, 5)]
    )!
    expect(doubled.value.totalCents).toBe(40 * RATE + 5 * RATE * 2)

    // The same week, decided at the usual rate, is worth the hours and
    // nothing more — even though the contract still says 15000.
    const flat = billableInPeriod(
      sheet(days), SEPTEMBER, 'SPLIT', RATE, OT,
      [decided('2026-09-07', 'SAME_RATE', 10_000, 5)]
    )!
    expect(flat.value.totalCents).toBe(45 * RATE)
  })

  it('undecided overtime does not reach the invoice at all', () => {
    const b = billableInPeriod(sheet(week('2026-09-07', [9, 9, 9, 9, 9])), SEPTEMBER, 'SPLIT', RATE, OT)!

    // Not as hours, not as money, and not folded in at the plain rate.
    expect(b.hours).toBe(40)
    expect(b.value.totalCents).toBe(40 * RATE)
    expect(b.pendingHours).toBe(5)
    // And nothing is marked billed, because nothing was decided.
    expect(b.weeksBilled).toEqual([])
  })

  it('a week banked as time off bills its regular hours and nothing more', () => {
    const b = billableInPeriod(
      sheet(week('2026-09-07', [9, 9, 9, 9, 9])), SEPTEMBER, 'SPLIT', RATE, OT,
      [decided('2026-09-07', 'TIME_OFF', 0, 5)]
    )!

    expect(b.hours).toBe(40)
    expect(b.value.totalCents).toBe(40 * RATE)
    // The five hours are the consultant's to take later; the client is
    // not billed for them now and must not be billed for them twice.
    expect(b.split.bankedHours).toBe(5)
    expect(b.pendingHours).toBe(0)
  })

  it('paid leave bills at the ordinary rate, not at a premium', () => {
    // Four days worked at nine hours, one day of banked leave taken.
    const days = week('2026-09-07', [9, 9, 9, 9, 8])
    const leave = { '2026-09-11': 8 }

    const b = billableInPeriod(
      sheet(days, leave), SEPTEMBER, 'SPLIT', RATE, OT,
      [decided('2026-09-07', 'PREMIUM', 15_000, 0)]
    )!

    // Thirty-six hours worked and eight taken from the bank: forty-four
    // hours on the sheet and not one of them overtime, because leave
    // never counts toward the threshold. Had it counted, the week would
    // have shown four hours over and banking them would have bought
    // more leave out of the client's money.
    expect(b.split.regularHours).toBe(36)
    expect(b.split.leaveHours).toBe(8)
    expect(b.split.overtimeHours).toBe(0)
    expect(b.value.leaveCents).toBe(8 * RATE)
    expect(b.value.totalCents).toBe(44 * RATE)
  })

  it('a week amended after somebody decided it waits for a fresh answer rather than billing the old one', () => {
    // Decided when the week showed five hours over; the sheet now shows
    // eight. The decision no longer describes the week.
    const b = billableInPeriod(
      sheet(week('2026-09-07', [10, 10, 10, 10, 8])), SEPTEMBER, 'SPLIT', RATE, OT,
      [decided('2026-09-07', 'PREMIUM', 15_000, 5)]
    )!

    expect(b.pendingHours).toBe(8)
    expect(b.value.totalCents).toBe(40 * RATE)
    expect(b.weeksBilled).toEqual([])
  })

  it('a week straddling two months is judged whole and billed in the days that fall in each', () => {
    // Monday 31 August to Friday 4 September, nine hours a day: one day
    // in August, four in September, and five hours over the line in a
    // 45-hour week that neither month can see on its own.
    const days = week('2026-08-31', [9, 9, 9, 9, 9])
    const s = sheet(days)
    const answer = [decided('2026-08-31', 'PREMIUM', 15_000, 5)]

    const august = billableInPeriod(
      s,
      periodFor(new Date('2026-08-15T00:00:00.000Z'), { frequency: 'MONTHLY', anchor: 'CALENDAR', straddle: 'SPLIT', startedOn: new Date('2026-01-01T00:00:00.000Z') } as Terms),
      'SPLIT', RATE, OT, answer
    )!
    const september = billableInPeriod(s, SEPTEMBER, 'SPLIT', RATE, OT, answer)!

    // August takes Monday's nine hours, all of them ordinary: the week
    // had not crossed the line yet.
    expect(august.hours).toBe(9)
    expect(august.split.overtimeHours).toBe(0)

    // September takes the other thirty-six, of which the last five are
    // the hours that took the week over.
    expect(september.hours).toBe(36)
    expect(september.split.overtimeHours).toBe(5)
    expect(september.value.totalCents).toBe(31 * RATE + 5 * RATE * 1.5)

    // Between them, the week is billed once and in full.
    expect(august.hours + september.hours).toBe(45)
    expect(august.value.totalCents + september.value.totalCents).toBe(40 * RATE + 5 * RATE * 1.5)
  })

  it('the hours printed on a line and the money printed on it are the same hours', () => {
    const b = billableInPeriod(
      sheet(week('2026-09-07', [9, 9, 9, 9, 9])), SEPTEMBER, 'SPLIT', RATE, OT,
      [decided('2026-09-07', 'SAME_RATE', 10_000, 5)]
    )!
    // 45 hours on the line, 45 hours of money against it.
    expect(b.hours).toBe(45)
    expect(b.value.totalCents).toBe(45 * RATE)

    const pending = billableInPeriod(sheet(week('2026-09-07', [9, 9, 9, 9, 9])), SEPTEMBER, 'SPLIT', RATE, OT)!
    // And where five hours are waiting, the line says forty, not
    // forty-five with forty hours of money against it.
    expect(pending.hours).toBe(40)
    expect(pending.value.totalCents).toBe(40 * RATE)
  })

  it('the invoice and the budget agree on the total for the same week and the same decision', () => {
    const days = week('2026-09-07', [9, 9, 9, 9, 9])
    const answer = [decided('2026-09-07', 'PREMIUM', 20_000, 5)]

    // What the client's budget commits, computed the way
    // app/api/program/budget computes it: the whole weekly split.
    const budget = valueOf(splitWeeks(days, OT, { decisions: answer }), RATE).totalCents

    // What the invoice bills for the same week.
    const invoice = billableInPeriod(sheet(days), SEPTEMBER, 'SPLIT', RATE, OT, answer)!.value.totalCents

    expect(invoice).toBe(budget)
  })

  it('a decision that has reached an invoice is marked billed and can no longer be changed', () => {
    // The weeks the invoice priced are handed back so the route can
    // stamp them, and a stamped decision refuses to move.
    const b = billableInPeriod(
      sheet(week('2026-09-07', [9, 9, 9, 9, 9])), SEPTEMBER, 'SPLIT', RATE, OT,
      [decided('2026-09-07', 'PREMIUM', 15_000, 5)]
    )!
    expect(b.weeksBilled).toEqual(['2026-09-07'])

    expect(mayChange({ billedAt: null }).ok).toBe(true)
    expect(mayChange({ billedAt: new Date('2026-09-30T00:00:00.000Z') }).ok).toBe(false)
    expect(mayChange({ billedAt: new Date() }).says).toContain('already been invoiced')

    // The route writes that stamp in the same transaction as the lines.
    const route = read(ROUTE)
    expect(route).toContain('tx.overtimeDecision.updateMany')
    expect(route).toContain('billedAt: new Date()')
  })

  it('a week banked as time off is stamped billed too, because its ordinary hours went out on the invoice', () => {
    const b = billableInPeriod(
      sheet(week('2026-09-07', [9, 9, 9, 9, 9])), SEPTEMBER, 'SPLIT', RATE, OT,
      [decided('2026-09-07', 'TIME_OFF', 0, 5)]
    )!
    expect(b.weeksBilled).toEqual(['2026-09-07'])
  })

  it('the invoice route reads a decision and never multiplies a rate itself', () => {
    const route = read(ROUTE)
    expect(route).toContain('billableInPeriod')
    expect(route).toContain('overtimeDecisions: true')
    // The two inlined premiums are gone: nothing in this route divides a
    // multiplier by ten thousand any more.
    expect(route).not.toContain('multiplierBps / 10_000')
    expect(route).not.toContain('policy.multiplierBps')
  })

  it('an invoice says out loud what it left off, rather than quietly billing a short month', () => {
    const route = read(ROUTE)
    expect(route).toContain('pendingSays')
    expect(route).toContain('nobody has decided yet whether they are')
  })

  it('a three-way match reads the premium the approver signed rather than calling it bad arithmetic', () => {
    const line = {
      id: 'l1', timesheetId: 'ts-1', personName: 'Priya Raman',
      hours: 45, rateCents: RATE, amountCents: 40 * RATE + 5 * RATE * 1.5,
    }
    const input = {
      invoice: { id: 'inv-1', totalCents: line.amountCents, periodStart: SEPTEMBER.start, periodEnd: SEPTEMBER.end, contractPeriod: null },
      timesheets: {
        'ts-1': {
          id: 'ts-1', status: 'APPROVED', approvedHours: 45,
          periodStart: SEPTEMBER.start, periodEnd: SEPTEMBER.end,
          contractRateCents: RATE, alreadyBilledOnInvoiceId: 'inv-1',
        },
      },
      po: null, poRequired: false, overrides: [],
    }

    // Without the premium, the arithmetic looks wrong — 45 × $100 is
    // $4,500 and the line says $4,750.
    const blind = threeWayMatch({ ...input, lines: [line] })
    expect(blind.checks.find((c) => c.code === 'EXTENSION')!.outcome).toBe('FAIL')

    // With the premium recomputed from the decision, it adds up.
    const seeing = threeWayMatch({ ...input, lines: [{ ...line, premiumCents: 5 * RATE * 0.5 }] })
    expect(seeing.checks.find((c) => c.code === 'EXTENSION')!.outcome).toBe('PASS')

    // And a line that does not match the decision still fails, in words
    // an AP clerk can act on.
    const wrong = threeWayMatch({
      ...input,
      invoice: { ...input.invoice, totalCents: 50_000_0 },
      lines: [{ ...line, amountCents: 500_000, premiumCents: 5 * RATE * 0.5 }],
    })
    const ext = wrong.checks.find((c) => c.code === 'EXTENSION')!
    expect(ext.outcome).toBe('FAIL')
    expect(ext.reason).toContain('of approved overtime is')
  })

  it('an invoice raised before overtime was a decision is checked the way it always was', () => {
    // No premium to read, so hours × rate is the whole answer and no
    // historical invoice changes verdict because this code shipped.
    const result = threeWayMatch({
      invoice: { id: 'inv-2', totalCents: 400_000, periodStart: SEPTEMBER.start, periodEnd: SEPTEMBER.end, contractPeriod: null },
      lines: [{ id: 'l1', timesheetId: 'ts-2', personName: 'Priya Raman', hours: 40, rateCents: RATE, amountCents: 400_000 }],
      timesheets: {
        'ts-2': {
          id: 'ts-2', status: 'APPROVED', approvedHours: 40,
          periodStart: SEPTEMBER.start, periodEnd: SEPTEMBER.end,
          contractRateCents: RATE, alreadyBilledOnInvoiceId: 'inv-2',
        },
      },
      po: null, poRequired: false, overrides: [],
    })
    expect(result.checks.find((c) => c.code === 'EXTENSION')!.outcome).toBe('PASS')
  })

  it('backfilling history does not change the value of an invoice already sent', () => {
    // Every week approved before the rewrite was billed by multiplying
    // the contract's own multiplier. The backfill writes exactly that
    // decision — PREMIUM at the contract's rate — so the new arithmetic
    // reproduces the old figure to the cent.
    const days = week('2026-09-07', [9, 9, 9, 9, 9])
    const policy = policyOf({ overtimeAfterHours: 40, overtimeMultiplierBps: 15_000 })

    const asBilledIn2026 = (40 * RATE) + 5 * RATE * (policy.multiplierBps / 10_000)

    const backfilled = billableInPeriod(
      sheet(days), SEPTEMBER, 'SPLIT', RATE, policy,
      [decided('2026-09-07', 'PREMIUM', policy.multiplierBps, 5)]
    )!

    expect(backfilled.value.totalCents).toBe(asBilledIn2026)

    // Without the backfill the same week would now bill forty hours, and
    // the history would silently lose the premium it was paid for.
    const unbackfilled = billableInPeriod(sheet(days), SEPTEMBER, 'SPLIT', RATE, policy)!
    expect(unbackfilled.value.totalCents).toBe(40 * RATE)
  })

  it('the backfill answers only weeks somebody already approved, and never the worker whose hours they are', () => {
    const script = read('scripts/backfill-overtime-decisions.ts')
    // Approved by the column or by the ledger, and nothing else. An
    // open week is a question for the approval desk.
    expect(script).toContain("{ status: 'APPROVED' }")
    expect(script).toContain("role: 'CLIENT_APPROVAL', state: 'LIVE'")
    // Nobody decides overtime on their own hours, including a script.
    expect(script).toContain('id !== sheet.personId')
    // What was applied is what the contract said, because that is what
    // the invoice charged.
    expect(script).toContain("treatment: 'PREMIUM'")
    expect(script).toContain('appliedBps: contract.overtimeMultiplierBps')
    // A week already on an invoice is stamped billed with that
    // invoice's own date, so it cannot be re-answered afterwards.
    expect(script).toContain('billedAt: billedOn')
    // And it says in words that nobody signed these.
    expect(script).toContain('Derived, not decided')
  })

  it('straight time is straight time: no threshold means no premium and nothing pending', () => {
    const b = billableInPeriod(
      sheet(week('2026-09-07', [12, 12, 12, 12, 12])), SEPTEMBER, 'SPLIT', RATE,
      { afterHours: null, multiplierBps: 15_000 }
    )!
    expect(b.hours).toBe(60)
    expect(b.pendingHours).toBe(0)
    expect(b.value.totalCents).toBe(60 * RATE)
  })

  it('a timesheet outside the period being billed is none of its business', () => {
    expect(
      billableInPeriod(sheet(week('2026-07-06', [8, 8, 8, 8, 8])), SEPTEMBER, 'SPLIT', RATE, OT)
    ).toBeNull()
  })
})

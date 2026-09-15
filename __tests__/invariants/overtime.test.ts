import { describe, it, expect } from 'vitest'
import {
  splitWeeks,
  valueOf,
  valueOfWeek,
  billableHours,
  weekStart,
  policyOf,
  says,
  saysAwaiting,
  weeksAwaitingDecision,
  mayDecide,
  mayChange,
  priceChoice,
  treatmentSays,
  STRAIGHT_TIME,
  decidingLeg,
  ladderOrder,
  type Decision,
  type ChainRung,
} from '@/lib/overtime'

/**
 * Overtime, after the correction: a multiplier on a contract is an
 * offer, not an outcome.
 *
 * Two mistakes are guarded here, and both of them reached an invoice.
 *
 * The first is treating a pay period as a week. Forty-five hours in a
 * week is five hours of overtime; the same forty-five spread over two
 * weeks is none, and a semi-monthly period holds two and a bit weeks.
 *
 * The second is pricing those five hours because a field on the
 * contract said 15000. A 45-hour week at $100 billed $4,750 and nobody
 * had agreed to the $750. Hours over the line are now *pending* until
 * whoever signs the week says what happens to them, and pending hours
 * are excluded from the money entirely rather than valued at zero.
 */

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

const decided = (weekOf: string, treatment: Decision['treatment'], appliedBps: number, overtimeHours: number): Decision =>
  ({ weekOf, treatment, appliedBps, overtimeHours })

describe('which week an hour belongs to', () => {
  it('a week begins on Monday, and Sunday belongs to the week that began six days earlier', () => {
    expect(weekStart('2026-09-07')).toBe('2026-09-07') // Monday
    expect(weekStart('2026-09-11')).toBe('2026-09-07') // Friday
    expect(weekStart('2026-09-13')).toBe('2026-09-07') // Sunday
    expect(weekStart('2026-09-14')).toBe('2026-09-14') // the next Monday
  })
})

describe('splitting a week into regular and overtime', () => {
  it('forty hours is forty regular and nothing over the line', () => {
    const s = splitWeeks(week('2026-09-07', [8, 8, 8, 8, 8]), OT)
    expect(s.regularHours).toBe(40)
    expect(s.pendingHours).toBe(0)
    expect(s.overtimeHours).toBe(0)
  })

  it('forty-five hours is forty regular and five waiting on somebody', () => {
    const s = splitWeeks(week('2026-09-07', [9, 9, 9, 9, 9]), OT)
    expect(s.regularHours).toBe(40)
    expect(s.pendingHours).toBe(5)
  })

  it('the same forty-five across two weeks is no overtime at all — the mistake this file exists to stop', () => {
    const days = { ...week('2026-09-10', [9, 9]), ...week('2026-09-14', [9, 9, 9]) }
    const s = splitWeeks(days, OT)
    expect(s.pendingHours).toBe(0)
    expect(s.regularHours).toBe(45)
    expect(s.weeks).toHaveLength(2)
  })

  it('a period holding two full weeks weighs each week on its own, and not the period', () => {
    const days = { ...week('2026-09-07', [10, 10, 10, 10, 10]), ...week('2026-09-14', [8, 8, 8, 8, 8]) }
    const s = splitWeeks(days, OT)
    expect(s.weeks.map((w) => w.overHours)).toEqual([10, 0])
    expect(s.pendingHours).toBe(10)
  })

  it('straight time is the default, so nothing multiplies itself because a field was left empty', () => {
    const s = splitWeeks(week('2026-09-07', [12, 12, 12, 12, 12]), STRAIGHT_TIME)
    expect(s.pendingHours).toBe(0)
    expect(s.regularHours).toBe(60)
    expect(policyOf(null).afterHours).toBeNull()
    expect(policyOf({ overtimeAfterHours: null }).afterHours).toBeNull()
  })

  it('ignores a day with no hours, and a day somebody typed nonsense into', () => {
    const s = splitWeeks({ '2026-09-07': 8, '2026-09-08': 0, '2026-09-09': NaN as unknown as number }, OT)
    expect(s.regularHours).toBe(8)
  })
})

describe('what the hours are worth, once somebody has decided', () => {
  const days = week('2026-09-07', [9, 9, 9, 9, 9]) // 45 hours, 5 over
  const RATE = 10_000 // $100/hr

  it('undecided overtime does not bill at the premium and does not reach the invoice', () => {
    const v = valueOfWeek(days, RATE, OT)
    expect(v.totalCents).toBe(400_000) // $4,000 — forty hours, and not one more
    expect(v.overtimeCents).toBe(0)
    expect(v.pendingHours).toBe(5)
    // The five hours are their own number. They are not quietly regular.
    expect(v.split.regularHours).toBe(40)
    expect(billableHours(v.split)).toBe(40)
  })

  it('overtime decided as the same rate bills flat, with no premium', () => {
    const v = valueOfWeek(days, RATE, OT, { decisions: [decided('2026-09-07', 'SAME_RATE', 10_000, 5)] })
    expect(v.overtimeCents).toBe(50_000) // 5h × $100
    expect(v.totalCents).toBe(450_000) // $4,500
    expect(v.pendingHours).toBe(0)
    expect(billableHours(v.split)).toBe(45)
  })

  it('overtime decided as a premium bills at the multiplier the approver chose, not the contract default', () => {
    // The contract says time and a half. This week was agreed at double time.
    const v = valueOfWeek(days, RATE, OT, { decisions: [decided('2026-09-07', 'PREMIUM', 20_000, 5)] })
    expect(v.overtimeCents).toBe(100_000) // 5h × $100 × 2.0, not × 1.5
    expect(v.totalCents).toBe(500_000)
  })

  it('overtime decided as a premium at the contract multiplier is the ordinary case, and bills $4,750', () => {
    const v = valueOfWeek(days, RATE, OT, { decisions: [decided('2026-09-07', 'PREMIUM', 15_000, 5)] })
    expect(v.totalCents).toBe(475_000)
    expect(v.overtimeCents).toBe(75_000)
  })

  it('overtime decided as time off does not bill, and the hours appear in the bank', () => {
    const v = valueOfWeek(days, RATE, OT, { decisions: [decided('2026-09-07', 'TIME_OFF', 0, 5)] })
    expect(v.totalCents).toBe(400_000) // $4,000, as if the week had been forty hours
    expect(v.overtimeCents).toBe(0)
    expect(v.split.bankedHours).toBe(5)
    expect(v.pendingHours).toBe(0)
  })

  it('amending the contract multiplier does not restate an invoice already sent', () => {
    const decision = decided('2026-09-07', 'PREMIUM', 15_000, 5)
    const sent = valueOfWeek(days, RATE, OT, { decisions: [decision] })
    // Somebody amends the contract to double time in March.
    const amended = { afterHours: 40, multiplierBps: 20_000 }
    const reread = valueOfWeek(days, RATE, amended, { decisions: [decision] })
    expect(reread.totalCents).toBe(sent.totalCents)
    expect(reread.overtimeCents).toBe(75_000)
  })

  it('a straight-time week is worth exactly hours times rate, as it always was', () => {
    const v = valueOfWeek(days, RATE, STRAIGHT_TIME)
    expect(v.totalCents).toBe(450_000)
    expect(v.overtimeCents).toBe(0)
    expect(v.pendingHours).toBe(0)
  })

  it('rounds once per band rather than per day, so a line agrees with the invoice it sits on', () => {
    const odd = week('2026-09-07', [8.33, 8.33, 8.33, 8.33, 8.33])
    const v = valueOfWeek(odd, 3_333, OT, { decisions: [decided('2026-09-07', 'PREMIUM', 15_000, 1.65)] })
    expect(v.regularCents + v.leaveCents + v.overtimeCents).toBe(v.totalCents)
    expect(Number.isInteger(v.totalCents)).toBe(true)
  })

  it('a semi-monthly sheet asks once per overtime week, not once per sheet', () => {
    const days2 = { ...week('2026-09-07', [9, 9, 9, 9, 9]), ...week('2026-09-14', [10, 10, 10, 10, 10]) }
    const none = splitWeeks(days2, OT)
    expect(weeksAwaitingDecision(none).map((w) => w.weekOf)).toEqual(['2026-09-07', '2026-09-14'])

    // One week answered. The other is still a question, and answering
    // the first does not answer it.
    const half = splitWeeks(days2, OT, { decisions: [decided('2026-09-07', 'SAME_RATE', 10_000, 5)] })
    expect(weeksAwaitingDecision(half).map((w) => w.weekOf)).toEqual(['2026-09-14'])
    expect(half.overtimeHours).toBe(5)
    expect(half.pendingHours).toBe(10)

    // And the two weeks may honestly be answered differently.
    const both = splitWeeks(days2, OT, {
      decisions: [decided('2026-09-07', 'SAME_RATE', 10_000, 5), decided('2026-09-14', 'TIME_OFF', 0, 10)],
    })
    expect(both.overtimeHours).toBe(5)
    expect(both.bankedHours).toBe(10)
    expect(weeksAwaitingDecision(both)).toEqual([])
  })

  it('every hour on a sheet is regular, leave, decided overtime or waiting — and never two of them', () => {
    const days2 = { ...week('2026-09-07', [9, 9, 9, 9, 9]), ...week('2026-09-14', [10, 10, 10, 10, 10]) }
    const s = splitWeeks(days2, OT, { decisions: [decided('2026-09-14', 'TIME_OFF', 0, 10)] })
    const total = s.regularHours + s.leaveHours + s.overtimeHours + s.bankedHours + s.pendingHours
    expect(total).toBe(95)
  })
})

describe('leave that was banked, and taken', () => {
  const RATE = 10_000

  it('leave taken does not count toward the overtime threshold', () => {
    // Four days worked at eight hours, one day of banked leave. The
    // sheet reads forty hours; only thirty-two were worked.
    const days = week('2026-09-07', [8, 8, 8, 8, 8])
    const s = splitWeeks(days, OT, { leaveDays: { '2026-09-11': 8 } })
    expect(s.weeks[0].workedHours).toBe(32)
    expect(s.leaveHours).toBe(8)
    expect(s.pendingHours).toBe(0)
  })

  it('a week of banked leave cannot manufacture fresh overtime, which is what would let the bank refill itself', () => {
    // Forty-five hours on the sheet, five of them leave. Worked forty.
    const days = week('2026-09-07', [9, 9, 9, 9, 9])
    const s = splitWeeks(days, OT, { leaveDays: { '2026-09-11': 5 } })
    expect(s.pendingHours).toBe(0)
    expect(s.overtimeHours).toBe(0)
    expect(s.bankedHours).toBe(0)
    expect(s.regularHours).toBe(40)
    expect(s.leaveHours).toBe(5)
  })

  it('paid leave is billed at the usual rate, because the consultant is paid for it', () => {
    const days = week('2026-09-07', [8, 8, 8, 8, 8])
    const v = valueOfWeek(days, RATE, OT, { leaveDays: { '2026-09-11': 8 } })
    expect(v.leaveCents).toBe(80_000)
    expect(v.regularCents).toBe(320_000)
    expect(v.totalCents).toBe(400_000)
  })

  it('more leave than hours on a day is taken as the hours there are, never as a negative week', () => {
    const days = week('2026-09-07', [8])
    const s = splitWeeks(days, OT, { leaveDays: { '2026-09-07': 40 } })
    expect(s.leaveHours).toBe(8)
    expect(s.regularHours).toBe(0)
  })
})

describe('a decision that no longer describes the week it was made about', () => {
  it('amending the hours after a decision makes it stale, and the week is asked again', () => {
    // Decided when the week held 45 hours. The consultant corrected it to 48.
    const corrected = week('2026-09-07', [9, 9, 9, 9, 12])
    const s = splitWeeks(corrected, OT, { decisions: [decided('2026-09-07', 'PREMIUM', 15_000, 5)] })
    expect(s.weeks[0].stale).toBe(true)
    expect(s.overtimeHours).toBe(0)
    expect(s.pendingHours).toBe(8)
    expect(weeksAwaitingDecision(s)).toHaveLength(1)
  })

  it('a week that no longer goes over the line at all carries no overtime, decided or otherwise', () => {
    const corrected = week('2026-09-07', [8, 8, 8, 8, 8])
    const s = splitWeeks(corrected, OT, { decisions: [decided('2026-09-07', 'PREMIUM', 15_000, 5)] })
    expect(s.overtimeHours).toBe(0)
    expect(s.pendingHours).toBe(0)
    expect(s.regularHours).toBe(40)
  })

  it('a decision that has reached an invoice cannot be changed', () => {
    expect(mayChange({ billedAt: new Date('2026-09-30') }).ok).toBe(false)
    expect(mayChange({ billedAt: new Date('2026-09-30') }).says).toMatch(/already been invoiced/)
    expect(mayChange({ billedAt: null }).ok).toBe(true)
    expect(mayChange(null).ok).toBe(true)
  })
})

describe('who may say what a week is worth', () => {
  const leg = {
    personId: 'priya',
    employerCompanyId: 'brightmoor',
    clientCompanyId: 'nike',
    endClientCompanyId: null,
    clientName: 'Nike',
    employerName: 'Brightmoor',
  }

  it('nobody decides overtime on hours they worked themselves', () => {
    const v = mayDecide({ personId: 'priya', companyId: 'brightmoor' }, leg)
    expect(v.ok).toBe(false)
    expect(v.says).toBe('Nobody decides overtime on hours they worked themselves.')
  })

  it('a sub-vendor decides its own leg and never sees the client’s decision', () => {
    const v = mayDecide({ personId: 'someone-at-vertex', companyId: 'vertex' }, leg)
    expect(v.ok).toBe(false)
    expect(v.says).toBe(
      'That week is between Nike and Brightmoor. Decide what you pay on your own contract.'
    )
  })

  it('the client who is billed for the week may decide it, and so may the supplier who pays for it', () => {
    expect(mayDecide({ personId: 'manager', companyId: 'nike' }, leg).ok).toBe(true)
    expect(mayDecide({ personId: 'recruiter', companyId: 'brightmoor' }, leg).ok).toBe(true)
  })

  it('an end client further up the chain is a party to the week and may decide it', () => {
    const chain = { ...leg, clientCompanyId: 'prime', endClientCompanyId: 'nike' }
    expect(mayDecide({ personId: 'manager', companyId: 'nike' }, chain).ok).toBe(true)
  })

  it('somebody with no company at all is told whose week it is rather than shown a code', () => {
    const v = mayDecide({ personId: 'drifter', companyId: null }, leg)
    expect(v.ok).toBe(false)
    expect(v.says).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/)
  })
})

describe('turning a choice into a number an invoice can price from', () => {
  it('the same rate applies no premium at all', () => {
    const p = priceChoice({ treatment: 'SAME_RATE' }, OT)
    expect(p.ok).toBe(true)
    expect(p.appliedBps).toBe(10_000)
  })

  it('a premium with no number of its own falls back to what the contract offered', () => {
    const p = priceChoice({ treatment: 'PREMIUM' }, OT)
    expect(p.ok).toBe(true)
    expect(p.appliedBps).toBe(15_000)
  })

  it('choosing a multiplier the contract never said needs a reason on the record', () => {
    expect(priceChoice({ treatment: 'PREMIUM', multiplierBps: 20_000 }, OT).ok).toBe(false)
    expect(priceChoice({ treatment: 'PREMIUM', multiplierBps: 20_000, reason: 'Go-live weekend, agreed with Nike' }, OT))
      .toMatchObject({ ok: true, appliedBps: 20_000 })
  })

  it('a premium below the usual rate is not a premium, and is refused in words', () => {
    const p = priceChoice({ treatment: 'PREMIUM', multiplierBps: 8_000, reason: 'cheaper' }, OT)
    expect(p.ok).toBe(false)
    expect(p.says).toMatch(/cannot be less than the usual rate/)
  })

  it('banking hours instead of paying them needs a reason, because it costs the consultant money now', () => {
    expect(priceChoice({ treatment: 'TIME_OFF' }, OT).ok).toBe(false)
    expect(priceChoice({ treatment: 'TIME_OFF', reason: 'Priya asked for the time back in October' }, OT))
      .toMatchObject({ ok: true, appliedBps: 0, accrualBps: 10_000 })
  })
})

describe('what the screen says', () => {
  it('the terms say who decides, and never claim the contract pays time and a half by itself', () => {
    const line = says({ afterHours: 40, multiplierBps: 15_000 })
    expect(line).toMatch(/Over 40 hours in a week, whoever approves the week decides/)
    expect(line).toMatch(/time and a half/)
    expect(line).not.toBe('Over 40 hours in a week is time and a half.')
  })

  it('says straight time plainly rather than leaving the reader to infer it from a blank', () => {
    expect(says(STRAIGHT_TIME)).toMatch(/every hour at the same rate/)
  })

  it('a week over the threshold cannot be approved until somebody says what happens to the overtime', () => {
    const s = splitWeeks(week('2026-09-07', [9, 9, 9, 9, 9]), OT)
    const waiting = weeksAwaitingDecision(s)
    expect(waiting).toHaveLength(1)
    expect(saysAwaiting(waiting, 'Priya Nair', OT)).toBe(
      'Priya Nair worked 45 hours in the week of September 7 — 5 hours over the 40 on this contract. ' +
        'Say what happens to those hours before you approve the week.'
    )
  })

  it('two overtime weeks read as two questions, so asking twice does not look like a bug', () => {
    const days = { ...week('2026-09-07', [9, 9, 9, 9, 9]), ...week('2026-09-14', [10, 10, 10, 10, 10]) }
    const line = saysAwaiting(weeksAwaitingDecision(splitWeeks(days, OT)), 'Priya Nair', OT)
    expect(line).toMatch(/2 weeks on this timesheet went over 40 hours/)
    expect(line).toMatch(/September 7 \(5 hours over\) and September 14 \(10 hours over\)/)
    expect(line).toMatch(/decided a week at a time/)
  })

  it('names each choice the way a hiring manager would say it, never as the enum', () => {
    expect(treatmentSays('SAME_RATE', 10_000)).toBe('Paid at the usual rate')
    expect(treatmentSays('PREMIUM', 15_000)).toBe('Paid at time and a half')
    expect(treatmentSays('PREMIUM', 20_000)).toBe('Paid at double time')
    expect(treatmentSays('TIME_OFF', 0)).toBe('Banked as paid time off')
  })

  it('every refusal on this desk is a sentence, not a code', () => {
    const lines = [
      mayDecide({ personId: 'priya', companyId: 'x' }, { personId: 'priya', employerCompanyId: 'a', clientCompanyId: 'b' }).says,
      mayChange({ billedAt: new Date() }).says,
      priceChoice({ treatment: 'TIME_OFF' }, OT).says,
      priceChoice({ treatment: 'PREMIUM', multiplierBps: 1 }, OT).says,
    ]
    for (const line of lines) {
      expect(line).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/)
      expect(line.endsWith('.')).toBe(true)
    }
  })
})

describe('the split still values a plain week the way it always did', () => {
  it('valueOf takes a rate and a split, and needs no policy to price a decided week', () => {
    const s = splitWeeks(week('2026-09-07', [8, 8, 8, 8, 8]), OT)
    expect(valueOf(s, 5_000).totalCents).toBe(200_000)
  })
})

describe('in a chain, nobody decides their own leg', () => {
  // Adobe buys Priya from Computer Systems, who buys her from CloudEPA,
  // who employs her. The hours are filed once, at the bottom.
  const TOP: ChainRung = {
    sellContractId: 'cs-adobe',
    companyId: 'computer-systems',
    clientCompanyId: 'adobe',
    endClientCompanyId: 'adobe',
    supplierSellContractId: 'cloudepa-cs',
  }
  const BOTTOM: ChainRung = {
    sellContractId: 'cloudepa-cs',
    companyId: 'cloudepa',
    clientCompanyId: 'computer-systems',
    endClientCompanyId: 'adobe',
    supplierSellContractId: null,
  }
  const CHAIN = [BOTTOM, TOP] // deliberately out of order; the walk sorts it
  const HOURS = 'cloudepa-cs'

  it('a client approving in a chain decides its own leg, not the leg the hours sit on', () => {
    const leg = decidingLeg('adobe', CHAIN, HOURS)
    expect(leg.sellContractId).toBe('cs-adobe')
    expect(leg.role).toBe('CLIENT_APPROVAL')
    expect(leg.onHoursLeg).toBe(false)
  })

  it("a sub-vendor's decision is its own and the client never sees it", () => {
    const sub = decidingLeg('cloudepa', CHAIN, HOURS)
    const client = decidingLeg('adobe', CHAIN, HOURS)
    expect(sub.sellContractId).toBe('cloudepa-cs')
    expect(sub.role).toBe('EMPLOYER_ACCEPTANCE')
    expect(sub.sellContractId).not.toBe(client.sellContractId)
  })

  it('a prime answers on the contract it buys from its sub, never on the one it sells', () => {
    const prime = decidingLeg('computer-systems', CHAIN, HOURS)
    expect(prime.role).toBe('PASS_THROUGH')
    expect(prime.sellContractId).toBe('cloudepa-cs')
    expect(prime.sellContractId).not.toBe('cs-adobe')
  })

  it('a direct placement has one leg, and deciding it is the ordinary case', () => {
    const only: ChainRung = {
      sellContractId: 'brightmoor-nike',
      companyId: 'brightmoor',
      clientCompanyId: 'nike',
      endClientCompanyId: null,
      supplierSellContractId: null,
    }
    for (const who of ['nike', 'brightmoor']) {
      const leg = decidingLeg(who, [only], 'brightmoor-nike')
      expect(leg.sellContractId).toBe('brightmoor-nike')
      expect(leg.onHoursLeg).toBe(true)
    }
    expect(decidingLeg('nike', [only], 'brightmoor-nike').role).toBe('CLIENT_APPROVAL')
    expect(decidingLeg('brightmoor', [only], 'brightmoor-nike').role).toBe('EMPLOYER_ACCEPTANCE')
  })

  it('the end client is named on every rung and buys only on the top one', () => {
    // Adobe appears as end client on the sub's contract too. Reading that
    // as a purchase would put Adobe's agreement on CloudEPA's row, which
    // is the bug this exists to stop.
    expect(BOTTOM.endClientCompanyId).toBe('adobe')
    expect(decidingLeg('adobe', CHAIN, HOURS).sellContractId).toBe('cs-adobe')
  })

  it('a firm that is nobody on this ladder is left where it was, and refused elsewhere', () => {
    const stranger = decidingLeg('some-other-firm', CHAIN, HOURS)
    expect(stranger.sellContractId).toBe(HOURS)
    expect(mayDecide(
      { personId: 'somebody', companyId: 'some-other-firm' },
      { personId: 'priya', employerCompanyId: 'cloudepa', clientCompanyId: 'computer-systems', endClientCompanyId: 'adobe' }
    ).ok).toBe(false)
  })

  it('a caller with no company has no leg to answer on, and the sentence says so', () => {
    const none = decidingLeg(null, CHAIN, HOURS)
    expect(none.role).toBeNull()
    expect(none.sellContractId).toBe(HOURS)
    expect(none.says).toContain('no leg to answer on')
  })

  it('the ladder reads top to bottom however the rungs arrive', () => {
    expect(ladderOrder(CHAIN).map((r) => r.sellContractId)).toEqual(['cs-adobe', 'cloudepa-cs'])
    expect(ladderOrder([TOP, BOTTOM]).map((r) => r.sellContractId)).toEqual(['cs-adobe', 'cloudepa-cs'])
  })

  it('a rung whose neighbours were not read keeps its place rather than vanishing', () => {
    // A partial read is a partial read. Dropping the rung would silently
    // move somebody's answer onto a contract they are not on.
    const partial = ladderOrder([{ ...BOTTOM, supplierSellContractId: 'a-rung-nobody-fetched' }])
    expect(partial.map((r) => r.sellContractId)).toEqual(['cloudepa-cs'])
  })

  it('every sentence on this desk is English, and never a contract id', () => {
    for (const who of ['adobe', 'computer-systems', 'cloudepa']) {
      const leg = decidingLeg(who, CHAIN, HOURS)
      expect(leg.says).not.toContain('cloudepa-cs')
      expect(leg.says.endsWith('.')).toBe(true)
    }
  })
})

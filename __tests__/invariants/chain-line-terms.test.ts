import { describe, it, expect } from 'vitest'
import { recompute } from '@/lib/invoice-match'
import { periodFor, type Terms } from '@/lib/periods'

/**
 * A line in a chain is priced on the terms of the contract it bills.
 *
 * Hours are filed once, on the contract of the firm that employs the
 * person, and every rung above bills the same week at its own rate and
 * on its own terms. The generator knew this — it substitutes our own
 * contract for the one the hours sit on before pricing anything. The
 * three-way match and the invoice screen did not: they read the rate
 * and the overtime terms off the timesheet's contract, which is the
 * rung underneath. Helena Marsh's $145 line to Northbend Athletic was
 * held to Techpeple's $118, wherever no rate-history row stood in front
 * of the contract to hide it.
 */

const SEPTEMBER = periodFor(new Date('2026-09-15T00:00:00.000Z'), {
  frequency: 'MONTHLY', anchor: 'CALENDAR', straddle: 'SPLIT',
  startedOn: new Date('2026-01-01T00:00:00.000Z'),
} as Terms)

function nineHourWeek() {
  const days: Record<string, number> = {}
  for (let i = 0; i < 5; i++) days[`2026-09-${String(7 + i).padStart(2, '0')}`] = 9
  return days
}

/** The prime bills 45 hours at $145; the sub's contract has no overtime line at all. */
const line = {
  hours: 45, rateCents: 14_500,
  amountCents: 40 * 14_500 + 5 * 14_500 * 1.5,
  sellContractId: 'prime-line',
  sellContract: { overtimeAfterHours: 40, overtimeMultiplierBps: 15_000, billStraddle: 'END' },
  timesheet: {
    id: 'ts-1',
    periodStart: new Date('2026-09-07T00:00:00.000Z'),
    periodEnd: new Date('2026-09-13T00:00:00.000Z'),
    totalHours: 45,
    days: nineHourWeek(),
    leaveDays: {},
    sellContractId: 'sub-line',
    overtimeDecisions: [{
      sellContractId: 'sub-line', weekOf: new Date('2026-09-07T00:00:00.000Z'),
      treatment: 'PREMIUM', appliedBps: 15_000, overtimeHours: 5, accrualBps: 10_000,
    }],
    sellContract: { overtimeAfterHours: null, overtimeMultiplierBps: 15_000, billStraddle: 'SPLIT' },
  },
}

describe('a chain’s line, recomputed', () => {
  it('a chain’s overtime working is recomputed from the terms of the contract being billed, not the rung the hours were filed on', () => {
    const w = recompute(line, SEPTEMBER)!
    expect(w.premiumCents).toBe(5 * 14_500 * 0.5)
    expect(w.bands.map((b) => [b.hours, b.rateCents])).toEqual([[40, 14_500], [5, 14_500 * 1.5]])
  })

  it('a line whose own contract was not loaded falls back to the timesheet’s, which is the same row on a direct placement', () => {
    const { sellContract: _, ...direct } = line
    // The sub's terms draw no overtime line, and somebody decided the
    // week — so it is judged against the job's hours, forty where the job
    // names none (lineFor, handed over by demand 2026-09-30), and the
    // premium decided on it is priced rather than dropped.
    const w = recompute({ ...direct, amountCents: 45 * 14_500 }, SEPTEMBER)!
    expect(w.premiumCents).toBe(5 * 14_500 * 0.5)
  })

  it('a week nobody decided, on a contract with no overtime line, recomputes as nothing at all', () => {
    const { sellContract: _, ...direct } = line
    const undecided = { ...direct, timesheet: { ...direct.timesheet, overtimeDecisions: [] } }
    expect(recompute({ ...undecided, amountCents: 45 * 14_500 }, SEPTEMBER)).toBeNull()
  })
})

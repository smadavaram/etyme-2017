/**
 * Terms before the start, from money's side of the award.
 *
 * Demand closed the award on 2026-10-06 against writing an employment the
 * person never agreed (`lib/award/hire-terms`) and left three things owed
 * here: activation must ask the terms gate, "Record a placement" must not
 * be a second door that writes the old $0 line, and an award for work
 * already under way must still write the reminders that are not yet past.
 *
 * The activation gate is walked on the seeded world in
 * `__integration__/start-waits-on-terms.test.ts`. This file is the
 * arithmetic: which pay line a recorded placement writes, which dates an
 * under-way award keeps, and which period its first pay day pays.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recordedLine } from '@/lib/money/recorded-line'
import { generateCycles, type CycleDefinition } from '@/lib/cycle-generator'
import { payDaysToMark } from '@/lib/money/pay-day-period'
import { periodFor, type Terms } from '@/lib/periods'
import { noDatesBefore } from '@/lib/award/hire-terms'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date) => x.toISOString().slice(0, 10)
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const base = {
  personName: 'Marisol Quintero',
  firmName: 'Brightmoor Staffing',
  ownCompany: null,
  boughtFrom: null,
}

describe('the pay line a recorded placement writes', () => {
  it('a placement recorded with no engagement and no pay writes no pay line, and says the firm owes its terms', () => {
    const v = recordedLine({ ...base })
    expect(v.ok && v.write).toBeNull()
    expect(v.says).toBe(
      'No pay line yet. Brightmoor Staffing has not said how it engages Marisol Quintero or what it pays them, so the placement cannot start until it does.'
    )
  })

  it('a placement recorded as the firm’s employee at $90 writes a W2 line paying the person $90', () => {
    const v = recordedLine({ ...base, engagementType: 'W2', payRateCents: 9_000 })
    expect(v.ok && v.write).toEqual({ contractType: 'W2', vendorCompanyId: null, payRateCents: 9_000 })
    expect(v.says).toBe('Brightmoor Staffing employs Marisol Quintero at $90/hr.')
  })

  it('a placement recorded at a pay rate of nothing is refused as a missing rate, not a free placement', () => {
    for (const payRateCents of [0, '0', -500, 'abc']) {
      const v = recordedLine({ ...base, engagementType: 'W2', payRateCents })
      expect(v.ok).toBe(false)
      expect(!v.ok && v.code).toBe('NO_RATE')
      expect(v.says).toBe('Say what Brightmoor Staffing pays Marisol Quintero. An empty rate is a missing rate, not a free placement.')
    }
    // A rate typed with no way of engaging her is not a line either.
    const typeless = recordedLine({ ...base, payRateCents: 9_000 })
    expect(!typeless.ok && typeless.code).toBe('NO_TYPE')
  })

  it('a placement recorded through the person’s own company pays that company, corp-to-corp', () => {
    const v = recordedLine({ ...base, ownCompany: { id: 'mq-llc', name: 'Quintero Controls LLC' }, engagementType: 'OWN_COMPANY', payRateCents: 11_000 })
    expect(v.ok && v.write).toEqual({ contractType: 'C2C', vendorCompanyId: 'mq-llc', payRateCents: 11_000 })
    // Naming her own company as the supplier is the same thing, said the other way.
    const asSupplier = recordedLine({
      ...base, ownCompany: { id: 'mq-llc', name: 'Quintero Controls LLC' },
      boughtFrom: { id: 'mq-llc', name: 'Quintero Controls LLC' }, payRateCents: 11_000,
    })
    expect(asSupplier.ok && asSupplier.write).toEqual({ contractType: 'C2C', vendorCompanyId: 'mq-llc', payRateCents: 11_000 })
  })

  it('a placement recorded through their own company is refused when they have no company on record', () => {
    const v = recordedLine({ ...base, engagementType: 'OWN_COMPANY', payRateCents: 11_000 })
    expect(!v.ok && v.code).toBe('NO_OWN_COMPANY')
  })

  it('a placement recorded as employed by another firm is refused in the words the terms page uses', () => {
    const v = recordedLine({ ...base, engagementType: 'OTHER_EMPLOYER', payRateCents: 9_000 })
    expect(!v.ok && v.code).toBe('THROUGH_THE_EMPLOYER')
    expect(v.says).toBe(
      "Marisol Quintero's employer has to agree this, so it cannot be written from here. " +
        'Ask the employer to put Marisol Quintero forward to Brightmoor Staffing; the chain then carries them as its own hop.'
    )
  })

  it('a placement bought from a supplier pays the supplier, and the person’s own terms stay between them and the supplier', () => {
    const v = recordedLine({ ...base, boughtFrom: { id: 'pin', name: 'Pinnacle Talent' }, payRateCents: 11_500 })
    expect(v.ok && v.write).toEqual({ contractType: 'C2C', vendorCompanyId: 'pin', payRateCents: 11_500 })
    expect(v.says).toBe(
      'Brightmoor Staffing buys Marisol Quintero from Pinnacle Talent at $115/hr. How Pinnacle Talent engages and pays them is between them.'
    )
    // "Employed by another firm" is what buying from a supplier means.
    const employed = recordedLine({ ...base, boughtFrom: { id: 'pin', name: 'Pinnacle Talent' }, engagementType: 'OTHER_EMPLOYER', payRateCents: 11_500 })
    expect(employed.ok).toBe(true)
  })

  it('a placement bought from a supplier at no rate is refused as a missing rate', () => {
    const v = recordedLine({ ...base, boughtFrom: { id: 'pin', name: 'Pinnacle Talent' }, payRateCents: 0 })
    expect(!v.ok && v.code).toBe('NO_RATE')
    expect(v.says).toBe('Say what Brightmoor Staffing pays Pinnacle Talent for Marisol Quintero. An empty rate is a missing rate, not a free placement.')
  })

  it('a person cannot be the firm’s employee and bought from a supplier at once', () => {
    for (const engagementType of ['W2', 'IND_1099', 'OWN_COMPANY']) {
      const v = recordedLine({ ...base, boughtFrom: { id: 'pin', name: 'Pinnacle Talent' }, engagementType, payRateCents: 9_000 })
      expect(!v.ok && v.code).toBe('TWO_ENGAGEMENTS')
    }
  })

  it('a corp-to-corp line with nobody named to pay is refused, never written to nobody', () => {
    // The older field, as `network-stress` and a script still send it.
    const v = recordedLine({ ...base, contractType: 'C2C', payRateCents: 9_000 })
    expect(!v.ok && v.code).toBe('NO_OWN_COMPANY')
    const w2 = recordedLine({ ...base, contractType: 'W2', payRateCents: 8_000 })
    expect(w2.ok && w2.write).toEqual({ contractType: 'W2', vendorCompanyId: null, payRateCents: 8_000 })
  })

  it('the contracts route writes its pay line from this rule and from nothing else', () => {
    const route = read('src/app/api/contracts/route.ts')
    expect(route).toMatch(/recordedLine\(/)
    expect(route).not.toMatch(/contractType: contractType \?\? 'W2'/)
  })
})

// ── Dates on an award for work already under way ─────────────────────

const APPROVE: CycleDefinition[] = [
  { kind: 'TIMESHEET_APPROVE', frequency: 'WEEKLY', dayOfWeek: 5, offsetDays: 3 },
]

describe('the dates an award for work already under way keeps', () => {
  // Work began Friday 4 September; the award is Sunday 4 October. The week
  // ending Friday 2 October is approved Monday 5 October — the day after
  // the award.
  const start = d('2026-09-04')
  const end = d('2026-10-30')
  const award = d('2026-10-04')

  it('a period that ended before the award but is due today or later keeps its date', () => {
    const kept = generateCycles(start, end, APPROVE, [], new Map(), { noneDueBefore: award }).map((c) => iso(c.dueOn))
    expect(kept[0]).toBe('2026-10-05')
    // Bounded by the period instead, that Monday was dropped — the bug.
    const byPeriod = generateCycles(start, end, APPROVE, [], new Map(), { onlyPeriodsAfter: noDatesBefore(award) }).map((c) => iso(c.dueOn))
    expect(byPeriod).not.toContain('2026-10-05')
  })

  it('no cycle is written due before the given day', () => {
    const kept = generateCycles(start, end, APPROVE, [], new Map(), { noneDueBefore: award })
    expect(kept.every((c) => iso(c.dueOn) >= '2026-10-04')).toBe(true)
    // A date on the day itself is kept.
    const onTheDay = generateCycles(start, end, APPROVE, [], new Map(), { noneDueBefore: d('2026-10-05') }).map((c) => iso(c.dueOn))
    expect(onTheDay[0]).toBe('2026-10-05')
  })

  it('an extension still writes no period that ended on or before the old end', () => {
    // Old end Friday 2 October; its approval falls on Monday 5 October,
    // after the old end, and was written by the first run.
    const added = generateCycles(start, end, APPROVE, [], new Map(), { onlyPeriodsAfter: d('2026-10-02') }).map((c) => iso(c.dueOn))
    expect(added[0]).toBe('2026-10-12')
  })
})

describe('which period the first pay day after an under-way award pays', () => {
  const MONTHLY: Terms = { frequency: 'MONTHLY', anchor: 'CALENDAR', straddle: 'SPLIT', startedOn: d('2026-06-01') }
  const periodOf = (x: Date) => periodFor(x, MONTHLY)
  // Work since 1 June; awarded in late July; the pay days written are
  // the ones not yet past: 7 August (July) and 9 September (August).
  const cycles = [
    { id: 'p1', dueOn: d('2026-08-07'), completedAt: null },
    { id: 'p2', dueOn: d('2026-09-09'), completedAt: null },
  ]

  it('the first pay day after an award marked under way pays its own period, not the weeks before it', () => {
    const run = (m: string) =>
      payDaysToMark(cycles, [periodFor(d(`${m}-01`), MONTHLY)], periodOf, d('2026-06-01')).map((x) => x.id)
    expect(run('2026-07')).toEqual(['p1'])
    expect(run('2026-06')).toEqual([])
    expect(run('2026-08')).toEqual(['p2'])
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  mayReadBenchProfit, benchSpell, costOfDays, benchToBill, courseGroup, utilization, moveSaving, median,
  type Earned, type Placed, type Seat,
} from '@/lib/bench-profit'
import { benchCost, type Policy } from '@/lib/bench-policy'
import { anchorSeed, forgetSeedAnchor, seedToday, day } from '@/lib/seed-days'
import { NICHE_PEOPLE, nicheStart, nicheListed, nicheCourse } from '@/lib/seed-bench-profit'

/**
 * Bench profit (CLAUDE.md, "Bench profit, next after the integrator
 * flow", decided 2026-09-30): per person, bench to bill; per course, what
 * it cost and what it placed; for an integrator, utilization. Every figure
 * is read through a rule that already exists — `burnOf` and `benchCost`
 * for the bench, `placementEarned`'s weeks for the margin — and a figure
 * the record cannot support is blank with the reason.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const HALF: Policy = { policy: 'REDUCED_RATE', benchRateBps: 5000, carryDays: 90 }
const reader = (roleName: string | null, over: Partial<Parameters<typeof mayReadBenchProfit>[0]> = {}) =>
  mayReadBenchProfit({ companyName: 'Pellwright Validation Partners', companyKind: 'VENDOR', roleName, consultantSeat: false, ...over })

describe('who reads bench profit', () => {
  it('the owner, the admin and the finance desk read bench profit', () => {
    for (const role of ['Owner', 'Admin', 'Finance']) expect(reader(role).ok, role).toBe(true)
    expect(reader('Owner', { companyKind: 'GSI' }).ok).toBe(true)
  })

  it('a recruiter is refused in a sentence naming the three desks that read bench profit', () => {
    const v = reader('Recruiter')
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.message).toContain('owner, the admin and the finance desk')
    expect(v.message).toContain('(Recruiter)')
    for (const role of ['Account Manager', 'Resource Manager', 'AP & Payroll', 'HR', 'Delivery Manager', null]) {
      expect(reader(role).ok, String(role)).toBe(false)
    }
  })

  it('a client is refused bench profit, because a client never sees a supplier’s margin', () => {
    const v = reader('Owner', { companyKind: 'CLIENT' })
    expect(v).toMatchObject({ ok: false, code: 'CLIENT' })
    if (!v.ok) expect(v.message).toContain('no client reads it')
  })

  it('a consultant is refused bench profit and pointed at their own page', () => {
    const v = reader('Owner', { consultantSeat: true })
    expect(v).toMatchObject({ ok: false, code: 'NOT_STAFF' })
    if (!v.ok) expect(v.message).toContain('your own page')
  })

  it('the bench page offers the Bench profit tab only to a seat the route would read', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/bench/page.tsx'), 'utf8')
    expect(page).toContain('mayReadBenchProfit(')
    const route = readFileSync(join(process.cwd(), 'src/app/api/bench/profit/route.ts'), 'utf8')
    expect(route).toContain('mayReadBenchProfit(')
  })
})

describe('a spell on the bench', () => {
  const now = d('2026-06-01')

  it('a bench spell runs from the day they joined the bench to the day their placement started', () => {
    const s = benchSpell({ joinedBench: d('2026-01-10'), lines: [{ id: 'a', startsOn: d('2026-03-01'), endsOn: d('2026-12-31') }], now })
    expect(s).toMatchObject({ kind: 'BEFORE', days: 50 })
  })

  it('a bench spell starts the day their last placement ended, where that is later than the day they joined', () => {
    const s = benchSpell({
      joinedBench: d('2025-01-01'),
      lines: [
        { id: 'old', startsOn: d('2025-02-01'), endsOn: d('2026-02-20') },
        { id: 'new', startsOn: d('2026-03-02'), endsOn: null },
      ],
      now,
    })
    expect(s).toMatchObject({ kind: 'BEFORE', days: 10 })
    if (s.kind === 'BEFORE') expect(s.placement.id).toBe('new')
  })

  it('somebody placed with nothing on the record before it went straight onto a project, with no days on the bench', () => {
    const s = benchSpell({ joinedBench: null, lines: [{ id: 'a', startsOn: d('2026-03-01'), endsOn: null }], now })
    expect(s).toMatchObject({ kind: 'STRAIGHT_ON', days: 0 })
  })

  it('somebody on the bench now is counted to today, and names the day a papered line starts', () => {
    const s = benchSpell({
      joinedBench: d('2026-04-02'),
      lines: [{ id: 'later', startsOn: d('2026-07-01'), endsOn: null }],
      now,
    })
    expect(s).toMatchObject({ kind: 'NOW', days: 60 })
    if (s.kind === 'NOW') expect(s.startsOn?.toISOString().slice(0, 10)).toBe('2026-07-01')
  })

  it('nothing on the record about when they joined the bench is unknown, never a zero', () => {
    expect(benchSpell({ joinedBench: null, lines: [], now }).kind).toBe('UNKNOWN')
  })
})

describe('what the days on the bench cost', () => {
  it('the bench cost is the days on the bench under the firm’s bench pay policy, through the one bench cost rule', () => {
    const c = costOfDays({ days: 50, policy: HALF, payRateCents: 6200, contractType: 'W2', currency: 'USD' })
    // $62 an hour times an eight-hour day is burnOf's $496; half of it, on
    // benchCost's working days.
    expect(c.costCents).toBe(benchCost(HALF, { idleDays: 50, billingDayRateCents: 49_600 }).costCents)
    expect(c.costCents).toBe(892_800)
    expect(c.says).toBe('50 days on the bench at 50% of $496.00 a day, under your bench pay policy: $8,928.00.')
  })

  it('the bench cost stops at the carry limit and says so', () => {
    const c = costOfDays({ days: 100, policy: HALF, payRateCents: 6200, contractType: 'W2', currency: 'USD' })
    expect(c.costCents).toBe(1_587_200)
    expect(c.says).toContain('Paid only up to your 90-day carry limit.')
  })

  it('under no bill, no pay, the bench cost is nothing, whatever the pay rate', () => {
    const c = costOfDays({ days: 40, policy: { policy: 'NO_PAY' }, payRateCents: null, contractType: null, currency: 'USD' })
    expect(c.costCents).toBe(0)
    expect(c.says).toContain('no bill, no pay')
  })

  it('a bench cost with no pay rate on record is not known yet, and says why rather than guessing', () => {
    const c = costOfDays({ days: 12, policy: HALF, payRateCents: null, contractType: null, currency: 'USD' })
    expect(c.costCents).toBeNull()
    expect(c.says).toContain('No pay rate is on record for them')
  })

  it('somebody paid through their own company costs the bench nothing', () => {
    const c = costOfDays({ days: 30, policy: { policy: 'FULL_PAY' }, payRateCents: 9000, contractType: 'C2C', currency: 'USD' })
    expect(c.costCents).toBe(0)
  })

  it('a reserve-funded bench cost is not known yet, because what their reserve held then is not read here', () => {
    const c = costOfDays({ days: 30, policy: { policy: 'RESERVE_FUNDED', reserveBps: 1000 }, payRateCents: 6200, contractType: 'W2', currency: 'USD' })
    expect(c.costCents).toBeNull()
  })
})

describe('bench to bill, per person', () => {
  const placement = { id: 'p', startsOn: d('2026-03-02'), endsOn: null }
  const spell = { kind: 'BEFORE' as const, from: d('2026-01-11'), to: d('2026-03-02'), days: 50, placement }
  const week = (end: string, cents: number) => ({ endsOn: d(end), marginCents: cents })
  const weeks = (n: number) => Array.from({ length: n }, (_, i) => week(new Date(Date.UTC(2026, 2, 6 + i * 7)).toISOString().slice(0, 10), 104_000))
  const earned = (n: number): Earned => ({ marginCents: 104_000 * n, refusedBecause: null, currency: 'USD', weeks: weeks(n) })
  const run = (e: Earned | null, over: Partial<Parameters<typeof benchToBill>[0]> = {}) =>
    benchToBill({ spell, policy: HALF, payRateCents: 6200, contractType: 'W2', currency: 'USD', earned: e, ...over })

  it('the margin paid the bench back on the last day of the week it caught up', () => {
    // $8,928 at $1,040 a week: eight weeks is $8,320, nine is $9,360.
    const r = run(earned(12))
    expect(r.costCents).toBe(892_800)
    expect(r.marginCents).toBe(1_248_000)
    expect(r.paidBackOn).toBe('2026-05-01')
    expect(r.leftCents).toBe(0)
    expect(r.paybackSays).toBe('Paid back on May 1, 2026, 60 days after they started on Mar 2, 2026.')
  })

  it('a margin not yet caught up says not yet, and what is left to earn back', () => {
    const r = run(earned(4))
    expect(r.paidBackOn).toBeNull()
    expect(r.leftCents).toBe(892_800 - 416_000)
    expect(r.paybackSays).toBe('Not yet. $4,768.00 left to earn back.')
  })

  it('a margin that cannot be stood behind leaves the payback blank, with the reason', () => {
    const r = run({ marginCents: null, refusedBecause: 'No buy line behind this placement, so nothing here knows what it costs.', currency: 'USD', weeks: [] })
    expect(r.marginCents).toBeNull()
    expect(r.marginSays).toContain('No buy line behind this placement')
    expect(r.paidBackOn).toBeNull()
    expect(r.leftCents).toBeNull()
    expect(r.paybackSays).toContain('Not known yet')
  })

  it('a bench cost that is not known leaves the payback blank rather than calling it paid', () => {
    const r = run(earned(12), { payRateCents: null })
    expect(r.costCents).toBeNull()
    expect(r.paidBackOn).toBeNull()
    expect(r.paybackSays).toContain('Not known yet')
  })

  it('a bench cost priced at a rate that was not paying them on those days says where the rate came from', () => {
    const r = run(earned(12), { rateFrom: 'Priced at what they are paid on the placement that followed.' })
    expect(r.costSays).toBe(
      '50 days on the bench at 50% of $496.00 a day, under your bench pay policy: $8,928.00. ' +
        'Priced at what they are paid on the placement that followed.'
    )
    // Nothing to price, nothing to explain.
    expect(run(earned(2), { policy: { policy: 'NO_PAY' }, rateFrom: 'x' }).costSays).not.toContain('x.')
  })

  it('nothing spent on the bench has nothing to pay back', () => {
    const r = run(earned(2), { policy: { policy: 'NO_PAY' } })
    expect(r.costCents).toBe(0)
    expect(r.paybackSays).toBe('Nothing to pay back.')
  })

  it('a margin in another currency than the bench was paid in is never set against it', () => {
    const r = run({ ...earned(12), currency: 'GBP' })
    expect(r.paidBackOn).toBeNull()
    expect(r.paybackSays).toContain('GBP')
  })

  it('somebody on the bench now has no margin since, and the whole cost to earn back', () => {
    const r = benchToBill({
      spell: { kind: 'NOW', from: d('2026-04-02'), to: d('2026-06-01'), days: 60, startsOn: null },
      policy: HALF, payRateCents: 6400, contractType: 'W2', currency: 'USD', earned: null,
    })
    expect(r.marginCents).toBeNull()
    expect(r.marginSays).toContain('On the bench now')
    expect(r.leftCents).toBe(r.costCents)
    expect(r.paybackSays).toContain('Not placed yet.')
  })
})

describe('per course', () => {
  const course = { id: 'c', title: 'Equipment and process validation', priceCents: 180_000, currency: 'USD' }
  const seat = (personId: string, status: string, completedAt: string | null): Seat => ({
    personId, status, enrolledAt: d('2026-01-01'), completedAt: completedAt ? d(completedAt) : null,
  })
  const seats = [
    seat('a', 'COMPLETED', '2026-02-01'),
    seat('b', 'COMPLETED', '2026-03-01'),
    seat('c', 'COMPLETED', '2026-04-01'),
    seat('d', 'IN_PROGRESS', null),
    seat('e', 'DROPPED', null),
  ]
  const placed = (start: string, margin: number | null): Placed => ({
    startsOn: d(start), marginCents: margin, refusedBecause: margin == null ? 'No week has been both approved and accepted yet.' : null, currency: 'USD',
  })

  it('a course’s cost is its price per seat times the seats taken, dropped seats included', () => {
    const g = courseGroup({ course, seats, placed: new Map() })
    expect(g.costCents).toBe(900_000)
    expect(g.costSays).toBe('$1,800.00 a seat, 5 seats taken: $9,000.00.')
    expect(g).toMatchObject({ seats: 5, finished: 3, dropped: 1 })
  })

  it('a course counts who was placed and the median days from finishing to the first day placed', () => {
    const g = courseGroup({ course, seats, placed: new Map([['a', placed('2026-03-23', 1_000_000)], ['b', placed('2026-04-02', 300_000)]]) })
    expect(g.placed).toBe(2)
    // 50 and 32 days; the median of two is their mean.
    expect(g.medianDaysToPlace).toBe(41)
    expect(g.marginCents).toBe(1_300_000)
    expect(g.marginSays).toBe('$13,000.00 earned by the 2 people it placed, more than the course cost.')
  })

  it('somebody placed before finishing counts as placed and is left out of the median, said', () => {
    const g = courseGroup({ course, seats, placed: new Map([['a', placed('2026-03-23', 1)], ['d', placed('2026-03-01', 1)]]) })
    expect(g.placed).toBe(2)
    expect(g.medianDaysToPlace).toBe(50)
    expect(g.speedSays).toContain('leaving out 1 placed before finishing')
  })

  it('a course’s margin is blank when any of its placements has a margin nobody can stand behind', () => {
    const g = courseGroup({ course, seats, placed: new Map([['a', placed('2026-03-23', 1_000_000)], ['b', placed('2026-04-02', null)]]) })
    expect(g.marginCents).toBeNull()
    expect(g.marginSays).toContain('Not known yet')
  })

  it('a course with no price on it has a cost that is not known yet', () => {
    const g = courseGroup({ course: { ...course, priceCents: null }, seats, placed: new Map() })
    expect(g.costCents).toBeNull()
    expect(g.costSays).toContain('not known yet')
  })

  it('the add-a-course form asks what a seat costs, so bench profit can say what a course cost', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/training/page.tsx'), 'utf8')
    expect(page).toContain('newCourse.price')
    expect(page).toContain('Price a seat, in dollars')
  })

  it('the median of an even count is the mean of the two middle numbers, and of none is blank', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([10, 40, 20, 30])).toBe(25)
    expect(median([])).toBeNull()
  })
})

describe('utilization, for an integrator', () => {
  it('utilization counts people billing against people on the bench, and never counts somebody with nothing on the record as either', () => {
    const u = utilization([
      { standing: 'ON_PROJECT', project: 'Northbend Athletic' },
      { standing: 'ON_PROJECT', project: 'Northbend Athletic' },
      { standing: 'ON_PROJECT', project: 'Harlow Health' },
      { standing: 'BETWEEN_PROJECTS', project: null },
      { standing: 'NOT_ON_THE_RECORD', project: null },
    ])
    expect(u).toMatchObject({ billing: 3, onBench: 1, unknown: 1, billingPct: 75, benchPct: 25 })
    expect(u.says).toBe('3 of 4 billing (75%), 1 on the bench (25%). 1 person with nothing on the record is not counted.')
  })

  it('utilization is counted per project, by the client each line bills', () => {
    const u = utilization([
      { standing: 'ON_PROJECT', project: 'Harlow Health' },
      { standing: 'ON_PROJECT', project: 'Northbend Athletic' },
      { standing: 'ON_PROJECT', project: 'Northbend Athletic' },
    ])
    expect(u.perProject).toEqual([
      { project: 'Northbend Athletic', billing: 2 },
      { project: 'Harlow Health', billing: 1 },
    ])
  })

  it('utilization with nobody to count is blank, not nought per cent', () => {
    const u = utilization([{ standing: 'NOT_ON_THE_RECORD', project: null }])
    expect(u.billingPct).toBeNull()
    expect(u.benchPct).toBeNull()
  })
})

describe('an internal move', () => {
  it('an internal move shows the days between the two projects and what they cost; what it saved is not known yet and says why', () => {
    const m = moveSaving({ oldEndsOn: d('2026-05-01'), newStartsOn: d('2026-05-11'), policy: HALF, payRateCents: 6200, contractType: 'W2', currency: 'USD' })
    expect(m.gapDays).toBe(10)
    expect(m.gapCostCents).toBe(benchCost(HALF, { idleDays: 10, billingDayRateCents: 49_600 }).costCents)
    expect(m.savedAgainstBenchCents).toBeNull()
    expect(m.savedAgainstBenchSays).toContain('Not known yet')
    expect(m.savedAgainstSubVendorCents).toBeNull()
    expect(m.savedAgainstSubVendorSays).toContain('sub-vendor')
  })

  it('a move not dated on both ends has no gap to count', () => {
    const m = moveSaving({ oldEndsOn: null, newStartsOn: d('2026-05-11'), policy: HALF, payRateCents: 6200, contractType: 'W2', currency: 'USD' })
    expect(m.gapDays).toBeNull()
    expect(m.gapCostCents).toBeNull()
  })
})

describe('the seeded bench vendor, whatever day the world is born', () => {
  // Every day of 2026, plus the days a month's length moves: the 1st, the
  // 31st, the 28th of February, and the 29th of a leap year.
  const birthdays = [
    ...Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i))),
    d('2027-02-28'), d('2027-03-01'), d('2028-02-28'), d('2028-02-29'), d('2028-03-01'), d('2028-12-31'),
  ]
  const DAY = 86_400_000
  const span = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY)
  const who = (name: string) => NICHE_PEOPLE.find((n) => n.name === name)!

  it('Tobias Wren sits 49 days and Noor Abernathy 35 on the bench before a Monday start, on any birthday of the world', () => {
    try {
      for (const born of birthdays) {
        anchorSeed(born)
        for (const [name, days, weeks] of [['Tobias Wren', 49, 17], ['Noor Abernathy', 35, 4]] as const) {
          const n = who(name)
          const start = nicheStart(n.placement!)
          const at = born.toISOString().slice(0, 10)
          expect(start.getUTCDay(), `${name}, born ${at}`).toBe(1)
          expect(span(nicheListed(n)!, start), `${name}, born ${at}`).toBe(days)
          // The course finished the day they joined the bench, thirty days after they enrolled.
          expect(span(nicheCourse(n)!.done!, start), `${name}, born ${at}`).toBe(days)
          expect(span(nicheCourse(n)!.enrolled, nicheCourse(n)!.done!), `${name}, born ${at}`).toBe(30)
          // Every week from the start to last week is signed, and that is always the same count.
          let signed = 0
          for (let m = start; m.getTime() + 4 * DAY <= day(-3).getTime(); m = new Date(m.getTime() + 7 * DAY)) signed++
          expect(signed, `${name}, born ${at}`).toBe(weeks)
        }
      }
    } finally {
      forgetSeedAnchor()
    }
  })

  it('Hector Valdivia has been on the bench 60 days and Lucia Brandvold 40, on any birthday of the world', () => {
    try {
      for (const born of birthdays) {
        anchorSeed(born)
        const today = seedToday()
        expect(span(day(who('Hector Valdivia').placement!.end), today)).toBe(60)
        expect(span(nicheListed(who('Lucia Brandvold'))!, today)).toBe(40)
      }
    } finally {
      forgetSeedAnchor()
    }
  })
})

import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { GET as benchProfit } from '@/app/api/bench/profit/route'
import { GET as placementGET } from '@/app/api/placements/[id]/route'
import { PATCH as benchPayPATCH } from '@/app/api/settings/bench/route'
import { GET as switchesGET, POST as switchPOST } from '@/app/api/settings/bench/people/route'
import { seedToday } from '@/lib/seed-days'
import { burnOf } from '@/lib/bench-policy'
import { holidayKeys } from '@/lib/seed-calendar'
import { karthikWindow } from '@/lib/seed-doors'
import { plainDate } from '@/lib/plain-date'
import { burdenRate } from '@/lib/order-postings'
import { postBenchProfitWeeks, NICHE_VENDOR } from '@/lib/seed-bench-profit'

/**
 * Bench profit on the seeded world (CLAUDE.md, "Bench profit, next after
 * the integrator flow", decided 2026-09-30).
 *
 * Pellwright Validation Partners is a niche bench vendor: validation
 * engineers, one course at $1,800 a seat, half pay on the bench for up to
 * ninety days, placing through Sundara Systems at Corveldt Aerospace
 * (lib/seed-bench-profit). Teleworld Solutions is the integrator whose
 * people move between its own projects. Every figure below is read off
 * the route and re-derived in the comment beside it.
 *
 * ── Every date is counted from the day the world was born ────────────
 *
 * The seeded world counts its dates from its own birthday
 * (lib/seed-days), so a calendar date written here would be true on one
 * day only. What the seed fixes in days is asserted as a number — 49 days
 * on the bench, 35, 60, 40, a median of 42, and the costs that follow
 * from them. What depends on the calendar is worked out below from the
 * same birthday: the Monday the placements began, the days that were a
 * holiday, and so the margin and the day it paid the bench back.
 *
 * ── The margin is the books' (2026-10-06) ────────────────────────────
 *
 * Bench profit reads money's `placementBooks`, the figure the placement
 * page and Profitability print. Pellwright employs its people on W2, so
 * the employer's burden comes off each signed week as the books post it:
 * that week's pay times the burden rate for the year the work began,
 * rounded on its own. The rate is read from `burdenRate`, the books' own
 * door — the published default for W2 until Pellwright has posted enough
 * real payroll to measure its own.
 *
 * ── Holidays on the bench (2026-10-03) ───────────────────────────────
 *
 * Pellwright is a bench supplier and has never turned holiday pay on, so
 * a public holiday inside a spell is not paid and comes off the cost.
 * Which holidays fall inside a spell depends on the day the world was
 * born, so the count is worked out below from the world's own calendar
 * (`holidaysIn`) and never written as a number. Teleworld is an
 * integrator and pays its people for holidays without anybody switching
 * them on.
 */

const D = '@demo.etyme.local'
const OWNER = `world-pellwright${D}`
const FINANCE = `world-pellwright-finance${D}`
const RECRUITER = `world-pellwright-recruiter${D}`

async function read(email: string) {
  as(email)
  return json(await benchProfit(req('GET', '/api/bench/profit')))
}
const row = (body: any, name: string) => body.data.people.find((p: any) => p.name === name)

let owner: any

const DAY = 86_400_000
const plus = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
const iso = (d: Date) => d.toISOString().slice(0, 10)
const between = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY)
const dollars = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** The Monday a placement began, `weeksAgo` whole weeks before the world's own week. */
function startOf(weeksAgo: number) {
  const today = seedToday()
  const monday = plus(today, -((today.getUTCDay() + 6) % 7))
  return plus(monday, -7 * weeksAgo)
}

/**
 * A placement the seed began `weeksAgo` whole weeks before the Monday of
 * the world's own week, and its signed weeks: every whole week up to
 * last week, eight hours on each weekday that is not a holiday, at
 * (bill − pay) an hour, less the employer's burden on that week's pay.
 */
function placed(weeksAgo: number, billCents: number, payCents: number, burden: number) {
  const start = startOf(weeksAgo)
  const weeks = Array.from({ length: weeksAgo }, (_, k) => {
    const m = plus(start, 7 * k)
    const days = [0, 1, 2, 3, 4].filter((i) => !holidayKeys().has(iso(plus(m, i)))).length
    const hours = days * 8
    return { friday: plus(m, 4), marginCents: hours * (billCents - payCents) - Math.round(hours * payCents * burden) }
  })
  return { start, weeks, marginCents: weeks.reduce((a, w) => a + w.marginCents, 0) }
}

/** The Friday of the week whose margin, added up from the start, first covers the cost. */
function paidBackOn(weeks: { friday: Date; marginCents: number }[], costCents: number): Date | null {
  let sum = 0
  for (const w of weeks) if ((sum += w.marginCents) >= costCents) return w.friday
  return null
}

/**
 * The weekday holidays on the world's calendar strictly after `from`,
 * through `to` — the days a bench spell is counted over. Counted here by
 * hand rather than through `benchDays`, so the route is checked against
 * the calendar and not against itself.
 */
function holidaysIn(from: Date, to: Date): number {
  let n = 0
  for (let d = plus(from, 1); d <= to; d = plus(d, 1)) {
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6 && holidayKeys().has(iso(d))) n++
  }
  return n
}
const notPaid = (n: number) => (n > 0 ? `, ${n} public holiday${n === 1 ? '' : 's'} not paid` : '')

// Seventeen weeks at ($145 − $64) an hour; four at ($82 − $58); each less
// the burden on its pay, at the W2 rate for the year each placement began.
let tobiasBurden = 0
let noorBurden = 0
const tobiasWeeks = () => placed(17, 14_500, 6_400, tobiasBurden)
const noorWeeks = () => placed(4, 8_200, 5_800, noorBurden)

beforeAll(async () => {
  await freshWorld()
  owner = await read(OWNER)
  const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-pellwright' }, select: { id: true } })
  tobiasBurden = (await burdenRate(firm.id, 'W2', startOf(17))).rate
  noorBurden = (await burdenRate(firm.id, 'W2', startOf(4))).rate
}, 900_000)

describe('bench to bill, per person, at Pellwright Validation Partners', () => {
  it('the owner reads what Tobias Wren’s days on the bench cost, less the public holidays Pellwright does not pay, and the day his margin after burden paid it back', () => {
    expect(owner.status, JSON.stringify(owner.body)).toBe(200)
    expect(owner.body.data.policySays).toBe('50% of their pay while on the bench, for up to 90 days.')
    const tobias = row(owner.body, 'Tobias Wren')
    const { start, weeks, marginCents } = tobiasWeeks()
    // Finished the course and joined the bench 49 days before he was placed,
    // on a Monday seventeen weeks before the world's own week.
    const from = plus(start, -49)
    expect(tobias).toMatchObject({ spell: 'BEFORE', benchFrom: iso(from), benchTo: iso(start), days: 49 })
    // 49 calendar days are 35 weekdays; a holiday among them is not paid,
    // because Pellwright never turned holiday pay on. Half of $64 × 8 = $256 a day.
    const h = holidaysIn(from, start)
    const worked = 35 - h
    const cost = worked * 25_600
    expect(tobias.costCents).toBe(cost)
    // Seventeen signed weeks at ($145 − $64) × 8 on every day that was not a
    // holiday, less the employer's burden on his $64 an hour.
    expect(tobiasBurden).toBeGreaterThan(0)
    expect(tobias.marginCents).toBe(marginCents)
    // The week his running margin first covers the cost, burden taken off.
    // At about $2,680 a week after burden against at most $8,960 of bench,
    // that week comes on any day the world can be born; which Friday it is
    // depends on where the holidays fall, so it is worked out, not assumed.
    const on = paidBackOn(weeks, cost)
    expect(on, 'his margin covers his bench cost').not.toBeNull()
    expect(tobias.paidBackOn).toBe(iso(on!))
    expect(tobias.paybackSays).toBe(
      `Paid back on ${plainDate(iso(on!))}, ${between(start, on!)} days after they started on ${plainDate(iso(start))}.`
    )
    expect(tobias.placedAt).toBe('Corveldt Aerospace, through Sundara Systems')
    // The sentence says what was counted, the holidays not paid included.
    expect(tobias.costCounted).toBe(`${worked} working days of 49 at 50% of $512.00 a day${notPaid(h)}`)
    expect(tobias.costSays).toBe(
      `${worked} working days of 49 at 50% of $512.00 a day${notPaid(h)}, under your bench pay policy: ${dollars(cost)}. ` +
        'Priced at what they are paid on the placement that followed, as your policy reads it.'
    )
  })

  it('Noor Abernathy has not paid her bench back yet, and the page says how much is left', () => {
    const noor = row(owner.body, 'Noor Abernathy')
    const { start, marginCents } = noorWeeks()
    // 35 days are 25 weekdays, less any holiday among them, at half of
    // $58 × 8; four signed weeks at ($82 − $58) × 8 a day never reach it.
    const from = plus(start, -35)
    const cost = (25 - holidaysIn(from, start)) * 23_200
    expect(noor).toMatchObject({ benchFrom: iso(from), benchTo: iso(start), days: 35, costCents: cost })
    expect(noor).toMatchObject({ marginCents, paidBackOn: null, leftCents: cost - marginCents })
    expect(noor.paybackSays).toBe(`Not yet. ${dollars(cost - marginCents)} left to earn back.`)
  })

  it('somebody on the bench with no pay on record has a cost that is not known yet, and says why', () => {
    for (const name of ['Lucia Brandvold', 'Samuel Varga']) {
      const r = row(owner.body, name)
      expect(r.spell, name).toBe('NOW')
      expect(r.costCents, name).toBeNull()
      expect(r.costSays, name).toContain('No pay rate is on record for them')
      // The real reason, never "because the bench cost is not" (bench tester, 2026-10-01).
      expect(r.paybackSays, name).toBe('Not known yet: no pay rate is on record for them.')
    }
    expect(row(owner.body, 'Lucia Brandvold').days).toBe(40)
  })

  it('Hector Valdivia, on the bench since his placement ended, costs half his day for every weekday since that is not a holiday, the count Bench burn shows with the same answer', () => {
    const hector = row(owner.body, 'Hector Valdivia')
    // His placement ended 60 days before the world was born. The weekdays
    // after that day through the world's own day, less the holidays
    // Pellwright does not pay, as Bench burn counts them, at half of $64 × 8.
    const from = plus(seedToday(), -60)
    const h = holidaysIn(from, seedToday())
    const burn = burnOf(
      { payRateCents: 6400, billing: false, benchSince: from, holidayPay: { paid: false, calendar: holidayKeys() } },
      seedToday()
    )
    const weekdays = burnOf({ payRateCents: 6400, billing: false, benchSince: from }, seedToday()).workingDays
    expect(weekdays).toBeGreaterThanOrEqual(42)
    expect(weekdays).toBeLessThanOrEqual(44)
    expect(burn.workingDays).toBe(weekdays - h)
    const worked = weekdays - h
    expect(hector).toMatchObject({ spell: 'NOW', benchFrom: iso(from), days: 60, costCents: worked * 25_600, marginCents: null })
    expect(hector.costCounted).toBe(`${worked} working days of 60 at 50% of $512.00 a day${notPaid(h)}`)
    expect(hector.paybackSays).toBe(`Not placed yet. ${dollars(worked * 25_600)} to earn back.`)
    // Nothing pays him today, and the sentence says the figure is the policy's.
    expect(hector.costSays).toContain('Nothing on the record pays them today; priced at the pay of their last placement')
  })

  it('every person on Pellwright’s bench profit reads holidays not paid, off for this firm', () => {
    for (const p of owner.body.data.people) {
      expect(p.holiday, p.name).toMatchObject({ paid: false, source: 'FIRM_OFF', says: 'Holidays not paid (off for this firm)' })
    }
    expect(owner.body.data.basis.join(' ')).toContain('Public holidays on the bench are not paid unless your firm turned holiday pay on')
  })

  it('somebody who took a seat and never joined the bench is not on the bench list', () => {
    expect(row(owner.body, 'Greta Lindahl')).toBeUndefined()
    expect(owner.body.data.people.map((p: any) => p.name).sort()).toEqual(
      ['Hector Valdivia', 'Lucia Brandvold', 'Noor Abernathy', 'Samuel Varga', 'Tobias Wren']
    )
  })

  // Both read money's placementBooks, burden taken off, so they agree.
  it('the margin on a placement is the placement page’s own figure, to the cent', async () => {
    const tobias = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'tobias.wren@seed.etyme.invalid' }, select: { id: true } })
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-pellwright' }, select: { id: true } })
    const line = await prisma.sellContract.findFirstOrThrow({ where: { companyId: firm.id, personId: tobias.id }, select: { id: true } })
    as(OWNER)
    const page = await json(await placementGET(req('GET', `/api/placements/${line.id}`), { params: Promise.resolve({ id: line.id }) }))
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    expect(Math.round(page.body.data.money.margin * 100)).toBe(row(owner.body, 'Tobias Wren').marginCents)
    expect(owner.body.data.basis.join(' ')).toContain('less employer burden where you employ the person')
  })
})

describe('per course', () => {
  it('the validation course cost $9,000 for five seats, placed two people a median of 42 days after they finished, and is credited with all they have earned since', () => {
    const [course] = owner.body.data.courses
    expect(owner.body.data.courses).toHaveLength(1)
    const earned = tobiasWeeks().marginCents + noorWeeks().marginCents
    expect(course).toMatchObject({
      title: 'Equipment and process validation: IQ, OQ and PQ',
      seats: 5, finished: 3, dropped: 1,
      pricePerSeatCents: 180_000, costCents: 900_000,
      placed: 2,
      // 49 days for Tobias and 35 for Noor.
      medianDaysToPlace: 42,
      marginCents: earned,
    })
    expect(course.marginSays).toBe(`${dollars(earned)} earned by the 2 people it placed, more than the course cost.`)
  })
})

describe('who reads it', () => {
  it('the finance desk reads the same figures as the owner', async () => {
    const f = await read(FINANCE)
    expect(f.status, JSON.stringify(f.body)).toBe(200)
    expect(f.body.data.people).toEqual(owner.body.data.people)
    expect(f.body.data.courses).toEqual(owner.body.data.courses)
  })

  it('the recruiter is refused in a sentence naming the desks that read it, and is shown no figure', async () => {
    const r = await read(RECRUITER)
    expect(r.status).toBe(403)
    expect(r.body.data).toBeUndefined()
    expect(r.body.error.message).toBe(
      'Bench profit at Pellwright Validation Partners is read by the owner, the admin and the finance desk. ' +
        'Your seat (Recruiter) is none of them. Ask one of them, or ask whoever manages roles there.'
    )
  })

  it('a client is refused bench profit, so a client never reads a supplier’s margin', async () => {
    const r = await read(`world-corveldt${D}`)
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('CLIENT')
  })

  it('the prime Pellwright places through reads none of Pellwright’s people in its own bench profit', async () => {
    const r = await read(`world-sundara${D}`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const names = r.body.data.people.map((p: any) => p.name)
    for (const n of ['Tobias Wren', 'Noor Abernathy', 'Hector Valdivia']) expect(names).not.toContain(n)
    expect(r.body.data.courses).toEqual([])
  })

  it('every person whose pay a figure was worked from is on the access trail, under the reader’s name', async () => {
    const reader = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER }, select: { id: true } })
    const trail = await prisma.accessLog.findMany({
      where: { actorPersonId: reader.id, action: 'PAYROLL_VIEW', reason: { contains: 'bench profit' } },
      select: { subjectId: true, allowed: true },
    })
    const shown = owner.body.data.people.map((p: any) => p.personId)
    for (const id of shown) expect(trail.some((t) => t.subjectId === id && t.allowed), id).toBe(true)
  })
})

describe('utilization, for an integrator', () => {
  it('Teleworld’s owner reads three of four people billing and one on the bench, by project', async () => {
    const r = await read(`world-teleworld${D}`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.utilization).toMatchObject({
      billing: 3, onBench: 1, billingPct: 75, benchPct: 25,
      perProject: [{ project: 'Northbend Athletic', billing: 2 }, { project: 'Harlow Health', billing: 1 }],
    })
    // Owners, managers and HR have nothing on the record and are counted apart.
    expect(r.body.data.utilization.says).toContain('3 of 4 billing (75%), 1 on the bench (25%).')
    // Nobody has been moved yet: the demo leaves the move to whoever walks it.
    expect(r.body.data.moves).toEqual([])
  })

  it('under Teleworld’s no bill, no pay policy Karthik Menon’s month between projects cost nothing', async () => {
    const r = await read(`world-teleworld${D}`)
    const karthik = row(r.body, 'Karthik Menon')
    // His last project ended on the last month-end at least ten days before
    // the world was born (lib/seed-doors), so the spell is ten to forty days.
    const ended = karthikWindow(seedToday()).end
    expect(karthik).toMatchObject({
      spell: 'NOW', benchFrom: iso(ended), days: between(ended, seedToday()), costCents: 0, paybackSays: 'Nothing to pay back.',
    })
  })

  it('a bench vendor is not shown utilization, which is an integrator’s question', () => {
    expect(owner.body.data.utilization).toBeNull()
  })

  it('Teleworld’s people are paid for holidays without anybody switching them on', async () => {
    const r = await read(`world-teleworld${D}`)
    const karthik = row(r.body, 'Karthik Menon')
    expect(karthik.holiday).toMatchObject({ paid: true, source: 'INTEGRATOR_DEFAULT', says: 'Paid for holidays: on for everybody here' })
    as(`world-teleworld${D}`)
    const s = await json(await switchesGET(req('GET', `/api/settings/bench/people?personId=${karthik.personId}`)))
    expect(s.status, JSON.stringify(s.body)).toBe(200)
    expect(s.body.data.people).toEqual([
      expect.objectContaining({ personId: karthik.personId, paid: true, source: 'INTEGRATOR_DEFAULT', turned: null }),
    ])
  })
})

// Last, because it changes the seeded firm: the switch turned on Our
// bench reaches the cost on bench profit.
describe('the holiday switch reaches the figure', () => {
  it('when Pellwright turns holiday pay on and its finance desk switches Hector on, the holidays are back in his cost and the row says who switched it', async () => {
    const hector = row(owner.body, 'Hector Valdivia')
    const from = plus(seedToday(), -60)
    const weekdays = burnOf({ payRateCents: 6400, billing: false, benchSince: from }, seedToday()).workingDays

    as(FINANCE)
    const firm = await json(await benchPayPATCH(req('PATCH', '/api/settings/bench', { holidayPay: true })))
    expect(firm.status, JSON.stringify(firm.body)).toBe(200)
    const turned = await json(await switchPOST(req('POST', '/api/settings/bench/people', { personId: hector.personId, paid: true })))
    expect(turned.status, JSON.stringify(turned.body)).toBe(200)
    expect(turned.body.data.message).toBe('Switched on for Hector Valdivia.')

    const after = await read(FINANCE)
    const h = row(after.body, 'Hector Valdivia')
    expect(h.costCents).toBe(weekdays * 25_600)
    expect(h.costCounted).toBe(`${weekdays} working days of 60 at 50% of $512.00 a day`)
    expect(h.holiday.source).toBe('PERSON_ON')
    // The turn is stamped with the day it was made, not the world's birthday.
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    expect(h.holiday.says).toBe(`Paid for holidays: switched on by Desmond Achterberg, ${today}`)
    // Nobody else was switched on, so Tobias still has no holiday paid.
    expect(row(after.body, 'Tobias Wren').costCents).toBe(row(owner.body, 'Tobias Wren').costCents)
    expect(row(after.body, 'Tobias Wren').holiday.source).toBe('NOT_SWITCHED_ON')
  })
})

describe('the bench-profit weeks are on the books under the hop-ledger rule', () => {
  it('every live signature on a bench-profit week is posted, the middle firm’s included', async () => {
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: `world-${NICHE_VENDOR.slug}` }, select: { id: true } })
    const signatures = await prisma.workAssertion.findMany({
      where: { state: 'LIVE', timesheet: { sellContract: { companyId: firm.id } } },
      select: { id: true, role: true, companyId: true },
    })
    const middle = signatures.filter((s) => s.role === 'PASS_THROUGH')
    // Sundara accepts every week it buys from Pellwright, so the middle rung is there to post.
    expect(middle.length).toBeGreaterThan(0)
    const postings = await prisma.orderPosting.findMany({
      where: { source: 'TIMESHEET', sourceId: { in: signatures.map((s) => s.id) } },
      select: { sourceId: true, kind: true, companyId: true },
    })
    for (const s of signatures) {
      const mine = postings.filter((p) => p.sourceId === s.id)
      expect(mine.length, `${s.role} ${s.id} has no posting`).toBeGreaterThan(0)
    }
    // A middle firm's acceptance is revenue to the firm below it and pay in its own books.
    for (const s of middle) {
      const mine = postings.filter((p) => p.sourceId === s.id)
      expect(mine.some((p) => p.kind === 'REVENUE' && p.companyId === firm.id)).toBe(true)
      expect(mine.some((p) => p.kind === 'PAY' && p.companyId === s.companyId)).toBe(true)
    }
  })

  it('posting the bench-profit weeks a second time writes nothing', async () => {
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: `world-${NICHE_VENDOR.slug}` }, select: { id: true } })
    const before = await prisma.orderPosting.count({ where: { source: 'TIMESHEET' } })
    const ctx = { firmBySlug: new Map([[NICHE_VENDOR.slug, firm]]) } as any
    expect(await postBenchProfitWeeks(ctx)).toBe(0)
    expect(await prisma.orderPosting.count({ where: { source: 'TIMESHEET' } })).toBe(before)
  })
})

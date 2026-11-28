import { describe, it, expect, beforeAll, vi } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { POST as extend } from '@/app/api/contracts/[id]/extend/route'
import { GET as payroll } from '@/app/api/payroll/route'
import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { planCyclesFor, writeCyclesFor } from '@/lib/contract-cycles'
import { formatDay } from '@/lib/format-date'

/**
 * An extended W-2 placement, and the hours after its first end.
 *
 * Extending a placement moved the sell and buy end dates and wrote the
 * added months' due dates. It never moved the window her hours are paid
 * through (`ContractLink.effectiveTo`) or her own row's end date on the
 * pay line. Payroll narrows every week to the days that window covers
 * (`daysFor`, lib/contract-links), so the payroll page read every hour
 * after the first end as nobody's. The run disagreed with its own page:
 * a week whose every day fell outside the window lost its day breakdown
 * there and was paid its whole accepted total.
 *
 * Every date here is counted from the run's own day; none is pinned. Each
 * first end is a Saturday at least two weeks back, with the Monday before
 * it and the Friday after it in one calendar month, so one month's pay
 * holds both weeks.
 */

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'
const DAY = 86_400_000
const key = (d: Date) => d.toISOString().slice(0, 10)
const at = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
const midnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

let firmId = ''
let clientId = ''

interface Placed {
  personId: string; sellId: string; buyId: string; name: string
  started: Date; firstEnd: Date; newEnd: Date; month: string
}

/** Saturdays at least two weeks back whose Monday before and Friday after share a month, latest first. */
function* saturdaysBack(today: Date): Generator<Date> {
  let d = at(today, -14)
  while (d.getUTCDay() !== 6) d = at(d, -1)
  for (let i = 0; i < 60; i++, d = at(d, -7)) {
    if (at(d, -5).getUTCMonth() === d.getUTCMonth() && at(d, 6).getUTCMonth() === d.getUTCMonth()) yield d
  }
}

async function placed(name: string, slug: string, firstEnd: Date, weeks = 13): Promise<Placed> {
  const started = at(firstEnd, -weeks * 7 + 1)
  const person = await prisma.person.create({ data: { name, primaryEmail: `${slug}@northwind-staffing.example` } })
  await prisma.context.create({
    data: { personId: person.id, companyId: firmId, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the payroll — W2' },
  })
  const sell = await prisma.sellContract.create({
    data: { companyId: firmId, clientCompanyId: clientId, personId: person.id, billRate: 7_000, state: 'IN_PROGRESS', startDate: started, endDate: firstEnd },
  })
  const buy = await prisma.buyContract.create({
    data: {
      companyId: firmId, contractType: 'W2', payCurrency: 'USD', state: 'IN_PROGRESS', startDate: started, endDate: firstEnd,
      payFrequency: 'MONTHLY', payAnchor: 'CALENDAR', payStraddle: 'SPLIT',
      candidates: { create: { personId: person.id, payRate: 4_500, payCurrency: 'USD', startDate: started, endDate: firstEnd } },
    },
  })
  await prisma.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: started, effectiveTo: firstEnd } })
  await writeCyclesFor(prisma, {
    sell: { id: sell.id, startDate: started, endDate: firstEnd },
    buy: { id: buy.id, contractType: 'W2', vendorCompanyId: null },
    packId: 'US_IT',
  })
  return {
    personId: person.id, sellId: sell.id, buyId: buy.id, name,
    started, firstEnd, newEnd: at(firstEnd, 90), month: key(firstEnd).slice(0, 7),
  }
}

/** A Monday-to-Friday week of eight-hour days, filed, approved by the client and accepted by the employer. */
async function acceptedWeek(p: Placed, sunday: Date) {
  const days: Record<string, number> = {}
  for (let i = 1; i <= 5; i++) days[key(at(sunday, i))] = 8
  const sat = at(sunday, 6)
  const ts = await prisma.timesheet.create({
    data: {
      sellContractId: p.sellId, personId: p.personId, periodStart: sunday, periodEnd: sat, days, totalHours: 40,
      status: 'APPROVED', submittedAt: sat, approvedAt: sat, clientApprovedAt: sat, employerAcceptedAt: sat,
    },
  })
  await prisma.workAssertion.create({
    data: { timesheetId: ts.id, companyId: firmId, role: 'EMPLOYER_ACCEPTANCE', hours: 40, rateCents: 4_500, state: 'LIVE' },
  })
}

async function payRow(p: Placed) {
  as(BRIGHTMOOR)
  const r = await json(await payroll(req('GET', `/api/payroll?period=${p.month}`)))
  expect(r.body?.error, JSON.stringify(r.body).slice(0, 400)).toBeUndefined()
  return r.body.data.payItems.find((x: any) => x.buyContractId === p.buyId)
}

async function run(p: Placed, action: 'calculate' | 'process') {
  as(BRIGHTMOOR)
  const r = await json(await runPayroll(req('POST', '/api/payroll/run', { buyContractIds: [p.buyId], action, period: p.month })))
  expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200)
  return r.body.data.details.find((x: any) => x.buyContractId === p.buyId)
}

async function extendTo(p: Placed, day: string) {
  as(BRIGHTMOOR)
  return json(
    await extend(
      req('POST', `/api/contracts/${p.sellId}/extend`, {
        newEndDate: day,
        note: 'The client renewed the work.',
        reason: 'The renewed papers are on their way.',
        limitReason: 'The client asked for the extension.',
      }),
      { params: Promise.resolve({ id: p.sellId }) },
    ),
  )
}

/** The cycles completed on a line, as they stand. */
async function completedOn(p: Placed) {
  const rows = await prisma.cycle.findMany({
    where: { OR: [{ buyContractId: p.buyId }, { sellContractId: p.sellId }], completedAt: { not: null } },
    select: { id: true, kind: true, dueOn: true, periodStart: true, periodEnd: true, completedAt: true },
  })
  return rows.sort((a, b) => a.id.localeCompare(b.id))
}

/** The pay runs logged for the firm, as they stand; or only the ones named. */
async function runsLogged(ids?: string[]) {
  const rows = await prisma.automationLog.findMany({
    where: { companyId: firmId, action: 'PAYROLL_RUN', ...(ids ? { id: { in: ids } } : {}) },
    select: { id: true, payload: true, at: true, summary: true },
  })
  return rows.sort((a, b) => a.id.localeCompare(b.id))
}

/** The pay period the generator writes holding a line's last day, over a whole series. */
async function payPeriodHolding(anyLine: Placed, start: Date, end: Date, day: Date) {
  const plan = await planCyclesFor(prisma, {
    sell: { id: anyLine.sellId, startDate: start, endDate: end },
    buy: { id: 'not-written', contractType: 'W2', vendorCompanyId: null },
    packId: 'US_IT',
  })
  return plan.rows.find((c) => 'buyContractId' in c && c.kind === 'SALARY_PAY' && key(c.periodStart) <= key(day) && key(day) <= key(c.periodEnd)) ?? null
}

let open: Placed
let ran: Placed
let before: { hours: number; gross: number; calculated: number }
let refused: { status: number; body: any }
let behind: Placed
let ranBefore: { completed: Awaited<ReturnType<typeof completedOn>>; runs: Awaited<ReturnType<typeof runsLogged>>; cut: string }

beforeAll(async () => {
  await freshWorld()
  firmId = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
  clientId = (await prisma.company.create({ data: { name: 'Ridgefold Mills', slug: 'ridgefold-extend-pay', kind: 'CLIENT', currency: 'USD' } })).id
  const today = midnight(new Date())
  const saturdays = [...saturdaysBack(today)]

  // Nothing paid yet: the week before the first end and the week after it are both accepted.
  open = await placed('Lena Okafor', 'lena.okafor.extend', saturdays[0])
  await acceptedWeek(open, at(open.firstEnd, -6))
  await acceptedWeek(open, at(open.firstEnd, 1))
  const row = await payRow(open)
  // Worked out before the extension, on what the first end allowed.
  const calculated = (await run(open, 'calculate')).totalHours
  before = { hours: row?.totalApprovedHours ?? 0, gross: row?.grossPay ?? 0, calculated }
  // An extension to a day before the end is refused and moves nothing.
  refused = await extendTo(open, key(at(open.firstEnd, -1)))
  const done = await extendTo(open, key(open.newEnd))
  expect(done.status, JSON.stringify(done.body).slice(0, 400)).toBe(200)

  // A pay period cut at the first end, already processed, then the week after the first end accepted.
  // The first end is a Saturday inside a pay period, so the period holding it was written cut there.
  // Which Saturday that is depends on the day the line started, so a start one week earlier is tried too.
  let ranEnd: { day: Date; weeks: number } | null = null
  for (const weeks of [13, 14]) {
    const s = saturdays[0]
    const whole = await payPeriodHolding(open, at(s, -weeks * 7 + 1), at(s, 90), s)
    if (whole && key(whole.periodEnd) > key(s)) { ranEnd = { day: s, weeks }; break }
  }
  expect(ranEnd, 'a Saturday inside a pay period').not.toBeNull()
  ran = await placed('Omar Lindqvist', 'omar.lindqvist.extend', ranEnd!.day, ranEnd!.weeks)
  await acceptedWeek(ran, at(ran.firstEnd, -6))
  await run(ran, 'calculate')
  await run(ran, 'process')
  // The pay day holding the first end, settled by a run: its period was cut at the first end.
  const cut = await prisma.cycle.findFirstOrThrow({
    where: { buyContractId: ran.buyId, kind: 'SALARY_PAY', periodEnd: ran.firstEnd },
    select: { id: true, completedAt: true },
  })
  if (!cut.completedAt) await prisma.cycle.update({ where: { id: cut.id }, data: { completedAt: new Date() } })
  await acceptedWeek(ran, at(ran.firstEnd, 1))
  ranBefore = { completed: await completedOn(ran), runs: await runsLogged(), cut: cut.id }
  const extended = await extendTo(ran, key(ran.newEnd))
  expect(extended.status, JSON.stringify(extended.body).slice(0, 400)).toBe(200)

  // A placement extended before the rule: its end moved a month on, and its window stayed at the first end.
  behind = await placed('Ines Moreau', 'ines.moreau.extend', saturdays[0])
  const moved = at(behind.firstEnd, 30)
  await prisma.sellContract.update({ where: { id: behind.sellId }, data: { endDate: moved } })
  await prisma.buyContract.update({ where: { id: behind.buyId }, data: { endDate: moved } })
  await prisma.automationLog.create({
    data: {
      companyId: clientId, action: 'CONTRACT_EXTENDED', summary: 'Ines Moreau extended', reason: 'Extended before the rule.',
      payload: { contractId: behind.sellId, oldEndDate: behind.firstEnd.toISOString(), newEndDate: moved.toISOString() },
      reversible: true,
    },
  })
  const again = await extendTo(behind, key(behind.newEnd))
  expect(again.status, JSON.stringify(again.body).slice(0, 400)).toBe(200)
  // Her week before the first end, and the week after it, both accepted.
  await acceptedWeek(behind, at(behind.firstEnd, -6))
  await acceptedWeek(behind, at(behind.firstEnd, 1))
}, 900_000)

describe('an extended W-2 placement is paid for the days it gained', () => {
  it('before the extension, the payroll page and the run both pay only the week inside the first end', () => {
    expect(before.hours).toBe(40)
    expect(before.gross).toBe(180_000)
    // The run used to pay the week after the first end in full while the page left it out.
    expect(before.calculated).toBe(40)
  })

  it("an extended placement's added days are paid like the days before", async () => {
    const row = await payRow(open)
    expect(row.totalApprovedHours).toBe(80)
    expect(row.grossPay).toBe(360_000)
    // One rate over both weeks: the days after the first end are priced as the days before it.
    expect(row.rates).toBeNull()
    expect(row.payRate).toBe(4_500)
  })

  it('hours left out of a calculation made before the extension are picked up on the next one, and paid once', async () => {
    const worked = await run(open, 'calculate')
    expect(worked.totalHours).toBe(80)
    const paid = await run(open, 'process')
    expect(paid.totalHours).toBe(80)
    expect(paid.grossPay).toBe(360_000)
    expect(paid.alreadyPaidHours).toBe(0)
  })

  it('extending moves the pay window, her row and the open cycles to the new end, in one save', async () => {
    const link = await prisma.contractLink.findFirstOrThrow({ where: { sellContractId: open.sellId } })
    expect(key(link.effectiveTo!)).toBe(key(open.newEnd))
    const buy = await prisma.buyContract.findUniqueOrThrow({ where: { id: open.buyId }, include: { candidates: true } })
    expect(key(buy.endDate!)).toBe(key(open.newEnd))
    expect(buy.candidates.map((c) => key(c.endDate!))).toEqual([key(open.newEnd)])
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: open.sellId } })
    expect(key(sell.endDate!)).toBe(key(open.newEnd))

    // Every open date ends by the new end, and the last pay period runs through it.
    const cycles = await prisma.cycle.findMany({ where: { OR: [{ buyContractId: open.buyId }, { sellContractId: open.sellId }], completedAt: null } })
    for (const c of cycles) if (c.periodEnd) expect(key(c.periodEnd) <= key(open.newEnd), `${c.kind} ends ${key(c.periodEnd)}`).toBe(true)
    expect(cycles.some((c) => c.buyContractId === open.buyId && c.kind === 'SALARY_PAY' && key(c.periodEnd!) === key(open.newEnd))).toBe(true)

    // The extension's log says what moved, from and to.
    const logs = await prisma.automationLog.findMany({
      where: { action: 'CONTRACT_EXTENDED', payload: { path: ['contractId'], equals: open.sellId } },
    })
    expect(logs).toHaveLength(1)
    const w = (logs[0].payload as any).windows
    expect(w.links).toEqual([{ id: link.id, from: key(open.firstEnd), to: key(open.newEnd) }])
    expect(w.rows).toEqual([{ id: buy.candidates[0].id, from: key(open.firstEnd), to: key(open.newEnd) }])
    expect(w.line).toEqual({ id: open.buyId, from: key(open.firstEnd), to: key(open.newEnd) })
  })

  it('an extension refused for its day moves no window', () => {
    expect(refused.status).toBe(422)
    expect(refused.body.error.field).toBe('newEndDate')
  })
})

describe('a processed pay run is never reopened by an extension', () => {
  it('a processed pay run is never reopened by an extension', async () => {
    // Every pay day a run settled keeps its days, its date and its mark; no run is rewritten.
    expect(await completedOn(ran)).toEqual(ranBefore.completed)
    expect(ranBefore.runs.length).toBeGreaterThan(0)
    expect(await runsLogged(ranBefore.runs.map((r) => r.id))).toEqual(ranBefore.runs)
    const cut = await prisma.cycle.findUniqueOrThrow({ where: { id: ranBefore.cut } })
    expect(key(cut.periodEnd!)).toBe(key(ran.firstEnd))
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'CONTRACT_EXTENDED', payload: { path: ['contractId'], equals: ran.sellId } },
    })
    expect((log.payload as any).windows.processedLeftAsTheyWere).toBeGreaterThanOrEqual(1)
  })

  it('the week after the first end, accepted after the month was paid, reads as still to pay', async () => {
    const row = await payRow(ran)
    expect(row.totalApprovedHours).toBe(80)
    expect(row.paidSoFar).toEqual({ hours: 40, grossCents: 180_000 })
    expect(row.partPaid).toBe('Paid already: $1,800.00 for 40 hours. Still to pay: $1,800.00 for 40 hours.')
  })

  it('the next run pays that week once, and never the week already paid', async () => {
    await run(ran, 'calculate')
    const paid = await run(ran, 'process')
    expect(paid.totalHours).toBe(40)
    expect(paid.grossPay).toBe(180_000)
    expect(paid.alreadyPaidHours).toBe(40)
  })
})

describe('a placement extended before today', () => {
  it('keeps its window where an earlier extension left it, never moved by a guess, and the new extension names it for a person to repair', async () => {
    const link = await prisma.contractLink.findFirstOrThrow({ where: { sellContractId: behind.sellId } })
    expect(key(link.effectiveTo!)).toBe(key(behind.firstEnd))
    const row = await prisma.buyContractCandidate.findFirstOrThrow({ where: { buyContractId: behind.buyId, personId: behind.personId } })
    expect(key(row.endDate!)).toBe(key(behind.firstEnd))
    // The pay line itself still moves with the placement, as it always did.
    const buy = await prisma.buyContract.findUniqueOrThrow({ where: { id: behind.buyId } })
    expect(key(buy.endDate!)).toBe(key(behind.newEnd))
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'CONTRACT_EXTENDED', payload: { path: ['newEndDate'], equals: behind.newEnd.toISOString() }, AND: [{ payload: { path: ['contractId'], equals: behind.sellId } }] },
    })
    const w = (log.payload as any).windows
    expect(w.links).toEqual([])
    expect(w.leftBehind).toEqual({
      links: [{ id: link.id, endsOn: key(behind.firstEnd), why: 'EARLIER_EXTENSION' }],
      rows: [{ id: row.id, endsOn: key(behind.firstEnd), why: 'EARLIER_EXTENSION' }],
    })
  })
})

describe('a week outside every pay window of a placement extended before today', () => {
  const heldWords = () =>
    `Ines Moreau's week of ${formatDay(at(behind.firstEnd, 1))}, 40 hours, is held off this pay. ` +
    `It is after the pay window ended on ${formatDay(behind.firstEnd)}; the placement was extended. ` +
    'Repair the pay window to pay it.'

  it('a week outside every pay window of an extended placement is held on Payroll with a sentence, never paid and never dropped silently', async () => {
    as(BRIGHTMOOR)
    const r = await json(await payroll(req('GET', `/api/payroll?period=${behind.month}`)))
    const row = r.body.data.payItems.find((x: any) => x.buyContractId === behind.buyId)
    // Only the week inside the window is paid.
    expect(row.totalApprovedHours).toBe(40)
    expect(row.grossPay).toBe(180_000)
    // The week after it is held, by name and week, with what a person does.
    expect(row.windowHeld).toBe(heldWords())
    expect(row.windowHeldHours).toBe(40)
    expect(row.heldHours).toBe(40)
    expect(row.heldWeeks).toEqual([{ weekOf: key(at(behind.firstEnd, 1)), hours: 40, reason: 'WINDOW', endedOn: key(behind.firstEnd) }])
    expect(row.statusSays).toMatch(/, week held$/)
    // Above the table, and in the count.
    expect(r.body.data.heldSays).toContain('Ines Moreau has a week held off this pay because it is after the pay window ended.')
    expect(r.body.data.summary.weeksHeld).toBeGreaterThanOrEqual(1)
    // The run pays the week inside the window only, and says the held one on its row.
    const worked = await run(behind, 'calculate')
    expect(worked.totalHours).toBe(40)
    expect(worked.windowHeld).toBe(heldWords())
    const paid = await run(behind, 'process')
    expect(paid.totalHours).toBe(40)
    expect(paid.grossPay).toBe(180_000)
    expect(paid.windowHeld).toBe(heldWords())
    // What the run recorded paying: no day after the window ended.
    const lines = (await runsLogged())
      .filter((r) => (r.payload as any)?.action === 'process')
      .flatMap((r) => ((r.payload as any).contracts ?? []).filter((c: any) => c.buyContractId === behind.buyId))
      .flatMap((c: any) => c.paid ?? [])
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((l: any) => l.day <= key(behind.firstEnd))).toBe(true)
    // And the run's own log says the held week, so it is never dropped without a word.
    expect((await runsLogged()).some((r) => ((r.payload as any)?.contracts ?? []).some((c: any) => c.buyContractId === behind.buyId && c.windowHeld === heldWords()))).toBe(true)
  })

  it('after the run, the row reads processed with a week held, and the pay file lists the held week', async () => {
    const row = await payRow(behind)
    expect(row.payStatus).toBe('HELD')
    expect(row.statusSays).toBe('Processed, week held')
    expect(row.windowHeld).toBe(heldWords())
    // The month also holds the seeded people's own weeks, which fall in the current month on the day
    // this runs and are not worked out. Pay never goes out before it is worked out, so work them out
    // first; the file is then asked for the same way on every day of the year.
    as(BRIGHTMOOR)
    const page = await json(await payroll(req('GET', `/api/payroll?period=${behind.month}`)))
    const waiting = page.body.data.payItems.filter((x: any) => x.payStatus === 'PENDING' && x.totalApprovedHours > 0).map((x: any) => x.buyContractId)
    if (waiting.length > 0) {
      const worked = await json(await runPayroll(req('POST', '/api/payroll/run', { buyContractIds: waiting, action: 'calculate', period: behind.month })))
      expect(worked.status, JSON.stringify(worked.body).slice(0, 400)).toBe(200)
    }
    as(BRIGHTMOOR)
    const res = await payroll(req('GET', `/api/payroll?period=${behind.month}&format=csv`))
    expect(res.status).toBe(200)
    const line = (await res.text()).split('\n').find((l) => l.startsWith('Ines Moreau,'))!
    expect(line).toContain(`after the pay window ended on`)
    expect(line).toContain('window to repair')
    expect(line).toContain('"Paid, week held"')
    // The window is not repaired by itself: that is a person's decision.
    const link = await prisma.contractLink.findFirstOrThrow({ where: { sellContractId: behind.sellId } })
    expect(key(link.effectiveTo!)).toBe(key(behind.firstEnd))
  })
})

/** A week filed and approved by nobody yet: submitted, not accepted. */
async function filedWeek(p: Placed, sunday: Date) {
  const days: Record<string, number> = {}
  for (let i = 1; i <= 5; i++) days[key(at(sunday, i))] = 8
  return prisma.timesheet.create({
    data: { sellContractId: p.sellId, personId: p.personId, periodStart: sunday, periodEnd: at(sunday, 6), days, totalHours: 40, status: 'SUBMITTED', submittedAt: at(sunday, 6) },
  })
}

/** A second pay line for her on the same placement, its window from `from` to `to`. */
async function secondLine(p: Placed, from: Date, to: Date | null) {
  const buy = await prisma.buyContract.create({
    data: {
      companyId: firmId, contractType: 'W2', payCurrency: 'USD', state: 'IN_PROGRESS', startDate: from, endDate: to,
      payFrequency: 'MONTHLY', payAnchor: 'CALENDAR', payStraddle: 'SPLIT',
      candidates: { create: { personId: p.personId, payRate: 4_500, payCurrency: 'USD', startDate: from, endDate: to } },
    },
  })
  const link = await prisma.contractLink.create({ data: { sellContractId: p.sellId, buyContractId: buy.id, effectiveFrom: from, effectiveTo: to } })
  return { buyId: buy.id, linkId: link.id }
}

describe('an extension whose pay window changes while it saves', () => {
  it('an extension whose pay window changed while it was saving is not made, and nothing is half moved', async () => {
    const p = await placed('Tomas Berg', 'tomas.berg.extend', [...saturdaysBack(midnight(new Date()))][2])
    const row = await prisma.buyContractCandidate.findFirstOrThrow({ where: { buyContractId: p.buyId, personId: p.personId } })
    // Her row moves between the read and the save: the window must not move without it.
    const real = prisma.$transaction.bind(prisma)
    const spy = vi.spyOn(prisma, '$transaction').mockImplementation((async (fn: any, opts?: any) => {
      await prisma.buyContractCandidate.update({ where: { id: row.id }, data: { endDate: at(p.firstEnd, -1) } })
      return real(fn, opts)
    }) as any)
    let r: { status: number; body: any }
    try {
      r = await extendTo(p, key(p.newEnd))
    } finally {
      spy.mockRestore()
    }
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe("Tomas Berg's pay window changed while this was saving, so the placement was not extended. Open it again and extend it.")
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: p.sellId } })
    expect(key(sell.endDate!)).toBe(key(p.firstEnd))
    const link = await prisma.contractLink.findFirstOrThrow({ where: { sellContractId: p.sellId } })
    expect(key(link.effectiveTo!)).toBe(key(p.firstEnd))
    expect(await prisma.automationLog.count({ where: { action: 'CONTRACT_EXTENDED', payload: { path: ['contractId'], equals: p.sellId } } })).toBe(0)
  })
})

describe('an extension with no single pay line in force', () => {
  it('an extension with two pay lines starting the same day moves neither window, says so, and names both in the log', async () => {
    const p = await placed('Sana Ivers', 'sana.ivers.extend', [...saturdaysBack(midnight(new Date()))][3])
    const first = await prisma.contractLink.findFirstOrThrow({ where: { sellContractId: p.sellId, buyContractId: p.buyId } })
    const second = await secondLine(p, p.started, p.firstEnd)
    const r = await extendTo(p, key(p.newEnd))
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200)
    const says =
      "Sana Ivers's pay window was not moved: two pay lines start on the same day, and moving either would be a guess. " +
      'Check which pay line pays the added days.'
    expect(r.body.data.message).toBe(`Extended to ${formatDay(p.newEnd)}. ${says}`)
    expect(r.body.data.payWindow).toBe(says)
    // Neither window moved.
    for (const id of [first.id, second.linkId]) {
      const l = await prisma.contractLink.findUniqueOrThrow({ where: { id } })
      expect(key(l.effectiveTo!)).toBe(key(p.firstEnd))
    }
    const log = await prisma.automationLog.findFirstOrThrow({ where: { action: 'CONTRACT_EXTENDED', payload: { path: ['contractId'], equals: p.sellId } } })
    const w = (log.payload as any).windows
    expect(w.links).toEqual([])
    expect(w.notMoved).toBe(says)
    expect(w.leftBehind.links.map((l: any) => [l.id, l.why]).sort()).toEqual(
      [[first.id, 'NO_PAY_LINE_IN_FORCE'], [second.linkId, 'NO_PAY_LINE_IN_FORCE']].sort(),
    )
    expect(log.reason).toContain(says)
  })
})

describe('a week not accepted yet, on the pay line it belongs to', () => {
  it("a week no window of this pay line covers is never named as waiting on this pay line's row", async () => {
    // A change of pay line the day after the first end: the old window closed, the new one open.
    const p = await placed('Rafe Dunmore', 'rafe.dunmore.extend', [...saturdaysBack(midnight(new Date()))][4])
    await prisma.sellContract.update({ where: { id: p.sellId }, data: { endDate: p.newEnd } })
    const next = await secondLine(p, at(p.firstEnd, 1), null)
    await filedWeek(p, at(p.firstEnd, 1))
    as(BRIGHTMOOR)
    const r = await json(await payroll(req('GET', `/api/payroll?period=${p.month}`)))
    const old = r.body.data.payItems.find((x: any) => x.buyContractId === p.buyId)
    const now = r.body.data.payItems.find((x: any) => x.buyContractId === next.buyId)
    // Waiting on the line whose window covers it, and only there.
    expect(old?.notAccepted ?? null).toBeNull()
    expect(now.notAccepted).toMatch(/^Rafe Dunmore's week of .+, 40 hours, is not in this pay until /)
  })

  it("a week after a window this pay line holds behind the placement's end is still named as waiting on it", async () => {
    // Extended before the rule: the window stayed at the first end, and the week after it is filed, not accepted.
    const p = await placed('Lio Marchetti', 'lio.marchetti.extend', [...saturdaysBack(midnight(new Date()))][5])
    await prisma.sellContract.update({ where: { id: p.sellId }, data: { endDate: at(p.firstEnd, 30) } })
    await filedWeek(p, at(p.firstEnd, 1))
    const row = await payRow(p)
    expect(row.notAccepted).toMatch(/^Lio Marchetti's week of .+, 40 hours, is not in this pay until /)
  })
})

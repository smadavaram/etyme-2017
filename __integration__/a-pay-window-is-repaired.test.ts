import { describe, it, expect, beforeAll, vi } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { GET as payroll } from '@/app/api/payroll/route'
import { POST as runPayroll } from '@/app/api/payroll/run/route'
import { POST as repairWindow } from '@/app/api/payroll/window-repair/route'
import { writeCyclesFor } from '@/lib/contract-cycles'
import { formatDay } from '@/lib/format-date'

/**
 * Repair the pay window: the act a week held on Payroll waits on.
 *
 * A placement extended before 2026-11-16 kept its pay window and her row
 * on the pay line at the first end, so Payroll holds every week after it
 * by name and week. The held sentence asked for a repair nothing in the
 * product could make. Now a seat that runs payroll presses Repair the pay
 * window on the held row; a seat that may not is told who may; and a
 * window whose later days a pay run already recorded as paid is not moved.
 *
 * Every date here is counted from the run's own day; none is pinned. Each
 * first end is a Saturday at least two weeks back, with the Monday before
 * it and the Friday after it in one calendar month, so one month's pay
 * holds both weeks.
 */

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'
const ACCOUNT_MANAGER = 'world-brightmoor-account@demo.etyme.local'
const READER = 'payroll-reader.window-repair@northwind-staffing.example'
const DAY = 86_400_000
const key = (d: Date) => d.toISOString().slice(0, 10)
const at = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
const midnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

let firmId = ''
let clientId = ''

interface Placed {
  personId: string; sellId: string; buyId: string; linkId: string; rowId: string; name: string
  firstEnd: Date; sellEnd: Date; month: string; after: string
}

/** Saturdays at least two weeks back whose Monday before and Friday after share a month, latest first. */
function* saturdaysBack(today: Date): Generator<Date> {
  let d = at(today, -14)
  while (d.getUTCDay() !== 6) d = at(d, -1)
  for (let i = 0; i < 60; i++, d = at(d, -7)) {
    if (at(d, -5).getUTCMonth() === d.getUTCMonth() && at(d, 6).getUTCMonth() === d.getUTCMonth()) yield d
  }
}

/** A W-2 placement extended before the rule: its end moved on a month, its window and her row left at the first end. */
async function extendedBefore(name: string, slug: string, firstEnd: Date): Promise<Placed> {
  const started = at(firstEnd, -13 * 7 + 1)
  const sellEnd = at(firstEnd, 30)
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
    include: { candidates: true },
  })
  const link = await prisma.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: started, effectiveTo: firstEnd } })
  await writeCyclesFor(prisma, {
    sell: { id: sell.id, startDate: started, endDate: firstEnd },
    buy: { id: buy.id, contractType: 'W2', vendorCompanyId: null },
    packId: 'US_IT',
  })
  // The extension made before the rule: both ends moved, the window and her row did not.
  await prisma.sellContract.update({ where: { id: sell.id }, data: { endDate: sellEnd } })
  await prisma.buyContract.update({ where: { id: buy.id }, data: { endDate: sellEnd } })
  await prisma.automationLog.create({
    data: {
      companyId: clientId, action: 'CONTRACT_EXTENDED', summary: `${name} extended`, reason: 'Extended before the rule.',
      payload: { contractId: sell.id, oldEndDate: firstEnd.toISOString(), newEndDate: sellEnd.toISOString() },
      reversible: true,
    },
  })
  const p: Placed = {
    personId: person.id, sellId: sell.id, buyId: buy.id, linkId: link.id, rowId: buy.candidates[0].id, name,
    firstEnd, sellEnd, month: key(firstEnd).slice(0, 7), after: key(at(firstEnd, 1)),
  }
  await acceptedWeek(p, at(firstEnd, -6))
  await acceptedWeek(p, at(firstEnd, 1))
  return p
}

/** A Monday-to-Friday week of eight-hour days, filed, approved by the client and accepted by the employer. */
async function acceptedWeek(p: Pick<Placed, 'sellId' | 'personId'>, sunday: Date) {
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
  return ts
}

async function readPayroll(p: Placed, email = BRIGHTMOOR) {
  as(email)
  const r = await json(await payroll(req('GET', `/api/payroll?period=${p.month}`)))
  expect(r.body?.error, JSON.stringify(r.body).slice(0, 400)).toBeUndefined()
  return { data: r.body.data, row: r.body.data.payItems.find((x: any) => x.buyContractId === p.buyId) }
}

async function run(p: Placed, action: 'calculate' | 'process') {
  as(BRIGHTMOOR)
  const r = await json(await runPayroll(req('POST', '/api/payroll/run', { buyContractIds: [p.buyId], action, period: p.month })))
  expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200)
  return r.body.data.details.find((x: any) => x.buyContractId === p.buyId)
}

async function repair(p: Placed, email = BRIGHTMOOR) {
  as(email)
  return json(await repairWindow(req('POST', '/api/payroll/window-repair', { sellContractId: p.sellId, buyContractId: p.buyId, personId: p.personId })))
}

/** Every day a processed run recorded paying on this pay line, with its hours. */
async function paidDays(p: Placed) {
  const rows = await prisma.automationLog.findMany({ where: { companyId: firmId, action: 'PAYROLL_RUN' }, select: { payload: true } })
  return rows
    .filter((r) => (r.payload as any)?.action === 'process')
    .flatMap((r) => ((r.payload as any).contracts ?? []).filter((c: any) => c.buyContractId === p.buyId))
    .flatMap((c: any) => (c.paid ?? []) as Array<{ timesheetId: string; day: string; hours: number }>)
}

async function windowOf(p: Placed) {
  const link = await prisma.contractLink.findUniqueOrThrow({ where: { id: p.linkId } })
  const row = await prisma.buyContractCandidate.findUniqueOrThrow({ where: { id: p.rowId } })
  return { link: key(link.effectiveTo!), row: key(row.endDate!) }
}

let held: Placed
let lumped: Placed
let saturdays: Date[] = []
let completedBefore: Array<{ id: string; periodEnd: string | null; completedAt: string | null }>
let repaired: { status: number; body: any }

beforeAll(async () => {
  await freshWorld()
  firmId = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
  clientId = (await prisma.company.create({ data: { name: 'Ridgefold Mills', slug: 'ridgefold-window-repair', kind: 'CLIENT', currency: 'USD' } })).id
  saturdays = [...saturdaysBack(midnight(new Date()))]

  // A seat that reads payroll and may not run it.
  const role = await prisma.role.create({ data: { companyId: firmId, name: 'Payroll reader', permissions: ['payroll.read'] } })
  const reader = await prisma.person.create({ data: { name: 'Corin Ashby', primaryEmail: READER } })
  await prisma.context.create({ data: { personId: reader.id, companyId: firmId, roleId: role.id, type: 'EMPLOYEE', grantReason: 'Reads payroll' } })

  // Held: the week inside the window is paid by a run; the week after it is held.
  held = await extendedBefore('Ines Moreau', 'ines.moreau.repair', saturdays[0])
  await run(held, 'calculate')
  await run(held, 'process')
  // The pay day that held the first end is settled: a run completed it.
  const cut = await prisma.cycle.findFirst({ where: { buyContractId: held.buyId, kind: 'SALARY_PAY', periodEnd: held.firstEnd }, select: { id: true, completedAt: true } })
  if (cut && !cut.completedAt) await prisma.cycle.update({ where: { id: cut.id }, data: { completedAt: new Date() } })
  completedBefore = (await prisma.cycle.findMany({ where: { buyContractId: held.buyId, completedAt: { not: null } } }))
    .map((c) => ({ id: c.id, periodEnd: c.periodEnd ? key(c.periodEnd) : null, completedAt: c.completedAt?.toISOString() ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id))

  // Lumped: a run before 2026-11-16 paid the week after the first end as one lump on its Sunday.
  lumped = await extendedBefore('Teodor Vance', 'teodor.vance.repair', saturdays[1])
  const after = await prisma.timesheet.findFirstOrThrow({ where: { sellContractId: lumped.sellId, periodStart: at(lumped.firstEnd, 1) } })
  await prisma.automationLog.create({
    data: {
      companyId: firmId, action: 'PAYROLL_RUN', summary: 'Payroll process: 1 contract', reason: 'A run before the rule.',
      payload: {
        action: 'process',
        contracts: [{ buyContractId: lumped.buyId, paid: [{ personId: lumped.personId, timesheetId: after.id, day: lumped.after, hours: 40, rateCents: 4_500 }] }],
      },
      reversible: false,
    },
  })
}, 900_000)

describe('a seat that runs payroll repairs a held pay window', () => {
  it('the held row says to repair the pay window, and offers it to a seat that runs payroll', async () => {
    const { data, row } = await readPayroll(held)
    expect(row.windowHeld).toBe(
      `Ines Moreau's week of ${formatDay(held.after)}, 40 hours, is held off this pay. ` +
        `It is after the pay window ended on ${formatDay(held.firstEnd)}; the placement was extended. ` +
        'Repair the pay window to pay it.',
    )
    expect(row.windowRepairs).toEqual([{ sellContractId: held.sellId, buyContractId: held.buyId, personId: held.personId }])
    expect(data.mayRepairWindow).toBe(true)
  })

  it("repairing a held window moves it and her row to the placement's end, and the held week is paid once on the next calculation", async () => {
    repaired = await repair(held)
    expect(repaired.status, JSON.stringify(repaired.body).slice(0, 400)).toBe(200)
    expect(repaired.body.data.says).toBe(`Ines Moreau's pay window now runs to ${formatDay(held.sellEnd)}. Calculate this pay to include the held week.`)
    expect(await windowOf(held)).toEqual({ link: key(held.sellEnd), row: key(held.sellEnd) })

    // The held week is no longer held: it is owed in this pay, beside the week already paid.
    const { row } = await readPayroll(held)
    expect(row.windowHeld).toBeNull()
    expect(row.windowRepairs).toEqual([])
    expect(row.totalApprovedHours).toBe(80)
    expect(row.paidSoFar).toEqual({ hours: 40, grossCents: 180_000 })

    // The next calculation pays it, and only it.
    await run(held, 'calculate')
    const paid = await run(held, 'process')
    expect(paid.totalHours).toBe(40)
    expect(paid.grossPay).toBe(180_000)
    expect(paid.alreadyPaidHours).toBe(40)
    expect(paid.windowHeld ?? null).toBeNull()

    // Paid once: every day of both weeks once, and a third run pays nothing more.
    await run(held, 'calculate')
    const again = await run(held, 'process')
    expect(again.totalHours ?? 0).toBe(0)
    const days = await paidDays(held)
    const byDay = new Map<string, number>()
    for (const d of days) byDay.set(`${d.timesheetId}|${d.day}`, (byDay.get(`${d.timesheetId}|${d.day}`) ?? 0) + Number(d.hours))
    expect(byDay.size).toBe(10)
    expect([...byDay.values()].every((h) => h === 8)).toBe(true)
  })

  it('the repair leaves one activity log row with who did it, from and to, saying nothing undoes it', async () => {
    const logs = await prisma.automationLog.findMany({ where: { companyId: firmId, action: 'PAY_WINDOW_REPAIRED', payload: { path: ['buyContractId'], equals: held.buyId } } })
    expect(logs).toHaveLength(1)
    const log = logs[0]
    expect(log.reversible).toBe(false)
    expect(log.summary).toBe(`Ines Moreau's pay window moved from ${formatDay(held.firstEnd)} to ${formatDay(held.sellEnd)}`)
    expect(log.reason).toMatch(/ repaired the pay window on Payroll, so the weeks after .* are paid on the next calculation\. Nothing in Etyme undoes this repair\.$/)
    const p = log.payload as any
    expect(p).toMatchObject({ sellContractId: held.sellId, personId: held.personId, from: key(held.firstEnd), to: key(held.sellEnd) })
    expect(p.by.name).toBeTruthy()
    expect(p.links).toEqual([{ id: held.linkId, from: key(held.firstEnd), to: key(held.sellEnd) }])
    expect(p.rows).toEqual([{ id: held.rowId, from: key(held.firstEnd), to: key(held.sellEnd) }])
  })

  it('a completed cycle is never widened by a repair', async () => {
    expect(completedBefore.length).toBeGreaterThan(0)
    const now = await prisma.cycle.findMany({ where: { id: { in: completedBefore.map((c) => c.id) } } })
    expect(now.map((c) => ({ id: c.id, periodEnd: c.periodEnd ? key(c.periodEnd) : null, completedAt: c.completedAt?.toISOString() ?? null }))
      .sort((a, b) => a.id.localeCompare(b.id))).toEqual(completedBefore)
    // And no open pay date runs past the placement's end.
    const open = await prisma.cycle.findMany({ where: { buyContractId: held.buyId, completedAt: null } })
    for (const c of open) if (c.periodEnd) expect(key(c.periodEnd) <= key(held.sellEnd), `${c.kind} ends ${key(c.periodEnd)}`).toBe(true)
  })

  it('pressing it again moves nothing and says there is nothing to repair', async () => {
    const again = await repair(held)
    expect(again.status).toBe(409)
    expect(again.body.error.message).toBe("Ines Moreau's pay window already reaches the end of the placement, so there is nothing to repair.")
    expect(await prisma.automationLog.count({ where: { companyId: firmId, action: 'PAY_WINDOW_REPAIRED', payload: { path: ['buyContractId'], equals: held.buyId } } })).toBe(1)
  })
})

describe('a window whose later days a pay run already paid', () => {
  it('a window whose later days a pay run already recorded as paid is not moved, and the refusal names the week', async () => {
    const r = await repair(lumped)
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('PAID_AFTER_THE_WINDOW')
    expect(r.body.error.message).toBe(
      `A pay run recorded Teodor Vance's week of ${formatDay(at(lumped.firstEnd, 1))} as paid, so the pay window was not moved. ` +
        'Check it against what your payroll provider paid out, so no day is paid twice.',
    )
    expect(await windowOf(lumped)).toEqual({ link: key(lumped.firstEnd), row: key(lumped.firstEnd) })
    expect(await prisma.automationLog.count({ where: { companyId: firmId, action: 'PAY_WINDOW_REPAIRED', payload: { path: ['buyContractId'], equals: lumped.buyId } } })).toBe(0)
  })
})

describe('a seat that may not run payroll', () => {
  it('a seat that may not run payroll is told who may', async () => {
    // On the held row, in place of the button.
    const { data, row } = await readPayroll(lumped, READER)
    expect(data.mayRepairWindow).toBe(false)
    expect(row.windowHeld).toMatch(/the placement was extended\. Repairing the pay window is for the .+ here\. Ask (them|one of them)\.$/)
    expect(row.windowHeld).toContain('AP & Payroll')
    expect(row.windowHeld).not.toContain('Payroll reader')

    // And the press itself, by a seat that may not, moves nothing and says who may.
    const r = await repair(lumped, ACCOUNT_MANAGER)
    expect(r.status).toBe(403)
    expect(r.body.error.message).toMatch(/^Repairing the pay window is for the .+ here\. Ask (them|one of them)\.$/)
    expect(r.body.error.message).toContain('AP & Payroll')
    expect(await windowOf(lumped)).toEqual({ link: key(lumped.firstEnd), row: key(lumped.firstEnd) })
  })
})

/** The access-log rows the repair wrote about her, oldest first. */
async function trailOf(p: Placed) {
  const rows = await prisma.accessLog.findMany({
    where: { subjectId: p.personId, action: 'PAYROLL_VIEW', reason: { startsWith: 'Repair the pay window' } },
    select: { allowed: true, reason: true, actorPersonId: true },
  })
  return rows
}

describe('every press of the repair is in the access log', () => {
  it('a repair writes an access-log row naming her, and every refusal writes one before it is sent', async () => {
    // Held: repaired once, then refused as nothing to repair.
    const heldRows = await trailOf(held)
    expect(heldRows.filter((r) => r.allowed)).toHaveLength(1)
    expect(heldRows.some((r) => !r.allowed && /NOTHING_TO_REPAIR/.test(r.reason ?? ''))).toBe(true)
    // Lumped: refused for the week a run paid, and refused to a seat that may not run payroll.
    const lumpedRows = await trailOf(lumped)
    expect(lumpedRows.every((r) => !r.allowed)).toBe(true)
    expect(lumpedRows.some((r) => /PAID_AFTER_THE_WINDOW/.test(r.reason ?? ''))).toBe(true)
    expect(lumpedRows.some((r) => /may not run payroll/.test(r.reason ?? ''))).toBe(true)
    for (const r of [...heldRows, ...lumpedRows]) expect(r.actorPersonId).toBeTruthy()
  })
})

describe('a placement another firm holds', () => {
  it("a placement of another firm's is never repaired through this firm's pay line, and the refusal is in the access log", async () => {
    const p = await extendedBefore('Mara Quist', 'mara.quist.repair', saturdays[2])
    // Another firm's placement for her, paying through this firm's pay line.
    const harborline = await prisma.company.create({ data: { name: 'Harborline Tech', slug: 'harborline-window-repair', kind: 'VENDOR', currency: 'USD' } })
    const theirs = await prisma.sellContract.create({
      data: { companyId: harborline.id, clientCompanyId: clientId, personId: p.personId, billRate: 7_000, state: 'IN_PROGRESS', startDate: at(p.firstEnd, -13 * 7 + 1), endDate: p.sellEnd },
    })
    await prisma.contractLink.create({ data: { sellContractId: theirs.id, buyContractId: p.buyId, effectiveFrom: at(p.firstEnd, -13 * 7 + 1), effectiveTo: p.firstEnd } })
    as(BRIGHTMOOR)
    const r = await json(await repairWindow(req('POST', '/api/payroll/window-repair', { sellContractId: theirs.id, buyContractId: p.buyId, personId: p.personId })))
    expect(r.status).toBe(404)
    expect(r.body.error.message).toBe('This pay line is not on your payroll.')
    expect(await windowOf(p)).toEqual({ link: key(p.firstEnd), row: key(p.firstEnd) })
    const theirLink = await prisma.contractLink.findFirstOrThrow({ where: { sellContractId: theirs.id } })
    expect(key(theirLink.effectiveTo!)).toBe(key(p.firstEnd))
    expect((await trailOf(p)).some((row) => !row.allowed && /not on this firm's payroll/.test(row.reason ?? ''))).toBe(true)
  })
})

describe('a window that changes while the repair saves', () => {
  it('a window that changed while the repair was saving is left as it was, and nothing is half moved', async () => {
    const p = await extendedBefore('Petra Lund', 'petra.lund.repair', saturdays[3])
    // Her row moves between the read and the save: the window must not move without it.
    const real = prisma.$transaction.bind(prisma)
    const spy = vi.spyOn(prisma, '$transaction').mockImplementation((async (fn: any, opts?: any) => {
      await prisma.buyContractCandidate.update({ where: { id: p.rowId }, data: { endDate: at(p.firstEnd, -1) } })
      return real(fn, opts)
    }) as any)
    let r: { status: number; body: any }
    try {
      r = await repair(p)
    } finally {
      spy.mockRestore()
    }
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe("Petra Lund's pay window changed while this was saving, so nothing was moved. Open Payroll again.")
    const link = await prisma.contractLink.findUniqueOrThrow({ where: { id: p.linkId } })
    expect(key(link.effectiveTo!)).toBe(key(p.firstEnd))
    expect(await prisma.automationLog.count({ where: { companyId: firmId, action: 'PAY_WINDOW_REPAIRED', payload: { path: ['buyContractId'], equals: p.buyId } } })).toBe(0)
    expect((await trailOf(p)).filter((row) => row.allowed)).toHaveLength(0)
  })
})

describe('a pay line an old run paid as a total', () => {
  it('a pay line an old run paid without recording its days is not repaired, and the refusal says to settle it by hand', async () => {
    const p = await extendedBefore('Arlo Kemp', 'arlo.kemp.repair', saturdays[4])
    const ranOn = new Date()
    await prisma.automationLog.create({
      data: {
        companyId: firmId, action: 'PAYROLL_RUN', summary: 'Payroll process: 1 contract', reason: 'A run before days were recorded.',
        payload: { action: 'process', contracts: [{ buyContractId: p.buyId, totalHours: 40, grossPay: 180_000 }] },
        reversible: false, at: ranOn,
      },
    })
    const r = await repair(p)
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('PAID_UNRECORDED')
    expect(r.body.error.message).toBe(
      `A pay run on ${formatDay(key(ranOn))} paid Arlo Kemp without recording which days it covered, ` +
        'so the pay window was not moved. Settle this pay line by hand first, so no day is paid twice.',
    )
    expect(await windowOf(p)).toEqual({ link: key(p.firstEnd), row: key(p.firstEnd) })
  })
})

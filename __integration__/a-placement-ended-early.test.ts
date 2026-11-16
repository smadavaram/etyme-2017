import { describe, it, expect, beforeAll, vi } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { POST as activate } from '@/app/api/contracts/[id]/activate/route'
import { GET as bench } from '@/app/api/bench/route'
import { benchAt } from '@/app/api/today/reads'
import { writeCyclesFor } from '@/lib/contract-cycles'
import { standingAgainstLimit } from '@/lib/tenure-days'
import { formatDay } from '@/lib/format-date'

/**
 * Founder, 2026-11-16 ("go ahead with your recommendations"): when a
 * placement is ended early, record the real last day.
 *
 * The Complete button set the line ENDED and kept its planned end, months
 * away. Bench and Today read her free only after it, and tenure at the
 * client counted days she was not on site. Now the act writes the day it
 * is pressed as the last day on site, keeps the planned end in its log,
 * and cuts the line's dates there. A week already billed or paid past
 * that day refuses it in a sentence.
 *
 * Every date here is counted from the run's own day; none is pinned.
 */

const D = '@demo.etyme.local'
const TECHPEPLE = `world-techpeple${D}`
const DAY = 86_400_000
const midnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
const key = (d: Date) => d.toISOString().slice(0, 10)

let firm = ''
let client = ''
let today = new Date()
let planned = new Date()
let started = new Date()

async function placed(name: string, slug: string) {
  const person = await prisma.person.create({ data: { name, primaryEmail: `${slug}@northwind-staffing.example` } })
  const profile = await prisma.consultantProfile.create({ data: { personId: person.id, skills: ['dbt'] } })
  await prisma.benchListing.create({
    data: {
      consultantId: profile.id, companyId: firm, tier: 'MARKETING', state: 'GRANTED',
      invitedAt: new Date(started.getTime() - 10 * DAY), grantedAt: new Date(started.getTime() - 5 * DAY),
    },
  })
  const sell = await prisma.sellContract.create({
    data: { companyId: firm, clientCompanyId: client, personId: person.id, billRate: 9_500, state: 'IN_PROGRESS', startDate: started, endDate: planned },
  })
  const buy = await prisma.buyContract.create({
    data: {
      companyId: firm, contractType: 'W2', payCurrency: 'USD', state: 'IN_PROGRESS', startDate: started, endDate: planned,
      candidates: { create: { personId: person.id, payRate: 6_000, payCurrency: 'USD', startDate: started, endDate: planned } },
    },
  })
  await prisma.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: started, effectiveTo: planned } })
  await writeCyclesFor(prisma, {
    sell: { id: sell.id, startDate: started, endDate: planned },
    buy: { id: buy.id, contractType: 'W2', vendorCompanyId: null },
    packId: 'US_IT',
  })
  return { personId: person.id, sellId: sell.id, buyId: buy.id }
}

const complete = async (id: string) =>
  json(await activate(req('POST', `/api/contracts/${id}/activate`, { action: 'complete' }), { params: Promise.resolve({ id }) }))

let ended: Awaited<ReturnType<typeof placed>>
let held: Awaited<ReturnType<typeof placed>>
let totalOnly: Awaited<ReturnType<typeof placed>>
let lump: Awaited<ReturnType<typeof placed>>
let between: Awaited<ReturnType<typeof placed>>

beforeAll(async () => {
  await freshWorld()
  firm = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-techpeple' }, select: { id: true } })).id
  client = (await prisma.company.create({ data: { name: 'Ridgefold Mills', slug: 'ridgefold-early-end', kind: 'CLIENT', currency: 'USD' } })).id
  today = midnight(new Date())
  started = new Date(today.getTime() - 60 * DAY)
  planned = new Date(today.getTime() + 120 * DAY)

  ended = await placed('Lena Okafor', 'lena.okafor.early')
  // The same person on another firm's rung over her first ten days: one stretch, counted once.
  const harborline = (await prisma.company.create({ data: { name: 'Harborline Tech', slug: 'harborline-early-end', kind: 'VENDOR', currency: 'USD' } })).id
  await prisma.sellContract.create({
    data: { companyId: harborline, clientCompanyId: client, personId: ended.personId, billRate: 9_900, state: 'ENDED', startDate: started, endDate: new Date(started.getTime() + 9 * DAY) },
  })

  // A second person whose pay run is already processed over the days after today.
  held = await placed('Omar Lindqvist', 'omar.lindqvist.early')
  const sheet = await prisma.timesheet.create({
    data: {
      sellContractId: held.sellId, personId: held.personId, periodStart: today, periodEnd: new Date(today.getTime() + 6 * DAY),
      days: { [key(today)]: 8, [key(new Date(today.getTime() + DAY))]: 8 }, totalHours: 16, status: 'APPROVED',
    },
  })
  void sheet
  await prisma.cycle.create({
    data: {
      buyContractId: held.buyId, kind: 'SALARY_PAY', dueOn: new Date(today.getTime() + 9 * DAY), completedAt: new Date(),
      periodStart: new Date(today.getTime() - 6 * DAY), periodEnd: new Date(today.getTime() + 7 * DAY),
    },
  })

  // A third, whose week running past today was filed as a total with no daily hours.
  totalOnly = await placed('Ines Moreau', 'ines.moreau.early')
  await prisma.timesheet.create({
    data: {
      sellContractId: totalOnly.sellId, personId: totalOnly.personId, periodStart: new Date(today.getTime() - DAY), periodEnd: new Date(today.getTime() + 5 * DAY),
      days: {}, totalHours: 40, status: 'SUBMITTED', submittedAt: today,
    },
  })

  // A fourth, whose week past today a pay run paid as one lump on its first day, with no pay day settled over it.
  lump = await placed('Tomas Berg', 'tomas.berg.early')
  const lumpSheet = await prisma.timesheet.create({
    data: {
      sellContractId: lump.sellId, personId: lump.personId, periodStart: today, periodEnd: new Date(today.getTime() + 6 * DAY),
      days: { [key(new Date(today.getTime() + 2 * DAY))]: 8 }, totalHours: 8, status: 'APPROVED',
    },
  })
  await prisma.automationLog.create({
    data: {
      companyId: firm, action: 'PAYROLL_RUN', summary: 'Payroll processed', reason: 'A run before the window rule.', reversible: false,
      payload: { action: 'process', contracts: [{ buyContractId: lump.buyId, paid: [{ personId: lump.personId, timesheetId: lumpSheet.id, day: key(today), hours: 8, rateCents: 6_000 }] }] },
    },
  })

  // A fifth, with nothing after today when the act is pressed.
  between = await placed('Ada Nkemelu', 'ada.nkemelu.early')
}, 600_000)

describe('a placement ended early', () => {
  it('a placement ended early takes the day it ended as its last day on site, and keeps the planned end in its log', async () => {
    as(TECHPEPLE)
    const r = await complete(ended.sellId)
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200)
    expect(r.body.data.state).toBe('ENDED')
    expect(r.body.data.endDate).toBe(key(today))
    expect(r.body.data.message).toBe(`Contract completed. Last day on site: ${formatDay(today)}.`)

    const line = await prisma.sellContract.findUniqueOrThrow({ where: { id: ended.sellId } })
    expect(line.state).toBe('ENDED')
    expect(key(line.endDate!)).toBe(key(today))

    const log = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'CONTRACT_COMPLETED', payload: { path: ['contractId'], equals: ended.sellId } },
    })
    expect((log.payload as any).endDate).toEqual({ from: key(planned), to: key(today) })
  })

  it('the pay line, her row on it and the window her hours are paid through end on the same day', async () => {
    const buy = await prisma.buyContract.findUniqueOrThrow({ where: { id: ended.buyId }, include: { candidates: true } })
    expect(buy.state).toBe('ENDED')
    expect(key(buy.endDate!)).toBe(key(today))
    expect(key(buy.candidates[0].endDate!)).toBe(key(today))
    const link = await prisma.contractLink.findFirstOrThrow({ where: { sellContractId: ended.sellId } })
    expect(key(link.effectiveTo!)).toBe(key(today))
  })

  it('no week or bill falls after the real last day: every open date ends by it, and the one that held it is cut there', async () => {
    const open = await prisma.cycle.findMany({
      where: { OR: [{ sellContractId: ended.sellId }, { buyContractId: ended.buyId }], completedAt: null },
    })
    expect(open.length).toBeGreaterThan(0)
    for (const c of open) {
      expect(key(c.periodStart!) <= key(today), `${c.kind} starts ${key(c.periodStart!)}`).toBe(true)
      expect(key(c.periodEnd!) <= key(today), `${c.kind} ends ${key(c.periodEnd!)}`).toBe(true)
    }
    expect(open.some((c) => key(c.periodEnd!) === key(today))).toBe(true)
  })

  it('the person reads free from the day after her real last day on Bench and Today', async () => {
    const now = new Date()
    expect((await benchAt(firm, now)).map((b) => b.personId)).not.toContain(ended.personId)
    expect((await benchAt(firm, new Date(now.getTime() + DAY))).map((b) => b.personId)).toContain(ended.personId)

    as(TECHPEPLE)
    const b = await json(await bench(req('GET', '/api/bench?scope=company')))
    expect(b.status).toBe(200)
    const rows = [...b.body.data.tiers.MARKETING, ...b.body.data.tiers.RETAINED]
    const hers = rows.find((r: any) => r.consultant.personId === ended.personId)
    expect(hers.free.says).toBe(`Free from ${formatDay(new Date(today.getTime() + DAY))}`)
  })

  it('tenure at the client counts days on site up to the real last day, a day counted once', async () => {
    const lines = await prisma.sellContract.findMany({
      where: { personId: ended.personId, clientCompanyId: client, state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED'] } },
      select: { startDate: true, endDate: true, state: true },
    })
    expect(lines).toHaveLength(2)
    const later = new Date(today.getTime() + 30 * DAY)
    const standing = standingAgainstLimit(lines.map((l) => ({ startDate: l.startDate, endDate: l.endDate, live: l.state !== 'ENDED' })), { capMonths: 18, breakDays: 90 }, later)
    // Sixty days before today through today, both counted, the overlap once.
    expect(standing.daysOnSite).toBe(61)
    expect(key(standing.lastDay!)).toBe(key(today))
  })

  it('an early end past a week already billed or paid is refused in a sentence naming the week', async () => {
    as(TECHPEPLE)
    const r = await complete(held.sellId)
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('PAST_LAST_DAY')
    expect(r.body.error.message).toBe(
      `The week of ${formatDay(today)} is already paid, with hours on ${formatDay(new Date(today.getTime() + DAY))}. End Omar Lindqvist's placement on or after that day.`,
    )
    const line = await prisma.sellContract.findUniqueOrThrow({ where: { id: held.sellId } })
    expect(line.state).toBe('IN_PROGRESS')
    expect(key(line.endDate!)).toBe(key(planned))
  })

  it('an early end is refused past a week with hours and no daily breakdown', async () => {
    as(TECHPEPLE)
    const r = await complete(totalOnly.sellId)
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('PAST_LAST_DAY')
    expect(r.body.error.message).toBe(
      `The week of ${formatDay(new Date(today.getTime() - DAY))} has a weekly total filed with no daily hours, through ${formatDay(new Date(today.getTime() + 5 * DAY))}. ` +
        "Have that week corrected, or end Ines Moreau's placement on or after that day.",
    )
    const line = await prisma.sellContract.findUniqueOrThrow({ where: { id: totalOnly.sellId } })
    expect(line.state).toBe('IN_PROGRESS')
    expect(key(line.endDate!)).toBe(key(planned))
  })

  it('a week a pay run paid is named paid, never filed, wherever the run put its hours', async () => {
    as(TECHPEPLE)
    const r = await complete(lump.sellId)
    expect(r.status).toBe(409)
    expect(r.body.error.week.stage).toBe('PAID')
    expect(r.body.error.message).toMatch(/^The week of .+ is already paid, with hours on .+\. End Tomas Berg's placement on or after that day\.$/)
  })

  it('an early end re-reads the weeks inside its save', async () => {
    // A week filed after the first read and before the save: the save reads it and refuses, and nothing is cut.
    const real = prisma.$transaction.bind(prisma)
    const spy = vi.spyOn(prisma, '$transaction').mockImplementation((async (fn: any, opts?: any) => {
      await prisma.timesheet.create({
        data: {
          sellContractId: between.sellId, personId: between.personId, periodStart: today, periodEnd: new Date(today.getTime() + 6 * DAY),
          days: { [key(new Date(today.getTime() + DAY))]: 8 }, totalHours: 8, status: 'SUBMITTED', submittedAt: today,
        },
      })
      return real(fn, opts)
    }) as any)
    try {
      as(TECHPEPLE)
      const r = await complete(between.sellId)
      expect(r.status).toBe(409)
      expect(r.body.error.message).toBe(
        `The week of ${formatDay(today)} has hours filed on ${formatDay(new Date(today.getTime() + DAY))}. Have that week corrected, or end Ada Nkemelu's placement on or after that day.`,
      )
    } finally {
      spy.mockRestore()
    }
    const line = await prisma.sellContract.findUniqueOrThrow({ where: { id: between.sellId } })
    expect(line.state).toBe('IN_PROGRESS')
    expect(key(line.endDate!)).toBe(key(planned))
    const link = await prisma.contractLink.findFirstOrThrow({ where: { sellContractId: between.sellId } })
    expect(key(link.effectiveTo!)).toBe(key(planned))
    const log = await prisma.automationLog.count({ where: { action: 'CONTRACT_COMPLETED', payload: { path: ['contractId'], equals: between.sellId } } })
    expect(log).toBe(0)
  })
})

describe('an early end leaves what another placement still needs', () => {
  it('her row on a pay line another open placement of hers still pays through is not ended with the first', async () => {
    const p = await placed('Noor Haddad', 'noor.haddad.early')
    // A second placement of hers, still running, paid through the same pay line.
    const second = await prisma.sellContract.create({
      data: { companyId: firm, clientCompanyId: client, personId: p.personId, billRate: 9_000, state: 'IN_PROGRESS', startDate: started, endDate: planned },
    })
    await prisma.contractLink.create({ data: { sellContractId: second.id, buyContractId: p.buyId, effectiveFrom: started, effectiveTo: null } })
    as(TECHPEPLE)
    const r = await complete(p.sellId)
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200)
    // Her row and the pay line keep their end: the second placement still pays through them.
    const buy = await prisma.buyContract.findUniqueOrThrow({ where: { id: p.buyId }, include: { candidates: true } })
    expect(key(buy.candidates[0].endDate!)).toBe(key(planned))
    expect(key(buy.endDate!)).toBe(key(planned))
    // The ended placement's own window ends on its last day; the second's is untouched.
    const own = await prisma.contractLink.findFirstOrThrow({ where: { sellContractId: p.sellId } })
    expect(key(own.effectiveTo!)).toBe(key(today))
    const theirs = await prisma.contractLink.findFirstOrThrow({ where: { sellContractId: second.id } })
    expect(theirs.effectiveTo).toBeNull()
    const log = await prisma.automationLog.findFirstOrThrow({ where: { action: 'CONTRACT_COMPLETED', payload: { path: ['contractId'], equals: p.sellId } } })
    expect((log.payload as any).payLinesKeptOpen).toEqual([{ buyContractId: p.buyId, sellContractId: second.id }])
  })

  it('a pay window that starts after the last day is never given a last day before its first, and the log names it', async () => {
    const p = await placed('Yusuf Arslan', 'yusuf.arslan.early')
    // A change of pay line set for a later day: its window, its line and her row on it all start then.
    const later = new Date(today.getTime() + 30 * DAY)
    const next = await prisma.buyContract.create({
      data: {
        companyId: firm, contractType: 'W2', payCurrency: 'USD', state: 'IN_PROGRESS', startDate: later, endDate: planned,
        candidates: { create: { personId: p.personId, payRate: 6_200, payCurrency: 'USD', startDate: later, endDate: planned } },
      },
      include: { candidates: true },
    })
    const link = await prisma.contractLink.create({ data: { sellContractId: p.sellId, buyContractId: next.id, effectiveFrom: later, effectiveTo: planned } })
    as(TECHPEPLE)
    const r = await complete(p.sellId)
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200)
    const after = await prisma.contractLink.findUniqueOrThrow({ where: { id: link.id } })
    expect(key(after.effectiveFrom)).toBe(key(later))
    expect(key(after.effectiveTo!)).toBe(key(planned))
    const line = await prisma.buyContract.findUniqueOrThrow({ where: { id: next.id }, include: { candidates: true } })
    expect(key(line.endDate!)).toBe(key(planned))
    expect(key(line.candidates[0].endDate!)).toBe(key(planned))
    // Nothing on the record runs backwards.
    const windows = await prisma.contractLink.findMany({ where: { sellContractId: p.sellId } })
    for (const w of windows) if (w.effectiveTo) expect(key(w.effectiveTo) >= key(w.effectiveFrom), w.id).toBe(true)
    const log = await prisma.automationLog.findFirstOrThrow({ where: { action: 'CONTRACT_COMPLETED', payload: { path: ['contractId'], equals: p.sellId } } })
    expect((log.payload as any).windowsStartingLater).toEqual([{ id: link.id, buyContractId: next.id, startsOn: key(later) }])
  })
})

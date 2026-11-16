import { describe, it, expect, beforeAll } from 'vitest'
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
})

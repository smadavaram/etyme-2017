import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as myWork, POST as fileWeek } from '@/app/api/me/work/route'
import { GET as timesheets } from '@/app/api/timesheets/route'
import { POST as reject } from '@/app/api/timesheets/[id]/reject/route'

/**
 * The worker files their own week, from their own page, on the seeded world.
 *
 * Break #5 of the founder's lifecycle walk, 2026-09-28: "A consultant
 * can't file timesheets; their view is read-only." CLAUDE.md, Phase 1
 * station 6: the worker files their own week; nobody else may.
 *
 * The timesheets door already admitted the person whose hours they are.
 * The page never asked it: it listed weeks and offered to send an open
 * one, and nothing let anybody write one.
 */

const HELENA = 'helena.marsh@seed.etyme.invalid'
const CHIDI = 'chidi.okafor@seed.etyme.invalid'
const MARISOL = 'marisol.quintero@seed.etyme.invalid'
const COLLEEN = 'colleen.byrne@seed.etyme.invalid'
const NIKE_HIRING = 'world-nike-hiring@demo.etyme.local'

const it_: Record<string, any> = {}

async function page(email: string) {
  as(email)
  const r = await json(await myWork(req('GET', '/api/me/work')))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data
}

/** Eight hours on each of the first two days of the first week with two open days. */
function aWeek(filing: any) {
  const week = filing.weeks.find((w: any) => w.days.length >= 2)
  expect(week, JSON.stringify(filing.weeks)).toBeTruthy()
  return { week, hours: { [week.days[0]]: 8, [week.days[1]]: 8 } }
}

describe('a worker files their own week', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
  }, 600_000)

  it('Helena’s page offers her weeks on CloudEPA’s contract, not the rung Computer Systems sells to Northbend', async () => {
    const d = await page(HELENA)
    expect(d.filing).toHaveLength(1)
    expect(d.filing[0].payer).toBe('CloudEPA')
    expect(d.filing[0].site).toBe('Northbend Athletic')
    it_.helena = d.filing[0]

    const top = await prisma.sellContract.findFirstOrThrow({
      where: { personId: d.person.id, company: { slug: 'world-computer-systems' } },
    })
    it_.topRung = top.id
    expect(it_.helena.contractId).not.toBe(top.id)
  })

  it('no day she already filed is offered again', async () => {
    for (const f of it_.helena.filed) {
      for (const w of it_.helena.weeks) {
        for (const day of w.days) {
          expect(day < f.periodStart || day > f.periodEnd, `${day} is inside ${f.periodStart}..${f.periodEnd}`).toBe(true)
        }
      }
    }
  })

  it('she files a week and sends it for approval, and it is on her employer’s contract', async () => {
    const { week, hours } = aWeek(it_.helena)
    as(HELENA)
    const r = await json(await fileWeek(req('POST', '/api/me/work', {
      contractId: it_.helena.contractId, periodStart: week.periodStart, hours,
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.status).toBe('SUBMITTED')
    expect(r.body.data.message).toContain('Sent 16 hours')

    const t = await prisma.timesheet.findUniqueOrThrow({ where: { id: r.body.data.timesheetId } })
    expect(t.sellContractId).toBe(it_.helena.contractId)
    expect(Number(t.totalHours)).toBe(16)
    expect(t.status).toBe('SUBMITTED')
    it_.filed = { id: t.id, week }
  })

  it('the week she sent is no longer offered, and is in her hours as waiting', async () => {
    const d = await page(HELENA)
    const offered = d.filing[0].weeks.flatMap((w: any) => w.days)
    expect(offered).not.toContain(it_.filed.week.days[0])
    const row = d.timesheets.find((t: any) => t.id === it_.filed.id)
    expect(row.status).toBe('SUBMITTED')
  })

  it('the same week sent twice is refused, not written twice', async () => {
    as(HELENA)
    const r = await json(await fileWeek(req('POST', '/api/me/work', {
      contractId: it_.helena.contractId, periodStart: it_.filed.week.periodStart, hours: { [it_.filed.week.days[0]]: 8 },
    })))
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('WEEK_CLOSED')
  })

  it('Northbend’s hiring desk finds her week waiting for a signature', async () => {
    as(NIKE_HIRING)
    const r = await json(await timesheets(req('GET', '/api/timesheets?status=SUBMITTED&limit=50')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.timesheets.map((t: any) => t.id)).toContain(it_.filed.id)
  })

  it('Northbend sends her week back with a reason, and her page offers it again with her hours and the reason', async () => {
    as(NIKE_HIRING)
    const r = await json(await reject(req('POST', `/api/timesheets/${it_.filed.id}/reject`, { reason: 'The second day was a site shutdown' }), { params: Promise.resolve({ id: it_.filed.id }) }))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()

    const d = await page(HELENA)
    const back = d.filing[0].returned.find((w: any) => w.timesheetId === it_.filed.id)
    expect(back, JSON.stringify(d.filing[0].returned)).toBeTruthy()
    expect(back.reason).toContain('The second day was a site shutdown')
    expect(back.hours).toEqual({ [it_.filed.week.days[0]]: 8, [it_.filed.week.days[1]]: 8 })
    // Corrected here, never re-sent unchanged from the open list.
    expect(d.filing[0].weeks.flatMap((w: any) => w.days)).not.toContain(it_.filed.week.days[0])
  })

  it('she corrects the week and sends it again, over the same week, and it is waiting once more', async () => {
    as(HELENA)
    const r = await json(await fileWeek(req('POST', '/api/me/work', {
      contractId: it_.helena.contractId, periodStart: it_.filed.week.periodStart, hours: { [it_.filed.week.days[0]]: 8 },
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.message).toContain('again, corrected')
    expect(r.body.data.timesheetId).toBe(it_.filed.id)
    const t = await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.filed.id } })
    expect(t.status).toBe('SUBMITTED')
    expect(Number(t.totalHours)).toBe(8)
    const d = await page(HELENA)
    expect(d.filing[0].returned).toEqual([])
  })

  it('she cannot put hours on the rung above her employer', async () => {
    as(HELENA)
    const r = await json(await fileWeek(req('POST', '/api/me/work', {
      contractId: it_.topRung, periodStart: it_.helena.weeks[0].periodStart, hours: { [it_.helena.weeks[0].days[0]]: 8 },
    })))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toContain('the firm that employs you')
  })

  it('a day that has not happened yet is refused in a sentence', async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    // A week still open today, read fresh: the one filed above is no longer
    // offered, and asking about it would be refused as already filed before
    // the future day is ever looked at — which week that is depends on the
    // calendar the test runs on.
    const open = (await page(HELENA)).filing[0].weeks
    const week = open[open.length - 1]
    as(HELENA)
    const r = await json(await fileWeek(req('POST', '/api/me/work', {
      contractId: it_.helena.contractId, periodStart: week.periodStart, hours: { [tomorrow]: 8 },
    })))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toMatch(/has not happened yet|not in the week/)
  })

  it('nobody else may file her week: another consultant is told it is not theirs', async () => {
    as(CHIDI)
    const r = await json(await fileWeek(req('POST', '/api/me/work', {
      contractId: it_.helena.contractId, periodStart: it_.helena.weeks[0].periodStart, hours: { [it_.helena.weeks[0].days[0]]: 8 },
    })))
    expect(r.status).toBe(404)
    expect(r.body.error.message).toBe('That is not one of your placements.')
  })

  it('a travel nurse paid through her own company files her twelve-hour shifts the same way', async () => {
    const d = await page(COLLEEN)
    expect(d.filing).toHaveLength(1)
    const week = d.filing[0].weeks.find((w: any) => w.days.length >= 2)
    as(COLLEEN)
    const r = await json(await fileWeek(req('POST', '/api/me/work', {
      contractId: d.filing[0].contractId, periodStart: week.periodStart, hours: { [week.days[0]]: 12, [week.days[1]]: 12 },
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.message).toContain('Sent 24 hours')
  })

  it('Helena reads her placement once, naming every firm between her and Northbend, in order', async () => {
    const d = await page(HELENA)
    const at = d.placements.filter((p: any) => p.site === 'Northbend Athletic')
    expect(at).toHaveLength(1)
    expect(at[0].chain).toBe('Northbend Athletic · through Computer Systems Inc · employed by CloudEPA')
  })

  it('the pay on her placement is her own, never a price between two firms', async () => {
    const d = await page(HELENA)
    const p = d.placements.find((x: any) => x.site === 'Northbend Athletic')
    const own = await prisma.buyContractCandidate.findFirst({
      where: { personId: d.person.id, state: 'ACTIVE', buyContract: { supplierSellContractId: null } },
      select: { payRate: true },
    })
    expect(p.payRate).toBe(own?.payRate ?? null)
    const bills = await prisma.sellContract.findMany({ where: { personId: d.person.id }, select: { billRate: true } })
    for (const b of bills) expect(p.payRate).not.toBe(b.billRate)
  })

  it('every worker in a chain reads one line per placement, however many rungs it has', async () => {
    for (const email of [HELENA, CHIDI, COLLEEN]) {
      const d = await page(email)
      const sites = d.placements.map((p: any) => p.id)
      expect(new Set(sites).size).toBe(sites.length)
      const rungs = await prisma.sellContract.count({ where: { personId: d.person.id } })
      expect(d.placements.length).toBeLessThanOrEqual(rungs)
      for (const p of d.placements) expect(p.chain.startsWith(p.site)).toBe(true)
    }
  })

  it('somebody with no placement is offered nothing to file', async () => {
    const d = await page(MARISOL)
    expect(d.filing).toEqual([])
  })
})

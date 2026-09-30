import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as fileTimesheet } from '@/app/api/timesheets/route'
import { POST as sendTimesheet } from '@/app/api/timesheets/[id]/submit/route'
import { POST as rejectTimesheet } from '@/app/api/timesheets/[id]/reject/route'
import { POST as approveTimesheet } from '@/app/api/timesheets/[id]/approve/route'

/**
 * One week, filed once by the worker, signed at the top — on the seeded
 * world.
 *
 * Helena Marsh works at Northbend Athletic, employed by CloudEPA, sold on
 * through Computer Systems. A probe filed her week on the Computer
 * Systems → Northbend rung and got a 201: a second copy of one week,
 * billable twice. CloudEPA could file her weeks for her. Future days and
 * days another week held went in. And a week Northbend sent back could
 * never be corrected.
 */

const D = '@demo.etyme.local'
const NIKE = { hiring: `world-nike-hiring${D}` }
const CLOUDEPA = `world-cloudepa${D}`

const call = async (fn: (r: any, ctx: any) => Promise<Response>, url: string, id: string, body?: unknown) =>
  json(await fn(req('POST', url, body), { params: Promise.resolve({ id }) }))

const iso = (d: Date) => d.toISOString().slice(0, 10)
const plus = (s: string, n: number) => iso(new Date(Date.parse(s) + n * 86_400_000))

const it_: Record<string, any> = {}

describe('one week, filed once by the worker, signed at the top', () => {
  beforeAll(async () => {
    await freshWorld()
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    it_.helena = helena
    const rungs = await prisma.sellContract.findMany({ where: { personId: helena.id }, include: { company: true } })
    it_.own = rungs.find((r) => r.company.slug === 'world-cloudepa')!.id
    it_.above = rungs.find((r) => r.company.slug === 'world-computer-systems')!.id
    const last = await prisma.timesheet.findFirstOrThrow({ where: { personId: helena.id }, orderBy: { periodEnd: 'desc' } })
    it_.lastEnd = iso(last.periodEnd)
    it_.today = iso(new Date())
    it_.from = plus(it_.lastEnd, 1)
    it_.to = plus(it_.today, -1) < it_.from ? it_.from : plus(it_.today, -1)
    it_.days = { [it_.from]: 8 }
  }, 240_000)

  it('Helena’s week on the Computer Systems → Northbend rung is refused, and nothing is written', async () => {
    as(it_.helena.primaryEmail)
    const r = await json(await fileTimesheet(req('POST', '/api/timesheets', {
      sellContractId: it_.above, periodStart: it_.from, periodEnd: it_.to, days: it_.days,
    })))
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('NOT_THIS_RUNG')
    expect(r.body.error.message).toBe('Your hours go on the contract with the firm that employs you, not this one. Choose that placement.')
    expect(await prisma.timesheet.count({ where: { sellContractId: it_.above } })).toBe(0)
  })

  it('CloudEPA, which employs her, cannot file her week for her, and is told who can', async () => {
    as(CLOUDEPA)
    const r = await json(await fileTimesheet(req('POST', '/api/timesheets', {
      sellContractId: it_.own, periodStart: it_.from, periodEnd: it_.to, days: it_.days,
    })))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('Only Helena Marsh can file their week. Ask them to file it from their own page.')
  })

  it('a week running into days that have not happened yet is refused', async () => {
    as(it_.helena.primaryEmail)
    const r = await json(await fileTimesheet(req('POST', '/api/timesheets', {
      sellContractId: it_.own, periodStart: it_.from, periodEnd: plus(it_.today, 2), days: it_.days,
    })))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toMatch(/has not happened yet/)
  })

  it('a week reaching back over days already on a week she filed is refused', async () => {
    as(it_.helena.primaryEmail)
    const r = await json(await fileTimesheet(req('POST', '/api/timesheets', {
      sellContractId: it_.own, periodStart: it_.lastEnd, periodEnd: it_.to, days: it_.days,
    })))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toMatch(/is already on a week you filed\.$/)
  })

  it('Helena files her open days on CloudEPA’s rung and sends them', async () => {
    as(it_.helena.primaryEmail)
    const r = await json(await fileTimesheet(req('POST', '/api/timesheets', {
      sellContractId: it_.own, periodStart: it_.from, periodEnd: it_.to, days: it_.days,
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    it_.week = r.body.data.timesheet.id
    const sent = await call(sendTimesheet, `/api/timesheets/${it_.week}/submit`, it_.week, {})
    expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()
  })

  it('Northbend sends it back, and Helena files the same week again with the right hours — the same row, both signatures cleared', async () => {
    as(NIKE.hiring)
    const back = await call(rejectTimesheet, `/api/timesheets/${it_.week}/reject`, it_.week, { reason: 'Monday was a half day' })
    expect(back.body?.error, JSON.stringify(back.body)).toBeUndefined()

    as(it_.helena.primaryEmail)
    const again = await json(await fileTimesheet(req('POST', '/api/timesheets', {
      sellContractId: it_.own, periodStart: it_.from, periodEnd: it_.to, days: { [it_.from]: 4 },
    })))
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(again.body.data.replaced).toBe(true)
    expect(again.body.data.timesheet.id).toBe(it_.week)
    const row = await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.week } })
    expect(Number(row.totalHours)).toBe(4)
    expect(row.status).toBe('OPEN')
    expect(row.clientApprovedAt).toBeNull()
    expect(row.employerAcceptedAt).toBeNull()
    expect(await prisma.timesheet.count({ where: { sellContractId: it_.own, periodStart: new Date(it_.from) } })).toBe(1)

    const sent = await call(sendTimesheet, `/api/timesheets/${it_.week}/submit`, it_.week, {})
    expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()
  })

  it('a week already sent cannot be filed again until it is returned', async () => {
    as(it_.helena.primaryEmail)
    const r = await json(await fileTimesheet(req('POST', '/api/timesheets', {
      sellContractId: it_.own, periodStart: it_.from, periodEnd: it_.to, days: { [it_.from]: 6 },
    })))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toMatch(/is already sent\. If it is wrong, ask for it to be returned, then file it again\.$/)
  })

  it('Northbend signs the one week, on CloudEPA’s rung — no rung above holds a copy, so every rung bills this week', async () => {
    as(NIKE.hiring)
    const signed = await call(approveTimesheet, `/api/timesheets/${it_.week}/approve`, it_.week, {})
    expect(signed.body?.error, JSON.stringify(signed.body)).toBeUndefined()
    const row = await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.week } })
    expect(row.sellContractId).toBe(it_.own)
    expect(row.clientApprovedAt).not.toBeNull()
    expect(await prisma.timesheet.count({ where: { sellContractId: it_.above } })).toBe(0)
  })
})

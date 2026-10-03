import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { shortDay } from '@/lib/consultant-portfolio'

import { GET as myWork, POST as sendFromHerPage } from '@/app/api/me/work/route'
import { POST as fileTimesheet } from '@/app/api/timesheets/route'
import { POST as sendTimesheet } from '@/app/api/timesheets/[id]/submit/route'
import { POST as rejectTimesheet } from '@/app/api/timesheets/[id]/reject/route'
import { GET as programDesk } from '@/app/api/program/route'
import { GET as autoApprove } from '@/app/api/cron/auto-approve/route'

/**
 * A week sent carries the day it was sent — walked on the seeded world.
 *
 * The send step answered with `submittedAt` and never wrote it. So a week
 * filed through the product had no sent date: Helena Marsh's own page
 * read "Sent to Northbend Athletic." with no day, the client's queue
 * counted her wait from the last day of her week instead, and the nightly
 * job — which starts the clock at the run for a sheet it cannot date —
 * never let an approval window run out on any week a worker sent.
 *
 * Helena is employed by CloudEPA and works at Northbend Athletic through
 * Computer Systems. The window is walked on a worker placed directly at
 * Cavanaugh Glassworks, the seeded program whose own order says silence
 * approves a week after five days.
 */

const D = '@demo.etyme.local'
const HELENA = 'helena.marsh@seed.etyme.invalid'
const NORTHBEND = { hiring: `world-nike-hiring${D}`, programme: `world-nike-programme${D}` }
const CRON_SECRET = 'a-sent-week-carries-its-day'
const DAY = 86_400_000

const call = async (fn: (r: any, ctx: any) => Promise<Response>, url: string, id: string, body?: unknown) =>
  json(await fn(req('POST', url, body), { params: Promise.resolve({ id }) }))

async function page(email: string) {
  as(email)
  const r = await json(await myWork(req('GET', '/api/me/work')))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data
}

async function sentAt(id: string): Promise<Date | null> {
  return (await prisma.timesheet.findUniqueOrThrow({ where: { id }, select: { submittedAt: true } })).submittedAt
}

async function runTheNightlyJob() {
  process.env.CRON_SECRET = CRON_SECRET
  const r = await json(await autoApprove(req('GET', '/api/cron/auto-approve', undefined, { authorization: `Bearer ${CRON_SECRET}` })))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data
}

const the: Record<string, any> = {}

describe('a week sent carries the day it was sent', () => {
  beforeAll(async () => {
    await freshWorld()
    const d = await page(HELENA)
    expect(d.filing, 'Helena files on one contract, her employer’s').toHaveLength(1)
    the.contractId = d.filing[0].contractId
    the.week = d.filing[0].weeks.find((w: any) => w.days.length >= 2)
    expect(the.week, JSON.stringify(d.filing[0].weeks)).toBeTruthy()
  }, 600_000)

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sending a week records when it was sent', async () => {
    as(HELENA)
    const filed = await json(await fileTimesheet(req('POST', '/api/timesheets', {
      sellContractId: the.contractId,
      periodStart: the.week.periodStart,
      periodEnd: the.week.periodEnd,
      days: { [the.week.days[0]]: 8, [the.week.days[1]]: 8 },
    })))
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    the.sheet = filed.body.data.timesheet.id
    expect(await sentAt(the.sheet), 'a week filed and not sent has not been sent').toBeNull()

    const before = Date.now()
    const sent = await call(sendTimesheet, `/api/timesheets/${the.sheet}/submit`, the.sheet, {})
    const after = Date.now()
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)

    const on = await sentAt(the.sheet)
    expect(on, 'the row carries the moment it was sent').not.toBeNull()
    expect(on!.getTime()).toBeGreaterThanOrEqual(before)
    expect(on!.getTime()).toBeLessThanOrEqual(after)
    // The answer names the same moment the row carries.
    expect(sent.body.data.submittedAt).toBe(on!.toISOString())
    the.firstSent = on
  })

  it('a week the worker sends says the day she sent it, on her own page', async () => {
    const d = await page(HELENA)
    const row = d.owed.weeks.find((w: any) => w.sheetId === the.sheet)
    expect(row, JSON.stringify(d.owed.weeks.slice(0, 3))).toBeTruthy()
    expect(row.stage).toBe('WAITING_FOR_CLIENT')
    expect(row.says).toBe(
      `Sent to Northbend Athletic on ${shortDay(the.firstSent.toISOString())}. Waiting for them to sign.`
    )
  })

  it('the client’s queue shows a week sent today as waiting since today, however long ago its days were', async () => {
    as(NORTHBEND.programme)
    const r = await json(await programDesk(req('GET', '/api/program')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const item = r.body.data.approvalQueue.find((x: any) => x.id === the.sheet)
    expect(item, 'her week is on Northbend’s queue').toBeTruthy()
    expect(item.submittedAt).toBe(the.firstSent.toISOString())
    expect(item.daysWaiting).toBe(0)
  })

  it('a week sent back and filed again carries no send time until it is sent again', async () => {
    as(NORTHBEND.hiring)
    const back = await call(rejectTimesheet, `/api/timesheets/${the.sheet}/reject`, the.sheet, { reason: 'The second day was a site shutdown' })
    expect(back.body?.error, JSON.stringify(back.body)).toBeUndefined()

    as(HELENA)
    const again = await json(await fileTimesheet(req('POST', '/api/timesheets', {
      sellContractId: the.contractId,
      periodStart: the.week.periodStart,
      periodEnd: the.week.periodEnd,
      days: { [the.week.days[0]]: 8 },
    })))
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(again.body.data.timesheet.id).toBe(the.sheet)
    expect(await sentAt(the.sheet)).toBeNull()
  })

  it('sending a returned week again records the new send time', async () => {
    as(HELENA)
    const sent = await call(sendTimesheet, `/api/timesheets/${the.sheet}/submit`, the.sheet, {})
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    const on = await sentAt(the.sheet)
    expect(on).not.toBeNull()
    expect(on!.getTime()).toBeGreaterThan(the.firstSent.getTime())
    expect(sent.body.data.submittedAt).toBe(on!.toISOString())
    the.secondSent = on
  })

  it('a returned week sent again from her own page records the new send time', async () => {
    as(NORTHBEND.hiring)
    const back = await call(rejectTimesheet, `/api/timesheets/${the.sheet}/reject`, the.sheet, { reason: 'Monday was a half day' })
    expect(back.body?.error, JSON.stringify(back.body)).toBeUndefined()

    as(HELENA)
    const r = await json(await sendFromHerPage(req('POST', '/api/me/work', {
      contractId: the.contractId, periodStart: the.week.periodStart, hours: { [the.week.days[0]]: 4 },
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.status).toBe('SUBMITTED')
    expect(r.body.data.timesheetId).toBe(the.sheet)
    const on = await sentAt(the.sheet)
    expect(on).not.toBeNull()
    expect(on!.getTime()).toBeGreaterThan(the.secondSent.getTime())
  })
})

describe('the approval window counts from when the week was sent', () => {
  beforeAll(async () => {
    // A worker placed directly at Cavanaugh Glassworks, on the client's own
    // order, which says silence approves a week after five days.
    const line = await prisma.sellContract.findFirst({
      where: {
        state: 'IN_PROGRESS',
        clientCompany: { slug: 'world-corning' },
        workOrder: { autoApproveTimesheets: true, issuedBy: { slug: 'world-corning' } },
      },
      select: {
        id: true,
        person: { select: { name: true, primaryEmail: true } },
        workOrder: { select: { approvalWindowDays: true } },
      },
      orderBy: { person: { name: 'asc' } },
    })
    expect(line, 'the seeded world has a worker on Cavanaugh Glassworks’ own silence-approving order').toBeTruthy()
    expect(line!.workOrder!.approvalWindowDays).toBe(5)
    the.cav = { contractId: line!.id, name: line!.person.name, email: line!.person.primaryEmail }

    const d = await page(the.cav.email)
    const mine = d.filing.find((f: any) => f.contractId === the.cav.contractId)
    expect(mine, JSON.stringify(d.filing)).toBeTruthy()
    const week = mine.weeks.find((w: any) => w.days.length >= 2)
    expect(week, JSON.stringify(mine.weeks)).toBeTruthy()

    as(the.cav.email)
    const r = await json(await sendFromHerPage(req('POST', '/api/me/work', {
      contractId: the.cav.contractId, periodStart: week.periodStart,
      hours: { [week.days[0]]: 8, [week.days[1]]: 8 },
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    the.cav.sheet = r.body.data.timesheetId
    the.cav.sent = await sentAt(the.cav.sheet)
    expect(the.cav.sent, 'the week sent from the worker’s page carries its send time').not.toBeNull()
  }, 120_000)

  afterEach(() => {
    vi.useRealTimers()
  })

  it('a week sent today is still inside the approval window two days later', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(the.cav.sent.getTime() + 2 * DAY + 60_000))
    await runTheNightlyJob()
    vi.useRealTimers()

    const row = await prisma.timesheet.findUniqueOrThrow({ where: { id: the.cav.sheet } })
    expect(row.status).toBe('SUBMITTED')
    expect(row.clientApprovedAt).toBeNull()
    expect(await prisma.automationLog.count({
      where: { action: 'TIMESHEET_AUTO_APPROVED', payload: { path: ['timesheetId'], equals: the.cav.sheet } },
    })).toBe(0)
  })

  it('the approval window counts from when the week was sent', async () => {
    const fifthDay = new Date(the.cav.sent.getTime() + 5 * DAY + 60_000)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(fifthDay)
    await runTheNightlyJob()
    vi.useRealTimers()

    const row = await prisma.timesheet.findUniqueOrThrow({ where: { id: the.cav.sheet } })
    // Signed by silence, on the fifth day after it was sent, naming nobody.
    expect(row.autoApproved).toBe(true)
    expect(row.clientApprovedById).toBeNull()
    expect(row.clientApprovedAt?.toISOString()).toBe(fifthDay.toISOString())

    const log = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'TIMESHEET_AUTO_APPROVED', payload: { path: ['timesheetId'], equals: the.cav.sheet } },
    })
    expect((log.payload as any).waitedDays).toBe(5)
    expect(log.reason).toBe(
      `Approved automatically. ${the.cav.name} submitted 16 hours 5 days ago and ` +
      'Cavanaugh Glassworks agreed to a 5 day window. Nobody looked at it.'
    )
  })
})

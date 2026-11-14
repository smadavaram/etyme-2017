import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { RATE_CHANGE_PERSON } from '@/lib/seed-rate-change'
import { clientOffEtymeBeforeSays, clientWaitingLinks } from '@/lib/consultant-portfolio'

import { GET as myWork, POST as fileWeek } from '@/app/api/me/work/route'

/**
 * The founder, 2026-11-14: the client approves the hours in its own
 * timesheet system, the contractor saves that approval, and sends it with
 * her week to the firm that employs her, which bills on it.
 *
 * A world made here, from the seeded one: Rosa Delgado is Brightmoor
 * Staffing's own W2 at Northbend Athletic, and in this world nobody at
 * Northbend Athletic has claimed its record, so it is not on Etyme
 * (`isShell` in lib/off-system). She files a week from her own page and
 * reads what it says, as her.
 */

const ROSA = RATE_CHANGE_PERSON.email
const CLIENT = 'Northbend Athletic'

async function page() {
  as(ROSA)
  const r = await json(await myWork(req('GET', '/api/me/work')))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data
}

const the = { sheetId: '' }

describe('a worker whose client is not on Etyme, on her own page', () => {
  beforeAll(async () => {
    await freshWorld()
    const moved = await prisma.company.updateMany({ where: { slug: 'world-nike' }, data: { claimedAt: null } })
    expect(moved.count).toBe(1)
  }, 900_000)

  it('before she files, she is told Northbend Athletic approves in its own system and that she attaches its approval', async () => {
    const d = await page()
    const filing = d.filing[0]
    expect(filing.payer).toBe('Brightmoor Staffing')
    expect(filing.signs.startsWith(clientOffEtymeBeforeSays(CLIENT))).toBe(true)
    expect(filing.signs).not.toContain('approves them first')
  })

  it('a worker whose client is not on Etyme is told to attach the client’s approval, and is never told her week was sent to them', async () => {
    const before = await page()
    const filing = before.filing[0]
    const isWeekday = (d: string) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())
    const week = filing.weeks.find((w: any) => w.days.some(isWeekday))
    expect(week, JSON.stringify(filing.weeks)).toBeTruthy()
    const hours = Object.fromEntries(week.days.filter(isWeekday).slice(0, 1).map((d: string) => [d, 8]))

    as(ROSA)
    const r = await json(await fileWeek(req('POST', '/api/me/work', { contractId: filing.contractId, periodStart: week.periodStart, hours })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    the.sheetId = r.body.data.timesheetId

    const d = await page()
    const row = d.owed.weeks.find((w: any) => w.sheetId === the.sheetId)
    expect(row, JSON.stringify(d.owed.weeks.slice(0, 3))).toBeTruthy()
    expect(row.stage).toBe('WAITING_FOR_CLIENT')
    expect(row.says).toMatch(/^Filed( on [A-Z][a-z]{2} \d{1,2})?\. Northbend Athletic is not on Etyme, so nothing was sent to them\./)
    expect(row.says).toContain('Attach the timesheet Northbend Athletic approved')
    expect(row.says).not.toMatch(/Sent to|Waiting for them to sign/)
    expect(d.owed.waiting.says).toContain('waiting for Northbend Athletic to approve.')
    expect(d.owed.waiting.says).not.toContain('to sign')
  })

  it('the week offers attaching Northbend Athletic’s timesheet first and asking by email second, on the owed row and in her hours', async () => {
    const d = await page()
    const row = d.owed.weeks.find((w: any) => w.sheetId === the.sheetId)
    const links = clientWaitingLinks({ id: the.sheetId, clientName: CLIENT, offEtyme: true })
    expect(row.links).toEqual(links)
    expect(links[0].href).toBe(`/dashboard/weeks/${the.sheetId}?mode=EVIDENCE`)
    expect(links[1].href).toBe(`/dashboard/weeks/${the.sheetId}?mode=LINK`)

    const listed = d.timesheets.find((t: any) => t.id === the.sheetId)
    expect(listed.door.href).toBe(links[0].href)
    expect(listed.door.says).toBe(links[0].says)
    expect(listed.door.also.href).toBe(links[1].href)
    expect(listed.door.says).not.toContain('signs this week in Etyme')
  })
})

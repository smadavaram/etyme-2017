import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as approve } from '@/app/api/timesheets/[id]/approve/route'
import { GET as decisions } from '@/app/api/decisions/route'

/**
 * The signed week travels down the chain, on the seeded world.
 *
 * Helena Marsh works at Northbend Athletic, sold by Computer Systems,
 * employed by Techpeple. Her seeded week of 17 September is filed and
 * unsigned. Before this, Computer Systems had no step on it and Techpeple
 * could accept it before Northbend had signed.
 */

const D = '@demo.etyme.local'
const NIKE = `world-nike-hiring${D}`
const CS = `world-computer-systems${D}`
const TECHPEPLE = `world-techpeple${D}`

const sign = async (id: string, body: unknown = {}) =>
  json(await approve(req('POST', `/api/timesheets/${id}/approve`, body), { params: Promise.resolve({ id }) }))
const queue = async () => (await json(await decisions(req('GET', '/api/decisions')))).body?.data?.decisions ?? []
const onQueue = async (id: string) => (await queue()).some((d: any) => d.entityType === 'TIMESHEET' && d.entityId === id)

async function toldAt(slug: string, title: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { slug } })
  for (let i = 0; i < 30; i++) {
    const n = await prisma.notification.findFirst({ where: { companyId: company.id, title } })
    if (n) return n
    await new Promise((r) => setTimeout(r, 100))
  }
  return null
}

const it_: Record<string, any> = {}

describe('the signed week travels down the chain, and each rung accepts it in turn', () => {
  beforeAll(async () => {
    await freshWorld()
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    const week = await prisma.timesheet.findFirstOrThrow({
      where: { personId: helena.id, status: 'SUBMITTED', clientApprovedAt: null },
      orderBy: { periodStart: 'desc' },
    })
    it_.week = week.id
    it_.hours = Number(week.totalHours)
  }, 240_000)

  it('Techpeple cannot accept Helena’s week before anybody above it has signed', async () => {
    as(TECHPEPLE)
    const r = await sign(it_.week)
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('NOT_YOUR_TURN')
    expect(r.body.error.message).toBe('Northbend Athletic has not signed this week yet. It comes to you once they have.')
    expect(await onQueue(it_.week)).toBe(false)
  })

  it('Computer Systems cannot accept it before Northbend has signed either', async () => {
    as(CS)
    const r = await sign(it_.week)
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('Northbend Athletic has not signed this week yet. It comes to you once they have.')
  })

  it('Northbend signs first, and Computer Systems is told the week has reached it, on its desk and by email', async () => {
    as(NIKE)
    const r = await sign(it_.week)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const row = await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.week } })
    expect(row.clientApprovedAt).not.toBeNull()
    expect(row.status).toBe('SUBMITTED')

    const told = await toldAt('world-computer-systems', 'Helena Marsh’s week is yours to accept')
    expect(told?.body).toMatch(/^Northbend Athletic signed .+ Accept what you pay Techpeple for it; nobody below you pays on this week until you do\.$/)
    expect(told?.channel).toBe('EMAIL')
    as(CS)
    expect(await onQueue(it_.week)).toBe(true)
  })

  it('Techpeple still cannot accept, because Computer Systems has not, and the week is not on its desk yet', async () => {
    as(TECHPEPLE)
    const r = await sign(it_.week)
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('Computer Systems Inc has not accepted this week yet. It comes to you once they have.')
    expect(await onQueue(it_.week)).toBe(false)
  })

  it('Computer Systems accepts what it pays Techpeple, on the same week, and Techpeple is told', async () => {
    as(CS)
    const r = await sign(it_.week)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const passed = await prisma.workAssertion.findMany({ where: { timesheetId: it_.week, role: 'PASS_THROUGH', state: 'LIVE' }, include: { company: true } })
    expect(passed.map((a) => a.company.name)).toEqual(['Computer Systems Inc'])
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.week } })).status).toBe('SUBMITTED')

    const told = await toldAt('world-techpeple', 'Helena Marsh’s week is yours to accept')
    expect(told?.body).toMatch(/^Computer Systems Inc accepted .+ Accept what you pay Helena Marsh for it;/)
    as(TECHPEPLE)
    expect(await onQueue(it_.week)).toBe(true)
  })

  it('Computer Systems cannot accept the same week twice', async () => {
    as(CS)
    const r = await sign(it_.week)
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('Already accepted.')
  })

  it('Techpeple accepts last, and the one week is approved with a signature from every rung — no copy on any rung', async () => {
    as(TECHPEPLE)
    const r = await sign(it_.week)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const row = await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.week }, include: { assertions: { include: { company: true } } } })
    expect(row.status).toBe('APPROVED')
    expect(row.employerAcceptedAt).not.toBeNull()
    expect(row.assertions.filter((a) => a.state === 'LIVE').map((a) => `${a.company.name}:${a.role}`).sort()).toEqual([
      'Computer Systems Inc:PASS_THROUGH',
      'Northbend Athletic:CLIENT_APPROVAL',
      'Techpeple:EMPLOYER_ACCEPTANCE',
    ])
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    expect(await prisma.timesheet.count({ where: { personId: helena.id, periodStart: row.periodStart } })).toBe(1)
    expect(await onQueue(it_.week)).toBe(false)
  })
})

/**
 * The founder, 2026-10-19: below the top of a chain, which hours are
 * overtime is the client's decision when it signed the week, carried
 * down. Computer Systems and Techpeple accept Helena's heavy week without
 * being asked about its overtime; each reads what Northbend decided, on
 * its own line; and an answer either sends anyway is refused.
 *
 * Every contract on the chain draws a forty-hour line, so before this
 * Computer Systems was stopped and asked to decide the five hours on the
 * contract it pays Techpeple on.
 */
describe('below the top of a chain, the client decided the overtime', () => {
  const ot: Record<string, any> = {}

  beforeAll(async () => {
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    const hoursOn = (await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.week } })).sellContractId
    const above = await prisma.buyContract.findFirstOrThrow({
      where: { supplierSellContractId: hoursOn },
      select: { sellLinks: { select: { sellContractId: true } } },
    })
    const top = above.sellLinks[0].sellContractId
    // Northbend's line with Computer Systems, and Techpeple's with Computer
    // Systems: both at forty, both offering time and a half.
    for (const id of [top, hoursOn]) {
      await prisma.sellContract.update({ where: { id }, data: { overtimeAfterHours: 40, overtimeMultiplierBps: 15_000 } })
    }

    // A forty-five hour week, nine a day Monday to Friday, a month before
    // any of hers, filed on Techpeple's contract as every week of hers is.
    const earliest = await prisma.timesheet.findFirstOrThrow({ where: { sellContractId: hoursOn }, orderBy: { periodStart: 'asc' } })
    const sunday = new Date(earliest.periodStart.getTime() - 28 * 86_400_000)
    sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay())
    const day = (n: number) => new Date(sunday.getTime() + n * 86_400_000).toISOString().slice(0, 10)
    ot.sunday = day(0)
    const sheet = await prisma.timesheet.create({
      data: {
        sellContractId: hoursOn, personId: helena.id,
        periodStart: new Date(`${day(0)}T00:00:00.000Z`), periodEnd: new Date(`${day(6)}T00:00:00.000Z`),
        days: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [day(n), 9])),
        totalHours: 45, status: 'SUBMITTED', submittedAt: new Date(`${day(5)}T18:00:00.000Z`),
      },
    })
    ot.week = sheet.id
  })

  const note = 'A go-live week, agreed with the account manager.'

  it('Northbend signs at the top and decides the five hours itself, at double time on its own contract', async () => {
    as(NIKE)
    const asked = await sign(ot.week, { note })
    expect(asked.status).toBe(422)
    expect(asked.body.error.code).toBe('OVERTIME_UNDECIDED')

    const r = await sign(ot.week, {
      note,
      overtime: [{ weekOf: ot.sunday, treatment: 'PREMIUM', multiplierBps: 20_000, reason: 'Go-live weekend, agreed in writing.' }],
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.clientDecided).toBeNull()
  })

  it('a firm in the middle accepting a week reads the client’s overtime decision and is not asked to decide it', async () => {
    as(CS)
    const card = (await queue()).find((d: any) => d.entityType === 'TIMESHEET' && d.entityId === ot.week)
    // The card says what Northbend decided, on the line Computer Systems
    // pays Techpeple on — time and a half — never Northbend's double time.
    expect(card?.clientDecided).toBe('Northbend Athletic decided 5 hours at time and a half.')

    const r = await sign(ot.week, { note })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.clientDecided).toBe('Northbend Athletic decided 5 hours at time and a half.')
    expect(r.body.data.message).toMatch(/^Accepted 45h — \$[\d,]+\.\d{2} to pay for the week\. Northbend Athletic decided 5 hours at time and a half\.$/)
    // Nothing of Computer Systems' own is written: the client's answer is the only one.
    const answers = await prisma.overtimeDecision.findMany({ where: { timesheetId: ot.week }, select: { decidedByCompanyId: true } })
    const nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' } })
    expect(answers.map((a) => a.decidedByCompanyId)).toEqual([nike.id])
  })

  it('an overtime answer from a rung below the top is refused in a sentence', async () => {
    as(TECHPEPLE)
    const r = await sign(ot.week, {
      note,
      overtime: [{ weekOf: ot.sunday, treatment: 'SAME_RATE' }],
    })
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('CLIENT_DECIDED_OVERTIME')
    expect(r.body.error.message).toBe(
      'Northbend Athletic decided the overtime on this week when it signed it, so accept the week without an overtime answer of your own.'
    )
    // Refused before anything was written: Techpeple has not accepted.
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id: ot.week } })).employerAcceptedAt).toBeNull()
  })

  it('the employer is told the client’s decision when the week reaches it, and accepts without being asked', async () => {
    const techpeple = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-techpeple' } })
    let told = null
    for (let i = 0; i < 30 && !told; i++) {
      told = await prisma.notification.findFirst({ where: { companyId: techpeple.id, entityId: ot.week, title: 'Helena Marsh’s week is yours to accept' } })
      if (!told) await new Promise((r) => setTimeout(r, 100))
    }
    expect(told?.body).toMatch(/ Northbend Athletic decided 5 hours at time and a half\.$/)

    as(TECHPEPLE)
    const r = await sign(ot.week, { note })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.clientDecided).toBe('Northbend Athletic decided 5 hours at time and a half.')
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id: ot.week } })).status).toBe('APPROVED')
  })
})

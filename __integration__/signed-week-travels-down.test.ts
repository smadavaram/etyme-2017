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
      'Techpeple:EMPLOYER_ACCEPTANCE',
      'Computer Systems Inc:PASS_THROUGH',
      'Northbend Athletic:CLIENT_APPROVAL',
    ])
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    expect(await prisma.timesheet.count({ where: { personId: helena.id, periodStart: row.periodStart } })).toBe(1)
    expect(await onQueue(it_.week)).toBe(false)
  })
})

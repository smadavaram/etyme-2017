import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as rejectTimesheet } from '@/app/api/timesheets/[id]/reject/route'

/**
 * A seated program office sends a week back from the same desk it signs
 * one from. The approve route resolved the seat; the reject route asked
 * the office's own company and role, so an office that could approve a
 * client's week was refused sending it back (architect, 2026-10-06).
 *
 * Aptiva Workforce sits at Cavanaugh Glassworks' desk (seeded). Its
 * Program Analyst holds almost nothing at Aptiva itself, so every gate
 * that passes is passing on the seat.
 */

const ANALYST = 'aptiva.reject.analyst@aptiva.invalid'
const co: Record<string, string> = {}
let seatId = ''
let weekId = ''

const reject = async (id: string, body: unknown) =>
  json(await rejectTimesheet(req('POST', `/api/timesheets/${id}/reject`, body), { params: Promise.resolve({ id }) }))

beforeAll(async () => {
  await freshWorld()
  for (const slug of ['world-corning', 'world-aptiva']) {
    co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id
  }
  const analystRole = await prisma.role.findFirstOrThrow({
    where: { companyId: co['world-aptiva'], name: 'Program Analyst' },
    select: { id: true },
  })
  const analyst = await prisma.person.create({ data: { name: 'Odile Brandt', primaryEmail: ANALYST } })
  await prisma.context.create({
    data: { personId: analyst.id, companyId: co['world-aptiva'], roleId: analystRole.id, type: 'EMPLOYEE', grantReason: 'reject walk' },
  })
  seatId = (await prisma.programSeat.findFirstOrThrow({
    where: { clientCompanyId: co['world-corning'], officeCompanyId: co['world-aptiva'] },
    select: { id: true },
  })).id
  weekId = (await prisma.timesheet.findFirstOrThrow({
    where: { status: 'SUBMITTED', clientApprovedAt: null, sellContract: { endClientCompanyId: co['world-corning'] } },
    select: { id: true },
    orderBy: { periodEnd: 'desc' },
  })).id
}, 300_000)

describe('a seated program office sends a week back from the client’s desk', () => {
  it('a seat at a desk that does not sign hours cannot send a week back either', async () => {
    // The seeded seat is Cavanaugh's Program Manager desk, which does not
    // sign hours (lib/company-defaults gives that to the hiring manager).
    as(ANALYST)
    const { status } = await reject(weekId, { reason: 'Hours on Tuesday do not match the badge log.' })
    expect(status).toBe(403)
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id: weekId } })).status).toBe('SUBMITTED')
  })

  it('a seated program office that may sign the client’s week may also send it back, judged by the client’s role and not its own', async () => {
    const hiring = await prisma.role.findFirstOrThrow({
      where: { companyId: co['world-corning'], name: 'Hiring Manager' },
      select: { id: true },
    })
    await prisma.programSeat.update({ where: { id: seatId }, data: { roleId: hiring.id } })
    as(ANALYST)
    const { status, body } = await reject(weekId, { reason: 'Hours on Tuesday do not match the badge log.' })
    expect(body?.error, JSON.stringify(body)).toBeUndefined()
    expect(status).toBeLessThan(400)
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id: weekId } })).status).toBe('OPEN')
  })
})

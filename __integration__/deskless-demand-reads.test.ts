import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as listTimesheets } from '@/app/api/timesheets/route'
import { GET as readBudget } from '@/app/api/program/budget/route'
import { GET as readOrg } from '@/app/api/program/org/route'
import { namesAPermission } from '@/lib/refusal-words'

/**
 * Sign-up walk, round three. Member holds no permission at all since
 * 801e7b900, and the menu shows such a seat only its own pages and what
 * is addressed to it. Timesheets, Budget and Org view asked nothing, so a
 * colleague not yet given a desk read all three by URL. They now refuse
 * the seat the menu hides them from, in a sentence, and log each refused
 * read; a desk-less worker still reads their own weeks.
 */

const PROGRAM = 'world-nike-programme@demo.etyme.local'
const NIKE_MEMBER = 'new.colleague@northbend.demo.etyme.local'
const FIRM_MEMBER = 'new.colleague@brightmoor.demo.etyme.local'

/** The access log is written without awaiting; give it a moment. */
async function refusalsBy(actorPersonId: string, startsWith: string) {
  for (let i = 0; i < 20; i++) {
    const rows = await prisma.accessLog.findMany({ where: { actorPersonId, allowed: false, reason: { startsWith } } })
    if (rows.length > 0) return rows
    await new Promise((r) => setTimeout(r, 100))
  }
  return []
}

describe('a client colleague seated as Member with no desk', () => {
  let member = ''
  let nike = ''
  beforeAll(async () => {
    await freshWorld()
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    nike = firm.id
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: firm.id, name: 'Member' }, select: { id: true } })
    member = (await prisma.person.create({ data: { primaryEmail: NIKE_MEMBER, name: 'Lee Chen' }, select: { id: true } })).id
    await prisma.context.create({
      data: { personId: member, companyId: firm.id, type: 'EMPLOYEE', roleId: role.id, grantReason: 'Joined on the domain' },
    })
  }, 240_000)

  it('is refused the budget in a sentence that names no permission key', async () => {
    as(NIKE_MEMBER)
    const { status, body } = await json(await readBudget(req('GET', '/api/program/budget')))
    expect(status, JSON.stringify(body)).toBe(403)
    expect(body.error.message).toBe('The budget is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.')
    expect(namesAPermission(body.error.message)).toBe(false)
  })

  it('has each person the budget would have named logged as a refused read', async () => {
    const allocated = await prisma.contractCostAllocation.findMany({
      where: { costCenter: { companyId: nike } },
      select: { sellContract: { select: { personId: true } } },
    })
    const people = new Set(allocated.map((a) => a.sellContract.personId))
    expect(people.size).toBeGreaterThan(0)
    const rows = await refusalsBy(member, 'Budget at Northbend Athletic refused')
    expect(new Set(rows.map((r) => r.subjectId))).toEqual(people)
  })

  it('is refused the org view in a sentence, and every person on site is logged as a refused read', async () => {
    as(NIKE_MEMBER)
    const { status, body } = await json(await readOrg(req('GET', '/api/program/org')))
    expect(status, JSON.stringify(body)).toBe(403)
    expect(body.error.message).toBe('The org view is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.')
    const rows = await refusalsBy(member, 'Org view at Northbend Athletic refused')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('is refused the timesheets of everybody on site, and each is logged as a refused read', async () => {
    as(NIKE_MEMBER)
    const { status, body } = await json(await listTimesheets(req('GET', '/api/timesheets')))
    expect(status, JSON.stringify(body)).toBe(403)
    expect(body.error.message).toBe('Timesheets is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.')
    const rows = await refusalsBy(member, 'Timesheets refused')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.action === 'TIMESHEET_VIEW')).toBe(true)
  })

  it('the program manager, who has a desk, still reads all three', async () => {
    as(PROGRAM)
    expect((await readBudget(req('GET', '/api/program/budget'))).status).toBe(200)
    expect((await readOrg(req('GET', '/api/program/org'))).status).toBe(200)
    expect((await listTimesheets(req('GET', '/api/timesheets'))).status).toBe(200)
  })
})

describe('a desk-less colleague at a supplier who is also somebody the work is about', () => {
  let worker = ''
  let contextId = ''
  beforeAll(async () => {
    await freshWorld()
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: firm.id, name: 'Member' }, select: { id: true } })
    // Somebody the firm employs on a placement with filed weeks, and a
    // colleague on another placement whose weeks must stay closed.
    const sheets = await prisma.timesheet.findMany({
      where: { sellContract: { companyId: firm.id } },
      select: { personId: true },
      distinct: ['personId'],
    })
    expect(sheets.length).toBeGreaterThan(1)
    worker = sheets[0].personId
    const p = await prisma.person.update({ where: { id: worker }, data: { primaryEmail: FIRM_MEMBER }, select: { id: true } })
    await prisma.context.deleteMany({ where: { personId: p.id, companyId: firm.id, type: 'EMPLOYEE' } })
    contextId = (await prisma.context.create({
      data: { personId: p.id, companyId: firm.id, type: 'EMPLOYEE', roleId: role.id, grantReason: 'Joined on the domain' },
      select: { id: true },
    })).id
  }, 240_000)

  it('reads their own weeks and nobody else’s', async () => {
    as(FIRM_MEMBER)
    const { status, body } = await json(await listTimesheets(req('GET', '/api/timesheets?limit=50', undefined, { 'x-context-id': contextId })))
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.data.timesheets.length).toBeGreaterThan(0)
    for (const t of body.data.timesheets) expect(t.person?.id ?? t.personId).toBe(worker)
  })
})

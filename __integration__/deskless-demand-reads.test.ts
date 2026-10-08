import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as listTimesheets } from '@/app/api/timesheets/route'
import { GET as readBudget } from '@/app/api/program/budget/route'
import { GET as readOrg } from '@/app/api/program/org/route'
import { namesAPermission } from '@/lib/refusal-words'
import { rolesFor } from '@/lib/company-defaults'

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

describe('an integrator’s own engineer, whose seat reads only its own work', () => {
  const KARTHIK = 'karthik.menon@seed.etyme.invalid'
  let karthik = ''
  let contextId = ''
  let colleague = { id: '', name: '' }
  beforeAll(async () => {
    await freshWorld()
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-teleworld' }, select: { id: true } })
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: KARTHIK }, select: { id: true } })
    karthik = person.id
    const seat = await prisma.context.findFirstOrThrow({
      where: { personId: karthik, companyId: firm.id, type: 'EMPLOYEE' },
      select: { id: true, role: { select: { permissions: true } } },
    })
    contextId = seat.id
    // The walk's seat: his own work and his own hours, no desk.
    expect([...(seat.role?.permissions ?? [])].sort()).toEqual(['assignments.read', 'timesheets.read'])
    const other = await prisma.timesheet.findFirst({
      where: { sellContract: { OR: [{ companyId: firm.id }, { clientCompanyId: firm.id }] }, personId: { not: karthik } },
      select: { person: { select: { id: true, name: true } } },
    })
    expect(other, 'Teleworld has a colleague with weeks on file').not.toBeNull()
    colleague = { id: other!.person.id, name: other!.person.name ?? '' }
  }, 240_000)

  it('a worker whose seat reads only its own work sees nobody else’s weeks, and is refused a colleague’s by name', async () => {
    as(KARTHIK)
    const list = await json(await listTimesheets(req('GET', '/api/timesheets?limit=50', undefined, { 'x-context-id': contextId })))
    expect(list.status, JSON.stringify(list.body)).toBe(200)
    for (const t of list.body.data.timesheets) expect(t.person?.id ?? t.personId).toBe(karthik)

    const own = await json(await listTimesheets(req('GET', `/api/timesheets?limit=50&personId=${karthik}`, undefined, { 'x-context-id': contextId })))
    expect(own.status, JSON.stringify(own.body)).toBe(200)
    for (const t of own.body.data.timesheets) expect(t.person?.id ?? t.personId).toBe(karthik)

    const theirs = await json(await listTimesheets(req('GET', `/api/timesheets?limit=50&personId=${colleague.id}`, undefined, { 'x-context-id': contextId })))
    expect(theirs.status, JSON.stringify(theirs.body)).toBe(403)
    expect(theirs.body.error.message).toBe(
      `${colleague.name}’s timesheet is not part of your seat at Teleworld Solutions. Ask your company’s owner if you need it.`
    )
    expect(namesAPermission(theirs.body.error.message)).toBe(false)
    const logged = await refusalsBy(karthik, 'Timesheets refused')
    expect(logged.some((r) => r.subjectId === colleague.id && r.action === 'TIMESHEET_VIEW')).toBe(true)
  })

  it('a supplier’s AP & Payroll and Account Manager, who have timesheet desks, still read the firm’s weeks', async () => {
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-teleworld' }, select: { id: true } })
    for (const name of ['AP & Payroll', 'Account Manager']) {
      // The default role, as `rolesFor` writes it for an integrator.
      const permissions = rolesFor('GSI').find((r) => r.name === name)!.permissions
      const role =
        (await prisma.role.findFirst({ where: { companyId: firm.id, name }, select: { id: true } })) ??
        (await prisma.role.create({ data: { companyId: firm.id, name, isDefault: true, permissions }, select: { id: true } }))
      const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@teleworld.test.etyme.invalid`
      const p = await prisma.person.create({ data: { primaryEmail: email, name: `Teleworld ${name}` }, select: { id: true } })
      const ctx = await prisma.context.create({
        data: { personId: p.id, companyId: firm.id, type: 'EMPLOYEE', roleId: role.id, grantReason: 'Test desk' },
        select: { id: true },
      })
      as(email)
      const { status, body } = await json(await listTimesheets(req('GET', '/api/timesheets?limit=50', undefined, { 'x-context-id': ctx.id })))
      expect(status, JSON.stringify(body)).toBe(200)
      const people = new Set(body.data.timesheets.map((t: any) => t.person?.id ?? t.personId))
      expect(people.size, `${name} reads more than one person’s weeks`).toBeGreaterThan(1)
    }
  })
})

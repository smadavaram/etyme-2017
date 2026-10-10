import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as listTimesheets } from '@/app/api/timesheets/route'
import { GET as readBudget } from '@/app/api/program/budget/route'
import { GET as readOrg } from '@/app/api/program/org/route'
import { GET as listSubmissions } from '@/app/api/submissions/route'
import { GET as listInvitations } from '@/app/api/invitations/route'
import { POST as answerInvitation } from '@/app/api/invitations/[id]/answer/route'
import { GET as GET_TERMS } from '@/app/api/submissions/[id]/terms/route'
import { GET as readRequisition } from '@/app/api/requisitions/[id]/route'
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

/** A refusal's row is written before the 403 is sent (recordRefusal), so it is read at once. */
async function refusalsBy(actorPersonId: string, startsWith: string) {
  return prisma.accessLog.findMany({ where: { actorPersonId, allowed: false, reason: { startsWith } } })
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

  it('a worker whose seat reads only its own work sees nobody else’s weeks, and is refused anybody else’s, by name only where the worker’s own firm seats, bills for or pays that person', async () => {
    as(KARTHIK)
    const list = await json(await listTimesheets(req('GET', '/api/timesheets?limit=50', undefined, { 'x-context-id': contextId })))
    expect(list.status, JSON.stringify(list.body)).toBe(200)
    for (const t of list.body.data.timesheets) expect(t.person?.id ?? t.personId).toBe(karthik)

    const own = await json(await listTimesheets(req('GET', `/api/timesheets?limit=50&personId=${karthik}`, undefined, { 'x-context-id': contextId })))
    expect(own.status, JSON.stringify(own.body)).toBe(200)
    for (const t of own.body.data.timesheets) expect(t.person?.id ?? t.personId).toBe(karthik)

    const theirs = await json(await listTimesheets(req('GET', `/api/timesheets?limit=50&personId=${colleague.id}`, undefined, { 'x-context-id': contextId })))
    expect(theirs.status, JSON.stringify(theirs.body)).toBe(403)
    // Named only where Teleworld knows the person: a seat there, or a
    // line of Teleworld's own that bills for or pays them. Anybody else —
    // a sub-vendor's worker Teleworld is only the client of — is "That
    // timesheet" (round five, problem 8; name-if-known).
    const tw = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-teleworld' } })).id
    const known = (await prisma.context.count({ where: { personId: colleague.id, companyId: tw, revokedAt: null } }))
      + (await prisma.sellContract.count({ where: { personId: colleague.id, companyId: tw } }))
      + (await prisma.buyContractCandidate.count({ where: { personId: colleague.id, buyContract: { companyId: tw } } }))
    expect(theirs.body.error.message).toBe(
      `${known ? `${colleague.name}’s timesheet` : 'That timesheet'} is not part of your seat at Teleworld Solutions. Ask your company’s owner if you need it.`
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


/**
 * Round five of the sign-up walk (2026-10-08), problems 3, 4 and 8. Karthik
 * Menon's seat reads his own work and his own hours and holds no desk. He
 * read all six of Teleworld's submissions with each rate, read the
 * client's band, put a stranger in front of a client with a pasted CV,
 * and a timesheet refusal named a worker at a firm Teleworld has no tie to.
 */
describe('a worker seat with no desk, on the buying side (round five)', () => {
  const KARTHIK = 'karthik.menon@seed.etyme.invalid'
  let karthik = ''
  let contextId = ''
  let teleworld = ''
  const headers = () => ({ 'x-context-id': contextId })
  beforeAll(async () => {
    await freshWorld()
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-teleworld' }, select: { id: true } })
    teleworld = firm.id
    karthik = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: KARTHIK }, select: { id: true } })).id
    contextId = (await prisma.context.findFirstOrThrow({
      where: { personId: karthik, companyId: firm.id, type: 'EMPLOYEE' }, select: { id: true },
    })).id
  }, 240_000)

  it('Karthik reads no colleague’s submission and no rate on the Submissions list', async () => {
    const colleagues = await prisma.submission.count({ where: { fromCompanyId: teleworld, personId: { not: karthik } } })
    expect(colleagues, 'Teleworld has put colleagues forward').toBeGreaterThan(0)
    as(KARTHIK)
    const { status, body } = await json(await listSubmissions(
      req('GET', `/api/submissions?direction=sent&companyId=${teleworld}&limit=50`, undefined, headers())
    ))
    // Refused outright, or narrowed to his own rows; never the firm's list.
    if (status === 403) {
      expect(namesAPermission(body.error.message)).toBe(false)
      return
    }
    expect(status, JSON.stringify(body)).toBe(200)
    for (const s of body.data.submissions) {
      expect(s.person.id).toBe(karthik)
      expect(s.rate).toBeNull()
    }
    expect(body.data.desk.ownOnly).toBe(true)
  })

  it('Karthik asking for a colleague’s submissions by person is refused without naming them', async () => {
    const other = await prisma.submission.findFirstOrThrow({
      where: { fromCompanyId: teleworld, personId: { not: karthik } },
      select: { person: { select: { id: true, name: true } } },
    })
    as(KARTHIK)
    const { status, body } = await json(await listSubmissions(
      req('GET', `/api/submissions?personId=${other.person.id}`, undefined, headers())
    ))
    expect(status, JSON.stringify(body)).toBe(403)
    expect(body.error.message).not.toContain(other.person.name)
    expect(namesAPermission(body.error.message)).toBe(false)
  })

  it('Karthik is refused Shared with you, so he reads no client’s rate band', async () => {
    as(KARTHIK)
    const { status, body } = await json(await listInvitations(req('GET', '/api/invitations', undefined, headers())))
    expect(status, JSON.stringify(body)).toBe(403)
    expect(JSON.stringify(body)).not.toMatch(/payMin|payMax|band/)
  })

  it('a desk-less seat cannot submit a new person by answering an invitation, and nobody is created', async () => {
    const invitation = await prisma.requirementInvitation.findFirst({
      where: { toCompanyId: teleworld, requirement: { status: 'OPEN' } }, select: { id: true },
    })
    expect(invitation, 'Teleworld has an open invitation').not.toBeNull()
    const before = await prisma.submission.count({ where: { fromCompanyId: teleworld } })
    as(KARTHIK)
    const cv = 'Walk Probe Three\nwalk.probe.three@example.invalid\nDO-178C verification engineer, ten years on avionics test.'
    const { status, body } = await json(await answerInvitation(
      req('POST', `/api/invitations/${invitation!.id}/answer`, { cv, rateCents: 13_500, mayRepresent: true }, headers()),
      { params: Promise.resolve({ id: invitation!.id }) }
    ))
    // Refused at the one door (named for Shared with you) or by the route
    // itself (named for the act); either way in a sentence, and nothing made.
    expect(status, JSON.stringify(body)).toBe(403)
    expect(body.error.message).toMatch(/^(Shared with you|Answering a job with a CV) is not part of your seat at Teleworld Solutions\./)
    expect(namesAPermission(body.error.message)).toBe(false)
    expect(await prisma.person.findUnique({ where: { primaryEmail: 'walk.probe.three@example.invalid' } })).toBeNull()
    expect(await prisma.submission.count({ where: { fromCompanyId: teleworld } })).toBe(before)
  })

  it('a timesheet refusal for a worker Teleworld has no tie to names nobody', async () => {
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' }, select: { id: true } })
    expect(await prisma.context.count({ where: { personId: helena.id, companyId: teleworld } })).toBe(0)
    as(KARTHIK)
    const { status, body } = await json(await listTimesheets(
      req('GET', `/api/timesheets?limit=50&personId=${helena.id}`, undefined, headers())
    ))
    expect(status, JSON.stringify(body)).toBe(403)
    expect(body.error.message).toBe(
      'That timesheet is not part of your seat at Teleworld Solutions. Ask your company’s owner if you need it.'
    )
    // Still a refused read of her data, and logged as one.
    const logged = await refusalsBy(karthik, 'Timesheets refused')
    expect(logged.some((r) => r.subjectId === helena.id)).toBe(true)
  })
})

/**
 * Round six of the sign-up walk (2026-10-08), problem 1, the blocker.
 * "Your terms" is on every worker's menu, so the door lets a desk-less
 * seat through to a terms page, and the route asked only whether the
 * caller sat at the submitting firm. Karthik read Felix Brenner's pay and
 * Deepa Varma's, and the log wrote each as an allowed "own terms" read.
 */
describe('a person’s terms with their firm, read from a seat with no desk (round six)', () => {
  const KARTHIK = 'karthik.menon@seed.etyme.invalid'
  const MO = 'mo@walk6.northbend.etyme.invalid'
  const TW_MEMBER = 'new.colleague@teleworld.etyme.invalid'
  let karthik = ''
  let karthikCtx = ''
  let teleworld = ''
  let own = ''
  let colleague = { submissionId: '', personId: '', name: '' }
  let moCtx = ''
  let memberCtx = ''
  let memberId = ''
  let moId = ''
  const readTerms = async (id: string, ctx: string) =>
    json(await GET_TERMS(req('GET', `/api/submissions/${id}/terms`, undefined, { 'x-context-id': ctx }), { params: Promise.resolve({ id }) }))

  beforeAll(async () => {
    await freshWorld()
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-teleworld' }, select: { id: true } })
    teleworld = firm.id
    karthik = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: KARTHIK }, select: { id: true } })).id
    karthikCtx = (await prisma.context.findFirstOrThrow({
      where: { personId: karthik, companyId: teleworld, type: 'EMPLOYEE' }, select: { id: true },
    })).id
    own = (await prisma.submission.findFirstOrThrow({
      where: { fromCompanyId: teleworld, personId: karthik, parentSubmissionId: null }, select: { id: true },
    })).id
    const other = await prisma.submission.findFirstOrThrow({
      where: { fromCompanyId: teleworld, personId: { not: karthik }, parentSubmissionId: null },
      select: { id: true, personId: true, person: { select: { name: true } } },
    })
    colleague = { submissionId: other.id, personId: other.personId, name: other.person.name ?? '' }

    // The seat a colleague gets on arrival, with no permission at all.
    const member =
      (await prisma.role.findFirst({ where: { companyId: teleworld, name: 'Member' }, select: { id: true } })) ??
      (await prisma.role.create({ data: { companyId: teleworld, name: 'Member', isDefault: true, permissions: [] }, select: { id: true } }))
    memberId = (await prisma.person.create({ data: { primaryEmail: TW_MEMBER, name: 'Tess Member' }, select: { id: true } })).id
    memberCtx = (await prisma.context.create({
      data: { personId: memberId, companyId: teleworld, type: 'EMPLOYEE', roleId: member.id, grantReason: 'Joined on the domain' },
      select: { id: true },
    })).id

    const nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const nikeMember = await prisma.role.findFirstOrThrow({ where: { companyId: nike.id, name: 'Member' }, select: { id: true } })
    moId = (await prisma.person.create({ data: { primaryEmail: MO, name: 'Mo Walker' }, select: { id: true } })).id
    moCtx = (await prisma.context.create({
      data: { personId: moId, companyId: nike.id, type: 'EMPLOYEE', roleId: nikeMember.id, grantReason: 'Joined on the domain' },
      select: { id: true },
    })).id
  }, 240_000)

  it('Karthik reads his own terms', async () => {
    as(KARTHIK)
    const { status, body } = await readTerms(own, karthikCtx)
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.data.you).toBe('PERSON')
    expect(body.data.person.id).toBe(karthik)
  })

  it('Karthik is refused a colleague’s terms in the no-desk sentence, naming nobody and no pay', async () => {
    as(KARTHIK)
    const { status, body } = await readTerms(colleague.submissionId, karthikCtx)
    expect(status, JSON.stringify(body)).toBe(403)
    expect(body.error.message).toBe(
      'Somebody else’s terms is not part of your seat at Teleworld Solutions. Ask your company’s owner if you need it.'
    )
    expect(JSON.stringify(body)).not.toContain(colleague.name)
    expect(JSON.stringify(body)).not.toMatch(/payRate|\/hr/)
    expect(namesAPermission(body.error.message)).toBe(false)
  })

  it('the refusal is on the access log as refused, and no allowed "own terms" read is written for Karthik', async () => {
    const refused = await prisma.accessLog.findMany({
      where: { actorPersonId: karthik, subjectId: colleague.personId, allowed: false, action: 'CONTRACT_VIEW' },
    })
    expect(refused.length).toBeGreaterThan(0)
    const allowed = await prisma.accessLog.count({
      where: { actorPersonId: karthik, subjectId: colleague.personId, allowed: true, action: 'CONTRACT_VIEW' },
    })
    expect(allowed).toBe(0)
  })

  it('a desk-less Member at the supplier is refused every colleague’s terms', async () => {
    as(TW_MEMBER)
    for (const id of [own, colleague.submissionId]) {
      const { status, body } = await readTerms(id, memberCtx)
      expect(status, JSON.stringify(body)).toBe(403)
      expect(body.error.code).toBe('NO_DESK')
      expect(JSON.stringify(body)).not.toMatch(/payRate|\/hr/)
    }
  })

  it('Mo, a Member at the client, is refused every terms page and reads no pay', async () => {
    as(MO)
    for (const id of [own, colleague.submissionId]) {
      const { status, body } = await readTerms(id, moCtx)
      expect(status, JSON.stringify(body)).toBe(403)
      expect(JSON.stringify(body)).not.toMatch(/payRate|\/hr/)
      expect(namesAPermission(body.error.message)).toBe(false)
    }
  })

  it('the recruiting desk at the firm still reads a colleague’s terms', async () => {
    const recruiting = rolesFor('GSI').find(
      (r) => r.permissions.includes('submissions.read') && !r.permissions.includes('*' as any)
    )!
    const role =
      (await prisma.role.findFirst({ where: { companyId: teleworld, name: recruiting.name }, select: { id: true } })) ??
      (await prisma.role.create({ data: { companyId: teleworld, name: recruiting.name, isDefault: true, permissions: recruiting.permissions }, select: { id: true } }))
    const email = 'recruiting.desk@teleworld.test.etyme.invalid'
    const p = await prisma.person.create({ data: { primaryEmail: email, name: 'Teleworld recruiting desk' }, select: { id: true } })
    const ctx = await prisma.context.create({
      data: { personId: p.id, companyId: teleworld, type: 'EMPLOYEE', roleId: role.id, grantReason: 'Test desk' },
      select: { id: true },
    })
    as(email)
    const { status, body } = await readTerms(colleague.submissionId, ctx.id)
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.data.you).toBe('FIRM')
    expect(body.data.person.name).toBe(colleague.name)
  })
})

/**
 * Round six, problem 2. Every rung of a chain writes a sell line carrying
 * the client's job request, and the page priced the filled job from
 * whichever was written last: Northbend read Helena Marsh at $118, the
 * rate Computer Systems pays Techpeple, where Northbend pays $145.
 */
describe('a filled job request shows the client the rate it pays (round six)', () => {
  beforeAll(async () => { await freshWorld() }, 240_000)

  async function placed(email: string, clientName: string, title: string, person: string) {
    const client = await prisma.company.findFirstOrThrow({ where: { name: clientName }, select: { id: true } })
    const r = await prisma.requirement.findFirstOrThrow({ where: { companyId: client.id, title }, select: { id: true } })
    as(email)
    const { status, body } = await json(await readRequisition(req('GET', `/api/requisitions/${r.id}`), { params: Promise.resolve({ id: r.id }) }))
    expect(status, JSON.stringify(body)).toBe(200)
    const row = body.data.candidates.find((c: any) => c.person.name === person)
    expect(row, `${person} is on ${title}`).toBeTruthy()
    return row.placedRate as number | null
  }

  it('Northbend’s ERP finance lead says Helena Marsh was filled at the $145 Northbend pays, never the $118 a rung below', async () => {
    expect(await placed('world-nike-programme@demo.etyme.local', 'Northbend Athletic', 'ERP finance lead', 'Helena Marsh')).toBe(14_500)
  })

  it('Cavanaugh’s process validation engineer says Tomasz Nowak was filled at the $128 Cavanaugh pays, never $103', async () => {
    expect(await placed('world-corning-programme@demo.etyme.local', 'Cavanaugh Glassworks', 'Process validation engineer', 'Tomasz Nowak')).toBe(12_800)
  })
})

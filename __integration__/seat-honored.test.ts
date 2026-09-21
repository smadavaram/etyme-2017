import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { hasPermission } from '@/lib/permissions'

import { GET as program } from '@/app/api/program/route'
import { GET as orgView } from '@/app/api/program/org/route'
import { POST as addUnit } from '@/app/api/program/units/route'
import { GET as agreements } from '@/app/api/program/agreements/route'
import { GET as requisitions, POST as raiseRequisition } from '@/app/api/requisitions/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { GET as requirements } from '@/app/api/requirements/route'
import { GET as suppliers } from '@/app/api/suppliers/route'
import { GET as people } from '@/app/api/people/route'
import { GET as onePerson } from '@/app/api/people/[id]/route'
import { GET as timesheets } from '@/app/api/timesheets/route'
import { POST as approveTimesheet } from '@/app/api/timesheets/[id]/approve/route'

/**
 * A program office acts at the client's desk, or it is told why not.
 *
 * ── What was broken ─────────────────────────────────────────────────
 *
 * The seat resolved and then decided nothing. `resolveClientCompany`
 * handed back the client and the seat, and every demand route went on
 * asking the caller's OWN permissions — so a program office was admitted
 * to a program its client had deliberately opened to it, at a desk its
 * client had deliberately named, and then refused at the first gate
 * because an MSP's own company has no contingent program of its own and
 * its own roles do not carry the permissions for running one.
 *
 * Etyme itself became a program office provider on 2026-09-20, so this
 * is not a hypothetical party any more: it is how Etyme runs anybody's
 * program at all.
 *
 * ── The three rules these sentences hold ────────────────────────────
 *
 *   1. The permissions are the CLIENT's role, never the office's.
 *   2. A seat scoped to a business unit reaches that unit and what is
 *      under it, and nothing else in the program.
 *   3. Every read under a seat names the seat, and a revoked seat is
 *      refused the next second.
 *
 * Aptiva Workforce is seeded into Cavanaugh Glassworks' Program Manager
 * desk by `lib/seed-world`: a mid-size manufacturer with no workforce
 * office of its own, which is the ordinary case for this product.
 */

const D = '@demo.etyme.local'
const CAVANAUGH_OWNER = `world-corning${D}`
/** A thin desk at the office. Its own firm gave it almost nothing. */
const APTIVA_ANALYST = 'aptiva.analyst@aptiva.invalid'
const KESTREL_OWNER = `world-kestrel${D}`

const co: Record<string, string> = {}
const unit: Record<string, string> = {}
const it_: Record<string, any> = {}

const call = async (
  fn: (r: any, ctx: any) => Promise<Response>,
  method: string,
  url: string,
  id: string,
  body?: unknown
) => json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

/** A seat written straight into the table, the way the client's own grant writes it. */
async function seat(opts: {
  office: string
  client: string
  roleName: string
  orgUnitId?: string | null
}) {
  const role = await prisma.role.findFirstOrThrow({
    where: { companyId: co[opts.client], name: opts.roleName },
    select: { id: true },
  })
  const grantor = await prisma.context.findFirstOrThrow({
    where: { companyId: co[opts.client] },
    select: { personId: true },
  })
  return prisma.programSeat.create({
    data: {
      clientCompanyId: co[opts.client],
      officeCompanyId: co[opts.office],
      roleId: role.id,
      orgUnitId: opts.orgUnitId ?? null,
      grantedById: grantor.personId,
      grantedAt: new Date(Date.now() - 86_400_000),
      validFrom: new Date(Date.now() - 86_400_000),
      reason: `Seated for the test that holds this behavior: ${opts.roleName}.`,
    },
    select: { id: true },
  })
}

beforeAll(async () => {
  await resetDatabase()
  await seedWorld()

  for (const slug of ['world-corning', 'world-aptiva', 'world-kestrel', 'world-halcyon', 'world-vertex-global']) {
    const c = await prisma.company.findUnique({ where: { slug } })
    if (c) co[slug] = c.id
  }

  for (const name of ['Technology', 'Apps', 'Security']) {
    const u = await prisma.orgUnit.findFirstOrThrow({
      where: { companyId: co['world-corning'], name },
      select: { id: true },
    })
    unit[name] = u.id
  }

  // ── A person at the office whose own firm gave them almost nothing ──
  //
  // The seeded Aptiva account owner holds `*`, so a test run as them
  // proves nothing: every gate would pass on its own permissions and the
  // seat would be doing no work. Aptiva's Program Analyst holds
  // `assignments.read` and `timesheets.read` and nothing else — no
  // `requirements.write`, no `requirements.distribute`, no
  // `timesheets.approve` — which is the whole point.
  const clerkRole = await prisma.role.findFirstOrThrow({
    where: { companyId: co['world-aptiva'], name: 'Program Analyst' },
    select: { id: true, permissions: true },
  })
  it_.clerkPermissions = clerkRole.permissions
  const clerk = await prisma.person.upsert({
    where: { primaryEmail: APTIVA_ANALYST },
    update: {},
    create: { name: 'Ruth Iwuchukwu', primaryEmail: APTIVA_ANALYST },
  })
  it_.clerkPersonId = clerk.id
  await prisma.context.create({
    data: {
      personId: clerk.id,
      companyId: co['world-aptiva'],
      roleId: clerkRole.id,
      type: 'EMPLOYEE',
      grantReason: 'Seated for the seat test',
    },
  })

  it_.aptivaSeat = (
    await prisma.programSeat.findFirstOrThrow({
      where: { clientCompanyId: co['world-corning'], officeCompanyId: co['world-aptiva'] },
      select: { id: true },
    })
  ).id
}, 300_000)

describe('a program office acts at the client’s desk', () => {
  it('the office’s own desk carries none of the permissions the client’s desk carries', () => {
    // If this ever stops being true the tests below stop proving
    // anything, so it is asserted rather than assumed.
    expect(hasPermission(it_.clerkPermissions, 'requirements.write')).toBe(false)
    expect(hasPermission(it_.clerkPermissions, 'requirements.distribute')).toBe(false)
    expect(hasPermission(it_.clerkPermissions, 'timesheets.approve')).toBe(false)
  })

  it('a seated program office raises a requisition under the client’s Program Manager role, though its own firm never granted that permission', async () => {
    as(APTIVA_ANALYST)
    const { status, body } = await json(
      await raiseRequisition(
        req('POST', '/api/requisitions', {
          title: 'Furnace refractory inspector',
          skills: ['Refractory', 'Kiln inspection'],
          headcount: 1,
          billMax: 11_000,
          months: 6,
        })
      )
    )
    expect(body?.error, JSON.stringify(body)).toBeUndefined()
    expect(status).toBe(201)
    // Raised for the client, not for the office. An office that raised
    // roles for itself would be supplying people, which it never does.
    const row = await prisma.requirement.findUniqueOrThrow({
      where: { id: body.data.requisition.id },
      select: { companyId: true, raisedById: true },
    })
    expect(row.companyId).toBe(co['world-corning'])
    expect(row.raisedById).toBe(it_.clerkPersonId)
    it_.raised = body.data.requisition.id
  })

  it('a seated program office chooses which suppliers see the role, which is the job it was hired for', async () => {
    // Only an approved requisition goes out, so the client's own rules
    // decide whether this one is ready — exactly as for its own staff.
    await prisma.requirement.update({
      where: { id: it_.raised },
      data: { approvalState: 'AUTO_APPROVED', status: 'OPEN' },
    })
    as(APTIVA_ANALYST)
    const { status, body } = await call(
      distribute,
      'POST',
      `/api/requisitions/${it_.raised}/distribute`,
      it_.raised,
      { vendors: [{ companyId: co['world-halcyon'], payMin: 8_000, payMax: 9_500 }] }
    )
    expect(body?.error, JSON.stringify(body)).toBeUndefined()
    expect(status).toBeLessThan(400)
  })

  it('a seated program office reads the client’s program — its contractors, its suppliers and its open roles', async () => {
    as(APTIVA_ANALYST)
    const { status, body } = await json(await program(req('GET', '/api/program')))
    expect(body?.error, JSON.stringify(body)).toBeUndefined()
    expect(status).toBe(200)
    expect(body.data.client.name).toBe('Cavanaugh Glassworks')
    expect(body.data.summary.activeContractors).toBeGreaterThan(0)
    expect(body.data.vendors.length).toBeGreaterThan(0)
  })

  it('a seated program office reads the client’s register of people, its suppliers, its roles and its agreements — not its own empty ones', async () => {
    as(APTIVA_ANALYST)
    const register = await json(await people(req('GET', '/api/people')))
    expect(register.body?.error, JSON.stringify(register.body)).toBeUndefined()
    expect(register.body.data.people.length).toBeGreaterThan(0)

    const panel = await json(await suppliers(req('GET', '/api/suppliers')))
    expect(panel.body?.error, JSON.stringify(panel.body)).toBeUndefined()
    expect(panel.body.data.suppliers.length).toBeGreaterThan(0)

    const roles = await json(await requirements(req('GET', '/api/requirements')))
    expect(roles.body?.error, JSON.stringify(roles.body)).toBeUndefined()
    expect(roles.body.data.requirements.length).toBeGreaterThan(0)
    for (const r of roles.body.data.requirements) {
      expect(r.company?.id ?? co['world-corning']).not.toBe(co['world-aptiva'])
    }

    const papers = await json(await agreements(req('GET', '/api/program/agreements')))
    expect(papers.body?.error, JSON.stringify(papers.body)).toBeUndefined()
    expect(papers.body.data.agreements.length).toBeGreaterThan(0)

    const org = await json(await orgView(req('GET', '/api/program/org')))
    expect(org.body?.error, JSON.stringify(org.body)).toBeUndefined()
    expect(org.body.data.summary.headcount).toBeGreaterThan(0)
  })

  it('a seated program office adds a business unit to the client’s org chart, not to its own', async () => {
    as(APTIVA_ANALYST)
    const { status, body } = await json(
      await addUnit(req('POST', '/api/program/units', { name: 'Hot End', kind: 'DEPARTMENT' }))
    )
    expect(body?.error, JSON.stringify(body)).toBeUndefined()
    expect(status).toBe(201)
    const created = await prisma.orgUnit.findUniqueOrThrow({
      where: { id: body.data.id },
      select: { companyId: true },
    })
    expect(created.companyId).toBe(co['world-corning'])
  })

  it('every read under a seat names the seat in the trail', async () => {
    as(APTIVA_ANALYST)
    await json(await people(req('GET', '/api/people')))
    await json(await program(req('GET', '/api/program')))
    // Access logging is fire-and-forget everywhere in this product: the
    // invariant is that the read is recorded, not that the reader waits.
    await new Promise((r) => setTimeout(r, 400))
    const trail = await prisma.accessLog.findMany({
      where: { actorCompanyId: co['world-aptiva'], reason: { contains: it_.aptivaSeat } },
      select: { reason: true, subjectId: true },
    })
    expect(trail.length, 'a program office read a client’s workforce and left no trail').toBeGreaterThan(0)
    expect(trail[0].reason).toContain('Aptiva Workforce')
    expect(trail[0].reason).toContain('Program Manager seat')
    expect(trail[0].reason).toContain('Cavanaugh Glassworks granted it')
  })

  it('a seated program office sees no more of a supplier chain than the client itself sees', async () => {
    as(APTIVA_ANALYST)
    const { body } = await json(await program(req('GET', '/api/program')))
    const names = body.data.contractors.map((c: any) => c.vendor.name)
    // Sahasra sits below Vertex Global on Cavanaugh's longest chain. The
    // NDA between a prime and its sub is what stops the sub being
    // reached round the prime, and a seat is not a way round it.
    expect(names.join(' | ')).not.toContain('Sahasra')
  })
})

describe('a seat reaches the unit it was granted over, and no further', () => {
  beforeAll(async () => {
    // One of Cavanaugh's contractors is moved to Security; the rest stay
    // on Apps. Both sit under Technology.
    const moved = await prisma.sellContract.findFirstOrThrow({
      where: { endClientCompanyId: co['world-corning'], state: 'IN_PROGRESS', orgUnitId: unit['Apps'] },
      select: { id: true, personId: true },
      orderBy: { id: 'asc' },
    })
    await prisma.sellContract.update({ where: { id: moved.id }, data: { orgUnitId: unit['Security'] } })
    it_.movedPersonId = moved.personId
    it_.securitySeat = (await seat({
      office: 'world-kestrel', client: 'world-corning',
      roleName: 'Program Manager', orgUnitId: unit['Security'],
    })).id
  })

  it('a seat scoped to one business unit reads that unit’s contractors and none of the others', async () => {
    as(KESTREL_OWNER)
    const { body } = await json(await program(req('GET', '/api/program')))
    expect(body?.error, JSON.stringify(body)).toBeUndefined()
    const seen = body.data.contractors.map((c: any) => c.person.id)
    expect(seen).toContain(it_.movedPersonId)
    expect(seen).toHaveLength(1)

    // And the whole client, read by the office seated over all of it,
    // is more than one — so the narrowing is the seat and not an empty
    // program.
    as(APTIVA_ANALYST)
    const whole = await json(await program(req('GET', '/api/program')))
    expect(whole.body.data.contractors.length).toBeGreaterThan(1)
  })

  it('a seat scoped to one business unit cannot raise a role in another', async () => {
    as(KESTREL_OWNER)
    const { status, body } = await json(
      await raiseRequisition(
        req('POST', '/api/requisitions', {
          title: 'Batch house operator',
          skills: ['Batch house'],
          headcount: 1,
          billMax: 8_000,
          orgUnitId: unit['Apps'],
        })
      )
    )
    expect(status).toBe(403)
    expect(body.error.message).toContain('outside it')
    expect(body.error.message).toMatch(/[a-z]{3,}\s+[a-z]{2,}/i)
  })

  it('a seat over a parent unit reaches everything under it, because a unit is a tree', async () => {
    await prisma.programSeat.update({
      where: { id: it_.securitySeat },
      data: { orgUnitId: unit['Technology'] },
    })
    as(KESTREL_OWNER)
    const { body } = await json(await program(req('GET', '/api/program')))
    expect(body.data.contractors.length).toBeGreaterThan(1)
    expect(body.data.contractors.map((c: any) => c.person.id)).toContain(it_.movedPersonId)
  })
})

describe('a seated coordinator signs the client’s week, if the client’s desk may', () => {
  beforeAll(async () => {
    it_.week = await prisma.timesheet.findFirstOrThrow({
      where: {
        status: 'SUBMITTED',
        clientApprovedAt: null,
        sellContract: { endClientCompanyId: co['world-corning'] },
      },
      select: { id: true, personId: true },
      orderBy: { periodEnd: 'desc' },
    })
  })

  it('a seated coordinator sees the client’s weeks awaiting a signature', async () => {
    as(APTIVA_ANALYST)
    const { body } = await json(await timesheets(req('GET', '/api/timesheets?status=SUBMITTED')))
    expect(body?.error, JSON.stringify(body)).toBeUndefined()
    const ids = body.data.timesheets.map((t: any) => t.id)
    expect(ids, 'the office saw none of the weeks it is paid to chase').toContain(it_.week.id)
  })

  it('a seat at a desk that does not sign hours is refused the signature, in the client’s own words', async () => {
    // Cavanaugh's Program Manager reads the work and does not sign it —
    // `lib/company-defaults` gives `timesheets.approve` to the hiring
    // manager and the owner. A seat is exactly that desk, so the office
    // is refused exactly where the client's own program manager is.
    as(APTIVA_ANALYST)
    const { status, body } = await call(
      approveTimesheet, 'POST', `/api/timesheets/${it_.week.id}/approve`, it_.week.id, {}
    )
    expect(status).toBe(403)
    expect(body.error.message).toMatch(/[a-z]{3,}\s+[a-z]{2,}/i)
  })

  it('a seated coordinator signs the client’s week under the client’s rules, and the signature carries their own name', async () => {
    // The client widens the desk the office sits at. Nothing about the
    // office changes; the client's own role does.
    const hiring = await prisma.role.findFirstOrThrow({
      where: { companyId: co['world-corning'], name: 'Hiring Manager' },
      select: { id: true },
    })
    await prisma.programSeat.update({ where: { id: it_.aptivaSeat }, data: { roleId: hiring.id } })

    as(APTIVA_ANALYST)
    const { status, body } = await call(
      approveTimesheet, 'POST', `/api/timesheets/${it_.week.id}/approve`, it_.week.id, {}
    )
    expect(body?.error, JSON.stringify(body)).toBeUndefined()
    expect(status).toBeLessThan(400)

    const after = await prisma.timesheet.findUniqueOrThrow({
      where: { id: it_.week.id },
      select: { clientApprovedAt: true, clientApprovedById: true },
    })
    expect(after.clientApprovedAt).not.toBeNull()
    // The person who signed is the real person at the office, never the
    // client — a client asking later who signed its week is entitled to
    // a name rather than to its own.
    expect(after.clientApprovedById).toBe(it_.clerkPersonId)

    // And the assertion is filed on the client's side of the paper, not
    // the office's. An office is not a party to the contract.
    const assertion = await prisma.workAssertion.findFirstOrThrow({
      where: { timesheetId: it_.week.id, role: 'CLIENT_APPROVAL' },
      select: { companyId: true, byId: true },
    })
    expect(assertion.companyId).toBe(co['world-corning'])
    expect(assertion.byId).toBe(it_.clerkPersonId)
  })
})

describe('a revoked seat is refused the next second', () => {
  beforeAll(async () => {
    await prisma.programSeat.updateMany({
      where: { officeCompanyId: co['world-aptiva'] },
      data: { revokedAt: new Date(Date.now() - 1000), revokeReason: 'The program comes back in house in October.' },
    })
    await prisma.programSeat.updateMany({
      where: { officeCompanyId: co['world-kestrel'] },
      data: { revokedAt: new Date(Date.now() - 1000), revokeReason: 'Ended.' },
    })
  })

  it('a revoked seat is refused on every one of these routes the next second', async () => {
    as(APTIVA_ANALYST)
    const refused: Record<string, { status: number; says: string }> = {}
    const note = async (name: string, r: Promise<{ status: number; body: any }>) => {
      const { status, body } = await r
      refused[name] = { status, says: body?.error?.message ?? '' }
    }

    // Named, not left to the fallback. Aptiva genuinely supplies people
    // to another client of its own — it is an MSP that also sells, which
    // CLAUDE.md's 2026-09-17 correction says is ordinary — so an
    // unnamed read resolves to *that* client and answers 200 correctly.
    // What must be refused is Cavanaugh, the program it no longer runs.
    const at = `?clientCompanyId=${co['world-corning']}`
    await note('program', json(await program(req('GET', `/api/program${at}`))))
    await note('org', json(await orgView(req('GET', `/api/program/org${at}`))))
    await note('requisitions', json(await requisitions(req('GET', `/api/requisitions${at}`))))
    await note(
      'raise',
      json(
        await raiseRequisition(
          req('POST', '/api/requisitions', { title: 'Anything at all', headcount: 1 })
        )
      )
    )
    await note(
      'distribute',
      call(distribute, 'POST', `/api/requisitions/${it_.raised}/distribute`, it_.raised, {
        vendors: [{ companyId: co['world-halcyon'] }],
      })
    )
    await note(
      'approve',
      call(approveTimesheet, 'POST', `/api/timesheets/${it_.week.id}/approve`, it_.week.id, {})
    )
    await note('unit', json(await addUnit(req('POST', '/api/program/units', { name: 'Cold End' }))))

    for (const [name, r] of Object.entries(refused)) {
      expect(r.status, `${name} still answered a revoked seat`).toBeGreaterThanOrEqual(400)
      expect(r.says, `${name} refused with no sentence`).toMatch(/[a-z]{3,}\s+[a-z]{2,}/i)
    }
  })

  it('a revoked seat reading the program with no client named is answered about its own client, never the one it lost', async () => {
    as(APTIVA_ANALYST)
    const { body } = await json(await program(req('GET', '/api/program')))
    // Aptiva sells people of its own, so it has a client it is entitled
    // to. That entitlement is a placement and has nothing to do with the
    // seat, and it must not quietly stand in for the seat.
    expect(body?.data?.client?.id ?? null).not.toBe(co['world-corning'])
  })

  it('a revoked seat reads the client’s register and its suppliers no longer', async () => {
    as(APTIVA_ANALYST)
    const register = await json(await people(req('GET', '/api/people')))
    expect(register.body.data.people, 'a revoked office still read the client’s register').toHaveLength(0)

    const panel = await json(await suppliers(req('GET', '/api/suppliers')))
    expect(panel.body.data.suppliers, 'a revoked office still read the client’s supplier panel').toHaveLength(0)
  })

  it('a revoked seat cannot open one person’s page at the client', async () => {
    as(APTIVA_ANALYST)
    const { status } = await call(
      onePerson, 'GET', `/api/people/${it_.week.personId}`, it_.week.personId
    )
    expect(status).toBeGreaterThanOrEqual(400)
  })
})

/**
 * Same role, two suppliers, two prices.
 *
 * The client dashboard compared rates by hiring manager and could not
 * see the other half of the question: two suppliers billing differently
 * for the same role, each perfectly in line with their own manager. The
 * arithmetic is `lib/census-page`'s `rateSpread`, imported rather than
 * re-derived, and the three refusals below are what stops it producing a
 * number nobody can stand behind.
 */
describe('what two suppliers charge for one role', () => {
  beforeAll(async () => {
    // The seat comes back so the rest of the file's revocation does not
    // decide this block, and Cavanaugh's own desk is the honest reader
    // for a question about Cavanaugh's money.
    await prisma.programSeat.updateMany({
      where: { officeCompanyId: co['world-aptiva'] },
      data: { revokedAt: null, revokeReason: null },
    })

    // A second supplier fills a role Vertex Global already fills, at a
    // lower price. Nothing in the seeded world has two suppliers on one
    // role, which is itself why this was never visible.
    const theirs = await prisma.sellContract.findFirstOrThrow({
      where: {
        endClientCompanyId: co['world-corning'],
        clientCompanyId: co['world-corning'],
        state: 'IN_PROGRESS',
        requirement: { isNot: null },
      },
      select: {
        id: true, requirementId: true, engagementId: true, billRate: true,
        startDate: true, endDate: true, orgUnitId: true,
        requirement: { select: { title: true } },
        company: { select: { name: true } },
      },
      orderBy: { billRate: 'desc' },
    })
    it_.sharedRole = theirs.requirement!.title
    it_.highRate = theirs.billRate
    it_.highSupplier = theirs.company.name
    it_.lowRate = theirs.billRate - 2_900

    const second = await prisma.person.create({
      data: { name: 'Bettina Krause', primaryEmail: 'bettina.krause@spread.invalid' },
    })
    it_.secondPersonId = second.id
    await prisma.sellContract.create({
      data: {
        companyId: co['world-halcyon'],
        clientCompanyId: co['world-corning'],
        endClientCompanyId: co['world-corning'],
        personId: second.id,
        requirementId: theirs.requirementId,
        engagementId: theirs.engagementId,
        orgUnitId: theirs.orgUnitId,
        billRate: it_.lowRate,
        billCurrency: 'USD',
        paymentTerms: 45,
        state: 'IN_PROGRESS',
        startDate: theirs.startDate,
        endDate: theirs.endDate,
      },
    })
  }, 120_000)

  it('a role two suppliers fill shows the lowest, the highest and the gap', async () => {
    as(CAVANAUGH_OWNER)
    const { body } = await json(await program(req('GET', '/api/program')))
    expect(body?.error, JSON.stringify(body)).toBeUndefined()
    const row = body.data.rateSpread.roles.find((r: any) => r.role === it_.sharedRole)
    expect(row, `no spread for ${it_.sharedRole}`).toBeDefined()
    expect(row.lowMinor).toBe(it_.lowRate)
    expect(row.highMinor).toBe(it_.highRate)
    expect(row.gapMinor).toBe(it_.highRate - it_.lowRate)
    expect(row.lowSupplier).toBe('Halcyon Talent')
    expect(row.highSupplier).toBe(it_.highSupplier)
    expect(row.suppliers).toBe(2)
    expect(row.currency).toBe('USD')
  })

  it('a role one supplier fills shows no spread and says so', async () => {
    as(CAVANAUGH_OWNER)
    const { body } = await json(await program(req('GET', '/api/program')))
    const spread = body.data.rateSpread
    // Every other role on site at Cavanaugh is filled by one supplier,
    // and each is named in a sentence rather than shown as a gap of zero
    // — a zero gap reads as "these two suppliers agree", which is a
    // claim nobody made.
    expect(spread.oneSupplierOnly.length).toBeGreaterThan(0)
    for (const line of spread.oneSupplierOnly) {
      expect(line).toMatch(/only .+ fills it|fill it/)
      expect(line).toMatch(/nothing to compare|no second price to compare/)
    }
    const compared = spread.roles.map((r: any) => r.role)
    for (const line of spread.oneSupplierOnly) {
      for (const role of compared) expect(line.startsWith(`${role} —`)).toBe(false)
    }
  })

  it('a sub-vendor’s rate never reaches the client’s page; the spread is between the suppliers the client pays', async () => {
    // Cavanaugh buys Tomasz Nowak from Vertex Global at $128, and Vertex
    // buys him from Sahasra at $103. Both legs name Cavanaugh as the
    // site. Subtracting one from the other is Vertex's entire margin.
    const rungs = await prisma.sellContract.findMany({
      where: { endClientCompanyId: co['world-corning'], state: 'IN_PROGRESS' },
      select: { billRate: true, clientCompanyId: true },
    })
    const belowTheTop = rungs
      .filter((r) => r.clientCompanyId !== co['world-corning'])
      .map((r) => r.billRate)
    expect(belowTheTop.length, 'the seeded world has no chain to test this with').toBeGreaterThan(0)

    as(CAVANAUGH_OWNER)
    const { body } = await json(await program(req('GET', '/api/program')))
    const quoted = body.data.rateSpread.roles.flatMap((r: any) => [r.lowMinor, r.highMinor])
    for (const sub of belowTheTop) {
      expect(quoted, `a sub-vendor's rate of ${sub} reached the client's page`).not.toContain(sub)
    }
    expect(body.data.rateSpread.basis).toContain('is itself billed on')
  })

  it('a supplier reading a client’s program is shown no spread at all, because what a client pays its competitors is not its business', async () => {
    as(`world-halcyon${D}`)
    const { body } = await json(
      await program(req('GET', `/api/program?clientCompanyId=${co['world-corning']}`))
    )
    expect(body?.error, JSON.stringify(body)).toBeUndefined()
    expect(body.data.rateSpread.roles).toHaveLength(0)
  })
})

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld, WORLD_SLUGS } from '@/lib/seed-world'
import { reservedAddress } from '@/lib/demo-session'
import { DELETE_ORDER } from '@/lib/seed-rebuild'
import { POST as rebuild } from '@/app/api/seed-world/rebuild/route'
import { POST as seed } from '@/app/api/seed-world/route'
import { GET as tenure } from '@/app/api/tenure/route'

/**
 * Deleting the demo world and seeding it again, on a database that also
 * holds real rows.
 *
 * The live database has the seeded world beside things that must never
 * be touched: leads from the site, incidents, the nightly job's runs,
 * and anybody who has signed up. The founder approved rebuilding the
 * world so it carries the seed's fixes and today's dates, and the only
 * thing worth proving is that it deletes the world and nothing else.
 *
 * The world is seeded forty days ago, so it reads as stale; then a real
 * firm moves in beside it — one whose slug happens to start `world-`,
 * because a real firm named World Wide Technology would — with a client,
 * a consultant, a contract, a week of hours, a lead, an incident and a
 * run of the nightly job. A visitor's sandbox sits there too, with a
 * reserved-address person seated in it, because a sandbox is the
 * reaper's and not the rebuild's.
 */

const SECRET = 'rebuild-test-secret'
const CONFIRM = { confirm: 'delete the demo world' }
const TALVERN_COMPLIANCE = 'world-terumo-bct-compliance@demo.etyme.local'

const call = (body?: unknown, authorization: string | null = `Bearer ${SECRET}`) =>
  rebuild(req('POST', '/api/seed-world/rebuild', body, authorization ? { authorization } : {}))

/**
 * What the deploy notes say to run after a rebuild: the seed route, again
 * and again, until it says the world is complete (lib/seed-steps).
 */
async function finishSeeding(): Promise<number> {
  for (let calls = 1; calls <= 20; calls++) {
    const r = await json(await seed(req('POST', '/api/seed-world', undefined, { authorization: `Bearer ${SECRET}` })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    if (r.body.data.done) return calls
  }
  throw new Error('The seed did not finish in twenty calls.')
}

/** Every row in every table, by model. */
async function census(): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const m of DELETE_ORDER) {
    const [r] = (await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${m}"`)) as { n: number }[]
    out[m] = r.n
  }
  return out
}

const midnightToday = () => {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

async function andersMonths(): Promise<number> {
  as(TALVERN_COMPLIANCE)
  const r = await json(await tenure(req('GET', '/api/tenure')))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data.people.find((p: { name: string }) => p.name === 'Anders Lund').cumulativeMonths
}

/** The real rows, read back whole. */
const real: Record<string, string> = {}
async function realRows() {
  return {
    companies: await prisma.company.findMany({
      where: { id: { in: [real.wwt, real.acme, real.sandbox] } }, orderBy: { id: 'asc' },
    }),
    people: await prisma.person.findMany({
      where: { id: { in: [real.jane, real.raj, real.luis, real.visitor, real.maya] } }, orderBy: { id: 'asc' },
    }),
    seats: await prisma.context.findMany({
      where: { companyId: { in: [real.wwt, real.acme, real.sandbox] } }, orderBy: { id: 'asc' },
    }),
    roles: await prisma.role.findMany({ where: { companyId: { in: [real.wwt, real.acme, real.sandbox] } }, orderBy: { id: 'asc' } }),
    units: await prisma.orgUnit.findMany({ where: { companyId: real.acme } }),
    requirements: await prisma.requirement.findMany({ where: { companyId: real.acme } }),
    contract: await prisma.sellContract.findUnique({ where: { id: real.contract } }),
    timesheet: await prisma.timesheet.findUnique({ where: { id: real.timesheet } }),
    lead: await prisma.marketingLead.findUnique({ where: { id: real.lead } }),
    incident: await prisma.incident.findUnique({ where: { id: real.incident } }),
    jobRun: await prisma.jobRun.findUnique({ where: { id: real.jobRun } }),
  }
}

let stale: { born: Date; anders: number }
let snapshot: Awaited<ReturnType<typeof realRows>>

beforeAll(async () => {
  await resetDatabase()
  process.env.CRON_SECRET = SECRET

  // The world as it stands on production: seeded weeks ago.
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] })
  vi.setSystemTime(new Date(Date.now() - 40 * 86_400_000))
  await seedWorld()
  vi.useRealTimers()
  const first = await prisma.company.findFirstOrThrow({
    where: { slug: { in: [...WORLD_SLUGS] } }, orderBy: { createdAt: 'asc' },
  })
  stale = { born: first.createdAt, anders: await andersMonths() }

  // A real firm, a real client, and a real consultant between them.
  const wwt = await prisma.company.create({
    data: { slug: 'world-wide-technology', name: 'World Wide Technology', kind: 'VENDOR', domain: 'wwt.com', domainVerified: true },
  })
  const acme = await prisma.company.create({
    data: { slug: 'acme-industrial', name: 'Acme Industrial', kind: 'CLIENT', domain: 'acme-industrial.com', domainVerified: true },
  })
  const jane = await prisma.person.create({ data: { name: 'Jane Porter', primaryEmail: 'jane@wwt.com' } })
  const raj = await prisma.person.create({ data: { name: 'Raj Patel', primaryEmail: 'raj@acme-industrial.com' } })
  const luis = await prisma.person.create({ data: { name: 'Luis Ortega', primaryEmail: 'luis.ortega@gmail.com' } })
  for (const [company, person] of [[wwt, jane], [acme, raj]] as const) {
    const role = await prisma.role.create({ data: { companyId: company.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    await prisma.context.create({ data: { personId: person.id, companyId: company.id, roleId: role.id, type: 'EMPLOYEE' } })
  }
  await prisma.orgUnit.create({ data: { companyId: acme.id, name: 'Plant engineering', kind: 'DEPARTMENT' } })
  await prisma.requirement.create({ data: { companyId: acme.id, title: 'Controls engineer' } })
  const contract = await prisma.sellContract.create({
    data: { companyId: wwt.id, clientCompanyId: acme.id, personId: luis.id, billRate: 11_000, startDate: new Date('2026-06-01') },
  })
  const timesheet = await prisma.timesheet.create({
    data: {
      sellContractId: contract.id, personId: luis.id,
      periodStart: new Date('2026-09-14'), periodEnd: new Date('2026-09-18'),
      days: { '2026-09-14': 8, '2026-09-15': 8, '2026-09-16': 8, '2026-09-17': 8, '2026-09-18': 8 }, totalHours: 40,
    },
  })

  // A visitor's sandbox: the reaper's, not the rebuild's — with a
  // person at a reserved address seated in it, who belongs to it.
  const sandbox = await prisma.company.create({
    data: { slug: 'sandbox-visitor', name: 'Visitor Sandbox', kind: 'VENDOR', isDemo: true, demoExpiresAt: new Date(Date.now() + 14 * 86_400_000) },
  })
  const visitor = await prisma.person.create({ data: { name: 'A Visitor', primaryEmail: 'visitor@gmail.com' } })
  const maya = await prisma.person.create({ data: { name: 'Maya Chen', primaryEmail: 'maya.chen@demo.etyme.invalid' } })
  const sandboxRole = await prisma.role.create({ data: { companyId: sandbox.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  await prisma.context.create({ data: { personId: visitor.id, companyId: sandbox.id, roleId: sandboxRole.id, type: 'EMPLOYEE' } })
  await prisma.context.create({ data: { personId: maya.id, companyId: sandbox.id, roleId: sandboxRole.id, type: 'CONSULTANT' } })

  // Records that outlive what they mention — the incident happened at a
  // demo firm, and it stays anyway.
  const nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' } })
  const lead = await prisma.marketingLead.create({ data: { email: 'cfo@example-buyer.com', source: 'home' } })
  const incident = await prisma.incident.create({
    data: { where: 'api/timesheets', message: 'a real error at a demo desk', companyId: nike.id },
  })
  const jobRun = await prisma.jobRun.create({ data: { job: 'daily', ok: true, ran: 12 } })

  Object.assign(real, {
    wwt: wwt.id, acme: acme.id, sandbox: sandbox.id,
    jane: jane.id, raj: raj.id, luis: luis.id, visitor: visitor.id, maya: maya.id,
    contract: contract.id, timesheet: timesheet.id,
    lead: lead.id, incident: incident.id, jobRun: jobRun.id,
  })
  snapshot = await realRows()
}, 900_000)

afterAll(() => {
  vi.useRealTimers()
  delete process.env.CRON_SECRET
})

describe('rebuilding the demo world', () => {
  it('refuses without the deployment secret, in a sentence, and deletes nothing', async () => {
    const before = await census()
    const none = await json(await call(CONFIRM, null))
    expect(none.status).toBe(401)
    expect(none.body.error.message).toBe(
      'Rebuilding the demo world needs the CRON_SECRET, sent as a bearer token. Nothing was deleted.'
    )
    const wrong = await json(await call(CONFIRM, 'Bearer not-the-secret'))
    expect(wrong.status).toBe(401)
    expect(wrong.body.error.message).toBe('That is not the CRON_SECRET for this deployment. Nothing was deleted.')
    expect(await census()).toEqual(before)
  })

  it('refuses on a deployment with no secret at all, even in development', async () => {
    delete process.env.CRON_SECRET
    try {
      const r = await json(await call(CONFIRM, 'Bearer undefined'))
      expect(r.status).toBe(503)
      expect(r.body.error.message).toContain('CRON_SECRET is not set on this deployment')
    } finally {
      process.env.CRON_SECRET = SECRET
    }
  })

  it('refuses without the confirmation phrase typed out, says what to send, and deletes nothing', async () => {
    const before = await census()
    for (const body of [undefined, {}, { confirm: 'yes' }, { confirm: 'Delete the demo world' }]) {
      const r = await json(await call(body))
      expect(r.status).toBe(400)
      expect(r.body.error.message).toBe(
        'This deletes the demo world and seeds it again. To go ahead, send {"confirm":"delete the demo world"} ' +
          'as the body, word for word. Nothing was deleted.'
      )
    }
    expect(await census()).toEqual(before)
  })

  it('refuses when a real firm has a contract with a demo client, names the firm, and deletes nothing', async () => {
    const nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' } })
    const tie = await prisma.sellContract.create({
      data: { companyId: real.wwt, clientCompanyId: nike.id, personId: real.luis, billRate: 12_000, startDate: new Date('2026-07-01') },
    })
    try {
      const before = await census()
      const r = await json(await call(CONFIRM))
      expect(r.status).toBe(409)
      expect(r.body.error.code).toBe('TIED_TO_REAL_DATA')
      expect(r.body.error.message).toMatch(/^Nothing was deleted\. The demo world is tied to real data/)
      expect(r.body.error.message).toContain('a demo SellContract points at World Wide Technology (world-wide-technology) through companyId')
      expect(r.body.error.message).toContain('luis.ortega@gmail.com')
      expect(await census()).toEqual(before)
    } finally {
      await prisma.sellContract.delete({ where: { id: tie.id } })
    }
  }, 120_000)

  it('refuses when somebody at a real address holds a seat at a demo firm, rather than delete their seat', async () => {
    const nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' } })
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: nike.id, name: 'Owner' } })
    const seat = await prisma.context.create({
      data: { personId: real.jane, companyId: nike.id, roleId: role.id, type: 'EMPLOYEE' },
    })
    try {
      const r = await json(await call(CONFIRM))
      expect(r.status).toBe(409)
      expect(r.body.error.message).toContain('a demo Context points at jane@wwt.com through personId')
    } finally {
      await prisma.context.delete({ where: { id: seat.id } })
    }
  }, 120_000)

  it('refuses when a real firm has starred a demo person, because the star would be left pointing at nobody', async () => {
    const anders = await prisma.person.findFirstOrThrow({ where: { name: 'Anders Lund' } })
    const star = await prisma.favorite.create({
      data: { companyId: real.acme, targetType: 'PERSON', targetId: anders.id, byId: real.raj },
    })
    try {
      const r = await json(await call(CONFIRM))
      expect(r.status).toBe(409)
      expect(r.body.error.message).toContain('which is demo, in targetId')
    } finally {
      await prisma.favorite.delete({ where: { id: star.id } })
    }
  }, 120_000)

  let afterFirst: Record<string, number>

  it('deletes the demo world and seeds it again counting from today, and every real row is exactly as it was', async () => {
    const r = await json(await call(CONFIRM))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    console.log(
      `rebuild: deleted ${r.body.data.deletedRows} rows (${r.body.data.deletedCompanies} companies, ` +
        `${r.body.data.deletedPeople} people) in ${r.body.data.deleteMs}ms; seeded in ${r.body.data.seedMs}ms`
    )
    expect(r.body.data.deletedCompanies).toBe(WORLD_SLUGS.length)
    expect(r.body.data.sparedPeople).toBe(1)
    console.log(`and finished seeding in ${await finishSeeding()} more call(s) of POST /api/seed-world`)

    // Everything real, row for row.
    expect(await realRows()).toEqual(snapshot)

    // The world is back, and born today rather than forty days ago.
    const first = await prisma.company.findFirstOrThrow({
      where: { slug: { in: [...WORLD_SLUGS] } }, orderBy: { createdAt: 'asc' },
    })
    expect(stale.born.getTime()).toBeLessThan(midnightToday().getTime() - 30 * 86_400_000)
    expect(first.createdAt.toISOString()).toBe(midnightToday().toISOString())
    console.log(`Anders read ${stale.anders} months on the world seeded forty days ago`)
    expect(await andersMonths()).toBe(23)
    afterFirst = await census()
  }, 600_000)

  it('writes down that it happened, as an act that cannot be put back', async () => {
    const log = await prisma.automationLog.findFirstOrThrow({ where: { action: 'DEMO_WORLD_REBUILT' } })
    expect(log.reversible).toBe(false)
    expect(log.companyId).toBeNull()
    expect(log.summary).toMatch(/^Deleted the demo world — \d+ companies, \d+ people at reserved addresses, \d+ rows in all/)
    expect((log.payload as { spared: string[] }).spared).toEqual(['maya.chen@demo.etyme.invalid'])
  })

  it('leaves only the seed’s roster and the real firms on the register, and nobody at a real address was written by the seed', async () => {
    const companies = await prisma.company.findMany({ select: { slug: true } })
    expect(companies.map((c) => c.slug).sort()).toEqual(
      [...WORLD_SLUGS, 'world-wide-technology', 'acme-industrial', 'sandbox-visitor'].sort()
    )
    const people = await prisma.person.findMany({ select: { primaryEmail: true } })
    const unreserved = people.map((p) => p.primaryEmail).filter((e) => !reservedAddress(e)).sort()
    expect(unreserved).toEqual(['jane@wwt.com', 'luis.ortega@gmail.com', 'raj@acme-industrial.com', 'visitor@gmail.com'])
  })

  it('is safe to run twice: the second rebuild writes the same world again and touches nothing real', async () => {
    const r = await json(await call(CONFIRM))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    await finishSeeding()
    expect(await realRows()).toEqual(snapshot)
    const now = await census()
    // The shape of the world, table by table. Not every table: the seed
    // picks which three contracts carry an expense by id order, and a
    // fresh world has fresh ids, so the books under it can differ by an
    // entry between two fresh seedings. That is the seed's, not the
    // rebuild's — nothing survives from the first world to vary it.
    for (const model of [
      'Company', 'Person', 'Context', 'Role', 'SellContract', 'BuyContract', 'WorkOrder', 'Requirement',
      'Submission', 'Interview', 'Timesheet', 'WorkAssertion', 'Invoice', 'VendorBill', 'Payment',
      'ConsultantProfile', 'BenchListing', 'Verification', 'Holiday', 'DocumentRequirement',
    ]) {
      expect(now[model], model).toBe(afterFirst[model])
    }
    expect(now.AutomationLog).toBe(afterFirst.AutomationLog + 1)
    expect(await andersMonths()).toBe(23)
  }, 600_000)
})

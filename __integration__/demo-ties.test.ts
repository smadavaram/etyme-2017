import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { req, json, prisma, freshWorld } from './harness'
import { DELETE_ORDER, RELEASE_PHRASE, STAND_IN_DOMAIN } from '@/lib/seed-rebuild'
import { POST as rebuild } from '@/app/api/seed-world/rebuild/route'
import { POST as cleanup } from '@/app/api/seed-world/cleanup/route'

/**
 * Whose records tie the demo world down, and letting go of them.
 *
 * On production the rebuild refused with fourteen threads — most of them
 * "a demo Context points at world-computer-systems@demo.etyme.local (a
 * demo address something real still holds)" — and the cleanup found 120
 * files, 370 CVs and 8 visa petitions on records outside the world. The
 * founder has to see whose records those are before anything goes.
 *
 * So the seeded world gets the shapes production has, by hand:
 *
 * - a company outside the world, Acme Verify, that gave a seat to Victor
 *   Hale — the demo's Computer Systems desk — and lists Computer Systems
 *   among the suppliers it cleared
 * - a visitor's sandbox with a made-up `verify.three@seed.etyme.invalid`
 *   seated in it, whom the demo world keeps as a contact
 * - two ties nothing here can release: Acme starred a demo person, and a
 *   real person at a gmail address holds a seat at Northbend Athletic
 * - seed rows on a real person and a visitor, for the cleanup
 */

const SECRET = 'demo-ties-secret'
const call = async (route: (r: import('next/server').NextRequest) => Promise<Response>, path: string, body: unknown) =>
  json(await route(req('POST', path, body, { authorization: `Bearer ${SECRET}` })))
const dryRun = () => call(rebuild, '/api/seed-world/rebuild', { dryRun: true })

async function census(): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const m of DELETE_ORDER) {
    const [r] = (await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${m}"`)) as { n: number }[]
    out[m] = r.n
  }
  return out
}

const seedCv = (name: string) =>
  `${name}\nData engineer — Austin, TX\n\nSkills: Spark, Airflow\nWork authorization: USC\n\n` +
  'Experience\nContract assignments delivering Spark and Airflow work for enterprise clients.\n'

const ids: Record<string, string> = {}

beforeAll(async () => {
  await freshWorld()
  process.env.CRON_SECRET = SECRET

  const victor = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'world-computer-systems@demo.etyme.local' } })
  const computerSystems = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-computer-systems' } })
  const nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' } })
  const anders = await prisma.person.findFirstOrThrow({ where: { name: 'Anders Lund' } })

  // A company outside the world, with its own owner.
  const acme = await prisma.company.create({
    data: { slug: 'acme-verify', name: 'Acme Verify', kind: 'CLIENT', domain: 'acme-verify.com', domainVerified: true },
  })
  const acmeRole = await prisma.role.create({ data: { companyId: acme.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const priya = await prisma.person.create({ data: { name: 'Priya Shah', primaryEmail: 'priya.shah@gmail.com' } })
  await prisma.context.create({ data: { personId: priya.id, companyId: acme.id, roleId: acmeRole.id, type: 'EMPLOYEE' } })

  // Acme gave the demo's Computer Systems desk a seat, and cleared
  // Computer Systems as a supplier beside a firm of its own.
  const victorSeat = await prisma.context.create({
    data: { personId: victor.id, companyId: acme.id, roleId: acmeRole.id, type: 'EMPLOYEE' },
  })
  const ownSupplier = await prisma.company.create({ data: { slug: 'acme-own-supplier', name: 'Harrow Staffing', kind: 'VENDOR', domain: 'harrowstaffing.com', domainVerified: true } })
  const requirement = await prisma.requirement.create({
    data: { companyId: acme.id, title: 'Data engineer', clearedSupplierIds: [computerSystems.id, ownSupplier.id] },
  })

  // A visitor's sandbox with a made-up verification address seated in it,
  // whom the demo world's Computer Systems keeps as a contact.
  const sandbox = await prisma.company.create({
    data: { slug: 'sandbox-visitor-ties', name: 'Visitor Sandbox', kind: 'VENDOR', isDemo: true, demoExpiresAt: new Date(Date.now() + 14 * 86_400_000) },
  })
  const sandboxRole = await prisma.role.create({ data: { companyId: sandbox.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const verify = await prisma.person.create({ data: { name: 'Verify Three', primaryEmail: 'verify.three@seed.etyme.invalid' } })
  const verifySeat = await prisma.context.create({ data: { personId: verify.id, companyId: sandbox.id, roleId: sandboxRole.id, type: 'EMPLOYEE' } })
  await prisma.companyContact.create({
    data: { companyId: computerSystems.id, atCompanyId: nike.id, name: 'Verify Three', personId: verify.id },
  })

  // Two ties nothing here releases: a star on a demo person, and a real
  // person's seat at a demo client.
  const star = await prisma.favorite.create({ data: { companyId: acme.id, targetType: 'PERSON', targetId: anders.id, byId: priya.id } })
  const nikeRole = await prisma.role.findFirstOrThrow({ where: { companyId: nike.id, name: 'Owner' } })
  const priyaAtNike = await prisma.context.create({ data: { personId: priya.id, companyId: nike.id, roleId: nikeRole.id, type: 'EMPLOYEE' } })

  // For the cleanup: a seed file on Priya's check, and a seed CV on a
  // visitor seated only in their sandbox.
  const visitor = await prisma.person.create({ data: { name: 'Sam Visitor', primaryEmail: 'sam.visitor@yahoo.com' } })
  await prisma.context.create({ data: { personId: visitor.id, companyId: sandbox.id, roleId: sandboxRole.id, type: 'EMPLOYEE' } })
  const check = await prisma.verification.create({ data: { personId: priya.id, type: 'I9_EVERIFY', status: 'CLEAR', uploadedById: priya.id } })
  await prisma.verificationDoc.create({
    data: { verificationId: check.id, fileName: 'i9.pdf', fileUrl: `/files/verifications/${check.id}/i9.pdf`, fileHash: `seed:${check.id}` },
  })
  for (const n of [1, 2]) {
    await prisma.resume.create({
      data: { personId: visitor.id, label: `CV ${n}`, fileName: `sam-visitor-${n}-cv.pdf`, contentType: 'application/pdf', sizeBytes: 200, textExtract: seedCv('Sam Visitor') },
    })
  }

  Object.assign(ids, {
    victor: victor.id, verify: verify.id, computerSystems: computerSystems.id, ownSupplier: ownSupplier.id,
    acme: acme.id, sandbox: sandbox.id, priya: priya.id, victorSeat: victorSeat.id, verifySeat: verifySeat.id,
    requirement: requirement.id, star: star.id, priyaAtNike: priyaAtNike.id,
  })
}, 600_000)

afterAll(() => {
  delete process.env.CRON_SECRET
})

describe('whose records tie the demo world down', () => {
  it('the rebuild dry run names whose real records are tied to the demo world, without showing anybody’s full email', async () => {
    const before = await census()
    const r = await dryRun()
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const d = r.body.data
    expect(d.dryRun).toBe(true)
    expect(d.blocked).toBe(true)
    type T = { table: string; column: string; owner: string; ownerStanding: string; demo: string; why: string; releasable: boolean; release: string; warning?: string; rows: number }
    const ties = d.ties as T[]

    // Acme's seat for the demo desk: whose, why, and what is true today.
    const seat = ties.find((t) => t.table === 'Context' && t.owner.startsWith('Acme Verify (acme-verify.com)'))!
    expect(seat, JSON.stringify(ties, null, 2)).toBeDefined()
    expect(seat.ownerStanding).toBe('OUTSIDE')
    expect(seat.owner).toContain('a company outside the demo world')
    expect(seat.demo).toBe('Victor Hale (world-computer-systems@demo.etyme.local)')
    expect(seat.why).toContain('Acme Verify (acme-verify.com) gave a seat to the made-up person Victor Hale')
    expect(seat.releasable).toBe(true)
    expect(seat.release).toContain(`released.${ids.victor}@${STAND_IN_DOMAIN}`)
    expect(seat.warning).toBe(
      'Today, anybody the demo signs in as Victor Hale (world-computer-systems@demo.etyme.local) can choose a seat at Acme Verify (acme-verify.com).'
    )

    // The made-up verification address, held by a visitor's sandbox.
    const sandboxSeat = ties.find((t) => t.demo.startsWith('Verify Three'))!
    expect(sandboxSeat.ownerStanding).toBe('VISITOR_SANDBOX')
    expect(sandboxSeat.owner).toContain('a visitor’s demo sandbox')
    expect(sandboxSeat.why).toContain('CompanyContact.personId')

    // A list of cleared suppliers loses one id and nothing else.
    const cleared = ties.find((t) => t.table === 'Requirement')!
    expect(cleared.column).toBe('clearedSupplierIds')
    expect(cleared.releasable).toBe(true)

    // A real person, named by a masked address, holding a seat at a demo client.
    const priya = ties.find((t) => t.owner.startsWith('Priya Shah'))!
    expect(priya.owner).toContain('Priya Shah (p•••@gmail.com)')
    expect(priya.why).toContain('holds a seat at the demo company Northbend Athletic')
    expect(priya.releasable).toBe(false)

    // And the star, which only deleting it would release.
    expect(ties.find((t) => t.table === 'Favorite')!.releasable).toBe(false)
    expect(d.cannot).toHaveLength(2)
    expect(d.clearsTheWay).toBe(false)
    expect(d.says).toMatch(/2 ties cannot be released without deleting a row/)

    // Nobody's whole address, and nothing written.
    const all = JSON.stringify(r.body)
    for (const email of ['priya.shah@gmail.com', 'sam.visitor@yahoo.com']) expect(all).not.toContain(email)
    expect(await census()).toEqual(before)
  }, 300_000)

  it('the cleanup dry run groups what it would take back by owner', async () => {
    const r = await call(cleanup, '/api/seed-world/cleanup', { dryRun: true })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const groups = r.body.data.byOwner as { owner: string; kind: string; standing: string; counts: Record<string, number>; total: number }[]

    const visitor = groups.find((g) => g.owner.startsWith('Sam Visitor'))!
    expect(visitor.owner).toContain('Sam Visitor (s•••@yahoo.com), a visitor, seated only in 1 demo sandbox')
    expect(visitor.standing).toBe('SANDBOX_VISITOR')
    expect(visitor.counts).toEqual({ resumes: 2 })
    expect(visitor.total).toBe(2)

    const priya = groups.find((g) => g.owner.startsWith('Priya Shah'))!
    expect(priya.standing).toBe('AT_A_COMPANY')
    expect(priya.owner).toContain('seated at Acme Verify (acme-verify.com)')
    expect(priya.counts).toEqual({ verificationFiles: 1 })

    // Every row the plan takes is on exactly one owner.
    const kinds = r.body.data.kinds as Record<string, { ids: string[] }>
    const listed = Object.values(kinds).reduce((n, k) => n + k.ids.length, 0)
    expect(groups.reduce((n, g) => n + g.total, 0)).toBe(listed)
    expect(r.body.data.owners).toContain('visitors seated only in their own demo sandbox: 1')
    expect(JSON.stringify(r.body)).not.toContain('sam.visitor@yahoo.com')
  }, 120_000)

  it('releasing the ties changes only the references and deletes no real row', async () => {
    const before = await census()
    const r = await call(rebuild, '/api/seed-world/rebuild', { confirm: RELEASE_PHRASE })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const d = r.body.data
    // Acme's seat and the sandbox's seat move to stand-ins; one id leaves the list.
    expect(d.released).toBe(3)
    expect(d.standIns).toBe(2)
    expect(d.remaining).toHaveLength(2)
    expect(d.says).toMatch(/^Released 3 rows outside the demo world from it, deleting none and writing 2 stand-in made-up people\./)

    // Not one row fewer anywhere; two stand-ins and one log more.
    const after = await census()
    for (const m of DELETE_ORDER) {
      const more = m === 'Person' ? 2 : m === 'AutomationLog' ? 1 : 0
      expect(after[m], m).toBe(before[m] + more)
    }

    // The seats are where they were, held by stand-ins of the same name.
    const seat = await prisma.context.findUniqueOrThrow({ where: { id: ids.victorSeat }, include: { person: true } })
    expect(seat.companyId).toBe(ids.acme)
    expect(seat.person.name).toBe('Victor Hale')
    expect(seat.person.primaryEmail).toBe(`released.${ids.victor}@${STAND_IN_DOMAIN}`)
    const sandboxSeat = await prisma.context.findUniqueOrThrow({ where: { id: ids.verifySeat }, include: { person: true } })
    expect(sandboxSeat.person.primaryEmail).toBe(`released.${ids.verify}@${STAND_IN_DOMAIN}`)
    // The demo desk is seated nowhere outside the world any more.
    expect(await prisma.context.count({ where: { personId: ids.victor, companyId: ids.acme } })).toBe(0)

    // The cleared list lost the demo supplier and kept its own.
    const requirement = await prisma.requirement.findUniqueOrThrow({ where: { id: ids.requirement } })
    expect(requirement.clearedSupplierIds).toEqual([ids.ownSupplier])

    // What nothing here releases is left exactly as it was.
    expect(await prisma.favorite.findUnique({ where: { id: ids.star } })).not.toBeNull()
    expect(await prisma.context.findUnique({ where: { id: ids.priyaAtNike } })).not.toBeNull()

    const log = await prisma.automationLog.findFirstOrThrow({ where: { action: 'DEMO_TIES_RELEASED' } })
    expect(log.reversible).toBe(false)
    const payload = log.payload as { changes: { op: string; table: string; ids: string[]; from: string }[] }
    expect(payload.changes.find((c) => c.op === 'REPOINT' && c.from === ids.victor)!.ids).toEqual([ids.victorSeat])
    expect(payload.changes.find((c) => c.op === 'REMOVE')!.from).toBe(ids.computerSystems)
  }, 300_000)

  it('after the ties are released the demo world can be rebuilt', async () => {
    // What only deleting would release, ended by hand — the founder's call.
    await prisma.favorite.delete({ where: { id: ids.star } })
    await prisma.context.delete({ where: { id: ids.priyaAtNike } })

    const r = await dryRun()
    expect(r.body.data.ties).toEqual([])
    expect(r.body.data.clearsTheWay).toBe(true)
    expect(r.body.data.blocked).toBe(false)

    const done = await call(rebuild, '/api/seed-world/rebuild', { confirm: 'delete the demo world' })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    // Everything outside the world is still there.
    expect(await prisma.company.count({ where: { id: { in: [ids.acme, ids.sandbox, ids.ownSupplier] } } })).toBe(3)
    expect(await prisma.context.findUnique({ where: { id: ids.victorSeat } })).not.toBeNull()
    expect(await prisma.context.findUnique({ where: { id: ids.verifySeat } })).not.toBeNull()
    expect(await prisma.requirement.findUnique({ where: { id: ids.requirement } })).not.toBeNull()
    expect(await prisma.person.findUnique({ where: { id: ids.priya } })).not.toBeNull()
  }, 600_000)
})

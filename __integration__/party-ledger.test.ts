import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as ledgerGet } from '@/app/api/party-ledger/[kind]/[id]/route'
import { GET as progressGet } from '@/app/api/learn/[tenant]/progress/route'

/**
 * Record 134: one ledger per party, read off the one record, through the
 * real route, as real seats on the seeded world. Priya Ramesh is employed by
 * the sub-vendor (Tecwyn), sold to the prime (Computer Systems), and sold on
 * by the prime to the client (Harlow Health).
 */

const D = '@demo.etyme.local'
const PRIME = `world-computer-systems${D}`
const CLIENT = `world-harlow-health${D}`
const s: Record<string, string> = {}
const ledger = async (kind: string, id: string) => json(await ledgerGet(req('GET', `/api/party-ledger/${kind}/${id}`), { params: Promise.resolve({ kind, id }) }))

beforeAll(async () => {
  await freshWorld()
  const id = async (slug: string) => (await prisma.company.findFirstOrThrow({ where: { slug }, select: { id: true } })).id
  s.prime = await id('world-computer-systems'); s.client = await id('world-harlow-health'); s.sub = await id('world-tecwyn')
  s.priya = (await prisma.person.findFirstOrThrow({ where: { name: 'Priya Ramesh' }, select: { id: true } })).id
}, 600_000)

describe('the party ledger reads activity, money and documents off the one record', () => {
  it('a supplier reading a person it sells reads all three sections, with a record to open on every line', async () => {
    as(PRIME)
    const r = await ledger('person', s.priya)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const l = r.body.data
    for (const k of ['activity', 'money', 'documents']) expect(Array.isArray(l[k]), k).toBe(true)
    expect(l.activity.length).toBeGreaterThan(0)
    for (const line of [...l.activity, ...l.money, ...l.documents]) {
      expect(line.source.type).toBeTruthy()
      expect(line.href).toMatch(/^\//)
    }
  })

  it('a supplier reading its own company reads all three sections', async () => {
    as(PRIME)
    const r = await ledger('company', s.prime)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.activity.length).toBeGreaterThan(0)
    expect(Array.isArray(r.body.data.money)).toBe(true)
    expect(Array.isArray(r.body.data.documents)).toBe(true)
  })

  it('a supplier reading its client reads all three sections', async () => {
    as(PRIME)
    const r = await ledger('company', s.client)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.activity.length).toBeGreaterThan(0)
    expect(r.body.data.money.length).toBeGreaterThan(0)
  })

  it('a client reading a supplier sees no margin, no commission and no firm below the supplier', async () => {
    as(CLIENT)
    const r = await ledger('company', s.prime)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const l = r.body.data
    const all = [...l.activity, ...l.money, ...l.documents]
    expect(all.length).toBeGreaterThan(0)
    expect(all.filter((x: { kind: string }) => ['margin', 'commission'].includes(x.kind))).toEqual([])
    const text = JSON.stringify(r.body).toLowerCase()
    expect(text).not.toContain('tecwyn')
    expect(text).not.toContain(s.sub)
  })

  it('a client reading a person it hires sees no firm below its supplier and no margin', async () => {
    as(CLIENT)
    const r = await ledger('person', s.priya)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const text = JSON.stringify(r.body).toLowerCase()
    expect(text).not.toContain('tecwyn')
    expect(text).not.toContain(s.sub)
    expect(r.body.data.money.filter((x: { kind: string }) => x.kind === 'margin')).toEqual([])
  })

  it('a client may not open the ledger of the firm below its supplier, and the refusal is logged first', async () => {
    as(CLIENT)
    const before = await prisma.accessLog.count({ where: { subjectCompanyId: s.sub, allowed: false } })
    const r = await ledger('company', s.sub)
    expect(r.status).toBe(403)
    expect(await prisma.accessLog.count({ where: { subjectCompanyId: s.sub, allowed: false } })).toBe(before + 1)
  })

  it('a read of another firm writes an access log row naming the reader', async () => {
    as(PRIME)
    const before = await prisma.accessLog.count({ where: { subjectCompanyId: s.client, allowed: true, actorCompanyId: s.prime } })
    await ledger('company', s.client)
    expect(await prisma.accessLog.count({ where: { subjectCompanyId: s.client, allowed: true, actorCompanyId: s.prime } })).toBe(before + 1)
  })

  it('a person nobody on the book knows is refused in a sentence', async () => {
    as(CLIENT)
    const stranger = await prisma.person.create({ data: { name: 'Nobody Known', primaryEmail: 'nobody.known@seed.etyme.invalid' } })
    const r = await ledger('person', stranger.id)
    expect(r.status).toBe(403)
    expect(r.body.error.message).toMatch(/book/)
  })
})

describe('before her yes a firm reads only what it typed', () => {
  it('a firm that only asked a person onto its bench reads the name it typed and empty sections', async () => {
    const owner = 'owner@ridgeway-bench.test'
    const mk = async (name: string, slug: string, email: string) => {
      const c = await prisma.company.create({ data: { name, slug, kind: 'VENDOR', currency: 'USD' } })
      const role = await prisma.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true } })
      const p = await prisma.person.create({ data: { name: `${name} Owner`, primaryEmail: email } })
      await prisma.context.create({ data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'owner' } })
      return c.id
    }
    await mk('Keel Harbor Staffing', 'keel-harbor-pl', 'owner@keel-harbor-pl.test')
    await mk('Ridgeway Bench Partners', 'ridgeway-bench-pl', owner)
    const { POST: addConsultant } = await import('@/app/api/consultants/route')
    as('owner@keel-harbor-pl.test')
    const a = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Devika Patel', email: 'devika.pl@example.test', headline: 'Validation engineer', skills: ['Validation'], location: 'Raleigh', workAuth: 'H1B' })))
    expect(a.status, JSON.stringify(a.body)).toBe(201)
    as(owner)
    const b = await json(await addConsultant(req('POST', '/api/consultants', { name: 'D. Patel', email: 'devika.pl@example.test', headline: 'Commissioning lead' })))
    expect(b.status, JSON.stringify(b.body)).toBe(201)
    const personId = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: 'devika.pl@example.test' }, select: { id: true } })).id
    const r = await ledger('person', personId)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.subject.name).toBe('D. Patel')
    expect([...r.body.data.activity, ...r.body.data.money, ...r.body.data.documents]).toEqual([])
    expect(r.body.data.notes.join(' ')).toMatch(/only what your firm typed/)
  })
})

describe('one session reaches the core and the learning site', () => {
  it('a signed-in seat reads the core ledger and the learning site’s own route with the one session and no second sign-in', async () => {
    as(PRIME)
    const core = await ledger('company', s.prime)
    expect(core.status).toBe(200)
    const slug = 'world-computer-systems'
    const learn = await progressGet(req('GET', `/api/learn/${slug}/progress`), { params: Promise.resolve({ tenant: slug }) })
    // The plugin is off for this firm, so the route answers as a refusal of the plugin, never a request to sign in.
    expect(learn.status).not.toBe(401)
  })
})

describe('a seat confined to one team reads only that team’s jobs and submissions in its company ledger', () => {
  it('a client seat the Owner gave the Dayton team reads Dayton’s jobs and submissions and none of Belfast’s', async () => {
    const client = await prisma.company.create({ data: { name: 'Cavanaugh Ledger Glass', slug: 'cavanaugh-ledger', kind: 'CLIENT', currency: 'USD' } })
    const ownerRole = await prisma.role.create({ data: { companyId: client.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    const owner = await prisma.person.create({ data: { name: 'Gwen Ledger', primaryEmail: 'owner@cavanaugh-ledger.test' } })
    await prisma.context.create({ data: { personId: owner.id, companyId: client.id, roleId: ownerRole.id, type: 'EMPLOYEE', grantReason: 'owner' } })
    const dayton = await prisma.orgUnit.create({ data: { companyId: client.id, name: 'Dayton', kind: 'BU' } })
    const belfast = await prisma.orgUnit.create({ data: { companyId: client.id, name: 'Belfast', kind: 'BU' } })
    const coordinator = await prisma.role.create({ data: { companyId: client.id, name: 'Coordinator', permissions: ['consultants.read'] } })
    const rory = await prisma.person.create({ data: { name: 'Rory Ledger', primaryEmail: 'rory@cavanaugh-ledger.test' } })
    const seat = await prisma.context.create({ data: { personId: rory.id, companyId: client.id, roleId: coordinator.id, type: 'EMPLOYEE', grantReason: 'coordinator' } })
    for (const permission of ['requirements.read', 'submissions.read']) {
      await prisma.permissionGrant.create({ data: { companyId: client.id, permission, contextId: seat.id, scope: 'UNIT', orgUnitId: dayton.id, grantedById: owner.id, reason: 'Rory runs Dayton' } })
    }
    const vendor = await prisma.company.create({ data: { name: 'Veritan Ledger', slug: 'veritan-ledger', kind: 'VENDOR', currency: 'USD' } })
    const lead = await prisma.person.create({ data: { name: 'Vera Ledger', primaryEmail: 'vera@veritan-ledger.test' } })
    let n = 0
    for (const [title, orgUnitId] of [['Dayton line lead', dayton.id], ['Belfast furnace engineer', belfast.id]] as const) {
      const r = await prisma.requirement.create({ data: { companyId: client.id, title, skills: ['PLC'], status: 'OPEN', approvalState: 'APPROVED', headcount: 1, orgUnitId, raisedById: owner.id, ownerId: owner.id } })
      const person = await prisma.person.create({ data: { name: `Ledger Candidate ${++n}`, primaryEmail: `ledger-candidate${n}@person.test` } })
      await prisma.submission.create({ data: { requirementId: r.id, personId: person.id, fromCompanyId: vendor.id, toCompanyId: client.id, kind: 'NETWORK', rate: 9_000, status: 'SUBMITTED', submittedById: lead.id } })
    }

    as('owner@cavanaugh-ledger.test')
    const whole = await ledger('company', client.id)
    expect(JSON.stringify(whole.body)).toContain('Belfast furnace engineer')

    as('rory@cavanaugh-ledger.test')
    const r = await ledger('company', client.id)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const text = JSON.stringify(r.body)
    expect(text).toContain('Dayton line lead')
    expect(text).not.toContain('Belfast furnace engineer')
    expect(text).not.toContain('Ledger Candidate 2')
  })
})

describe('a seat confined to one team reads only that team’s submissions in a person’s ledger', () => {
  it('a client seat the Owner gave the Dayton team reads a person’s Dayton submission and not her Belfast one', async () => {
    const client = await prisma.company.create({ data: { name: 'Marlowe Person Glass', slug: 'marlowe-person', kind: 'CLIENT', currency: 'USD' } })
    const ownerRole = await prisma.role.create({ data: { companyId: client.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    const owner = await prisma.person.create({ data: { name: 'Gwen Marlowe', primaryEmail: 'owner@marlowe-person.test' } })
    await prisma.context.create({ data: { personId: owner.id, companyId: client.id, roleId: ownerRole.id, type: 'EMPLOYEE', grantReason: 'owner' } })
    const dayton = await prisma.orgUnit.create({ data: { companyId: client.id, name: 'Dayton', kind: 'BU' } })
    const belfast = await prisma.orgUnit.create({ data: { companyId: client.id, name: 'Belfast', kind: 'BU' } })
    const coordinator = await prisma.role.create({ data: { companyId: client.id, name: 'Coordinator', permissions: ['consultants.read'] } })
    const rory = await prisma.person.create({ data: { name: 'Rory Marlowe', primaryEmail: 'rory@marlowe-person.test' } })
    const seat = await prisma.context.create({ data: { personId: rory.id, companyId: client.id, roleId: coordinator.id, type: 'EMPLOYEE', grantReason: 'coordinator' } })
    for (const permission of ['requirements.read', 'submissions.read']) {
      await prisma.permissionGrant.create({ data: { companyId: client.id, permission, contextId: seat.id, scope: 'UNIT', orgUnitId: dayton.id, grantedById: owner.id, reason: 'Rory runs Dayton' } })
    }
    const vendor = await prisma.company.create({ data: { name: 'Veritan Person', slug: 'veritan-person', kind: 'VENDOR', currency: 'USD' } })
    const lead = await prisma.person.create({ data: { name: 'Vera Person', primaryEmail: 'vera@veritan-person.test' } })
    const her = await prisma.person.create({ data: { name: 'Mina Marlowe Candidate', primaryEmail: 'mina.marlowe@person.test' } })
    // She is on the client's book through a seat there, so her ledger may be opened at all.
    await prisma.context.create({ data: { personId: her.id, companyId: client.id, roleId: coordinator.id, type: 'EMPLOYEE', grantReason: 'on the book' } })
    for (const [title, orgUnitId] of [['Dayton line lead', dayton.id], ['Belfast furnace engineer', belfast.id]] as const) {
      const r = await prisma.requirement.create({ data: { companyId: client.id, title, skills: ['PLC'], status: 'OPEN', approvalState: 'APPROVED', headcount: 1, orgUnitId, raisedById: owner.id, ownerId: owner.id } })
      await prisma.submission.create({ data: { requirementId: r.id, personId: her.id, fromCompanyId: vendor.id, toCompanyId: client.id, kind: 'NETWORK', rate: 9_000, status: 'SUBMITTED', submittedById: lead.id } })
    }

    as('owner@marlowe-person.test')
    const whole = await ledger('person', her.id)
    expect(whole.status, JSON.stringify(whole.body)).toBe(200)
    expect(JSON.stringify(whole.body)).toContain('Belfast furnace engineer')

    as('rory@marlowe-person.test')
    const r = await ledger('person', her.id)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const text = JSON.stringify(r.body)
    expect(text).toContain('Dayton line lead')
    expect(text).not.toContain('Belfast furnace engineer')
  })
})

describe('an MSP seated on one unit of a client’s program reads only that unit in the client’s ledger', () => {
  it('an MSP seated on the Dayton unit reads Dayton’s jobs and submissions and none of Belfast’s', async () => {
    const client = await prisma.company.create({ data: { name: 'Hollis Program Glass', slug: 'hollis-program', kind: 'CLIENT', currency: 'USD' } })
    const ownerRole = await prisma.role.create({ data: { companyId: client.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    const owner = await prisma.person.create({ data: { name: 'Gwen Hollis', primaryEmail: 'owner@hollis-program.test' } })
    await prisma.context.create({ data: { personId: owner.id, companyId: client.id, roleId: ownerRole.id, type: 'EMPLOYEE', grantReason: 'owner' } })
    const dayton = await prisma.orgUnit.create({ data: { companyId: client.id, name: 'Dayton', kind: 'BU' } })
    const belfast = await prisma.orgUnit.create({ data: { companyId: client.id, name: 'Belfast', kind: 'BU' } })
    const seatRole = await prisma.role.create({ data: { companyId: client.id, name: 'Program manager', permissions: ['requirements.read', 'submissions.read', 'consultants.read'] } })
    const msp = await prisma.company.create({ data: { name: 'Hollis MSP Office', slug: 'hollis-msp', kind: 'MSP', currency: 'USD' } })
    const mspRole = await prisma.role.create({ data: { companyId: msp.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    const mspPerson = await prisma.person.create({ data: { name: 'Mo Hollis', primaryEmail: 'mo@hollis-msp.test' } })
    await prisma.context.create({ data: { personId: mspPerson.id, companyId: msp.id, roleId: mspRole.id, type: 'EMPLOYEE', grantReason: 'owner' } })
    await prisma.programSeat.create({ data: { clientCompanyId: client.id, officeCompanyId: msp.id, roleId: seatRole.id, orgUnitId: dayton.id, grantedById: owner.id, reason: 'Mo runs the Dayton program' } })
    const vendor = await prisma.company.create({ data: { name: 'Veritan Program', slug: 'veritan-program', kind: 'VENDOR', currency: 'USD' } })
    const lead = await prisma.person.create({ data: { name: 'Vera Program', primaryEmail: 'vera@veritan-program.test' } })
    let n = 0
    for (const [title, orgUnitId] of [['Dayton line lead', dayton.id], ['Belfast furnace engineer', belfast.id]] as const) {
      const r = await prisma.requirement.create({ data: { companyId: client.id, title, skills: ['PLC'], status: 'OPEN', approvalState: 'APPROVED', headcount: 1, orgUnitId, raisedById: owner.id, ownerId: owner.id } })
      const person = await prisma.person.create({ data: { name: `Program Candidate ${++n}`, primaryEmail: `program-candidate${n}@person.test` } })
      await prisma.submission.create({ data: { requirementId: r.id, personId: person.id, fromCompanyId: vendor.id, toCompanyId: client.id, kind: 'NETWORK', rate: 9_000, status: 'SUBMITTED', submittedById: lead.id } })
    }

    as('mo@hollis-msp.test')
    const r = await ledger('company', client.id)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const text = JSON.stringify(r.body)
    expect(text).toContain('Dayton line lead')
    expect(text).not.toContain('Belfast furnace engineer')
    expect(text).not.toContain('Program Candidate 2')
  })
})

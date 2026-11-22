import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { groupsAddUpTo, groupsAddUpSays, NEEDS_CLASSIFYING } from '@/lib/counterparty'

/**
 * The customer and client split (record 110, A1), through the routes.
 *
 * A customer pays us: the firm the bill goes to. A client is the end
 * client: where our people work. A supplier supplies us. The role is read
 * off each contract line, and beside it what a person said on the
 * register. A company loaded as a client is in no group until a person
 * classifies it, and nothing here writes to such a row by itself.
 *
 * Walked on the seeded world (Brightmoor Staffing, and Northbend Athletic
 * as the firm that only buys) and on a small firm made here.
 */

const companies = await import('@/app/api/companies/route')
const groupsRoute = await import('@/app/api/companies/groups/route')
const classifyRoute = await import('@/app/api/companies/[id]/classify/route')
const clients = await import('@/app/api/clients/route')

const D = '@demo.etyme.local'
const OWNER = `world-brightmoor${D}`
const RECRUITER = `world-brightmoor-recruiter${D}`
const BUYER = `world-nike${D}`
const SMALL_OWNER = 'owner.split-walk@larkfield-staffing.example'

let brightmoor = ''
let small = ''
let entity: string | undefined

const list = async () => {
  const r = await json(await companies.GET(req('GET', '/api/companies?records=1')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data as { companies: any[]; groups: { totals: any; says: string; mayClassify: boolean } }
}
const groups = async () => {
  const r = await json(await groupsRoute.GET(req('GET', '/api/companies/groups')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data as { sells: boolean; totals: any; says: string; mayClassify: boolean; entities: { id: string }[]; companies: any[] }
}
const picker = async (what: 'bill-to' | 'worksite') =>
  (await json(await groupsRoute.GET(req('GET', `/api/companies/groups?for=${what}`)))).body.data.options as { id: string; name: string; note: string | null }[]
const classify = async (id: string, body: object) =>
  json(await classifyRoute.PATCH(req('PATCH', `/api/companies/${id}/classify`, { ...(entity ? { actingEntityId: entity } : {}), ...body }) as any, { params: { id } }))
const rowOf = async (id: string) => (await list()).companies.find((c) => c.id === id)

/** A company the small firm keeps, with a register row of the kind the old doors wrote. */
async function kept(name: string, slug: string, kind: 'VENDOR' | 'CLIENT' | 'UNCLASSIFIED', relationship: 'CLIENT' | 'SUPPLIER' | null) {
  const c = await prisma.company.create({ data: { name, slug, kind, currency: 'USD', listedById: small, claimedAt: null, isDemo: true } })
  if (relationship) await prisma.counterparty.create({ data: { companyId: small, otherCompanyId: c.id, relationship, status: 'ACTIVE' } })
  return c.id
}
async function line(personName: string, slug: string, billTo: string, worksite: string | null) {
  const person = await prisma.person.create({ data: { name: personName, primaryEmail: `${slug}@larkfield-staffing.example` } })
  const start = new Date('2026-09-01T00:00:00Z')
  return prisma.sellContract.create({
    data: { companyId: small, clientCompanyId: billTo, endClientCompanyId: worksite, personId: person.id, billRate: 9_000, state: 'IN_PROGRESS', startDate: start, endDate: new Date('2027-02-28T00:00:00Z') },
  })
}

beforeAll(async () => {
  await freshWorld()
  brightmoor = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
  // A small staffing firm of this file's own, with one Owner.
  const firm = await prisma.company.create({ data: { name: 'Larkfield Staffing', slug: 'larkfield-split-walk', kind: 'VENDOR', currency: 'USD', claimedAt: new Date(), isDemo: true } })
  small = firm.id
  const role = await prisma.role.create({ data: { companyId: small, name: 'Owner', permissions: ['*'], isDefault: true } })
  const owner = await prisma.person.create({ data: { name: 'Nadia Larkfield', primaryEmail: SMALL_OWNER } })
  await prisma.context.create({ data: { personId: owner.id, type: 'EMPLOYEE', companyId: small, roleId: role.id } })
}, 600_000)

describe('a small staffing firm: the role is read off each contract', () => {
  let prime = '', site = '', both = '', loaded = '', sub = ''

  beforeAll(async () => {
    prime = await kept('Tallis Consulting Group', 'tallis-split-walk', 'VENDOR', 'CLIENT')
    site = await kept('Orrin Freight Lines', 'orrin-split-walk', 'UNCLASSIFIED', null)
    both = await kept('Wexcombe Insurance', 'wexcombe-split-walk', 'UNCLASSIFIED', null)
    loaded = await kept('Pellam Foods', 'pellam-split-walk', 'CLIENT', 'CLIENT')
    sub = await kept('Quillon Technical', 'quillon-split-walk', 'VENDOR', 'SUPPLIER')
    // Billed to the prime, working at the end client.
    await line('Asha Verran', 'asha.verran', prime, site)
    // Billed to Wexcombe and working there: no other end client is named.
    await line('Tomas Ilves', 'tomas.ilves', both, null)
    // Billed to the prime, working at Wexcombe.
    await line('Mirela Stanek', 'mirela.stanek', prime, both)
    // The company loaded as a client is billed on one line.
    await line('Deniz Arkan', 'deniz.arkan', loaded, null)
    as(SMALL_OWNER)
  })

  it('a company that pays us on one contract and is the worksite on another is in both groups, and the total counts it once', async () => {
    as(SMALL_OWNER)
    const read = await list()
    const row = read.companies.find((c) => c.id === both)
    expect(row.group.groups).toEqual(['CUSTOMER', 'CLIENT'])
    // Both come from the contracts; nobody has said anything about it.
    expect(row.group.onContracts).toEqual(['CUSTOMER', 'CLIENT'])
    expect(row.group.said).toEqual([])
    expect(read.companies.filter((c) => c.id === both)).toHaveLength(1)
    expect(read.groups.totals.inTwo).toBeGreaterThanOrEqual(1)
    expect(groupsAddUpTo(read.groups.totals)).toBe(read.groups.totals.total)
    expect(read.groups.totals.total).toBe(read.companies.length)
  })

  it('the firm billed is a customer and the company named as the end client is a client, each from the contract line', async () => {
    as(SMALL_OWNER)
    const read = await list()
    const p = read.companies.find((c) => c.id === prime)
    expect(p.group.groups).toEqual(['CUSTOMER'])
    expect(p.group.suggestion).toBe('Billed on 2 contracts.')
    const s = read.companies.find((c) => c.id === site)
    expect(s.group.groups).toEqual(['CLIENT'])
    expect(s.group.suggestion).toBe('Worksite on 1 contract.')
    expect(read.companies.find((c) => c.id === sub).group.groups).toEqual(['SUPPLIER'])
  })

  it('a line that names no end client says so beside the worksite count, so nobody reads it as a named worksite', async () => {
    as(SMALL_OWNER)
    const row = await rowOf(both)
    expect(row.group.suggestion).toBe('Billed on 1 contract. Worksite on 2 contracts: named on 1, and no other end client is named on 1.')
  })

  it('a company loaded as a client is never shown as a customer until a person says so', async () => {
    as(SMALL_OWNER)
    const before = await prisma.counterparty.findMany({ where: { companyId: small, otherCompanyId: loaded } })
    const read = await list()
    const row = read.companies.find((c) => c.id === loaded)
    // It holds the register row the old door wrote and is billed on a contract, and still it is in no group.
    expect(row.positions).toContain('CUSTOMER')
    expect(row.group.needsClassifying).toBe(true)
    expect(row.group.groups).toEqual([])
    expect(row.group.suggestion).toBe('Billed on 1 contract. Worksite on 1 contract, because no other end client is named on it.')
    expect(read.groups.totals.needsClassifying).toBe(1)
    expect(read.groups.says).toContain('1 needs classifying')
    // Reading it wrote nothing to its rows.
    expect(await prisma.counterparty.findMany({ where: { companyId: small, otherCompanyId: loaded } })).toEqual(before)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: loaded } })).kind).toBe('CLIENT')
  })

  it('the groups on the Companies list add up to the total the list says', async () => {
    as(SMALL_OWNER)
    const read = await list()
    const t = read.groups.totals
    const inGroup = (g: string) => read.companies.filter((c) => c.group.groups.includes(g)).length
    expect(t.customers).toBe(inGroup('CUSTOMER'))
    expect(t.clients).toBe(inGroup('CLIENT'))
    expect(t.suppliers).toBe(inGroup('SUPPLIER'))
    expect(t.needsClassifying).toBe(read.companies.filter((c) => c.group.needsClassifying).length)
    expect(groupsAddUpTo(t)).toBe(read.companies.length)
    expect(read.groups.says).toBe(groupsAddUpSays(t))
    expect(read.groups.says).toMatch(new RegExp(`^${read.companies.length} companies: 2 customers, 2 clients, 1 supplier, 1 in two groups, 1 needs classifying`))
    // The Classify page and the pickers read the same counts.
    const g = await groups()
    expect(g.totals).toEqual(t)
    expect(g.says).toBe(read.groups.says)
  })

  it('the bill-to picker offers customers and the worksite picker offers clients', async () => {
    as(SMALL_OWNER)
    const billTo = await picker('bill-to')
    const worksite = await picker('worksite')
    expect(billTo.filter((o) => o.note === null).map((o) => o.id).sort()).toEqual([prime, both].sort())
    expect(worksite.filter((o) => o.note === null).map((o) => o.id).sort()).toEqual([site, both].sort())
    // A supplier is in neither.
    expect([...billTo, ...worksite].map((o) => o.id)).not.toContain(sub)
  })

  it('a picker offers a company that still needs classifying only with those words beside its name', async () => {
    as(SMALL_OWNER)
    for (const what of ['bill-to', 'worksite'] as const) {
      const o = (await picker(what)).find((x) => x.id === loaded)
      expect(o?.note).toBe(NEEDS_CLASSIFYING.toLowerCase())
    }
  })

  it('classifying a company is on the ledger with who and when, and can be changed', async () => {
    as(SMALL_OWNER)
    const owner = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: SMALL_OWNER } })
    const first = await classify(loaded, { customer: true, client: false })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body.data.message).toBe('Nadia Larkfield said Pellam Foods is a customer (pays us). You can change this later.')
    let row = await rowOf(loaded)
    expect(row.group.needsClassifying).toBe(false)
    expect(row.group.said).toEqual(['CUSTOMER'])
    expect(row.group.groups).toContain('CUSTOMER')
    const g = (await groups()).companies.find((c) => c.id === loaded)
    expect(g.classifiedByName).toBe('Nadia Larkfield')
    expect(new Date(g.classifiedAt).getTime()).toBeGreaterThan(Date.now() - 60_000)
    let ledger = await prisma.recordAction.findMany({ where: { companyId: small, recordType: 'Company', recordId: loaded, action: 'COMPANY_CLASSIFIED' }, orderBy: { createdAt: 'asc' } })
    expect(ledger).toHaveLength(1)
    expect(ledger[0].personId).toBe(owner.id)
    expect(ledger[0].heldAs).toBe('Owner')
    expect(ledger[0].summary).toBe('Nadia Larkfield said Pellam Foods is a customer (pays us).')

    // Changed later: a client, and no longer said to be a customer.
    const second = await classify(loaded, { customer: false, client: true })
    expect(second.status, JSON.stringify(second.body)).toBe(200)
    row = await rowOf(loaded)
    expect(row.group.said).toEqual(['CLIENT'])
    expect(row.group.needsClassifying).toBe(false)
    ledger = await prisma.recordAction.findMany({ where: { companyId: small, recordType: 'Company', recordId: loaded, action: 'COMPANY_CLASSIFIED' }, orderBy: { createdAt: 'asc' } })
    expect(ledger.map((l) => l.summary)).toEqual([
      'Nadia Larkfield said Pellam Foods is a customer (pays us).',
      'Nadia Larkfield said Pellam Foods is a client (where our people work).',
    ])
    // The row the old door wrote is still there, and the Kind did not move.
    expect(await prisma.counterparty.count({ where: { companyId: small, otherCompanyId: loaded, relationship: 'CLIENT' } })).toBe(1)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: loaded } })).kind).toBe('CLIENT')

    // And both.
    const third = await classify(loaded, { customer: true, client: true })
    expect(third.status).toBe(200)
    expect((await rowOf(loaded)).group.said).toEqual(['CUSTOMER', 'CLIENT'])
  })

  it('a save with neither box ticked is refused in a sentence and changes nothing', async () => {
    as(SMALL_OWNER)
    const r = await classify(loaded, { customer: false, client: false })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('Tick "Customer: pays us", "Client: where our people work" or both for Pellam Foods.')
    expect((await rowOf(loaded)).group.said).toEqual(['CUSTOMER', 'CLIENT'])
  })

  it('a company that was never a customer can be said to be a client, and is then counted under Clients', async () => {
    as(SMALL_OWNER)
    const fresh = await kept('Harrow Vale Clinics', 'harrow-vale-split-walk', 'UNCLASSIFIED', null)
    expect((await rowOf(fresh)).group.notClassified).toBe(true)
    const r = await classify(fresh, { customer: false, client: true })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const row = await rowOf(fresh)
    expect(row.group.groups).toEqual(['CLIENT'])
    expect(row.group.notClassified).toBe(false)
    // Saying "client" gives no Customer position, so nothing can be billed to it by this.
    expect(row.positions).not.toContain('CUSTOMER')
  })

  it('a company on nobody’s list is answered as one that does not exist, and the refusal is logged first', async () => {
    as(SMALL_OWNER)
    const stranger = await prisma.company.create({ data: { name: 'Unlisted Split Walk', slug: 'unlisted-split-walk', kind: 'CLIENT', currency: 'USD', isDemo: true, claimedAt: new Date() } })
    const before = await prisma.accessLog.count()
    const r = await classify(stranger.id, { customer: true, client: false })
    expect(r.status).toBe(404)
    expect(r.body.error.message).toBe('That company is not on your Companies list.')
    expect(await prisma.accessLog.count()).toBe(before + 1)
  })
})

describe('the seeded world: Brightmoor Staffing', () => {
  it('every seeded company of Kind client on its list needs classifying, and none is counted as a customer', async () => {
    as(OWNER)
    const read = await list()
    const g = await groups()
    entity = g.entities[0]?.id
    const kinds = new Map((await prisma.company.findMany({ where: { id: { in: read.companies.map((c) => c.id) } }, select: { id: true, kind: true } })).map((c) => [c.id, c.kind]))
    const loadedAsClient = read.companies.filter((c) => kinds.get(c.id) === 'CLIENT' && !c.notLinked)
    expect(loadedAsClient.length).toBeGreaterThan(0)
    for (const c of loadedAsClient) {
      expect(c.group.needsClassifying, c.name).toBe(true)
      expect(c.group.groups, c.name).toEqual([])
    }
    expect(read.groups.totals.needsClassifying).toBe(loadedAsClient.length)
    expect(groupsAddUpTo(read.groups.totals)).toBe(read.companies.length)
    expect(g.totals).toEqual(read.groups.totals)
  })

  it('a client listed through the clients door reads "On no contract yet" and needs classifying', async () => {
    as(OWNER)
    const made = await json(await clients.POST(req('POST', '/api/clients', { name: 'Ashgrove Paper Mills' })))
    expect(made.status, JSON.stringify(made.body)).toBeLessThan(300)
    const row = (await list()).companies.find((c) => c.name === 'Ashgrove Paper Mills')
    expect(row.group.needsClassifying).toBe(true)
    expect(row.group.suggestion).toBe('On no contract yet.')
    const said = await classify(row.id, { customer: true, client: true })
    expect(said.status, JSON.stringify(said.body)).toBe(200)
    expect((await rowOf(row.id)).group.groups).toEqual(['CUSTOMER', 'CLIENT'])
  })

  it('a recruiter, who does not manage who the firm trades with, cannot classify a company, and the refusal is logged first', async () => {
    as(OWNER)
    const target = (await list()).companies.find((c) => c.group.needsClassifying)
    as(RECRUITER)
    const before = await prisma.accessLog.count()
    const r = await classify(target.id, { customer: true, client: false })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('for the Owner, an Admin or whoever manages who you trade with')
    expect(await prisma.accessLog.count()).toBe(before + 1)
    as(OWNER)
    expect((await rowOf(target.id)).group.needsClassifying).toBe(true)
  })
})

describe('the seeded world: Northbend Athletic, a firm that only buys', () => {
  it('a firm that only buys has no customers group', async () => {
    as(BUYER)
    const read = await list()
    const t = read.groups.totals
    expect(t.sells).toBe(false)
    expect(t.customers).toBe(0)
    expect(t.clients).toBe(0)
    expect(t.needsClassifying).toBe(0)
    expect(t.suppliers).toBeGreaterThan(0)
    expect(read.groups.says).not.toMatch(/customer|client|classifying/)
    expect(read.groups.mayClassify).toBe(false)
    for (const c of read.companies) {
      expect(c.group.groups.filter((g: string) => g !== 'SUPPLIER'), c.name).toEqual([])
      expect(c.group.needsClassifying, c.name).toBe(false)
    }
    expect(groupsAddUpTo(t)).toBe(read.companies.length)
    expect(await picker('bill-to')).toEqual([])
    expect(await picker('worksite')).toEqual([])
  })

  it('it is refused in a sentence when it tries to name a customer, and nothing is written', async () => {
    as(BUYER)
    const anySupplier = (await list()).companies.find((c) => c.group.groups.includes('SUPPLIER'))
    const before = await prisma.counterparty.count()
    const nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const ent = (await prisma.legalEntity.findFirst({ where: { companyId: nike.id }, select: { id: true } }))?.id
    const r = await json(await classifyRoute.PATCH(req('PATCH', `/api/companies/${anySupplier.id}/classify`, { customer: true, client: false, ...(ent ? { actingEntityId: ent } : {}) }) as any, { params: { id: anySupplier.id } }))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('buys from its suppliers and bills nobody')
    expect(await prisma.counterparty.count()).toBe(before)
  })
})

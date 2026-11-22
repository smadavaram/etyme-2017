import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * The Companies list, after the founder's firm pressed it on 2026-11-14
 * (record 72, items B1, B2, B3, B5). A staff address that also holds a
 * seat reads that seat's book, never the whole deployment; every row the
 * list draws opens in its drawer; every row is in a tile and the tiles
 * add up; a firm on Etyme you only wrote down is named and nothing else;
 * a company is known by its domain among the companies you recorded; what
 * was typed is kept and shown; and a recorded company can be corrected.
 * Nothing here sends an email: the one sender is faked and counted.
 */

const sent: string[] = []
vi.mock('@/lib/senders', async (orig) => {
  const real: any = await orig()
  return {
    ...real,
    emailSender: () => ({ channel: 'EMAIL', send: async (to: string) => { sent.push(to) } }),
  }
})

const companies = await import('@/app/api/companies/route')
const extend = await import('@/app/api/companies/[id]/extend/route')
const locations = await import('@/app/api/companies/[id]/locations/route')
const recordRoute = await import('@/app/api/companies/[id]/record/route')
const clients = await import('@/app/api/clients/route')
const { companyTiles } = await import('@/lib/counterparty')

const D = '@demo.etyme.local'
const OWNER = `world-brightmoor${D}`
const SEATS = ['brightmoor', 'tecwyn', 'nike', 'aptiva', 'tellisford', 'computer-systems', 'kestrel'].map((s) => `world-${s}${D}`)

let brightmoor = ''
const listed = async (q = '?records=1') => {
  const r = await json(await companies.GET(req('GET', `/api/companies${q}`)))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.companies as any[]
}
const record = async (name: string, extra: object = {}) =>
  json(await companies.POST(req('POST', '/api/companies', { name, kind: 'UNCLASSIFIED', ...extra })))
const drawer = async (id: string) => json(await extend.GET(req('GET', `/api/companies/${id}/extend`) as any, { params: { id } }))
const sites = async (id: string) => json(await locations.GET(req('GET', `/api/companies/${id}/locations`) as any, { params: Promise.resolve({ id }) }))
const edit = async (id: string, body: object) => json(await recordRoute.PATCH(req('PATCH', `/api/companies/${id}/record`, body) as any, { params: { id } }))

const staffBefore = process.env.ETYME_STAFF_EMAILS

beforeAll(async () => {
  await freshWorld()
  brightmoor = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
}, 600_000)

afterAll(() => {
  if (staffBefore === undefined) delete process.env.ETYME_STAFF_EMAILS
  else process.env.ETYME_STAFF_EMAILS = staffBefore
})

describe('a staff address that also holds a seat reads her seat’s book', () => {
  it('a staff address that also holds a seat reads only that seat’s own Companies list, never every company on the deployment', async () => {
    as(OWNER)
    delete process.env.ETYME_STAFF_EMAILS
    const asSeat = (await listed()).map((c) => c.id).sort()
    process.env.ETYME_STAFF_EMAILS = OWNER
    const asStaff = (await listed()).map((c) => c.id).sort()
    const everyCompany = await prisma.company.count()
    expect(asStaff).toEqual(asSeat)
    expect(asStaff.length).toBeLessThan(everyCompany)
    // A firm is never among its own companies.
    expect(asStaff).not.toContain(brightmoor)
  })

  it('a staff address with a seat cannot read the sites of a company her firm does not deal with, and the refusal is in the access log first', async () => {
    process.env.ETYME_STAFF_EMAILS = OWNER
    as(OWNER)
    const mine = new Set((await listed()).map((c) => c.id))
    const stranger = await prisma.company.findFirstOrThrow({ where: { id: { notIn: [...mine, brightmoor] } }, select: { id: true } })
    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: stranger.id } })
    const r = await sites(stranger.id)
    expect(r.status).toBe(404)
    expect(r.body.error.message).toBe('That company is not one you trade with.')
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: stranger.id } })).toBe(before + 1)
    delete process.env.ETYME_STAFF_EMAILS
  })
})

describe('every row the list draws opens', () => {
  it('every company the Companies list draws opens in its drawer, for every seeded seat', async () => {
    delete process.env.ETYME_STAFF_EMAILS
    for (const seat of SEATS) {
      as(seat)
      for (const row of await listed()) {
        if (row.notLinked) continue // its drawer is the "not linked yet" panel, which calls no route
        const r = await drawer(row.id)
        expect(r.status, `${seat} opening ${row.name}: ${JSON.stringify(r.body)}`).toBe(200)
      }
    }
  })
})

describe('the tiles add up', () => {
  it('every company on the list is in a tile, for every seeded seat, and the tiles less the companies counted twice are the total', async () => {
    for (const seat of SEATS) {
      as(seat)
      const rows = await listed()
      const t = companyTiles(rows)
      const sum = t.customers + t.suppliers + t.primes + t.msps + t.notClassified + t.worksWithYou + t.notLinked
      expect(t.total, seat).toBe(rows.length)
      // A row in two tiles is counted twice; none is in no tile.
      const twice = rows.filter((r) => (['CUSTOMER', 'SUPPLIER', 'PRIME', 'MSP'] as const).filter((p) => r.positions.includes(p)).length > 1).length
      expect(sum - twice, seat).toBe(rows.length)
      expect(t.countedTwice, seat).toBe(twice)
    }
  })

  it('Brightmoor’s list reads the same figures as its own register and records: customers, suppliers, not classified, works with you', async () => {
    as(OWNER)
    const rows = await listed()
    const t = companyTiles(rows)
    const register = await prisma.counterparty.findMany({ where: { companyId: brightmoor }, select: { otherCompanyId: true, relationship: true } })
    const onList = new Set(rows.map((r) => r.id))
    const customers = new Set(rows.filter((r) => r.positions.includes('CUSTOMER')).map((r) => r.id))
    // Every customer row the register holds is counted under Customers.
    for (const r of register.filter((x) => x.relationship === 'CLIENT' && onList.has(x.otherCompanyId))) expect(customers.has(r.otherCompanyId)).toBe(true)
    expect(t.customers).toBe(customers.size)
    expect(t.suppliers).toBe(rows.filter((r) => r.positions.includes('SUPPLIER')).length)
    expect(t.notClassified).toBe(rows.filter((r) => r.mine && r.positions.length === 0).length)
    expect(t.worksWithYou).toBe(rows.filter((r) => !r.mine && !r.notLinked && r.positions.length === 0).length)
    expect(t.customers).toBeGreaterThan(0)
  })

  it('a company on the list only through work holds no position and reads Works with you, never a blank', async () => {
    for (const seat of SEATS) {
      as(seat)
      for (const row of await listed()) {
        if (row.positions.length === 0 && !row.notClassified && !row.notLinked) expect(companyTiles([row]).worksWithYou).toBe(1)
      }
    }
  })
})

describe('a firm you do not work with is not described to you', () => {
  let onEtyme = ''
  beforeAll(async () => {
    // A firm on Etyme, signed up on its own domain, that Brightmoor has
    // never worked with. Brightmoor writes it on its own register by hand.
    const c = await prisma.company.create({
      data: { name: 'Harborline Tech', slug: 'harborline-tech-walk', kind: 'VENDOR', currency: 'USD', domain: 'harborline-tech.example', domainVerified: true, claimedAt: new Date('2026-01-05T12:00:00Z'), isDemo: false },
    })
    onEtyme = c.id
    const p = await prisma.person.create({ data: { name: 'Harbor Owner', primaryEmail: 'owner@harborline-tech.example' } })
    await prisma.context.create({ data: { personId: p.id, type: 'EMPLOYEE', companyId: c.id } })
    await prisma.counterparty.create({ data: { companyId: brightmoor, otherCompanyId: c.id, relationship: 'SUPPLIER', status: 'ACTIVE' } })
  })

  it('a firm on Etyme that the reader only wrote down is listed with its name and no address, domain, kind or created date of its own, and offers Ask them to link', async () => {
    as(OWNER)
    const row = (await listed()).find((c) => c.id === onEtyme)
    expect(row).toBeDefined()
    expect(row).toMatchObject({ name: 'Harborline Tech', notLinked: true, slug: '', domain: null, kind: null, createdAt: null, askAs: 'SUPPLIER' })
    const raw = JSON.stringify(row)
    expect(raw).not.toContain('harborline-tech.example')
    expect(raw).not.toContain('harborline-tech-walk')
    expect(raw).not.toContain('2026-01-05')
    expect(row.may).toEqual({ extendToSupplier: false, extendToCustomer: false, setKind: false })
  })

  it('a firm on Etyme that the reader only wrote down keeps its sites to itself', async () => {
    as(OWNER)
    expect((await sites(onEtyme)).status).toBe(404)
  })

  it('once the other firm writes the reader on its own register, the two work together and the row reads in full', async () => {
    await prisma.counterparty.create({ data: { companyId: onEtyme, otherCompanyId: brightmoor, relationship: 'CLIENT', status: 'ACTIVE' } })
    as(OWNER)
    const row = (await listed()).find((c) => c.id === onEtyme)
    expect(row).toMatchObject({ notLinked: false, slug: 'harborline-tech-walk', domain: 'harborline-tech.example' })
    expect((await sites(onEtyme)).status).toBe(200)
  })
})

describe('a company is known by its domain among the companies you recorded', () => {
  let first = ''
  it('the same name on a different domain is recorded as a second company, because a company is known by its domain', async () => {
    as(OWNER)
    const a = await record('Northwind Staffing', { domain: 'northwind-staffing.example' })
    expect(a.status).toBe(201)
    first = a.body.data.company.id
    const b = await record('Northwind Staffing', { domain: 'northwind-group.example' })
    expect(b.status, JSON.stringify(b.body)).toBe(201)
    expect(b.body.data.message).toContain('Another company on your list is also called Northwind Staffing, on northwind-staffing.example.')
    const rows = (await listed()).filter((c) => c.name === 'Northwind Staffing')
    expect(rows.map((r) => r.notedDomain).sort()).toEqual(['northwind-group.example', 'northwind-staffing.example'])
  })

  it('a company typed with a domain already on your list under another name is refused, the one already there is named with its domain, and the refusal is logged first', async () => {
    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: first } })
    const r = await record('NW Staffing Partners', { domain: 'https://www.Northwind-Staffing.example/about' })
    expect(r.status).toBe(409)
    expect(r.body.error).toMatchObject({
      code: 'SAME_DOMAIN_ON_YOUR_LIST',
      companyId: first,
      message: 'Northwind Staffing (northwind-staffing.example) is on your Companies list already on that domain. Open it there rather than record it twice.',
    })
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: first } })).toBe(before + 1)
  })

  it('a subdomain of a domain already on your list is the same company', async () => {
    const r = await record('Northwind Mail', { domain: 'mail.northwind-staffing.example' })
    expect(r.status).toBe(409)
    expect(r.body.error.companyId).toBe(first)
  })

  it('a subdomain typed on Add a company is kept as the company’s own domain, and the reply says so', async () => {
    const r = await record('Harrowgate Mills', { domain: 'eu.harrowgate-mills.example' })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.message).toContain('The company\'s domain is kept as harrowgate-mills.example, read from eu.harrowgate-mills.example.')
    const c = await prisma.company.findUniqueOrThrow({ where: { id: r.body.data.company.id }, select: { website: true } })
    expect(c.website).toBe('harrowgate-mills.example')
  })

  it('the same domain is refused whatever Kind is chosen, before any firm on Etyme is looked up', async () => {
    const r = await json(await companies.POST(req('POST', '/api/companies', { name: 'Northwind Again', kind: 'VENDOR', relationship: 'SUPPLIER', domain: 'northwind-staffing.example' })))
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('SAME_DOMAIN_ON_YOUR_LIST')
  })

  it('the same name typed with no domain is still refused when the one already on your list has no domain either', async () => {
    expect((await record('Quarry Lane Talent')).status).toBe(201)
    const r = await record('quarry lane talent')
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('SAME_NAME_ON_YOUR_LIST')
  })

  it('the same name where only the new one has a domain is recorded, and the message says another company on your list shares the name', async () => {
    const r = await record('Quarry Lane Talent', { domain: 'quarrylane.example' })
    expect(r.status).toBe(201)
    expect(r.body.data.message).toContain('Another company on your list is also called Quarry Lane Talent, with no domain yet.')
  })

  it('a personal email domain is never a company’s identity: it is not kept, the reply says so, and the name rule decides', async () => {
    const r = await record('Quarry Lane Talent', { domain: 'gmail.com' })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('SAME_NAME_ON_YOUR_LIST')
    const s = await record('Bluefen Recruiting', { domain: 'gmail.com' })
    expect(s.status).toBe(201)
    expect(s.body.data.message).toContain('gmail.com is a personal email domain, so it was not kept as their company\'s domain.')
    const c = await prisma.company.findUniqueOrThrow({ where: { id: s.body.data.company.id }, select: { website: true, domain: true } })
    expect(c).toEqual({ website: null, domain: null })
  })

  it('the clients door records a client on a new domain although a client of the same name is listed on another domain', async () => {
    const a = await json(await clients.POST(req('POST', '/api/clients', { name: 'Cedar Point Health', domain: 'cedarpoint.example' })))
    expect(a.status, JSON.stringify(a.body)).toBe(201)
    const b = await json(await clients.POST(req('POST', '/api/clients', { name: 'Cedar Point Health', domain: 'cedarpoint-clinics.example' })))
    expect(b.status).toBe(201)
    expect(b.body.data.client.id).not.toBe(a.body.data.client.id)
    expect(b.body.data.message).toContain('Another company on your list is also called Cedar Point Health, on cedarpoint.example.')
    // And the same domain again is the same client, whatever the name.
    const c = await json(await clients.POST(req('POST', '/api/clients', { name: 'Cedar Point', domain: 'cedarpoint.example' })))
    expect(c.body.data.client.id).toBe(a.body.data.client.id)
  })
})

describe('what was typed is kept and shown', () => {
  it('a domain and an entity type typed on Add a company are on the list whatever Kind was chosen, and never in the column other people join by', async () => {
    as(OWNER)
    const r = await json(await companies.POST(req('POST', '/api/companies', { name: 'Larkspur Systems', kind: 'VENDOR', relationship: 'SUPPLIER', domain: 'larkspur-systems.example', entityType: 'LLC' })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const id = r.body.data.company.id
    const row = (await listed()).find((c) => c.id === id)
    expect(row).toMatchObject({ domain: null, notedDomain: 'larkspur-systems.example', notedFrom: 'TYPED', entityType: 'LLC' })
    const c = await prisma.company.findUniqueOrThrow({ where: { id }, select: { domain: true, domainVerified: true } })
    expect(c).toEqual({ domain: null, domainVerified: false })
  })

  it('a client added with a domain and an entity type shows both on the Companies list', async () => {
    const r = await json(await clients.POST(req('POST', '/api/clients', { name: 'Ferncliff Foods', domain: 'ferncliff.example', entityType: 'Inc.' })))
    expect(r.status).toBe(201)
    const row = (await listed()).find((c) => c.id === r.body.data.client.id)
    expect(row).toMatchObject({ notedDomain: 'ferncliff.example', entityType: 'Inc.' })
  })

  it('a company made by pasting supplier emails shows the domain on its invitation, read at read time with nothing backfilled', async () => {
    const c = await prisma.company.create({ data: { name: 'Tangent Talent', slug: 'tangent-talent-walk', kind: 'VENDOR', currency: 'USD', listedById: brightmoor, isDemo: false } })
    await prisma.counterparty.create({ data: { companyId: brightmoor, otherCompanyId: c.id, relationship: 'SUPPLIER', status: 'ACTIVE' } })
    await prisma.supplierInvite.create({ data: { companyId: c.id, byId: brightmoor, email: 'ops@tangent-talent.example', domain: 'tangent-talent.example', token: `walk-tangent-${Date.now()}` } })
    const row = (await listed()).find((x) => x.id === c.id)
    expect(row).toMatchObject({ notedDomain: 'tangent-talent.example', notedFrom: 'INVITATION' })
    expect((await prisma.company.findUniqueOrThrow({ where: { id: c.id }, select: { website: true } })).website).toBeNull()
    // And the twin rule reads the same domain.
    const r = await record('Tangent Group', { domain: 'tangent-talent.example' })
    expect(r.status).toBe(409)
    expect(r.body.error.companyId).toBe(c.id)
  })

  it('another firm reading its own list is never shown a domain this firm typed', async () => {
    as(`world-tecwyn${D}`)
    const raw = JSON.stringify(await listed())
    expect(raw).not.toContain('larkspur-systems.example')
    expect(raw).not.toContain('tangent-talent.example')
  })
})

describe('a recorded company can be corrected', () => {
  let id = ''
  it('the Owner corrects the name, the domain and the entity type of a company she recorded, one log row says what changed from what to what, and nothing is emailed', async () => {
    as(OWNER)
    id = (await record('Rivetstone', { domain: 'rivetston.example' })).body.data.company.id
    const before = sent.length
    const r = await edit(id, { name: 'Rivetstone Partners', domain: 'rivetstone.example', entityType: 'LLC' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.message).toBe('Rivetstone Partners is corrected on your Companies list. Saving a company never emails them.')
    const c = await prisma.company.findUniqueOrThrow({ where: { id }, select: { name: true, website: true, entityType: true, domain: true } })
    expect(c).toEqual({ name: 'Rivetstone Partners', website: 'rivetstone.example', entityType: 'LLC', domain: null })
    const logs = await prisma.automationLog.findMany({ where: { companyId: brightmoor, action: 'COMPANY_RECORD_EDITED', payload: { path: ['otherCompanyId'], equals: id } } })
    expect(logs).toHaveLength(1)
    expect(logs[0].summary).toContain('changed the name from Rivetstone to Rivetstone Partners, the domain from rivetston.example to rivetstone.example, the entity type from nothing to LLC')
    expect(sent.length).toBe(before)
    // The drawer offers Edit, and its history carries the change.
    const d = await drawer(id)
    expect(d.body.data.may.edit).toBe(true)
    expect(d.body.data.history[0].action).toBe('COMPANY_RECORD_EDITED')
  })

  it('a correction onto a domain another company on your list holds is refused and links that company', async () => {
    const r = await edit(id, { name: 'Rivetstone Partners', domain: 'northwind-staffing.example' })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('SAME_DOMAIN_ON_YOUR_LIST')
  })

  it('a correction with no name is refused in a sentence and changes nothing', async () => {
    const r = await edit(id, { name: ' ', domain: 'rivetstone.example' })
    expect(r.status).toBe(422)
    expect(r.body.error).toMatchObject({ field: 'name', message: 'Give the company’s name, at least two letters.' })
  })

  it('a company that is on Etyme keeps its own name: no Edit is offered and the route refuses in a sentence', async () => {
    const harbor = (await prisma.company.findUniqueOrThrow({ where: { slug: 'harborline-tech-walk' }, select: { id: true } })).id
    const d = await drawer(harbor)
    expect(d.status, JSON.stringify(d.body)).toBe(200)
    expect(d.body.data.may.edit).toBe(false)
    const r = await edit(harbor, { name: 'Harbor Renamed' })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('Harborline Tech is on Etyme, so it keeps its own name and domain. Nothing was changed.')
    expect((await prisma.company.findUniqueOrThrow({ where: { id: harbor }, select: { name: true } })).name).toBe('Harborline Tech')
  })

  it('another firm cannot correct a company this firm recorded, and is answered as an id that does not exist', async () => {
    as(`world-tecwyn${D}`)
    const r = await edit(id, { name: 'Taken Over' })
    expect(r.status).toBe(404)
    expect(r.body.error.message).toBe('That company is not on your Companies list.')
    as(OWNER)
  })

  it('nothing was emailed at any step', () => {
    expect(sent).toEqual([])
  })
})

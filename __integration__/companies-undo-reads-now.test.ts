import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * The fix list of 2026-11-14, E3, and the small faults the press of
 * 2026-11-15 left on Companies and Contacts, walked through the routes.
 * Extend leaves its sentence where the press happened, with Undo beside
 * it, and Undo is the drawer's own Remove. Whether a history row can be
 * undone is read now, never the flag stored when it was written. A
 * company added with a Kind chosen is on the adding firm's own log.
 */

const companies = await import('@/app/api/companies/route')
const extend = await import('@/app/api/companies/[id]/extend/route')
const record = await import('@/app/api/companies/[id]/record/route')
const contacts = await import('@/app/api/contacts/route')

const OWNER = 'world-brightmoor@demo.etyme.local'
let brightmoor = ''
const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: { id } }))
const drawer = (id: string) => call(extend.GET as any, 'GET', `/api/companies/${id}/extend`, id)

beforeAll(async () => {
  await freshWorld()
  brightmoor = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
  as(OWNER)
}, 600_000)

describe('Extend, and Undo where the press happened', () => {
  let id = ''

  it('pressing Extend to Supplier answers in a sentence the row keeps, and Undo puts the company back to not classified with its Kind as it was', async () => {
    id = (await json(await companies.POST(req('POST', '/api/companies', { name: 'Northwind Staffing', kind: 'UNCLASSIFIED', domain: 'northwind-staffing.example' })))).body.data.company.id
    const up = await call(extend.POST as any, 'POST', `/api/companies/${id}/extend`, id, { as: 'SUPPLIER' })
    expect(up.status).toBe(201)
    expect(up.body.data.message).toBe('Northwind Staffing is your supplier now. What kind of company it is did not change. To qualify them, start from Suppliers.')
    const back = await call(extend.DELETE as any, 'DELETE', `/api/companies/${id}/extend?as=SUPPLIER`, id)
    expect(back.status).toBe(200)
    expect(back.body.data.message).toBe('Northwind Staffing is no longer your supplier. What kind of company it is did not change. It stays on your Companies list, not classified.')
    expect(back.body.data.positions).toEqual([])
    expect(back.body.data.notClassified).toBe(true)
    expect((await prisma.company.findUniqueOrThrow({ where: { id }, select: { kind: true } })).kind).toBe('UNCLASSIFIED')
  })

  it('an extension nothing hangs off reads "Can be undone" in the history, and the one it replaced says nothing', async () => {
    await call(extend.POST as any, 'POST', `/api/companies/${id}/extend`, id, { as: 'SUPPLIER' })
    const h = (await drawer(id)).body.data.history as any[]
    const extensions = h.filter((r) => r.action === 'COMPANY_EXTENDED')
    expect(extensions).toHaveLength(2)
    expect(extensions[0]).toMatchObject({ undoSays: 'Can be undone', reversible: true })
    expect(extensions[1]).toMatchObject({ undoSays: null, reversible: false })
    expect(h.find((r) => r.action === 'COMPANY_POSITION_REMOVED')).toMatchObject({ undoSays: null })
  })

  it('a company recorded on the list never says it can be undone, because no control deletes a company', async () => {
    const created = ((await drawer(id)).body.data.history as any[]).find((r) => r.action === 'COMPANY_CREATED')
    expect(created).toMatchObject({ undoSays: null, reversible: false })
    const stored = await prisma.automationLog.findFirstOrThrow({ where: { companyId: brightmoor, action: 'COMPANY_CREATED', payload: { path: ['otherCompanyId'], equals: id } } })
    expect(stored.reversible).toBe(false)
  })

  it('once an order hangs off the position, the history says it cannot be undone while work hangs off it, and Undo is refused in the route’s own sentence', async () => {
    await prisma.workOrder.create({ data: { number: 'NW-UNDO-1', issuedById: brightmoor, issuedToId: id, amount: 100, recordedById: brightmoor, title: 'Order to Northwind', startDate: new Date('2026-03-02T00:00:00Z') } as any })
    const h = (await drawer(id)).body.data.history as any[]
    expect(h.find((r) => r.action === 'COMPANY_EXTENDED')).toMatchObject({ undoSays: 'Cannot be undone while work hangs off it', reversible: false })
    const refused = await call(extend.DELETE as any, 'DELETE', `/api/companies/${id}/extend?as=SUPPLIER`, id)
    expect(refused.status).toBe(409)
    expect(refused.body.error.message).toBe('Northwind Staffing stays your supplier while 1 order hangs off it. End or move that work first.')
    expect((await drawer(id)).body.data.positions).toEqual(['SUPPLIER'])
  })
})

describe('A company added with a Kind chosen', () => {
  it('writes its activity row on the adding firm’s own log, where its Activity log and the company’s History read it', async () => {
    const r = await json(await companies.POST(req('POST', '/api/companies', { name: 'Harborline Tech', kind: 'VENDOR', relationship: 'SUPPLIER', domain: 'harborline-tech.example' })))
    expect(r.status).toBe(200)
    const id = r.body.data.company.id
    const row = await prisma.automationLog.findFirstOrThrow({ where: { action: 'COMPANY_CREATED', payload: { path: ['otherCompanyId'], equals: id } } })
    expect(row.companyId).toBe(brightmoor)
    expect(row.reversible).toBe(false)
    expect(await prisma.automationLog.count({ where: { companyId: id, action: 'COMPANY_CREATED' } })).toBe(0)
    const h = (await drawer(id)).body.data.history as any[]
    expect(h.map((x) => x.action)).toContain('COMPANY_CREATED')
    expect(r.body.data.message).toContain('is on your Companies list.')
  })
})

describe('Correcting a company, and a contact’s role', () => {
  it('a correction that does not send the entity type or the domain leaves both as they were', async () => {
    const id = (await json(await companies.POST(req('POST', '/api/companies', { name: 'Quayside Partners', kind: 'UNCLASSIFIED', domain: 'quayside-partners.example', entityType: 'LLC' })))).body.data.company.id
    const r = await call(record.PATCH as any, 'PATCH', `/api/companies/${id}/record`, id, { name: 'Quayside Partners Group' })
    expect(r.status).toBe(200)
    expect(r.body.data.changes).toEqual([{ box: 'name', from: 'Quayside Partners', to: 'Quayside Partners Group' }])
    const c = await prisma.company.findUniqueOrThrow({ where: { id }, select: { entityType: true, website: true } })
    expect(c).toEqual({ entityType: 'LLC', website: 'quayside-partners.example' })
    // An explicit empty box still clears.
    const cleared = await call(record.PATCH as any, 'PATCH', `/api/companies/${id}/record`, id, { name: 'Quayside Partners Group', entityType: '' })
    expect(cleared.body.data.changes).toEqual([{ box: 'entity type', from: 'LLC', to: null }])
  })

  it('a contact’s role made only of spaces is saved as Other, like an empty role', async () => {
    const at = (await prisma.company.findFirstOrThrow({ where: { listedById: brightmoor, name: 'Quayside Partners Group' }, select: { id: true } })).id
    const r = await call(contacts.POST as any, 'POST', '/api/contacts', '', { name: 'Rowan Pike', email: 'rowan@quayside-partners.example', atCompanyId: at, kind: '   ' })
    expect(r.status).toBe(201)
    expect((await prisma.companyContact.findFirstOrThrow({ where: { atCompanyId: at, name: 'Rowan Pike' }, select: { kind: true } })).kind).toBe('OTHER')
  })
})

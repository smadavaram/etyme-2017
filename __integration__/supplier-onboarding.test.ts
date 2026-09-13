import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { GET as listRequests, POST as recommend } from '@/app/api/supplier-requests/route'
import { PATCH as review } from '@/app/api/supplier-requests/[id]/route'
import { GET as decisions } from '@/app/api/decisions/route'
import { GET as suppliers } from '@/app/api/suppliers/route'

/**
 * Nike's hiring manager met a firm at a conference. Procurement, not the
 * hiring manager, makes it a supplier — after the paperwork.
 */

const D = '@demo.etyme.local'
const HIRING = `world-nike-hiring${D}`
const PROCUREMENT = `world-nike-procurement${D}`
const PROGRAMME = `world-nike-programme${D}`
const call = async (fn: any, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))
const it_: Record<string, any> = {}

describe('a supplier is recommended, papered and approved', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
  }, 240_000)

  it('the hiring manager recommends a firm with a reason, and it goes to Procurement, not onto the list', async () => {
    as(HIRING)
    const r = await json(await recommend(req('POST', '/api/supplier-requests', { name: 'Harbor Staffing', contactEmail: 'ops@harborstaffing.com', reason: 'Met at SIA; strong on supply chain planners.' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    it_.id = r.body.data.request.id
    expect(r.body.data.says).toContain('with Procurement')
    const list = await json(await suppliers(req('GET', '/api/suppliers')))
    expect(list.body.data.suppliers.map((s: any) => s.name)).not.toContain('Harbor Staffing')
  })

  it('the seeded desk already holds Vertex Talent with two of four documents in', async () => {
    as(PROCUREMENT)
    const r = await json(await listRequests(req('GET', '/api/supplier-requests')))
    const vertex = r.body.data.requests.find((x: any) => x.name === 'Vertex Talent')
    expect(vertex?.state).toBe('IN_REVIEW')
    expect(vertex?.readiness).toMatchObject({ held: 2, of: 4, ok: false })
  })

  it('the hiring manager cannot approve it — that is Procurement’s call', async () => {
    as(HIRING)
    const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve' })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('NOT_PROCUREMENT')
  })

  it('Procurement finds it on the desk as a decision', async () => {
    as(PROCUREMENT)
    const r = await json(await decisions(req('GET', '/api/decisions')))
    const mine = r.body.data.decisions.find((d: any) => d.type === 'SUPPLIER_REVIEW' && d.entityId === it_.id)
    expect(mine?.title).toBe('Review supplier — Harbor Staffing')
    expect(mine?.subtitle).toContain('0 of 4 documents on file')
  })

  it('approval is refused while the paperwork is missing, in a sentence that names it', async () => {
    as(PROCUREMENT)
    const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve' })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toContain('cannot be approved without a certificate of insurance, a tax form, a D&B report and vendor screening')
  })

  it('the paperwork goes on file one item at a time; a waiver needs a reason', async () => {
    as(PROCUREMENT)
    for (const key of ['INSURANCE', 'TAX_FORM', 'VENDOR_SCREENING']) {
      const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key, state: 'HELD' })
      expect(r.status, JSON.stringify(r.body)).toBe(200)
    }
    const bare = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key: 'DNB_REPORT', state: 'WAIVED' })
    expect(bare.status).toBe(422)
    const waived = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key: 'DNB_REPORT', state: 'WAIVED', note: 'Sole trader; no D&B file exists.' })
    expect(waived.body.data.readiness.ok).toBe(true)
  })

  it('approved: a company, an agreement stub, a register row at approved standing, and the recommender is told', async () => {
    as(PROCUREMENT)
    const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toContain('is a supplier now')
    const list = await json(await suppliers(req('GET', '/api/suppliers')))
    const vertex = list.body.data.suppliers.find((s: any) => s.name === 'Harbor Staffing')
    expect(vertex?.tier).toBe('APPROVED')
    expect(vertex?.agreement).toBe(true)
    const hm = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: HIRING }, select: { id: true } })
    const told = await prisma.notification.findFirst({ where: { personId: hm.id, title: 'Harbor Staffing is approved' } })
    expect(told).not.toBeNull()
  })

  it('nobody approves their own recommendation, whatever else they hold', async () => {
    as(PROGRAMME)
    const r = await json(await recommend(req('POST', '/api/supplier-requests', { name: 'Ridgeline Search', reason: 'Met them at SIA.' })))
    expect(r.status).toBe(201)
    const own = await call(review, 'PATCH', `/api/supplier-requests/${r.body.data.request.id}`, r.body.data.request.id, { action: 'mark', key: 'INSURANCE', state: 'HELD' })
    expect(own.status).toBe(403)
    expect(own.body.error.code).toBe('OWN_RECOMMENDATION')
    as(PROCUREMENT)
    const mine = await json(await listRequests(req('GET', '/api/supplier-requests')))
    expect(mine.body.data.requests.some((x: any) => x.name === 'Ridgeline Search' && x.state === 'RECOMMENDED')).toBe(true)
  })
})

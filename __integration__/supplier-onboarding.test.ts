import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { GET as listRequests, POST as recommend } from '@/app/api/supplier-requests/route'
import { PATCH as review } from '@/app/api/supplier-requests/[id]/route'
import { GET as applyGet, POST as applyPost } from '@/app/api/supplier-apply/[token]/route'
import { GET as decisions } from '@/app/api/decisions/route'
import { GET as suppliers } from '@/app/api/suppliers/route'

/**
 * Nike's hiring manager met a firm at a conference. It walks three
 * desks — the program office, HR, Procurement — while the firm supplies
 * its side through a link of its own; nobody decides their own
 * recommendation and nobody decides twice.
 */

const D = '@demo.etyme.local'
const HIRING = `world-nike-hiring${D}`
const PROGRAMME = `world-nike-programme${D}`
const HR = `world-nike-hr${D}`
const PROCUREMENT = `world-nike-procurement${D}`
const call = async (fn: any, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))
const viaToken = async (fn: any, method: string, token: string, body?: unknown) =>
  json(await fn(req(method, `/api/supplier-apply/${token}`, body), { params: Promise.resolve({ token }) }))
const it_: Record<string, any> = {}

describe('a supplier walks three desks', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
  }, 240_000)

  it('the seeded desk holds Vertex Talent at Procurement, cleared by the program office and HR, with the firm’s side in', async () => {
    as(PROCUREMENT)
    const r = await json(await listRequests(req('GET', '/api/supplier-requests')))
    const vertex = r.body.data.requests.find((x: any) => x.name === 'Vertex Talent')
    expect(vertex?.stage).toBe('PROCUREMENT')
    expect(vertex?.steps.map((s: any) => s.status)).toEqual(['done', 'done', 'now', 'next'])
    expect(vertex?.readiness).toMatchObject({ held: 2, of: 7, ok: false })
    expect(vertex?.mayAct).toBe(true)
  })

  it('the hiring manager recommends a firm, says what it supplies, and it goes to the program office — and the firm gets its link', async () => {
    as(HIRING)
    const r = await json(await recommend(req('POST', '/api/supplier-requests', {
      name: 'Harbor Staffing', contactEmail: 'ops@harborstaffing.com', contactName: 'Lena Ortiz',
      skills: 'Supply chain planners, S&OP', reason: 'Met at SIA; strong on supply chain planners.',
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    it_.id = r.body.data.request.id
    expect(r.body.data.request.stage).toBe('TEAM')
    expect(r.body.data.says).toContain('walks three desks')
    const row = await prisma.supplierRequest.findUniqueOrThrow({ where: { id: it_.id } })
    it_.token = row.token
    expect(row.linkSentAt).not.toBeNull()
    const list = await json(await suppliers(req('GET', '/api/suppliers')))
    expect(list.body.data.suppliers.map((s: any) => s.name)).not.toContain('Harbor Staffing')
  })

  it('the hiring manager cannot decide any desk on it, and Procurement cannot jump the queue', async () => {
    as(HIRING)
    const own = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve' })
    expect(own.status).toBe(403)
    expect(own.body.error.code).toBe('OWN_RECOMMENDATION')
    as(PROCUREMENT)
    const early = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve' })
    expect(early.status).toBe(403)
    expect(early.body.error.code).toBe('NOT_THIS_DESK')
  })

  it('the program office finds it on the desk, and confirms the need', async () => {
    as(PROGRAMME)
    const d = await json(await decisions(req('GET', '/api/decisions')))
    const mine = d.body.data.decisions.find((x: any) => x.type === 'SUPPLIER_REVIEW' && x.entityId === it_.id)
    expect(mine?.title).toBe('Review supplier — Harbor Staffing')
    expect(mine?.subtitle).toContain('Program office desk')
    const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve', note: 'Two planning roles open next quarter.' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toBe('Harbor Staffing cleared Program office and is with HR now.')
  })

  it('meanwhile the firm supplies its side through its link, with nothing to sign up for', async () => {
    const page = await viaToken(applyGet, 'GET', it_.token)
    expect(page.status).toBe(200)
    expect(page.body.data.client).toBe('Nike')
    expect(page.body.data.asks.map((a: any) => a.key)).toEqual(['TAX_FORM', 'INSURANCE', 'BANK', 'EXPERIENCE', 'REFERENCES', 'REVENUE', 'PROPOSAL'])
    const sent = await viaToken(applyPost, 'POST', it_.token, {
      legalName: 'Harbor Staffing LLC', experience: 'Nine years placing planners across CPG.',
      skills: 'S&OP, demand planning',
      bank: { bankName: 'US Bank', accountName: 'Harbor Staffing LLC', last4: '9921' },
      references: [{ name: 'A', company: 'Acme' }, { name: 'B', company: 'Beta' }],
      docs: [{ key: 'TAX_FORM', fileName: 'Harbor-W9.pdf', size: 100 }, { key: 'INSURANCE', fileName: 'Harbor-COI.pdf', size: 100 }],
    })
    expect(sent.status, JSON.stringify(sent.body)).toBe(201)
    expect(sent.body.data.says).toContain('has everything it asked you for')
    expect(sent.body.data.asks.filter((a: any) => a.state === 'PROVIDED').map((a: any) => a.key).sort()).toEqual(['BANK', 'EXPERIENCE', 'INSURANCE', 'REFERENCES', 'TAX_FORM'])
  })

  it('HR reads the skill set and says it fits; the program manager who decided before cannot decide again', async () => {
    as(PROGRAMME)
    const twice = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve' })
    expect(twice.status).toBe(403)
    expect(twice.body.error.code).toBe('DECIDED_BEFORE')
    as(HR)
    const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve', note: 'Planning is what Apps hires for.' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toBe('Harbor Staffing cleared HR and is with Procurement now.')
  })

  it('Procurement is refused until the firm’s side is verified and its own screening is on file, in a sentence that names what', async () => {
    as(PROCUREMENT)
    const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve' })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toContain('the D&B report and vendor screening are still missing')
    expect(r.body.error.message).toContain('were supplied and need verifying')
  })

  it('Procurement verifies what the firm sent, pulls the D&B report, screens, waives with a reason — and approves', async () => {
    as(PROCUREMENT)
    for (const key of ['TAX_FORM', 'INSURANCE', 'BANK', 'EXPERIENCE', 'REFERENCES', 'VENDOR_SCREENING']) {
      const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key, state: 'HELD' })
      expect(r.status, JSON.stringify(r.body)).toBe(200)
    }
    const bare = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key: 'DNB_REPORT', state: 'WAIVED' })
    expect(bare.status).toBe(422)
    const waived = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key: 'DNB_REPORT', state: 'WAIVED', note: 'Sole trader; no D&B file exists.' })
    expect(waived.body.data.readiness.ok).toBe(true)
    const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toContain('is a supplier now')
    const list = await json(await suppliers(req('GET', '/api/suppliers')))
    const harbor = list.body.data.suppliers.find((s: any) => s.name === 'Harbor Staffing')
    expect(harbor?.tier).toBe('APPROVED')
    expect(harbor?.agreement).toBe(true)
    const hm = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: HIRING }, select: { id: true } })
    expect(await prisma.notification.findFirst({ where: { personId: hm.id, title: 'Harbor Staffing is approved' } })).not.toBeNull()
    const done = await viaToken(applyPost, 'POST', it_.token, { legalName: 'x' })
    expect(done.status).toBe(409)
  })
})

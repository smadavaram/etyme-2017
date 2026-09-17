import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { GET as listRequests, POST as recommend } from '@/app/api/supplier-requests/route'
import { PATCH as review } from '@/app/api/supplier-requests/[id]/route'
import { GET as applyGet, POST as applyPost } from '@/app/api/supplier-apply/[token]/route'
import { GET as decisions } from '@/app/api/decisions/route'
import { GET as suppliers } from '@/app/api/suppliers/route'

/**
 * Northbend Athletic's hiring manager met a firm at a conference. It walks four desks
 * — his department lead, Procurement, HR, Finance — while the firm
 * supplies its side through a link of its own; every desk is emailed;
 * nobody decides their own recommendation and nobody decides twice.
 */

const D = '@demo.etyme.local'
const HIRING = `world-nike-hiring${D}`
const PROGRAMME = `world-nike-programme${D}`
const LEAD = `world-nike-vp${D}`
const AP = `world-nike-ap${D}`
const HR = `world-nike-hr${D}`
const PROCUREMENT = `world-nike-procurement${D}`
const call = async (fn: any, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))
const viaToken = async (fn: any, method: string, token: string, body?: unknown) =>
  json(await fn(req(method, `/api/supplier-apply/${token}`, body), { params: Promise.resolve({ token }) }))
const it_: Record<string, any> = {}

describe('a supplier walks four desks', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
  }, 240_000)

  it('the seeded desk holds Veritan Talent with HR, cleared by the department lead and Procurement, the firm’s side in', async () => {
    as(HR)
    const r = await json(await listRequests(req('GET', '/api/supplier-requests')))
    const vertex = r.body.data.requests.find((x: any) => x.name === 'Veritan Talent')
    expect(vertex?.stage).toBe('HR')
    expect(vertex?.steps.map((s: any) => s.status)).toEqual(['done', 'done', 'now', 'next', 'next'])
    expect(vertex?.readiness).toMatchObject({ held: 0, of: 2, ok: false })
    expect(vertex?.mayAct).toBe(true)
  })

  it('the hiring manager recommends a firm, says what it supplies; his department lead is emailed and the firm gets its link', async () => {
    as(HIRING)
    const r = await json(await recommend(req('POST', '/api/supplier-requests', {
      name: 'Harbor Staffing', contactEmail: 'ops@harborstaffing.com', contactName: 'Lena Ortiz',
      skills: 'Supply chain planners, S&OP', reason: 'Met at SIA; strong on supply chain planners.',
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    it_.id = r.body.data.request.id
    expect(r.body.data.request.stage).toBe('LEAD')
    expect(r.body.data.says).toContain('is with your department lead')
    const row = await prisma.supplierRequest.findUniqueOrThrow({ where: { id: it_.id } })
    it_.token = row.token
    expect(row.linkSentAt).not.toBeNull()
    const lead = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: LEAD }, select: { id: true } })
    let told = null
    for (let i = 0; i < 20 && !told; i++) {
      told = await prisma.notification.findFirst({ where: { personId: lead.id, entityId: it_.id, title: 'Supplier recommended — Harbor Staffing' } })
      if (!told) await new Promise((res) => setTimeout(res, 100))
    }
    expect(told?.channel).toBe('EMAIL')
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

  it('the department lead finds it on the desk and confirms the need; the program office, not named as lead, cannot', async () => {
    as(PROGRAMME)
    const pmo = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve' })
    expect(pmo.status).toBe(403)
    as(LEAD)
    const d = await json(await decisions(req('GET', '/api/decisions')))
    const mine = d.body.data.decisions.find((x: any) => x.type === 'SUPPLIER_REVIEW' && x.entityId === it_.id)
    expect(mine?.title).toBe('Review supplier — Harbor Staffing')
    expect(mine?.subtitle).toContain('Department lead desk')
    const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve', note: 'Two planning roles open next quarter.' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toBe('Harbor Staffing cleared Department lead and is with Procurement now.')
  })

  it('meanwhile the firm supplies its side through its link, with nothing to sign up for', async () => {
    const page = await viaToken(applyGet, 'GET', it_.token)
    expect(page.status).toBe(200)
    expect(page.body.data.client).toBe('Northbend Athletic')
    expect(page.body.data.asks.map((a: any) => a.key)).toEqual(['EXPERIENCE', 'REFERENCES', 'REVENUE', 'PROPOSAL', 'INSURANCE', 'TAX_FORM', 'BANK'])
    const sent = await viaToken(applyPost, 'POST', it_.token, {
      legalName: 'Harbor Staffing LLC', experience: 'Nine years placing planners across CPG.',
      skills: 'S&OP, demand planning',
      bank: { bankName: 'US Bank', accountName: 'Harbor Staffing LLC', last4: '9921' },
      references: [{ name: 'A', company: 'Acme' }, { name: 'B', company: 'Beta' }],
      docs: [{ key: 'TAX_FORM', fileName: 'Harbor-W9.pdf', size: 100 }, { key: 'INSURANCE', fileName: 'Harbor-COI.pdf', size: 100 }],
    })
    expect(sent.status, JSON.stringify(sent.body)).toBe(201)
    expect(sent.body.data.says).toContain('has everything it asked you for')
  })

  it('Procurement is refused until its own items are verified, verifies what the firm sent, waives the D&B report with a reason, and qualifies the firm', async () => {
    as(PROCUREMENT)
    const early = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve' })
    expect(early.status).toBe(409)
    expect(early.body.error.message).toContain('the D&B report is still missing')
    expect(early.body.error.message).toContain('past experience and references were supplied and need verifying')
    const notMine = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key: 'TAX_FORM', state: 'HELD' })
    expect(notMine.status).toBe(409)
    expect(notMine.body.error.code).toBe('NOT_YOUR_ITEM')
    for (const key of ['EXPERIENCE', 'REFERENCES']) {
      const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key, state: 'HELD' })
      expect(r.status, JSON.stringify(r.body)).toBe(200)
    }
    const bare = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key: 'DNB_REPORT', state: 'WAIVED' })
    expect(bare.status).toBe(422)
    const waived = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key: 'DNB_REPORT', state: 'WAIVED', note: 'Sole trader; no D&B file exists.' })
    expect(waived.body.data.readiness.ok).toBe(true)
    const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve', note: 'References confirmed by phone.' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toBe('Harbor Staffing cleared Procurement and is with HR now.')
  })

  it('HR verifies the insurance, runs the screening, and clears compliance; the lead who decided before cannot decide again', async () => {
    as(LEAD)
    const twice = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve' })
    expect(twice.status).toBe(403)
    expect(twice.body.error.code).toBe('DECIDED_BEFORE')
    as(HR)
    for (const key of ['INSURANCE', 'VENDOR_SCREENING']) {
      const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key, state: 'HELD' })
      expect(r.status, JSON.stringify(r.body)).toBe(200)
    }
    const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve', note: 'COI current; no sanctions or litigation found.' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toBe('Harbor Staffing cleared HR and is with Finance now.')
  })

  it('Finance verifies the W-9 and the bank details and approves: a company, an agreement stub, a register row at approved standing; the recommender is told; the link closes', async () => {
    as(AP)
    const early = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve' })
    expect(early.status).toBe(409)
    for (const key of ['TAX_FORM', 'BANK']) {
      const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key, state: 'HELD' })
      expect(r.status, JSON.stringify(r.body)).toBe(200)
    }
    const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve', note: 'Bank details match the W-9 legal name.' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toContain('is a supplier now')
    const list = await json(await suppliers(req('GET', '/api/suppliers')))
    const harbor = list.body.data.suppliers.find((s: any) => s.name === 'Harbor Staffing')
    expect(harbor?.tier).toBe('APPROVED')
    expect(harbor?.agreement).toBe(true)
    const hm = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: HIRING }, select: { id: true } })
    let told = null
    for (let i = 0; i < 20 && !told; i++) {
      told = await prisma.notification.findFirst({ where: { personId: hm.id, title: 'Harbor Staffing is approved' } })
      if (!told) await new Promise((res) => setTimeout(res, 100))
    }
    expect(told).not.toBeNull()
    const done = await viaToken(applyPost, 'POST', it_.token, { legalName: 'x' })
    expect(done.status).toBe(409)
  })
})

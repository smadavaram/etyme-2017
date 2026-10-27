import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { GET as listRequests, POST as recommend } from '@/app/api/supplier-requests/route'
import { PATCH as review } from '@/app/api/supplier-requests/[id]/route'
import { POST as attachFile } from '@/app/api/supplier-requests/[id]/file/route'
import { NextRequest } from 'next/server'
import { GET as applyGet, POST as applyPost } from '@/app/api/supplier-apply/[token]/route'
import { GET as decisions } from '@/app/api/decisions/route'
import { GET as suppliers } from '@/app/api/suppliers/route'
import { GET as complianceView } from '@/app/api/compliance/route'
import { GET as openFile } from '@/app/api/documents/[id]/file/route'

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
/** A desk attaching a file, the way the page sends it: multipart, the key and the file. */
const attach = async (id: string, key: string, name: string, words: string) => {
  const form = new FormData()
  form.append('key', key)
  form.append('file', new File([`%PDF-1.4\n% ${words}\n%%EOF\n`], name, { type: 'application/pdf' }))
  const r = new NextRequest(`http://localhost:3000/api/supplier-requests/${id}/file`, { method: 'POST', body: form })
  return json(await attachFile(r, { params: Promise.resolve({ id }) }))
}
const iso = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
/** A small real file, the way the page sends one: its bytes in base64 beside its name. */
const pdf = (words: string) => {
  const bytes = Buffer.from(`%PDF-1.4\n% ${words}\n%%EOF\n`)
  return { size: bytes.byteLength, type: 'application/pdf', content: bytes.toString('base64') }
}

describe('a supplier walks four desks', () => {
  beforeAll(async () => {
    await freshWorld()
  }, 240_000)

  it('the seeded desk holds Veritan Talent with HR, cleared by the department lead and Procurement, the firm’s side in', async () => {
    as(HR)
    const r = await json(await listRequests(req('GET', '/api/supplier-requests')))
    const vertex = r.body.data.requests.find((x: any) => x.name === 'Veritan Talent')
    expect(vertex?.stage).toBe('HR')
    expect(vertex?.steps.map((s: any) => s.status)).toEqual(['done', 'done', 'now', 'next', 'next'])
    expect(vertex?.readiness).toMatchObject({ held: 0, of: 3, ok: false })
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
    expect(mine?.subtitle).toContain('with Department lead')
    const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve', note: 'Two planning roles open next quarter.' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toBe('Harbor Staffing cleared Department lead and is with Procurement now.')
  })

  it('meanwhile the firm supplies its side through its link, with nothing to sign up for', async () => {
    const page = await viaToken(applyGet, 'GET', it_.token)
    expect(page.status).toBe(200)
    expect(page.body.data.client).toBe('Northbend Athletic')
    // Northbend's own purchase orders require general liability and
    // workers' comp cover, a certificate of good standing and a
    // non-disclosure agreement of every supplier. The cover is the
    // insurance item the walk already asks for; the good standing is
    // asked for by name and says whose order asked; the NDA is the
    // desk's to paper and never appears on the firm's page.
    expect(page.body.data.asks.map((a: any) => a.key)).toEqual(['EXPERIENCE', 'REFERENCES', 'REVENUE', 'PROPOSAL', 'INSURANCE', 'GOOD_STANDING', 'TAX_FORM', 'BANK'])
    const standing = page.body.data.asks.find((a: any) => a.key === 'GOOD_STANDING')
    expect(standing.label).toBe('Certificate of good standing')
    expect(standing.says).toBe('Required by Northbend Athletic\u2019s orders.')
    expect(page.body.data.asks.find((a: any) => a.key === 'INSURANCE').says).toBe('Required by Northbend Athletic\u2019s orders.')
    expect(page.body.data.asks.map((a: any) => a.key)).not.toContain('NDA')
    const sent = await viaToken(applyPost, 'POST', it_.token, {
      legalName: 'Harbor Staffing LLC', experience: 'Nine years placing planners across CPG.',
      skills: 'S&OP, demand planning',
      bank: { bankName: 'US Bank', accountName: 'Harbor Staffing LLC', last4: '9921' },
      references: [{ name: 'A', company: 'Acme' }, { name: 'B', company: 'Beta' }],
      docs: [
        { key: 'TAX_FORM', fileName: 'Harbor-W9.pdf', ...pdf('Harbor Staffing W-9') },
        // The two dates printed on the certificate, typed by the firm
        // that holds it. Received, never verified — HR still decides.
        { key: 'INSURANCE', fileName: 'Harbor-COI.pdf', ...pdf('Harbor Staffing certificate of insurance'), validFrom: iso(-30), validUntil: iso(335) },
      ],
    })
    expect(sent.status, JSON.stringify(sent.body)).toBe(201)
    // The one thing it did not send is the one the client's orders ask
    // for and the old checklist never mentioned.
    expect(sent.body.data.says).toContain('Sent to Northbend Athletic. They will be in touch.')
    expect(sent.body.data.says).toContain('still needs: Certificate of good standing')
    const again = await viaToken(applyPost, 'POST', it_.token, {
      docs: [{ key: 'GOOD_STANDING', fileName: 'Harbor-good-standing-2026.pdf', ...pdf('Harbor Staffing good standing'), validFrom: iso(-60), validUntil: iso(305) }],
    })
    expect(again.body.data.says).toBe('Sent to Northbend Athletic. They will be in touch.')
  })

  it('a file the firm sends through its link is kept whole, HR opens it through the one file door, and a name with no file is refused', async () => {
    const row = await prisma.supplierRequest.findUniqueOrThrow({ where: { id: it_.id } })
    const cover = (row.checklist as any[]).find((i) => i.key === 'INSURANCE')
    expect(cover.fileUrl, 'the item points at the kept file').toMatch(/^\/api\/documents\/[^/]+\/file$/)
    const id = cover.fileUrl.split('/')[3]
    const kept = await prisma.docFile.findUniqueOrThrow({ where: { docInstanceId: id } })
    expect(kept.fileName).toBe('Harbor-COI.pdf')
    expect(kept.bytes.toString()).toContain('Harbor Staffing certificate of insurance')
    // The client's paperwork team reads it; the paper is the client's.
    as(HR)
    const opened = await openFile(req('GET', cover.fileUrl), { params: Promise.resolve({ id }) })
    expect(opened.status).toBe(200)
    expect(Buffer.from(await opened.arrayBuffer()).toString()).toContain('Harbor Staffing certificate of insurance')
    // A file's name with nothing behind it is not an answer.
    const bare = await viaToken(applyPost, 'POST', it_.token, { docs: [{ key: 'PROPOSAL', fileName: 'Harbor-proposal.pdf', size: 100 }] })
    expect(bare.status).toBe(422)
    expect(bare.body.error.message).toBe('Harbor-proposal.pdf did not arrive with the file itself. Pick it again and send it.')
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

  it('a certificate verified with no dates is refused in a sentence asking for them, and the item stays unverified', async () => {
    // Veritan Talent is the seeded firm sitting on the HR desk, and its
    // link never carried the two dates — which is the ordinary case for
    // a firm that uploaded a PDF and nothing else. Harbor Staffing typed
    // them, so HR confirming its certificate is a different story and is
    // the one below.
    as(HR)
    const list = await json(await listRequests(req('GET', '/api/supplier-requests')))
    const veritan = list.body.data.requests.find((x: any) => x.name === 'Veritan Talent')
    expect(veritan?.stage, 'Veritan is on the HR desk').toBe('HR')
    expect(veritan.checklist.find((i: any) => i.key === 'INSURANCE').validFrom ?? null).toBeNull()

    const bare = await call(review, 'PATCH', `/api/supplier-requests/${veritan.id}`, veritan.id, { action: 'mark', key: 'INSURANCE', state: 'HELD' })
    expect(bare.status, JSON.stringify(bare.body)).toBe(422)
    expect(bare.body.error.code).toBe('NEEDS_DATES')
    expect(bare.body.error.message).toContain('the day it starts and the day it runs out')

    const after = await json(await listRequests(req('GET', '/api/supplier-requests')))
    const still = after.body.data.requests.find((x: any) => x.name === 'Veritan Talent')
    expect(still.checklist.find((i: any) => i.key === 'INSURANCE').state, 'still unverified').not.toBe('HELD')
  })

  it('a certificate the firm dated on its own link is confirmed by the desk without retyping the dates', async () => {
    as(HR)
    const list = await json(await listRequests(req('GET', '/api/supplier-requests')))
    const harbor = list.body.data.requests.find((x: any) => x.name === 'Harbor Staffing')
    const item = harbor.checklist.find((i: any) => i.key === 'INSURANCE')
    // What the firm typed off its own certificate, received and not yet
    // verified: the desk sees it in the boxes rather than a blank form.
    expect(item.state).toBe('PROVIDED')
    expect(item.validFrom).toBe(iso(-30))
    expect(item.validUntil).toBe(iso(335))
  })

  it('HR cannot clear compliance until the certificate of good standing the client\u2019s orders require is verified', async () => {
    as(HR)
    const insured = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, {
      action: 'mark', key: 'INSURANCE', state: 'HELD', validFrom: iso(-30), validUntil: iso(335),
    })
    expect(insured.status, JSON.stringify(insured.body)).toBe(200)
    // The firm is not a company on the register yet — Finance writes that
    // row — so the dates are held and the sentence says when they land.
    expect(insured.body.data.says).toContain('the moment Finance approves the firm')

    const screened = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key: 'VENDOR_SCREENING', state: 'HELD' })
    expect(screened.status, JSON.stringify(screened.body)).toBe(200)
    const early = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve' })
    expect(early.status).toBe(409)
    expect(early.body.error.message).toContain('the certificate of good standing was supplied and needs verifying')
  })

  it('the checklist HR reads names the client\u2019s own order beside the item it asked for', async () => {
    as(HR)
    const r = await json(await listRequests(req('GET', '/api/supplier-requests')))
    const harbor = r.body.data.requests.find((x: any) => x.name === 'Harbor Staffing')
    const item = harbor.checklist.find((i: any) => i.key === 'GOOD_STANDING')
    expect(item).toMatchObject({ desk: 'HR', required: true, state: 'PROVIDED' })
    expect(item.says).toBe('Required by Northbend Athletic\u2019s orders.')
    // The NDA the order also requires is on the list, the desk's to
    // paper, and does not hold the firm up.
    expect(harbor.checklist.find((i: any) => i.key === 'NDA')).toMatchObject({ desk: 'HR', by: 'DESK', required: false })
  })

  it('an agreement cannot be marked on file without the signed copy; HR attaches the copy both firms signed and then marks it', async () => {
    as(HR)
    for (const key of ['AGREEMENT', 'NDA']) {
      const bare = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key, state: 'HELD' })
      expect(bare.status).toBe(422)
      expect(bare.body.error.code).toBe('NEEDS_SIGNED_COPY')
      expect(bare.body.error.message).toContain('is on file only with the copy both firms signed. Attach the signed copy, then mark it on file.')
    }
    const attached = await attach(it_.id, 'NDA', 'Harbor-NDA-signed.pdf', 'NDA between Northbend Athletic and Harbor Staffing, signed by both')
    expect(attached.status, JSON.stringify(attached.body)).toBe(201)
    const nda = attached.body.data.request.checklist.find((i: any) => i.key === 'NDA')
    expect(nda).toMatchObject({ state: 'PROVIDED', fileName: 'Harbor-NDA-signed.pdf' })
    expect(nda.fileUrl).toMatch(/^\/api\/documents\/[^/]+\/file$/)
    const held = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key: 'NDA', state: 'HELD' })
    expect(held.status, JSON.stringify(held.body)).toBe(200)
    expect(held.body.data.request.checklist.find((i: any) => i.key === 'NDA')).toMatchObject({ state: 'HELD', fileName: 'Harbor-NDA-signed.pdf' })
  })

  it('only the step the firm is on may attach a file to its items; Finance cannot attach to HR’s agreement', async () => {
    as(AP)
    const r = await attach(it_.id, 'AGREEMENT', 'Harbor-MSA.pdf', 'MSA')
    expect(r.status).toBe(403)
  })

  it('HR verifies the insurance and the good standing, runs the screening, and clears compliance; the lead who decided before cannot decide again', async () => {
    as(LEAD)
    const twice = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve' })
    expect(twice.status).toBe(403)
    expect(twice.body.error.code).toBe('DECIDED_BEFORE')
    as(HR)
    const r0 = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, {
      action: 'mark', key: 'GOOD_STANDING', state: 'HELD', validFrom: iso(-60), validUntil: iso(305),
    })
    expect(r0.status, JSON.stringify(r0.body)).toBe(200)
    const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve', note: 'COI current; good standing current; no sanctions or litigation found.' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toBe('Harbor Staffing cleared HR and is with Finance now.')
  })

  it('Finance verifies the W-9 and the bank details and approves: a company, an agreement stub, a register row at approved standing; the recommender is told; the link closes', async () => {
    as(AP)
    const early = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve' })
    expect(early.status).toBe(409)
    // The W-9 is a reissued form: verified with the edition printed on it.
    const noEdition = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key: 'TAX_FORM', state: 'HELD' })
    expect(noEdition.status).toBe(422)
    expect(noEdition.body.error).toMatchObject({ code: 'NEEDS_EDITION', field: 'edition' })
    expect(noEdition.body.error.message).toContain('Say which edition of the tax form was signed before you verify it.')
    const w9 = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key: 'TAX_FORM', state: 'HELD', edition: 'Rev. March 2024' })
    expect(w9.status, JSON.stringify(w9.body)).toBe(200)
    expect(w9.body.data.request.checklist.find((i: any) => i.key === 'TAX_FORM')).toMatchObject({ state: 'HELD', edition: 'Rev. March 2024' })
    const bank = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'mark', key: 'BANK', state: 'HELD' })
    expect(bank.status, JSON.stringify(bank.body)).toBe(200)
    const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.id}`, it_.id, { action: 'approve', note: 'Bank details match the W-9 legal name.' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toContain('is a supplier now')
    // Four rows: general liability and workers' comp off the one
    // insurance item, the certificate of good standing, and the W-9 with
    // the edition Finance read off it (2026-10-26).
    expect(r.body.data.evidence.recorded).toBe(4)
    expect(r.body.data.evidence.undated).toEqual([])
    expect(r.body.data.says).toContain('on their compliance record')
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
    it_.claim = r.body.data.claim
  })

  it('an approved supplier is told, with a link, that it can take its account', async () => {
    // Finance's yes wrote a claim and the firm's contact was emailed it.
    const invite = await prisma.supplierInvite.findFirstOrThrow({ where: { email: 'ops@harborstaffing.com' }, select: { token: true, state: true } })
    expect(it_.claim?.to).toBe('ops@harborstaffing.com')
    expect(it_.claim?.url).toMatch(new RegExp(`/claim/${invite.token}$`))
    expect(['SENT', 'NOT_CONFIGURED']).toContain(it_.claim?.state)
    // The apply link, opened again, says the same sentence with the same link.
    const page = await viaToken(applyGet, 'GET', it_.token)
    expect(page.body.data.decided).toBe(true)
    expect(page.body.data.claim.says).toBe('Northbend Athletic approved Harbor Staffing as a supplier. Take your account:')
    expect(page.body.data.claim.url).toBe(it_.claim.url)
  })
})

/**
 * "Ensure the loop of documents never cracks between parties."
 *
 * The register is where a client sees the crack before somebody starts:
 * every firm it buys from, against what its own purchase orders require
 * of a supplier, read through `lib/document-requirements`.
 */
describe('the register names what each supplier owes on this client\u2019s own orders', () => {
  it('a supplier\u2019s row names the documents it owes on this client\u2019s orders and does not hold', async () => {
    as(PROGRAMME)
    const r = await json(await suppliers(req('GET', '/api/suppliers')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)

    // Northbend's orders require general liability and workers' comp
    // cover, a certificate of good standing, an NDA and the agreement
    // itself of every supplier. Brightmoor's cover is on file and its
    // agreement is signed; nobody has ever filed a good standing.
    const brightmoor = r.body.data.suppliers.find((s: any) => s.name === 'Brightmoor Staffing')
    expect(brightmoor.owes).toEqual(['Certificate of good standing'])
    expect(brightmoor.agreement).toBe(true)

    // And every firm on the register is asked the same question, so the
    // page cannot say one supplier owes a certificate and the next owes
    // nothing under the same client's orders.
    for (const s of r.body.data.suppliers.filter((x: any) => !x.name.startsWith('Harbor'))) {
      expect(s.owes, s.name).toContain('Certificate of good standing')
    }
  })

  it('a document that is on file is not named as owed, and one nothing here can evidence is counted rather than claimed', async () => {
    as(PROGRAMME)
    const r = await json(await suppliers(req('GET', '/api/suppliers')))
    const brightmoor = r.body.data.suppliers.find((s: any) => s.name === 'Brightmoor Staffing')

    const cover = await prisma.verification.findMany({
      where: { company: { name: 'Brightmoor Staffing' }, type: { in: ['INSURANCE_GL', 'INSURANCE_WC'] }, status: 'CLEAR' },
      select: { type: true },
    })
    expect(cover.map((c) => c.type).sort()).toEqual(['INSURANCE_GL', 'INSURANCE_WC'])
    expect(brightmoor.owes).not.toContain('Certificate of general liability insurance')

    // The non-disclosure agreement Northbend requires of every supplier
    // is signed paper, not a verification, so nothing here could say
    // whether it is held. It is counted, never reported as missing.
    expect(brightmoor.owesUnknown).toBe(1)
  })

  it('the firm approved a moment ago with no agreement signed owes the agreement, by name', async () => {
    as(PROGRAMME)
    const r = await json(await suppliers(req('GET', '/api/suppliers')))
    const harbor = r.body.data.suppliers.find((s: any) => s.name === 'Harbor Staffing')
    // Finance's yes wrote the stub; nobody signed it, and the register
    // says so rather than showing an agreement on file.
    expect(harbor.owes).toContain('Master service agreement')
    expect(harbor.signedAt).toBeNull()
  })
})

/**
 * "Ensure the loop of documents never cracks between parties."
 *
 * HR clearing a certificate of insurance and the compliance page going
 * on saying the firm has no cover were two records, and only one of them
 * is what every gate in the product reads. This is the walk-out the
 * other way: what four desks verified, on the firm's own record, the day
 * it becomes a supplier.
 */
describe('what the desks verified is on the supplier\u2019s compliance record', () => {
  it('a firm approved today is insured on the compliance page tomorrow, from the certificate HR verified on the way in', async () => {
    const harbor = await prisma.company.findFirstOrThrow({ where: { name: 'Harbor Staffing' }, select: { id: true } })
    const rows = await prisma.verification.findMany({
      where: { companyId: harbor.id },
      select: { type: true, status: true, validFrom: true, expiresAt: true, verifiedById: true, result: true, formEdition: true },
    })
    expect(rows.map((v) => v.type).sort()).toEqual(['GOOD_STANDING', 'INSURANCE_GL', 'INSURANCE_WC', 'W9'])
    // The W-9 has no validity window: it is on the record with the
    // edition printed on it, and no dates for the watch to chase.
    const w9 = rows.find((v) => v.type === 'W9')!
    expect(w9).toMatchObject({ status: 'CLEAR', formEdition: 'Rev. March 2024', validFrom: null, expiresAt: null })
    for (const v of rows.filter((x) => x.type !== 'W9')) {
      expect(v.status).toBe('CLEAR')
      // The two dates are what make it a verification rather than a row
      // that passes every check until somebody audits it.
      expect(v.validFrom, v.type).toBeTruthy()
      expect(v.expiresAt!.getTime(), v.type).toBeGreaterThan(Date.now())
      expect(v.verifiedById, 'a person stands behind it').toBeTruthy()
      expect(JSON.stringify(v.result)).toContain('Verified at supplier onboarding')
    }

    // And the client's own compliance page reads it, which is the whole
    // point: it is the same table every gate in the product asks.
    as(PROGRAMME)
    const page = await json(await complianceView(req('GET', '/api/compliance')))
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    const row = page.body.data.verifications.companies.find((c: any) => c.companyId === harbor.id)
    if (row) expect(row.cover.outcome, row.cover.says).not.toBe('BLOCK')
  })

  it('the register stops saying the firm owes the cover its desks just verified', async () => {
    as(PROGRAMME)
    const r = await json(await suppliers(req('GET', '/api/suppliers')))
    const harbor = r.body.data.suppliers.find((s: any) => s.name === 'Harbor Staffing')
    expect(harbor.owes).not.toContain('Certificate of general liability insurance')
    expect(harbor.owes).not.toContain('Certificate of good standing')
    // The agreement stub nobody signed is still owed, and still named.
    expect(harbor.owes).toContain('Master service agreement')
  })
})

/**
 * "Background check is a verdict a screening company renders, not a
 * document a desk can read the dates off." — the founder, 2026-09-22.
 *
 * `lib/onboarding-evidence` refuses to write a compliance record for
 * one, and the refusal was invisible: neither `ok` nor `needsDates`, so
 * the route surfaced nothing. A desk marked a screening report verified,
 * the tick went green, nothing was written anywhere, and the desk was
 * told nothing at all. A silent refusal on a compliance screen leaves
 * the desk more wrong than the gap it closed.
 */
describe('a desk that verifies somebody else\u2019s verdict is told nothing was recorded', () => {
  beforeAll(async () => {
    // This client's own orders ask its suppliers for a screening report.
    // The client may ask for anything; what it may not do is have its
    // own HR desk render the answer.
    const client = await prisma.company.findFirstOrThrow({ where: { name: 'Northbend Athletic' }, select: { id: true } })
    const order = await prisma.workOrder.findFirstOrThrow({ where: { issuedById: client.id }, select: { id: true } })
    // The client's orders already ask for a screening report on the
    // worker; this one asks the firm itself to hold one before it may
    // trade, which is what puts the item on the supplier walk.
    const asked = await prisma.documentRequirement.updateMany({
      where: { workOrderId: order.id, documentTypeKey: 'BACKGROUND_CHECK' },
      data: { owedBy: 'SUPPLIER', required: true },
    })
    expect(asked.count).toBe(1)
    as(HIRING)
    const r = await json(await recommend(req('POST', '/api/supplier-requests', {
      name: 'Ridgeline Staffing', contactEmail: 'ops@ridgelinestaffing.com', contactName: 'Dana Voss',
      skills: 'Warehouse supervisors', reason: 'Strong on warehouse supervisors at short notice.',
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    it_.rid = r.body.data.request.id

    as(LEAD)
    expect((await call(review, 'PATCH', `/api/supplier-requests/${it_.rid}`, it_.rid, { action: 'approve' })).status).toBe(200)
    as(PROCUREMENT)
    for (const key of ['EXPERIENCE', 'REFERENCES', 'DNB_REPORT']) {
      const m = await call(review, 'PATCH', `/api/supplier-requests/${it_.rid}`, it_.rid, { action: 'mark', key, state: 'HELD' })
      expect(m.status, JSON.stringify(m.body)).toBe(200)
    }
    expect((await call(review, 'PATCH', `/api/supplier-requests/${it_.rid}`, it_.rid, { action: 'approve' })).status).toBe(200)
  }, 120_000)

  it('a desk that marks a screening report verified is told nothing was recorded, and why', async () => {
    as(HR)
    const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.rid}`, it_.rid, {
      action: 'mark', key: 'BACKGROUND_CHECK', state: 'HELD', note: 'Sterling report received from the firm.',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    // Not an error, and not silence either.
    expect(r.body.data.recorded).not.toBeNull()
    expect(r.body.data.recorded.onRecord).toBe(false)
    expect(r.body.data.recorded.written).toBe(0)
    expect(r.body.data.recorded.says).toContain('a verdict a screening company renders')
    expect(r.body.data.recorded.says).toContain('nothing goes on the compliance record from here')
    // And whose it is, so the desk leaves with somebody to ask.
    expect(r.body.data.recorded.says).toContain('A screening company runs this one')
    expect(r.body.data.says).toContain('nothing goes on the compliance record from here')
  })

  it('the note and the file the desk was shown stay on the checklist, because that is the honest record of what the firm sent', async () => {
    as(HR)
    const r = await json(await listRequests(req('GET', '/api/supplier-requests')))
    const ridge = r.body.data.requests.find((x: any) => x.name === 'Ridgeline Staffing')
    const item = ridge.checklist.find((i: any) => i.key === 'BACKGROUND_CHECK')
    expect(item.state).toBe('HELD')
    expect(item.note).toBe('Sterling report received from the firm.')
    expect(item.says).toBe('Required by Northbend Athletic\u2019s orders.')
    // Beside the item, where the desk is looking — every time it reads
    // the list, not once in a banner it scrolled past.
    expect(item.evidence.onRecord).toBe(false)
    expect(item.evidence.renders).toBe('PROVIDER')
    expect(item.evidence.says).toContain('Your note and the file stay on the checklist')
    // A certificate the same desk verifies properly says nothing extra.
    const insured = await call(review, 'PATCH', `/api/supplier-requests/${it_.rid}`, it_.rid, {
      action: 'mark', key: 'INSURANCE', state: 'HELD', validFrom: iso(-30), validUntil: iso(335),
    })
    expect(insured.status, JSON.stringify(insured.body)).toBe(200)
    expect(insured.body.data.recorded.onRecord).toBe(true)
  })

  it('an approval says which items it did not put on the compliance record, and whose opinion each of them is', async () => {
    as(HR)
    for (const [key, dates] of [['GOOD_STANDING', { validFrom: iso(-60), validUntil: iso(305) }], ['VENDOR_SCREENING', {}]] as const) {
      const m = await call(review, 'PATCH', `/api/supplier-requests/${it_.rid}`, it_.rid, { action: 'mark', key, state: 'HELD', ...dates })
      expect(m.status, JSON.stringify(m.body)).toBe(200)
    }
    expect((await call(review, 'PATCH', `/api/supplier-requests/${it_.rid}`, it_.rid, { action: 'approve', note: 'Insured, in good standing, screened.' })).status).toBe(200)

    as(AP)
    for (const key of ['TAX_FORM', 'BANK']) {
      expect((await call(review, 'PATCH', `/api/supplier-requests/${it_.rid}`, it_.rid, { action: 'mark', key, state: 'HELD', edition: 'Rev. March 2024' })).status).toBe(200)
    }
    const r = await call(review, 'PATCH', `/api/supplier-requests/${it_.rid}`, it_.rid, { action: 'approve', note: 'Bank details match the W-9.' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    // The three certificates its desks verified are on the record, and
    // the W-9 with its edition.
    expect(r.body.data.evidence.recorded).toBe(4)
    // And the one they could not is named, in full, with the party whose
    // verdict it would take.
    expect(r.body.data.evidence.notRecorded.map((n: any) => n.key)).toEqual(['BACKGROUND_CHECK'])
    expect(r.body.data.says).toContain('not on the compliance record')
    expect(r.body.data.says).toContain('A screening company runs this one')

    // Nothing was written, which is the point of the refusal.
    const supplier = r.body.data.supplier
    expect(await prisma.verification.count({ where: { companyId: supplier.id, type: 'BACKGROUND_CHECK' } })).toBe(0)
    expect(await prisma.verification.count({ where: { companyId: supplier.id } })).toBe(4)
  })
})


/**
 * A seeded world may only hold verdicts a desk could have reached.
 *
 * The release walk, 2026-09-22, reported the demo teaching a lie: a
 * certificate of insurance on the compliance record that the desk's own
 * door would refuse today. The specific report was off — Veritan's
 * certificate is seeded PROVIDED, which is HR's work still to do, and
 * exactly what the report asked for. The class was real all the same,
 * one layer down.
 *
 * `lib/onboarding-evidence` is the only door in the product that puts a
 * certificate on a compliance record, and it insists on the two dates
 * printed on the certificate: cover that starts next month covers nobody
 * starting this week, and a row filed with no expiry passes every check
 * until the day somebody audits it. Thirteen of the nineteen seeded
 * company certificates carried no `validFrom`. Every reader falls back
 * to `issuedAt`, so nothing computed a wrong answer — what was wrong was
 * a demo world shaped in a way the product will not accept, which is how
 * a real refusal stays hidden until a paying client finds it.
 *
 * Replayed through the door rather than asserted against a column, so
 * the rule cannot drift: what the desk saw, on the day it saw it.
 */
describe('every certificate in the seeded world is one a desk could have written through its own door', () => {
  beforeAll(async () => {
    await seedWorld()
  }, 240_000)

  it('every certificate a company holds carries the day it starts and the day it runs out, as its own desk would have had to type them', async () => {
    const { verificationFromChecklistItem } = await import('@/lib/onboarding-evidence')
    const { typeByKey } = await import('@/lib/document-type')

    const rows = await prisma.verification.findMany({
      where: { NOT: { companyId: null } },
      select: {
        type: true, validFrom: true, expiresAt: true, verifiedAt: true, issuedAt: true,
        company: { select: { name: true } },
      },
    })
    expect(rows.length, 'no company in the seeded world holds a certificate at all').toBeGreaterThan(10)

    const refused: string[] = []
    for (const r of rows) {
      const verdict = verificationFromChecklistItem(
        {
          key: r.type,
          label: typeByKey(r.type)?.label ?? r.type,
          state: 'HELD',
          answers: [r.type],
          validFrom: r.validFrom,
          validUntil: r.expiresAt,
        },
        'a-firm-on-the-register',
        // The day the desk looked at it. A certificate verified in March
        // and out of date by August is an ordinary fact and not a seed
        // bug; one that was already dead the day somebody cleared it is.
        { at: r.verifiedAt ?? r.issuedAt ?? new Date() }
      )
      if (!verdict.ok) refused.push(`${r.company!.name} — ${r.type}: ${verdict.says}`)
    }

    expect(refused, refused.join('\n')).toEqual([])
  }, 120_000)
})

/**
 * The release walk of 2026-10-27, on a client with one person.
 *
 * Brackenridge Tools signed up with one Owner, Ruth, who recommended
 * Quarrybrook Staffing and was told to "invite a second person". She
 * invited a Procurement Lead, and he was told the same. A desk nobody
 * named falls back and never refuses; the recommender never decides.
 */
describe('a client with one person, and a firm applying to its second client', () => {
  const RUTH = 'ruth@brackenridge-tools.example'
  const IAN = 'ian@brackenridge-tools.example'
  const AMARA = 'amara@brackenridge-tools.example'
  const HARBOR_OPS = 'ops@harborstaffing.com'
  const b: Record<string, any> = {}
  const seat = async (email: string, name: string, companyId: string, role: string) => {
    const person = await prisma.person.upsert({ where: { primaryEmail: email }, update: {}, create: { primaryEmail: email, name } })
    const r = await prisma.role.findFirstOrThrow({ where: { companyId, name: role } })
    await prisma.context.create({ data: { personId: person.id, companyId, roleId: r.id, type: 'EMPLOYEE' } })
    return person
  }
  const quarry = async () => (await json(await listRequests(req('GET', '/api/supplier-requests')))).body.data.requests.find((x: any) => x.name === 'Quarrybrook Staffing')

  beforeAll(async () => {
    const { createCompany } = await import('@/lib/company-create')
    const ruth = await prisma.person.upsert({ where: { primaryEmail: RUTH }, update: {}, create: { primaryEmail: RUTH, name: 'Ruth Okonjo' } })
    const made = await createCompany({
      name: 'Brackenridge Tools', kind: 'CLIENT', slug: 'brackenridge-tools-walk', domain: null,
      byPersonId: ruth.id, seatAsOwner: true, claimDomain: false, startsSetup: true,
    })
    b.companyId = made.company.id
  })

  it('a client with one person is told which role to invite to approve a supplier, and that person can decide the moment they are seated', async () => {
    as(RUTH)
    const r = await json(await recommend(req('POST', '/api/supplier-requests', {
      name: 'Quarrybrook Staffing', contactEmail: 'ops@quarrybrook.example', contactName: 'Theo Marsh',
      skills: 'Machinists, CNC operators', reason: 'They staffed our Dayton line before.',
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    b.requestId = r.body.data.request.id
    const alone = await quarry()
    expect(alone.mayAct).toBe(false)
    expect(alone.whyNot).toContain('Invite somebody as Program Manager or Approver')
    expect(alone.whyNot).toContain('The person who recommended a firm cannot approve it')
    expect(alone.whyNot).not.toContain('a second person')

    // A Procurement Lead invited first is told whom to invite, not "a second person".
    await seat(IAN, 'Ian Doyle', b.companyId, 'Procurement Lead')
    as(IAN)
    const ian = await quarry()
    expect(ian.mayAct).toBe(false)
    expect(ian.whyNot).toContain('Invite somebody as Program Manager or Approver')

    // The Approver she invites decides on arrival: on his queue, and his yes moves it on.
    await seat(AMARA, 'Amara Bello', b.companyId, 'Approver')
    as(AMARA)
    const amara = await quarry()
    expect(amara.mayAct, amara.whyNot).toBe(true)
    const queue = await json(await decisions(req('GET', '/api/decisions')))
    expect(queue.body.data.decisions.some((d: any) => d.type === 'SUPPLIER_REVIEW' && d.entityId === b.requestId)).toBe(true)
    const yes = await call(review, 'PATCH', `/api/supplier-requests/${b.requestId}`, b.requestId, { action: 'approve', note: 'We need a second machining supplier.' })
    expect(yes.status, JSON.stringify(yes.body)).toBe(200)
    expect(yes.body.data.request.stage).toBe('PROCUREMENT')
  })

  it('the chip and the heading on a pending supplier name the same role', async () => {
    as(RUTH)
    const r = await json(await recommend(req('POST', '/api/supplier-requests', {
      name: 'Lathe & Line Staffing', contactEmail: 'hello@latheline.example', skills: 'Toolmakers', reason: 'A second bid for the tool room.',
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const list = (await json(await listRequests(req('GET', '/api/supplier-requests')))).body.data.requests
    const row = list.find((x: any) => x.name === 'Lathe & Line Staffing')
    const now = row.steps.find((s: any) => s.status === 'now')
    expect(row.stageWord).toBe('Program manager')
    expect(now.word).toBe(row.stageWord)
  })

  it('a supplier applying to a second client finds its papers and references filled from the first, and re-sends them in one click', async () => {
    // Harbor Staffing applied to Northbend Athletic above and was approved.
    const northbend = await prisma.supplierRequest.findFirstOrThrow({ where: { name: 'Harbor Staffing', contactEmail: HARBOR_OPS, supplierCompanyId: { not: null } } })
    // Lena takes Harbor's account, as the claim link does: the roles of its kind, and her seat.
    const { ensureDefaultRoles } = await import('@/lib/company-roles')
    await ensureDefaultRoles(northbend.supplierCompanyId!, 'VENDOR')
    await seat(HARBOR_OPS, 'Lena Ortiz', northbend.supplierCompanyId!, 'Owner')
    as(RUTH)
    const r = await json(await recommend(req('POST', '/api/supplier-requests', {
      name: 'Harbor Staffing', contactEmail: HARBOR_OPS, contactName: 'Lena Ortiz', skills: 'Planners', reason: 'Northbend speaks well of them.',
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const second = await prisma.supplierRequest.findUniqueOrThrow({ where: { id: r.body.data.request.id } })

    // The client's own desk opening the link sees nothing sent to another client.
    const asClient = await viaToken(applyGet, 'GET', second.token)
    expect(asClient.body.data.prefill.signedInAtFirm).toBe(false)
    expect(asClient.body.data.prefill.sentBefore).toEqual([])
    expect(asClient.body.data.prefill.references).toEqual([])
    expect(asClient.body.data.prefill.skills).toBe('Planners')
    const refused = await viaToken(applyPost, 'POST', second.token, { reuse: [{ requestId: northbend.id, key: 'TAX_FORM' }] })
    expect(refused.status).toBe(403)

    // Harbor, signed in, finds its papers and references from Northbend.
    as(HARBOR_OPS)
    const page = await viaToken(applyGet, 'GET', second.token)
    const p = page.body.data.prefill
    expect(p.signedInAtFirm).toBe(true)
    expect(p.legalName).toBe('Harbor Staffing')
    expect(p.sentBefore.map((s: any) => s.key).sort()).toEqual(['GOOD_STANDING', 'INSURANCE', 'TAX_FORM'])
    expect(p.sentBefore.every((s: any) => s.says.startsWith('Sent before to Northbend Athletic on '))).toBe(true)
    expect(p.references.map((x: any) => x.name)).toEqual(['A', 'B'])
    expect(p.bank.last4).toBe('9921')

    // One click: every paper sent again, the bytes copied onto Brackenridge's own paper.
    const sent = await viaToken(applyPost, 'POST', second.token, {
      reuse: p.sentBefore.map((s: any) => ({ requestId: s.requestId, key: s.key })),
      references: p.references,
    })
    expect(sent.status, JSON.stringify(sent.body)).toBe(201)
    const after = await prisma.supplierRequest.findUniqueOrThrow({ where: { id: second.id } })
    const w9 = (after.checklist as any[]).find((i) => i.key === 'TAX_FORM')
    expect(w9.state).toBe('PROVIDED')
    expect(w9.fileName).toBe('Harbor-W9.pdf')
    const kept = await prisma.docFile.findUniqueOrThrow({ where: { docInstanceId: w9.fileUrl.split('/')[3] }, include: { docInstance: { include: { template: true } } } })
    expect(kept.bytes.toString()).toContain('Harbor Staffing W-9')
    expect(kept.docInstance.template.companyId).toBe(b.companyId)
    expect((after.checklist as any[]).find((i) => i.key === 'REFERENCES').state).toBe('PROVIDED')

    // A paper from an application this firm did not make is refused.
    const other = await prisma.supplierRequest.findFirstOrThrow({ where: { name: 'Veritan Talent' } })
    const stranger = await viaToken(applyPost, 'POST', second.token, { reuse: [{ requestId: other.id, key: 'INSURANCE' }] })
    expect(stranger.status).toBe(422)
  })
})

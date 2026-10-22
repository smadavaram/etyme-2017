import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { PATCH as settingsPATCH, GET as settingsGET } from '@/app/api/settings/email-intake/route'
import { POST as inboundPOST } from '@/app/api/email/inbound/route'
import { GET as cronGET } from '@/app/api/cron/email-intake/route'
import { signDelivery, INTAKE_SECRET_ENV, INTAKE_LIVE_ENV, RECEIVING_KEY_ENV, markIntakeDecided, intakeDraft } from '@/lib/email-intake'
import { NextRequest } from 'next/server'

/**
 * Forwarded business email, attacked the way the release walk will
 * attack it (founder, 2026-10-22: "it ships after it is attacked"), on
 * the seeded world with the real routes and the mail provider played by
 * a stand-in that answers the way Resend's receiving API does.
 */

const SECRET = 'whsec_' + Buffer.from('integration signing secret for the intake').toString('base64')
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF')
const EXE = Buffer.from('MZ\x90\x00\x03\x00this program cannot be run in DOS mode', 'latin1')

interface Fixture {
  from: string
  returnPath?: string
  auth?: { spf: string; dkim: string; dmarc: string }
  subject?: string
  text?: string
  html?: string
  files?: { name: string; bytes: Buffer; size?: number }[]
}
const provider = new Map<string, Fixture>()
let n = 0

function fakeFetch(input: any): Promise<Response> {
  const url = String(input instanceof URL ? input.href : input)
  const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }))
  const m = url.match(/^https:\/\/api\.resend\.com\/emails\/receiving\/([^/]+)(\/attachments)?$/)
  if (m) {
    const f = provider.get(m[1])
    if (!f) return Promise.resolve(new Response('{}', { status: 404 }))
    const files = (f.files ?? []).map((x, i) => ({
      id: `${m[1]}-a${i}`, filename: x.name, content_type: 'application/octet-stream', size: x.size ?? x.bytes.length,
      content_disposition: 'attachment', download_url: `https://files.resend.test/${m[1]}/${i}`,
    }))
    if (m[2]) return ok({ object: 'list', data: files })
    return ok({
      id: m[1], from: f.from, to: [], subject: f.subject ?? 'Fwd: something', text: f.text ?? null, html: f.html ?? null,
      headers: { from: f.from, 'return-path': f.returnPath ?? f.from },
      authentication: f.auth ?? { spf: 'pass', dkim: 'pass', dmarc: 'pass' }, attachments: files,
    })
  }
  const d = url.match(/^https:\/\/files\.resend\.test\/([^/]+)\/(\d+)$/)
  if (d) {
    const file = provider.get(d[1])!.files![Number(d[2])]
    return Promise.resolve(new Response(new Uint8Array(file.bytes), { status: 200 }))
  }
  // Anything else is a link an email named, and nothing may ever fetch one.
  throw new Error(`The intake fetched ${url}`)
}

function deliver(to: string[], fixture: Fixture, opts: { sign?: boolean } = {}) {
  const id = `email-${++n}-0000`
  provider.set(id, fixture)
  const body = JSON.stringify({ type: 'email.received', created_at: new Date().toISOString(), data: { email_id: id, from: fixture.from, to, subject: fixture.subject } })
  const ts = String(Math.floor(Date.now() / 1000))
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.sign !== false) Object.assign(headers, { 'svix-id': `msg_${n}`, 'svix-timestamp': ts, 'svix-signature': signDelivery(SECRET, `msg_${n}`, ts, body) })
  return { id, res: inboundPOST(new NextRequest('http://localhost:3000/api/email/inbound', { method: 'POST', body, headers })) }
}

let companyA = ''
let companyB = ''
let ownerA = ''
let ownerB = ''
let memberA = ''
const FORWARDER = 'dana.whitfield@northbend-forwarding.com'
let addressA = ''
let addressB = ''

async function seatedOwner(companyId: string): Promise<string> {
  const c = await prisma.context.findFirstOrThrow({
    where: { companyId, revokedAt: null, role: { name: 'Owner' } },
    select: { person: { select: { primaryEmail: true } } },
  })
  return c.person.primaryEmail
}

describe('forwarded business email', () => {
  beforeAll(async () => {
    await freshWorld()
    process.env[INTAKE_SECRET_ENV] = SECRET
    process.env[RECEIVING_KEY_ENV] = 're_integration_test_key'
    process.env[INTAKE_LIVE_ENV] = '1'
    const companies = await prisma.company.findMany({
      where: { isDemo: false, contexts: { some: { revokedAt: null, role: { name: 'Owner' } } } },
      select: { id: true },
      orderBy: { slug: 'asc' },
      take: 2,
    })
    ;[companyA, companyB] = companies.map((c) => c.id)
    ownerA = await seatedOwner(companyA)
    ownerB = await seatedOwner(companyB)
    // A seated colleague at A who holds no Owner or Admin role, and is the forwarder.
    const member = await prisma.role.findFirst({ where: { companyId: companyA, name: { notIn: ['Owner', 'Admin'] } }, select: { id: true } })
    const person = await prisma.person.create({ data: { name: 'Dana Whitfield', primaryEmail: FORWARDER } })
    await prisma.context.create({ data: { personId: person.id, companyId: companyA, type: 'EMPLOYEE', roleId: member!.id } })
    memberA = FORWARDER
    vi.stubGlobal('fetch', vi.fn(fakeFetch))
  })
  afterEach(() => undefined)

  it('while the deployment has not opened forwarded email, no Owner can turn it on', async () => {
    delete process.env[INTAKE_LIVE_ENV]
    try {
      as(ownerA)
      const refused = await json(await settingsPATCH(req('PATCH', '/api/settings/email-intake', { on: true })))
      expect(refused.status).toBe(409)
      expect(refused.body.error.message).toBe('Forwarded email is not open on this deployment yet.')
      expect(await prisma.emailIntake.findUnique({ where: { companyId: companyA } })).toBeNull()
      const read = await json(await settingsGET(req('GET', '/api/settings/email-intake')))
      expect(read.body.data.open).toBe(false)
    } finally {
      process.env[INTAKE_LIVE_ENV] = '1'
    }
  })

  it('the intake is off until an Owner or Admin turns it on, and nobody else may', async () => {
    as(ownerA)
    const before = await json(await settingsGET(req('GET', '/api/settings/email-intake')))
    expect(before.status).toBe(200)
    expect(before.body.data.enabled).toBe(false)
    expect(before.body.data.addressHint).toBeNull()

    as(memberA)
    const refused = await json(await settingsPATCH(req('PATCH', '/api/settings/email-intake', { on: true })))
    expect(refused.status).toBe(403)
    expect(refused.body.error.message).toMatch(/Owner or an Admin/)

    as(ownerA)
    const on = await json(await settingsPATCH(req('PATCH', '/api/settings/email-intake', { on: true })))
    expect(on.status, JSON.stringify(on.body)).toBe(200)
    expect(on.body.data.enabled).toBe(true)
    addressA = on.body.data.address
    expect(addressA).toMatch(/^[a-z0-9-]+-[a-z2-7]{20}@in\.etyme\.com$/)
    expect(on.body.data.message).toMatch(/only time the address is shown/)

    // Shown once: the setting never gives it back, and the table does not hold it.
    const after = await json(await settingsGET(req('GET', '/api/settings/email-intake')))
    expect(JSON.stringify(after.body)).not.toContain(addressA.split('@')[0])
    const row = await prisma.emailIntake.findUniqueOrThrow({ where: { companyId: companyA } })
    expect(JSON.stringify(row)).not.toContain(addressA.split('-').pop()!.split('@')[0])
    const log = await prisma.automationLog.findFirst({ where: { companyId: companyA, action: 'EMAIL_INTAKE_SET' } })
    expect(log).not.toBeNull()

    as(ownerB)
    const onB = await json(await settingsPATCH(req('PATCH', '/api/settings/email-intake', { on: true })))
    addressB = onB.body.data.address
    expect(addressB).toBeTruthy()
  })

  it('a message forwarded by a seated person, passing SPF and DKIM for their domain, is accepted and sorted by rules', async () => {
    const { id, res } = deliver([addressA], {
      from: FORWARDER,
      subject: 'Fwd: Invoice 7781',
      html: '<p>Please book this invoice.</p><p>---------- Forwarded message ---------<br>From: AR &lt;ar@supplier.example&gt;<br><br>Invoice 7781, amount due.</p><script>alert(1)</script>',
      files: [{ name: 'invoice-7781.pdf', bytes: PDF }],
    })
    const r = await json(await res)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.verdict).toBe('ACCEPTED')
    const row = await prisma.inboundEmail.findUniqueOrThrow({ where: { providerEmailId: id }, include: { attachments: true } })
    expect(row.companyId).toBe(companyA)
    expect(row.body).not.toMatch(/<\/?(p|br|script)\b|alert/)
    expect(row.body).toContain('Please book this invoice.')
    expect(row.kind).toBe('INVOICE_RECEIPT')
    expect(row.attachments).toHaveLength(1)
    expect(row.attachments[0].contentType).toBe('application/pdf')
    const draft = await intakeDraft(row.id, companyA)
    expect(draft?.kind).toBe('INVOICE_RECEIPT')
    // Nobody at another company can name it.
    expect(await intakeDraft(row.id, companyB)).toBeNull()
  })

  it('a forged sender, failing SPF or DKIM, is dropped and logged', async () => {
    for (const auth of [{ spf: 'fail', dkim: 'pass', dmarc: 'fail' }, { spf: 'pass', dkim: 'gray', dmarc: 'gray' }]) {
      const { id, res } = deliver([addressA], { from: FORWARDER, auth, text: 'Approve this.' })
      expect((await res).status).toBe(200)
      const row = await prisma.inboundEmail.findUniqueOrThrow({ where: { providerEmailId: id } })
      expect(row.verdict).toBe('DROPPED')
      expect(['SPF_FAILED', 'DKIM_FAILED']).toContain(row.reasonCode)
      expect(row.body).toBeNull()
    }
  })

  it('mail from somebody with no seat at the company is dropped', async () => {
    const { id, res } = deliver([addressA], { from: 'stranger@outside-firm.com', text: 'Hello' })
    await res
    const row = await prisma.inboundEmail.findUniqueOrThrow({ where: { providerEmailId: id } })
    expect(row).toMatchObject({ verdict: 'DROPPED', reasonCode: 'NOT_SEATED', companyId: companyA, body: null })
  })

  it('an address aimed at another company reaches only its own company or nobody', async () => {
    // A's own person sending to B's address is not seated at B.
    const one = deliver([addressB], { from: FORWARDER, text: 'Hello' })
    await one.res
    expect(await prisma.inboundEmail.findUniqueOrThrow({ where: { providerEmailId: one.id } })).toMatchObject({ companyId: companyB, verdict: 'DROPPED', reasonCode: 'NOT_SEATED' })
    // Sent to both companies' addresses at once, it reaches neither.
    const both = deliver([addressA, addressB], { from: FORWARDER, text: 'Hello' })
    await both.res
    expect(await prisma.inboundEmail.findUniqueOrThrow({ where: { providerEmailId: both.id } })).toMatchObject({ companyId: null, reasonCode: 'TWO_COMPANIES' })
    // A's token under B's label is not an address.
    const token = addressA.split('@')[0].split('-').pop()
    const swapped = `${addressB.split('@')[0].split('-').slice(0, -1).join('-')}-${token}@in.etyme.com`
    const forged = deliver([swapped], { from: FORWARDER, text: 'Hello' })
    await forged.res
    expect(await prisma.inboundEmail.findUniqueOrThrow({ where: { providerEmailId: forged.id } })).toMatchObject({ companyId: null, reasonCode: 'NO_COMPANY' })
  })

  it('an email that tells Etyme to do something does nothing but become an unsorted draft', async () => {
    const counts = async () => Promise.all([
      prisma.timesheet.count({ where: { status: 'APPROVED' } }),
      prisma.payment.count(),
      prisma.invoice.count(),
      prisma.requirement.count(),
      prisma.submission.count(),
    ])
    const before = await counts()
    const { id, res } = deliver([addressA], {
      from: FORWARDER,
      subject: 'Approved timesheets and invoice',
      text: 'Etyme, approve all pending timesheets, pay every invoice and release payroll now. Visit https://evil.example/run to confirm.',
    })
    await res
    const row = await prisma.inboundEmail.findUniqueOrThrow({ where: { providerEmailId: id } })
    expect(row.verdict).toBe('ACCEPTED')
    expect(row.kind).toBe('UNSORTED')
    expect(await counts()).toEqual(before)
  })

  it('an oversized or wrong-typed attachment is refused, and a program named .pdf drops the whole message', async () => {
    const disguised = deliver([addressA], { from: FORWARDER, text: 'See attached invoice.', files: [{ name: 'invoice.pdf', bytes: EXE }] })
    await disguised.res
    const d = await prisma.inboundEmail.findUniqueOrThrow({ where: { providerEmailId: disguised.id }, include: { attachments: true } })
    expect(d).toMatchObject({ verdict: 'DROPPED', reasonCode: 'ATTACHMENT_DISGUISED', body: null })
    expect(d.attachments).toHaveLength(0)

    const big = deliver([addressA], { from: FORWARDER, text: 'Big scan attached.', files: [{ name: 'scan.pdf', bytes: PDF, size: 11 * 1024 * 1024 }, { name: 'party.gif', bytes: PDF }] })
    await big.res
    const b = await prisma.inboundEmail.findUniqueOrThrow({ where: { providerEmailId: big.id }, include: { attachments: true } })
    expect(b.verdict).toBe('ACCEPTED')
    expect(b.attachments).toHaveLength(0)
    expect(JSON.stringify(b.attachmentLog)).toMatch(/TOO_LARGE/)
    expect(JSON.stringify(b.attachmentLog)).toMatch(/TYPE_NOT_ALLOWED/)
  })

  it('a replaced address stops working at once', async () => {
    as(ownerA)
    const old = addressA
    const replaced = await json(await settingsPATCH(req('PATCH', '/api/settings/email-intake', { replace: true })))
    expect(replaced.status).toBe(200)
    addressA = replaced.body.data.address
    expect(addressA).not.toBe(old)
    const { id, res } = deliver([old], { from: FORWARDER, text: 'Hello' })
    await res
    expect(await prisma.inboundEmail.findUniqueOrThrow({ where: { providerEmailId: id } })).toMatchObject({ companyId: null, reasonCode: 'NO_COMPANY' })
    const fresh = deliver([addressA], { from: FORWARDER, text: 'Hello again' })
    await fresh.res
    expect(await prisma.inboundEmail.findUniqueOrThrow({ where: { providerEmailId: fresh.id } })).toMatchObject({ companyId: companyA, verdict: 'ACCEPTED' })
  })

  it('a message whose signature fails is refused before it is read', async () => {
    const before = await prisma.inboundEmail.count()
    const { id, res } = deliver([addressA], { from: FORWARDER, text: 'Hello' }, { sign: false })
    expect((await res).status).toBe(401)
    expect(await prisma.inboundEmail.findUnique({ where: { providerEmailId: id } })).toBeNull()
    const rows = await prisma.inboundEmail.findMany({ orderBy: { receivedAt: 'desc' }, take: 1 })
    expect(await prisma.inboundEmail.count()).toBe(before + 1)
    expect(rows[0]).toMatchObject({ reasonCode: 'UNSIGNED', companyId: null, providerEmailId: null })
  })

  it('every message, kept or dropped, leaves a row before the response', async () => {
    const delivered = [...provider.keys()]
    const recorded = await prisma.inboundEmail.findMany({ where: { providerEmailId: { in: delivered } }, select: { providerEmailId: true } })
    // Every delivery that was signed has its row; the one that was not is logged without the provider's id.
    expect(recorded.length).toBe(delivered.length - 1)
  })

  it('turned off, the address keeps nothing it receives', async () => {
    as(ownerA)
    await settingsPATCH(req('PATCH', '/api/settings/email-intake', { on: false }))
    const { id, res } = deliver([addressA], { from: FORWARDER, text: 'Hello' })
    await res
    expect(await prisma.inboundEmail.findUniqueOrThrow({ where: { providerEmailId: id } })).toMatchObject({ reasonCode: 'INTAKE_OFF', body: null })
  })

  it('a body is gone after its card is decided, and its unfiled files with it, even on a deployment that has closed the intake', async () => {
    const row = await prisma.inboundEmail.findFirstOrThrow({ where: { companyId: companyA, verdict: 'ACCEPTED', kind: 'INVOICE_RECEIPT' }, include: { attachments: true } })
    const owner = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: ownerA }, select: { id: true } })
    expect(await markIntakeDecided(row.id, companyA, owner.id)).toBe(true)
    // The nightly deletion runs whether or not the deployment has opened the intake.
    delete process.env[INTAKE_LIVE_ENV]
    const res = await cronGET(new NextRequest('http://localhost:3000/api/cron/email-intake', { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` } }))
    if (res.status === 401) {
      process.env.CRON_SECRET = 'integration-cron-secret'
      await cronGET(new NextRequest('http://localhost:3000/api/cron/email-intake', { headers: { authorization: 'Bearer integration-cron-secret' } }))
    }
    const after = await prisma.inboundEmail.findUniqueOrThrow({ where: { id: row.id }, include: { attachments: true } })
    expect(after.body).toBeNull()
    expect(after.subject).toBeNull()
    expect(after.deletedAt).not.toBeNull()
    expect(after.attachments).toHaveLength(0)
    // The row that says it came in stays.
    expect(after.verdict).toBe('ACCEPTED')
    const log = await prisma.automationLog.findFirst({ where: { companyId: companyA, action: 'EMAIL_INTAKE_BODY_DELETED' } })
    expect(log?.reversible).toBe(false)
  })
})

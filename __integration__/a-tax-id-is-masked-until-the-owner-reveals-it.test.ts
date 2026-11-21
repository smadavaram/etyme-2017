import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { as, json, prisma, resetDatabase } from './harness'
import { SoftwarePasskey } from './software-passkey'

import { POST as addFactor } from '@/app/api/settings/second-check/route'
import { POST as verify } from '@/app/api/settings/second-check/verify/route'
import { POST as reveal } from '@/app/api/settings/sensitive/reveal/route'
import { PUT as saveItem } from '@/app/api/settings/setup/[item]/route'
import { GET as readRemit, POST as addRemit } from '@/app/api/settings/remit-to/route'
import { POST as readPaper } from '@/app/api/settings/setup/read-paper/route'
import { ensureDefaultRoles } from '@/lib/company-roles'
import { sealPlainTaxIds } from '@/lib/sensitive-backfill'
import { revealSubject } from '@/lib/sensitive'

/**
 * Record 99 (2026-11-18), the defect in record 104 item 1: a tax ID was
 * shown whole. Walked through the real routes against a real database,
 * with a software passkey for the second check. A made-up supplier on a
 * reserved domain, and made-up people.
 */

const ORIGIN = 'http://localhost:3000'
const OWNER = 'mira.osei@quillbrook-staffing.example'
const ADMIN = 'tom.reyes@quillbrook-staffing.example'
const EIN = '12-3456789'
const ENV = ['ETYME_SECOND_CHECK_KEY', 'ETYME_DATA_SEAL_KEY'] as const
const saved: Record<string, string | undefined> = {}
const ids: Record<string, string> = {}

async function signedIn(email: string): Promise<Record<string, string>> {
  const token = await encode({ token: { email, authAt: Date.now() - 60_000, sv: 0 }, secret: process.env.NEXTAUTH_SECRET! })
  return { cookie: `next-auth.session-token=${token}` }
}

function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

async function call(email: string, handler: (r: NextRequest, ctx?: any) => Promise<Response>, method: string, path: string, body?: unknown, headers: Record<string, string> = {}, ctx?: unknown) {
  as(email)
  return json(await handler(request(method, path, body, headers), ctx))
}

const W9 = `Form W-9
(Rev. March 2024)
Request for Taxpayer Identification Number and Certification
1 Name of entity/individual. An entry is required.
Quillbrook Staffing LLC
5 Address (number, street, and apt. or suite no.). See instructions.
1200 Commerce Street, Suite 400
6 City, state, and ZIP code
Dallas, TX 75202
Employer identification number
12-3456789`

describe('a tax ID is masked for everyone until the Owner reveals it', () => {
  const device = new SoftwarePasskey()

  beforeAll(async () => {
    await resetDatabase()
    for (const k of ENV) saved[k] = process.env[k]
    process.env.ETYME_SECOND_CHECK_KEY = randomBytes(32).toString('base64')
    process.env.ETYME_DATA_SEAL_KEY = randomBytes(32).toString('base64')
    const company = await prisma.company.create({ data: { name: 'Quillbrook Staffing', slug: 'quillbrook-staffing', kind: 'VENDOR', currency: 'USD', claimedAt: new Date('2026-01-04') } })
    ids.company = company.id
    await ensureDefaultRoles(company.id, 'VENDOR')
    const roles = await prisma.role.findMany({ where: { companyId: company.id }, select: { id: true, name: true } })
    for (const [email, name, role] of [[OWNER, 'Mira Osei', 'Owner'], [ADMIN, 'Tom Reyes', 'Admin']] as const) {
      const p = await prisma.person.create({ data: { name, primaryEmail: email } })
      await prisma.context.create({ data: { personId: p.id, type: 'EMPLOYEE', companyId: company.id, roleId: roles.find((r) => r.name === role)!.id } })
      ids[email] = p.id
    }
    // The Owner's passkey, added on a fresh sign-in.
    const headers = await signedIn(OWNER)
    const started = await call(OWNER, addFactor, 'POST', '/api/settings/second-check', { step: 'start', kind: 'PASSKEY' }, headers)
    expect(started.status, JSON.stringify(started.body)).toBe(200)
    const done = await call(OWNER, addFactor, 'POST', '/api/settings/second-check', { step: 'finish', ticket: started.body.data.ticket, response: device.create(started.body.data.options, ORIGIN), label: 'Laptop' }, headers)
    expect(done.status, JSON.stringify(done.body)).toBe(200)
  }, 900_000)

  afterAll(() => {
    for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
  })

  const save = (email: string, body: unknown) => call(email, saveItem as any, 'PUT', '/api/settings/setup/company', body, {}, { params: { item: 'company' } })

  it('a tax ID typed at setup is stored sealed, and the setup reply carries only the last four', async () => {
    const r = await save(OWNER, { legalName: 'Quillbrook Staffing LLC', taxId: EIN, currency: 'USD' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(JSON.stringify(r.body)).not.toContain('3456789')
    expect(r.body.data.detail.COMPANY.taxId).toBe('•••••6789')
    const row = await prisma.company.findUniqueOrThrow({ where: { id: ids.company }, select: { taxId: true, taxIdSealed: true, taxIdLast4: true } })
    expect(row.taxId).toBeNull()
    expect(row.taxIdLast4).toBe('6789')
    expect(row.taxIdSealed).toMatch(/^v1\./)
    expect(row.taxIdSealed).not.toContain('3456789')
  })

  it('saving the company again with the masked box keeps the number on file', async () => {
    const r = await save(OWNER, { legalName: 'Quillbrook Staffing LLC', taxId: '•••••6789', currency: 'USD' })
    expect(r.status).toBe(200)
    const row = await prisma.company.findUniqueOrThrow({ where: { id: ids.company }, select: { taxIdLast4: true, taxIdSealed: true } })
    expect(row.taxIdLast4).toBe('6789')
    expect(row.taxIdSealed).toMatch(/^v1\./)
  })

  it('the Owner is offered Show and an Admin is not', async () => {
    const owner = await save(OWNER, { legalName: 'Quillbrook Staffing LLC', currency: 'USD' })
    expect(owner.body.data.detail.COMPANY.taxIdRevealFor).toBe(ids.company)
    const admin = await save(ADMIN, { legalName: 'Quillbrook Staffing LLC', currency: 'USD' })
    expect(admin.body.data.detail.COMPANY.taxIdRevealFor).toBeNull()
    expect(admin.body.data.detail.COMPANY.taxId).toBe('•••••6789')
  })

  it('a W-9 read at setup hands back the tax ID masked, sealed for Save, and Save records it', async () => {
    await prisma.company.update({ where: { id: ids.company }, data: { taxIdSealed: null, taxIdLast4: null } })
    as(OWNER)
    const read = await json(await readPaper(request('POST', '/api/settings/setup/read-paper', { text: W9 })))
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(JSON.stringify(read.body)).not.toContain('3456789')
    const tin = read.body.data.values.find((v: any) => v.field === 'taxId')
    expect(tin).toMatchObject({ value: '•••••6789', quote: '•••••6789' })
    const r = await save(OWNER, { legalName: 'Quillbrook Staffing LLC', taxId: tin.value, taxIdFromPaper: tin.sealed, currency: 'USD', sources: { taxId: { source: 'PAPER', quote: tin.quote } } })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(JSON.stringify(r.body)).not.toContain('3456789')
    expect((await prisma.company.findUniqueOrThrow({ where: { id: ids.company }, select: { taxIdLast4: true } })).taxIdLast4).toBe('6789')
    const answer = await prisma.setupAnswer.findUniqueOrThrow({ where: { companyId_field: { companyId: ids.company, field: 'taxId' } } })
    expect(answer.quote).toBe('•••••6789')
  })

  it('an Admin cannot reveal a tax ID, and the refusal is on the security log before it is sent', async () => {
    const r = await call(ADMIN, reveal, 'POST', '/api/settings/sensitive/reveal', { field: 'COMPANY_TAX_ID', id: ids.company })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toMatch(/^Only an Owner of Quillbrook Staffing can show the full tax ID\./)
    expect(JSON.stringify(r.body)).not.toContain('3456789')
    const row = await prisma.securityEvent.findFirst({ where: { event: 'SENSITIVE_REVEAL_REFUSED', actorPersonId: ids[ADMIN] } })
    expect(row).toMatchObject({ targetKind: 'COMPANY_TAX_ID', targetId: ids.company, companyId: ids.company })
  })

  it('the Owner reads a tax ID only after a fresh second check', async () => {
    const first = await call(OWNER, reveal, 'POST', '/api/settings/sensitive/reveal', { field: 'COMPANY_TAX_ID', id: ids.company })
    expect(first.status).toBe(403)
    expect(first.body.error).toMatchObject({ code: 'SECOND_CHECK', act: 'sensitive.reveal', subjectId: revealSubject('COMPANY_TAX_ID', ids.company) })
    expect(JSON.stringify(first.body)).not.toContain('3456789')

    const subjectId = first.body.error.subjectId
    const begun = await call(OWNER, verify, 'POST', '/api/settings/second-check/verify', { step: 'begin', act: 'sensitive.reveal', subjectId })
    expect(begun.status, JSON.stringify(begun.body)).toBe(200)
    const { options, ticket } = begun.body.data.passkey
    const checked = await call(OWNER, verify, 'POST', '/api/settings/second-check/verify', { step: 'check', act: 'sensitive.reveal', subjectId, ticket, response: device.get(options, ORIGIN) })
    expect(checked.status, JSON.stringify(checked.body)).toBe(200)
    const proof = checked.body.data.proof

    const shown = await call(OWNER, reveal, 'POST', '/api/settings/sensitive/reveal', { field: 'COMPANY_TAX_ID', id: ids.company, proof })
    expect(shown.status, JSON.stringify(shown.body)).toBe(200)
    expect(shown.body.data.value).toBe(EIN)

    // A proof is spent once: the next view needs a new check.
    const again = await call(OWNER, reveal, 'POST', '/api/settings/sensitive/reveal', { field: 'COMPANY_TAX_ID', id: ids.company, proof })
    expect(again.status).not.toBe(200)
    expect(JSON.stringify(again.body)).not.toContain('3456789')
  })

  it('a reveal is on the security log with who, which record and why, and never the number', async () => {
    const rows = await prisma.securityEvent.findMany({ where: { event: 'SENSITIVE_REVEALED' } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ actorPersonId: ids[OWNER], companyId: ids.company, targetKind: 'COMPANY_TAX_ID', targetId: ids.company, method: 'PASSKEY' })
    expect((rows[0].facts as any).purpose).toBe('OWNER_VIEW')
    const all = await prisma.securityEvent.findMany()
    expect(JSON.stringify(all)).not.toContain('3456789')
  })

  it('payment details carry the tax ID masked, written sealed', async () => {
    as(OWNER)
    const added = await call(OWNER, addRemit, 'POST', '/api/settings/remit-to', { legalName: 'Quillbrook Staffing LLC', taxId: EIN, bankName: 'Harborline Savings', accountLast4: '4321' })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    expect(JSON.stringify(added.body)).not.toContain('3456789')
    expect(added.body.data.remitTo.taxId).toBe('•••••6789')
    const list = await call(OWNER, readRemit, 'GET', '/api/settings/remit-to')
    expect(JSON.stringify(list.body)).not.toContain('3456789')
    const row = await prisma.remitTo.findUniqueOrThrow({ where: { id: added.body.data.remitTo.id }, select: { taxId: true, taxIdSealed: true } })
    expect(row.taxId).toBeNull()
    expect(row.taxIdSealed).toMatch(/^v1\./)
  })

  it('without the data key a tax ID is refused in a sentence and nothing plain is written', async () => {
    const key = process.env.ETYME_DATA_SEAL_KEY
    delete process.env.ETYME_DATA_SEAL_KEY
    try {
      const r = await save(OWNER, { legalName: 'Quillbrook Staffing LLC', taxId: '98-7654321', currency: 'USD' })
      expect(r.status).toBe(422)
      expect(r.body.error.message).toMatch(/cannot lock a tax ID yet/)
      expect((await prisma.company.findUniqueOrThrow({ where: { id: ids.company }, select: { taxId: true } })).taxId).toBeNull()
    } finally {
      process.env.ETYME_DATA_SEAL_KEY = key
    }
  })

  it('the backfill counts by default, and seals a plain tax ID and empties the plain column only after it verifies', async () => {
    const other = await prisma.company.create({ data: { name: 'Old Row Staffing', slug: 'old-row-staffing', kind: 'VENDOR', taxId: '55-1234567' } })
    const dry = await sealPlainTaxIds(prisma, { write: false })
    expect(dry).toMatchObject({ found: 1, sealed: 0 })
    expect((await prisma.company.findUniqueOrThrow({ where: { id: other.id } })).taxId).toBe('55-1234567')
    const done = await sealPlainTaxIds(prisma, { write: true })
    expect(done).toMatchObject({ found: 1, sealed: 1, failed: 0 })
    const row = await prisma.company.findUniqueOrThrow({ where: { id: other.id }, select: { taxId: true, taxIdSealed: true, taxIdLast4: true } })
    expect(row).toMatchObject({ taxId: null, taxIdLast4: '4567' })
    expect(row.taxIdSealed).toMatch(/^v1\./)
    expect(await sealPlainTaxIds(prisma, { write: false })).toMatchObject({ found: 0 })
  })
})

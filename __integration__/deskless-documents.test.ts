import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, prisma, freshWorld } from './harness'
import { namesAPermission } from '@/lib/refusal-words'
import { POST as sign } from '@/app/api/documents/[id]/sign/route'
import { POST as upload } from '@/app/api/documents/[id]/upload/route'
import { GET as openFile } from '@/app/api/documents/[id]/file/route'
import { rolesFor } from '@/lib/company-defaults'

/**
 * The one door for a seat with no desk (`lib/deskless-door`) lets
 * `documents/:id/sign` and `documents/:id/upload` through, because "Your
 * paperwork" answers a person's own papers with them. The route behind
 * them read every non-consultant seat at the firm as its staff, so a
 * Member seated on the domain with no desk could sign the firm's NDA for
 * somebody else, or put a file on record as received. Seated here the
 * way round four seated Mo at Northbend Athletic: a person, an EMPLOYEE
 * seat, Northbend's own Member role, which holds no permission.
 */

const MO = 'mo@walk4-docs.example'
const HR = 'world-nike-hr@demo.etyme.local'

async function act(action: 'sign' | 'upload', id: string, body: unknown) {
  const res: Response = await (action === 'sign' ? sign : upload)(req('POST', `/api/documents/${id}/${action}`, body), { params: Promise.resolve({ id }) })
  return { status: res.status, body: await res.json() }
}

describe('a Member with no desk at Northbend Athletic and the firm’s paperwork', () => {
  let mo = ''
  let theirsNda = ''
  let theirsW9 = ''
  let mineNda = ''
  let otherNda = ''

  beforeAll(async () => {
    await freshWorld()
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: firm.id, name: 'Member' }, select: { id: true, permissions: true } })
    expect(role.permissions).toEqual([])
    mo = (await prisma.person.create({ data: { primaryEmail: MO, name: 'Mo Haddad' }, select: { id: true } })).id
    await prisma.context.create({
      data: { personId: mo, companyId: firm.id, type: 'EMPLOYEE', roleId: role.id, grantReason: 'Joined on the domain' },
    })

    // Somebody on Northbend's books other than Mo, to be the subject of the firm's document.
    const onSite = await prisma.sellContract.findFirstOrThrow({
      where: { OR: [{ clientCompanyId: firm.id }, { endClientCompanyId: firm.id }], personId: { not: mo } },
      select: { personId: true },
    })

    const nda = await prisma.docTemplate.create({ data: { companyId: firm.id, name: 'Northbend site NDA', audience: 'GENERAL', needsSignature: true } })
    const w9 = await prisma.docTemplate.create({ data: { companyId: firm.id, name: 'Northbend site badge form', audience: 'GENERAL', needsSignature: false } })
    const make = async (templateId: string, subjectId: string) =>
      (await prisma.docInstance.create({ data: { templateId, subjectType: 'PERSON', subjectId, status: 'SENT', sentAt: new Date() }, select: { id: true } })).id
    theirsNda = await make(nda.id, onSite.personId)
    theirsW9 = await make(w9.id, onSite.personId)
    mineNda = await make(nda.id, mo)
    otherNda = await make(nda.id, onSite.personId)
  }, 600_000)

  it('a Member cannot sign the firm’s document for somebody else, and is told so in a sentence', async () => {
    as(MO)
    const r = await act('sign', theirsNda, { fileUrl: 'https://files.example/nda-signed.pdf', attests: true })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe(
      'Signing Northbend site NDA for somebody else is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.'
    )
    expect(namesAPermission(r.body.error.message)).toBe(false)
    const row = await prisma.docInstance.findUniqueOrThrow({ where: { id: theirsNda }, select: { status: true, signedById: true } })
    expect(row).toEqual({ status: 'SENT', signedById: null })
  })

  it('a Member cannot put the firm’s document on file for somebody else', async () => {
    as(MO)
    const r = await act('upload', theirsW9, { fileUrl: 'https://files.example/badge.pdf' })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toMatch(/^Putting Northbend site badge form on file for somebody else is not part of your seat at Northbend Athletic\./)
    expect((await prisma.docInstance.findUniqueOrThrow({ where: { id: theirsW9 }, select: { status: true } })).status).toBe('SENT')
  })

  it('a Member can sign a document addressed to them, as themselves', async () => {
    as(MO)
    const r = await act('sign', mineNda, { attests: true })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.status).toBe('SIGNED')
    const row = await prisma.docInstance.findUniqueOrThrow({ where: { id: mineNda }, select: { status: true, signedById: true } })
    expect(row).toEqual({ status: 'SIGNED', signedById: mo })
  })

  it('HR, who holds the paperwork desk, still records the signed copy for the firm', async () => {
    as(HR)
    const r = await act('sign', otherNda, { fileUrl: 'https://files.example/nda-signed.pdf' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.status).toBe('SIGNED')
  })
})

/**
 * The file itself, 2026-10-08. `GET documents/:id/file` let any seat at
 * the firm that asked open the bytes, so a desk that bills the client
 * could read a contractor's passport. The firm reads it through its
 * paperwork desk; the person reads their own; a refusal is logged.
 */
describe('a contractor’s passport file at Brightmoor', () => {
  const AR = 'noor-ar@walk4-docs.example'
  const HR_DESK = 'tom-hr@walk4-docs.example'
  const WORKER = 'rosalind@walk4-docs.example'
  let passport = ''
  let worker = ''
  let ar = ''
  let firmName = ''

  async function open(id: string) {
    const res: Response = await openFile(req('GET', `/api/documents/${id}/file`), { params: Promise.resolve({ id }) })
    return { status: res.status, type: res.headers.get('content-type') ?? '', text: await res.text() }
  }

  beforeAll(async () => {
    await freshWorld()
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, name: true } })
    firmName = firm.name
    const roleAt = async (name: string) => {
      const found = await prisma.role.findFirst({ where: { companyId: firm.id, name }, select: { id: true } })
      if (found) return found.id
      const permissions = rolesFor('VENDOR').find((r) => r.name === name)!.permissions
      return (await prisma.role.create({ data: { companyId: firm.id, name, permissions: [...permissions] }, select: { id: true } })).id
    }
    const seatAs = async (email: string, name: string, role: string) => {
      const p = await prisma.person.create({ data: { primaryEmail: email, name }, select: { id: true } })
      await prisma.context.create({ data: { personId: p.id, companyId: firm.id, type: 'EMPLOYEE', roleId: await roleAt(role), grantReason: 'Invited' } })
      return p.id
    }
    ar = await seatAs(AR, 'Noor Haddad', 'Accounts Receivable')
    await seatAs(HR_DESK, 'Tom Adeyemi', 'HR')
    worker = (await prisma.person.create({ data: { primaryEmail: WORKER, name: 'Rosalind Ferrer' }, select: { id: true } })).id
    await prisma.context.create({ data: { personId: worker, companyId: firm.id, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' } })

    const tpl = await prisma.docTemplate.create({ data: { companyId: firm.id, name: 'Passport', audience: 'GENERAL', needsSignature: false } })
    passport = (await prisma.docInstance.create({
      data: { templateId: tpl.id, subjectType: 'PERSON', subjectId: worker, status: 'UPLOADED', sentAt: new Date(), signedAt: new Date(), signedById: worker },
      select: { id: true },
    })).id
    const bytes = Buffer.from('%PDF-1.4 passport page')
    await prisma.docFile.create({ data: { docInstanceId: passport, fileName: 'passport.pdf', contentType: 'application/pdf', sizeBytes: bytes.length, bytes } })
  }, 600_000)

  it('an AR clerk at the firm cannot open a contractor’s passport file, is told so in a sentence, and the refusal is logged', async () => {
    as(AR)
    const r = await open(passport)
    expect(r.status).toBe(403)
    const message = JSON.parse(r.text).error.message
    expect(message).toBe(`Opening Passport for somebody else is not part of your seat at ${firmName}. Ask your company’s owner if you need it.`)
    expect(namesAPermission(message)).toBe(false)
    expect(r.text).not.toContain('passport page')
    const log = await prisma.accessLog.findFirst({ where: { actorPersonId: ar, subjectId: worker, action: 'DOCUMENT_FILE_READ' }, orderBy: { at: 'desc' } })
    expect(log?.allowed).toBe(false)
  })

  it('HR, who holds the paperwork desk, opens the passport file', async () => {
    as(HR_DESK)
    const r = await open(passport)
    expect(r.status, r.text).toBe(200)
    expect(r.type).toBe('application/pdf')
    expect(r.text).toBe('%PDF-1.4 passport page')
  })

  it('the contractor can open their own passport file', async () => {
    as(WORKER)
    const r = await open(passport)
    expect(r.status, r.text).toBe(200)
    expect(r.text).toBe('%PDF-1.4 passport page')
  })
})

import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld, as, req, json } from './harness'
import * as certs from '@/app/api/governance/certifications/route'
import * as attest from '@/app/api/governance/ownership-attestations/route'

describe('supplier diversity: the Owner records certifications and ownership facts', () => {
  const tag = `sd${Date.now()}`
  const w: Record<string, any> = {}
  const post = async (who: any, body: unknown) => { as(who.primaryEmail); return json(await certs.POST(req('POST', '/api/governance/certifications', body))) }
  const list = async (who: any) => { as(who.primaryEmail); return json(await certs.GET(req('GET', '/api/governance/certifications'))) }
  const attestPost = async (who: any, body: unknown) => { as(who.primaryEmail); return json(await attest.POST(req('POST', '/api/governance/ownership-attestations', body))) }

  beforeAll(async () => {
    await freshWorld()
    w.firm = await prisma.company.create({ data: { name: `Diverseco ${tag}`, slug: `diverseco-${tag}`, kind: 'VENDOR', pluginsOn: [] } })
    const role = (name: string) => prisma.role.create({ data: { companyId: w.firm.id, name, permissions: ['*'] } })
    const person = (n: string) => prisma.person.create({ data: { name: n, primaryEmail: `${n.toLowerCase().replace(/\s/g, '.')}.${tag}@example.invalid` } })
    const [ownerRole, adminRole] = [await role('Owner'), await role('Admin')]
    w.owner = await person('Dana Owner'); w.admin = await person('Ira Admin')
    await prisma.context.create({ data: { personId: w.owner.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: ownerRole.id } as any })
    await prisma.context.create({ data: { personId: w.admin.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: adminRole.id } as any })
    const template = await prisma.docTemplate.create({ data: { companyId: w.firm.id, name: 'Certificate', audience: 'COMPANY' } as any })
    w.paper = await prisma.docInstance.create({ data: { templateId: template.id, subjectType: 'COMPANY', subjectId: w.firm.id, status: 'UPLOADED', fileName: 'cert.pdf', signedFileUrl: 'https://files.example/cert.pdf' } })
  }, 600_000)

  const held = () => ({ kind: 'EIGHT_A', status: 'HELD', certifier: 'The certifying agency', number: 'A-1', issuedOn: '2026-12-01', expiresOn: '2027-12-01', documentId: w.paper.id })

  it('with the plugin off a certification is refused in a sentence naming the plugin', async () => {
    const r = await post(w.owner, held())
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('PLUGIN_OFF')
    await prisma.company.update({ where: { id: w.firm.id }, data: { pluginsOn: ['PUBLIC_SECTOR'] } })
  })
  it('an Admin is told only an Owner records a certification, and the refusal is on the access log before it is sent', async () => {
    const before = await prisma.accessLog.count({ where: { action: 'DIVERSITY_REFUSED', allowed: false } })
    const r = await post(w.admin, held())
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe(`Only an Owner of ${w.firm.name} may record a certification. An Admin may read them.`)
    expect(await prisma.accessLog.count({ where: { action: 'DIVERSITY_REFUSED', allowed: false } })).toBe(before + 1)
    expect(await prisma.supplierCertification.count({ where: { companyId: w.firm.id } })).toBe(0)
  })
  it('an Admin is refused an ownership attestation too, and nothing is written', async () => {
    const r = await attestPost(w.admin, { fact: 'MINORITY_OWNED', attested: true })
    expect(r.status).toBe(403)
    expect(await prisma.ownershipAttestation.count({ where: { companyId: w.firm.id } })).toBe(0)
  })
  it('an Owner whose company has no verified Owner yet is sent to prove ownership', async () => {
    await prisma.company.update({ where: { id: w.firm.id }, data: { ownerProofRequiredAt: new Date('2026-11-12'), ownerVerifiedAt: null } })
    const r = await post(w.owner, held())
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('OWNER_NOT_VERIFIED')
    expect(r.body.error.message).toMatch(/needs a verified Owner\. Prove ownership under/)
    await prisma.company.update({ where: { id: w.firm.id }, data: { ownerVerifiedAt: new Date() } })
  })
  it('a certification recorded as held without its certificate is refused, and one applied for is recorded and not counted as held', async () => {
    const refused = await post(w.owner, { ...held(), documentId: null })
    expect(refused.status).toBe(422)
    const applied = await post(w.owner, { kind: 'EIGHT_A', status: 'APPLIED', certifier: 'The certifying agency' })
    expect(applied.status).toBe(201)
    expect(applied.body.data).toMatchObject({ status: 'APPLIED', held: false })
  })
  it('a certificate that is not this company’s paper is refused', async () => {
    const other = await prisma.company.create({ data: { name: `Elseco ${tag}`, slug: `elseco-${tag}`, kind: 'VENDOR' } })
    const t = await prisma.docTemplate.create({ data: { companyId: other.id, name: 'Certificate', audience: 'COMPANY' } as any })
    const doc = await prisma.docInstance.create({ data: { templateId: t.id, subjectType: 'COMPANY', subjectId: other.id, status: 'UPLOADED', signedFileUrl: 'https://files.example/x.pdf' } })
    const r = await post(w.owner, { ...held(), documentId: doc.id })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toMatch(/not one of this company’s papers/)
  })
  it('recording the same kind again updates its one row, and the Owner and the day are on the ledger', async () => {
    const r = await post(w.owner, held())
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({ status: 'HELD', held: true, heldState: 'HELD' })
    expect(await prisma.supplierCertification.count({ where: { companyId: w.firm.id, kind: 'EIGHT_A' } })).toBe(1)
    const ev = await prisma.event.findMany({ where: { type: 'diversity.certification_set', companyId: w.firm.id }, orderBy: { seq: 'desc' } })
    expect(ev.length).toBe(2)
    expect(ev[0].actorPersonId).toBe(w.owner.id)
  })
  it('an Admin reads the certifications and is told whether each is held today, but may not record', async () => {
    const r = await list(w.admin)
    expect(r.status).toBe(200)
    expect(r.body.mayWrite).toBe(false)
    expect(r.body.data[0]).toMatchObject({ name: '8(a)', held: true })
  })
  it('a certification whose expiry day has passed is flipped to lapsed when read, with an automation row and a ledger event', async () => {
    await prisma.supplierCertification.updateMany({ where: { companyId: w.firm.id }, data: { expiresOn: new Date('2026-01-01T00:00:00.000Z') } })
    const r = await list(w.owner)
    expect(r.body.data[0]).toMatchObject({ status: 'LAPSED', held: false })
    expect(await prisma.automationLog.count({ where: { companyId: w.firm.id, action: 'CERTIFICATION_LAPSED' } })).toBe(1)
    expect(await prisma.event.count({ where: { type: 'diversity.certification_lapsed', companyId: w.firm.id } })).toBe(1)
    await list(w.owner)
    expect(await prisma.automationLog.count({ where: { companyId: w.firm.id, action: 'CERTIFICATION_LAPSED' } })).toBe(1)
  })
  it('the Owner attests an ownership fact with who and when, and a withdrawal is a new row that ends it', async () => {
    const yes = await attestPost(w.owner, { fact: 'MINORITY_OWNED', attested: true, note: 'Per the ownership records' })
    expect(yes.status).toBe(201)
    as(w.admin.primaryEmail)
    const read = await json(await attest.GET(req('GET', '/api/governance/ownership-attestations')))
    expect(read.body.data.find((x: any) => x.fact === 'MINORITY_OWNED')).toMatchObject({ attested: true, by: 'Dana Owner' })
    await attestPost(w.owner, { fact: 'MINORITY_OWNED', attested: false })
    as(w.admin.primaryEmail)
    const after = await json(await attest.GET(req('GET', '/api/governance/ownership-attestations')))
    expect(after.body.data.find((x: any) => x.fact === 'MINORITY_OWNED').attested).toBe(false)
    expect(await prisma.ownershipAttestation.count({ where: { companyId: w.firm.id, fact: 'MINORITY_OWNED' } })).toBe(2)
  })
})

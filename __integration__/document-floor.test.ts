import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'
import { GET as complianceView } from '@/app/api/compliance/route'
import { POST as askFor } from '@/app/api/packets/route'
import { POST as submitCandidates } from '@/app/api/submissions/route'

/**
 * The same certificate, read by three desks on the same day.
 *
 * A supplier's general liability policy is printed today and its cover
 * begins in three weeks. Activation already refused it. The compliance
 * page, the packet that chases documents and the submission door each
 * read the same row through a query that asked when it ran out and never
 * when it started — so the same certificate blocked in one place and
 * read as held in the other two.
 *
 * Every branch of that arithmetic was already under test and every one
 * passed. Only a run against the database catches a column that is never
 * selected, which is why this story is here rather than in a unit test.
 */

const D = '@demo.etyme.local'

const ctx: Record<string, any> = {}

/** Replace a company's general liability cover with one policy on given dates. */
async function coverFrom(companyId: string, validFrom: Date, expiresAt: Date) {
  await prisma.verification.deleteMany({ where: { companyId, type: 'INSURANCE_GL' } })
  const uploader = await prisma.person.findFirstOrThrow({ select: { id: true } })
  await prisma.verification.create({
    data: {
      companyId,
      type: 'INSURANCE_GL',
      status: 'CLEAR',
      // The broker printed it today. The policy period is its own fact.
      issuedAt: day(0),
      validFrom,
      expiresAt,
      verifiedAt: day(0),
      uploadedById: uploader.id,
    },
  })
}

describe('a policy that begins in three weeks reads the same way at every desk', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    // A supplier with somebody on site at a client — the case the
    // compliance page exists for.
    const placement = await prisma.sellContract.findFirstOrThrow({
      where: { state: { in: ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION', 'PAUSED'] } },
      select: {
        companyId: true,
        company: { select: { name: true } },
        clientCompanyId: true,
        clientCompany: { select: { name: true } },
      },
    })
    ctx.supplierId = placement.companyId
    ctx.supplierName = placement.company.name
    ctx.clientId = placement.clientCompanyId
    ctx.clientName = placement.clientCompany.name

    // Somebody who sits at that client, to read the page as.
    const clientSeat = await prisma.context.findFirstOrThrow({
      where: { companyId: ctx.clientId, revokedAt: null, person: { primaryEmail: { endsWith: D } } },
      select: { person: { select: { primaryEmail: true } } },
    })
    ctx.clientEmail = clientSeat.person.primaryEmail

    // A supplier invited to a role that is still open — the submission door.
    const invitation = await prisma.requirementInvitation.findFirstOrThrow({
      where: { requirement: { status: 'OPEN', approvalState: { not: 'PENDING_APPROVAL' } } },
      select: {
        requirementId: true,
        toCompanyId: true,
        toCompany: { select: { name: true } },
        requirement: { select: { companyId: true, payerCompanyId: true } },
      },
    })
    ctx.invitedSupplierId = invitation.toCompanyId
    ctx.invitedSupplierName = invitation.toCompany.name
    ctx.requirementId = invitation.requirementId

    const supplierSeat = await prisma.context.findFirstOrThrow({
      where: {
        companyId: ctx.invitedSupplierId,
        revokedAt: null,
        person: { primaryEmail: { endsWith: D } },
      },
      select: { person: { select: { id: true, primaryEmail: true } } },
    })
    ctx.supplierEmail = supplierSeat.person.primaryEmail
    ctx.anyPersonId = supplierSeat.person.id

    // Both suppliers hold one certificate, and its cover starts in three weeks.
    await coverFrom(ctx.supplierId, day(21), day(386))
    await coverFrom(ctx.invitedSupplierId, day(21), day(386))
  }, 240_000)

  it('the compliance page says the supplier cannot place anybody, and says why in a sentence', async () => {
    as(ctx.clientEmail)
    const res = await json(await complianceView(req('GET', '/api/compliance')))
    expect(res.status, JSON.stringify(res.body)).toBe(200)

    const supplier = res.body.data.verifications.companies.find(
      (c: any) => c.companyId === ctx.supplierId
    )
    expect(supplier, `${ctx.supplierName} is not on the page at all`).toBeTruthy()
    expect(supplier.cover.outcome).toBe('BLOCK')
    expect(supplier.cover.says).toContain('does not start until')
    // Never a code. Somebody reading this has to know what to do next.
    expect(supplier.cover.fix).toContain('nobody starts before the cover does')
  })

  it('and the certificate itself reads as not yet started, rather than as clear', async () => {
    as(ctx.clientEmail)
    const res = await json(await complianceView(req('GET', '/api/compliance')))
    const supplier = res.body.data.verifications.companies.find(
      (c: any) => c.companyId === ctx.supplierId
    )
    const gl = supplier.checks.find((c: any) => c.type === 'INSURANCE_GL')
    // The stored status is CLEAR. What is true today is that it covers
    // nobody, and the computed standing is what the screen shows.
    expect(gl.status).toBe('CLEAR')
    expect(gl.standing).toBe('NOT_YET_VALID')
    expect(gl.validFrom).toBeTruthy()
  })

  it('the supplier is named among those who cannot put anybody forward today', async () => {
    as(ctx.clientEmail)
    const res = await json(await complianceView(req('GET', '/api/compliance')))
    const names = res.body.data.lapsed.map((l: any) => l.companyId)
    expect(names).toContain(ctx.supplierId)
  })

  it('the annual refresh asks the supplier for the certificate instead of calling it already on file', async () => {
    as(ctx.clientEmail)
    const res = await json(
      await askFor(
        req('POST', '/api/packets', {
          packetKey: 'COMPLIANCE_ANNUAL',
          subjectCompanyId: ctx.supplierId,
          recipientEmail: 'broker@example.com',
        })
      )
    )
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect(res.body.data.created).toBe(true)
    const gl = res.body.data.asking.find((a: any) =>
      a.label.toLowerCase().includes('general liability')
    )
    expect(gl, 'the general liability certificate was treated as already held').toBeTruthy()
    expect(gl.why).toContain('does not cover today')
  })

  it('a supplier whose cover begins after the candidate would start cannot submit anybody', async () => {
    as(ctx.supplierEmail)
    const res = await json(
      await submitCandidates(
        req('POST', '/api/submissions', {
          requirementId: ctx.requirementId,
          personIds: [ctx.anyPersonId],
          rate: 9000,
          fromCompanyId: ctx.invitedSupplierId,
        })
      )
    )
    expect(res.status, JSON.stringify(res.body)).toBe(409)
    expect(res.body.error.message).toContain('does not start until')
  }, 60_000)

  it('and the moment the cover has begun, the same submission is not refused for cover', async () => {
    await coverFrom(ctx.invitedSupplierId, day(-10), day(355))
    as(ctx.supplierEmail)
    const res = await json(
      await submitCandidates(
        req('POST', '/api/submissions', {
          requirementId: ctx.requirementId,
          personIds: [ctx.anyPersonId],
          rate: 9000,
          fromCompanyId: ctx.invitedSupplierId,
        })
      )
    )
    // Whatever else this person's paperwork says, the cover is no longer
    // the reason. Anything else is a per-candidate answer in the batch.
    expect(res.body?.error?.code).not.toBe('COVER_LAPSED')
  }, 60_000)

  it('and the compliance page stops naming the other supplier the moment its cover starts', async () => {
    await coverFrom(ctx.supplierId, day(-10), day(355))
    as(ctx.clientEmail)
    const res = await json(await complianceView(req('GET', '/api/compliance')))
    const supplier = res.body.data.verifications.companies.find(
      (c: any) => c.companyId === ctx.supplierId
    )
    expect(supplier.cover.outcome).not.toBe('BLOCK')
    const gl = supplier.checks.find((c: any) => c.type === 'INSURANCE_GL')
    expect(gl.standing).not.toBe('NOT_YET_VALID')
  })
})

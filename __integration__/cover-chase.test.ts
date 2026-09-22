import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'
import { GET as nightlyWatch } from '@/app/api/cron/watch/route'
import { GET as placement } from '@/app/api/placements/[id]/route'

/**
 * The weeks nobody is insured, and who hears about them.
 *
 * Two desks read a supplier's cover and both of them read it wrong. The
 * nightly chase asked only what was expiring, so a supplier whose policy
 * lapsed in September and whose renewal begins in October was never
 * chased for the days in between — and those days are the only ones that
 * matter, because they are the ones somebody is standing on a site with
 * nothing behind them. The placement thread echoed the sub-vendor's
 * stored status, so a certificate that blocked at activation read "Clear"
 * on the screen an hour earlier.
 */

const ctx: Record<string, any> = {}
let secretBefore: string | undefined

/** Give a company exactly one general liability policy, on these dates. */
async function coverFrom(companyId: string, validFrom: Date, expiresAt: Date) {
  await prisma.verification.deleteMany({ where: { companyId, type: 'INSURANCE_GL' } })
  const uploader = await prisma.person.findFirstOrThrow({ select: { id: true } })
  await prisma.verification.create({
    data: {
      companyId,
      type: 'INSURANCE_GL',
      status: 'CLEAR',
      issuedAt: day(-2),
      validFrom,
      expiresAt,
      verifiedAt: day(-2),
      uploadedById: uploader.id,
    },
  })
}

describe('a supplier whose cover has not begun is chased for the weeks nobody is insured', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    secretBefore = process.env.CRON_SECRET
    process.env.CRON_SECRET = 'cover-chase-test'

    // A placement bought through a firm below us — the only case where a
    // sub-vendor's cover appears on the thread at all.
    const link = await prisma.contractLink.findFirstOrThrow({
      where: { buyContract: { vendorCompanyId: { not: null } } },
      select: {
        sellContractId: true,
        buyContract: { select: { vendorCompanyId: true, vendorCompany: { select: { name: true } } } },
        sellContract: {
          select: {
            companyId: true,
            company: { select: { name: true } },
          },
        },
      },
    })
    ctx.placementId = link.sellContractId
    ctx.subVendorId = link.buyContract.vendorCompanyId
    ctx.subVendorName = link.buyContract.vendorCompany!.name
    ctx.sellerId = link.sellContract.companyId

    // Somebody at the firm that owns the placement, to read it as.
    const seat = await prisma.context.findFirstOrThrow({
      where: { companyId: ctx.sellerId, revokedAt: null },
      select: { person: { select: { primaryEmail: true } } },
    })
    ctx.sellerEmail = seat.person.primaryEmail

    // The sub-vendor's only policy begins in three weeks.
    await coverFrom(ctx.subVendorId, day(21), day(386))
  }, 240_000)

  afterAll(() => {
    if (secretBefore === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = secretBefore
  })

  it('the nightly chase names the supplier whose cover starts next month, and says how long nobody is insured', async () => {
    const res = await json(
      await nightlyWatch(
        req('GET', '/api/cron/watch?dry=1', undefined, { authorization: 'Bearer cover-chase-test' })
      )
    )
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const gap = res.body.data.findings.find(
      (f: any) => f.kind === 'COVER_NOT_STARTED' && f.headline.includes(ctx.subVendorName)
    )
    expect(gap, `${ctx.subVendorName} was not chased at all`).toBeTruthy()
    expect(gap.detail).toContain('nobody is insured through them for the next 21 days')
    // "Renew it" is an instruction nobody can follow about a policy that
    // has not started, and the certificate is already the newest there is.
    expect(gap.detail).toContain('Renewing is not the ask')
    expect(gap.urgency).toBe('BLOCKING')
  }, 120_000)

  it('and it asks that supplier for the certificate, instead of treating the policy that starts later as on file', async () => {
    await prisma.documentPacket.deleteMany({ where: { subjectCompanyId: ctx.subVendorId } })
    const res = await json(
      await nightlyWatch(
        req('GET', '/api/cron/watch', undefined, { authorization: 'Bearer cover-chase-test' })
      )
    )
    expect(res.status, JSON.stringify(res.body)).toBe(200)

    const asked = await prisma.documentPacket.findFirst({
      where: { subjectCompanyId: ctx.subVendorId, cancelledAt: null },
      select: { reopenedReason: true, items: { select: { key: true } } },
    })
    expect(asked, 'nobody asked the supplier for anything').toBeTruthy()
    expect(asked!.items.map((i) => i.key)).toContain('INSURANCE_GL')
    // What the supplier is told is the finding's own sentence, not a
    // renewal notice for a policy they have already sent.
    expect(asked!.reopenedReason).toContain('nobody is insured')
  }, 120_000)

  it('the letter comes from the firm that pays the supplier, not from the supplier to itself', async () => {
    // A prime buying through a sub holds a buy line against that sub and
    // the sub holds nothing of its own, so the chase found no buyer above
    // it at all: the letter was raised by the sub, to the sub, saying
    // "remind yourself", while the prime that pays it — and whose
    // placement a lapse actually stops — heard nothing.
    const asked = await prisma.documentPacket.findFirstOrThrow({
      where: { subjectCompanyId: ctx.subVendorId, cancelledAt: null },
      select: { companyId: true },
    })
    expect(asked.companyId).toBe(ctx.sellerId)
    expect(asked.companyId).not.toBe(ctx.subVendorId)
  }, 120_000)

  it('and the same letter asks for the document the buyer wrote onto its own line, not only the shipped annual list', async () => {
    // The crack this closes: the nightly finding refused a start and
    // chased a firm for a document the buyer had asked for on its own
    // order, and the letter that then went out asked only for what the
    // shipped `COMPLIANCE_ANNUAL` packet lists. Chased for one thing,
    // asked for another.
    const buy = await prisma.buyContract.findFirstOrThrow({
      where: { vendorCompanyId: ctx.subVendorId, companyId: ctx.sellerId },
      select: { id: true },
    })
    await prisma.documentType.upsert({
      where: { companyId_key: { companyId: ctx.sellerId, key: 'GOOD_STANDING' } },
      create: {
        companyId: ctx.sellerId,
        key: 'GOOD_STANDING',
        label: 'Certificate of good standing',
        purpose: 'COMPLIANCE',
        validityShape: 'START_AND_END',
        suppliedBy: 'SUPPLIER',
        blocks: true,
      },
      update: {},
    })
    await prisma.documentRequirement.upsert({
      where: { buyContractId_documentTypeKey: { buyContractId: buy.id, documentTypeKey: 'GOOD_STANDING' } },
      create: {
        buyContractId: buy.id,
        documentTypeKey: 'GOOD_STANDING',
        required: true,
        owedBy: 'SUPPLIER',
        note: 'We do not pay a firm that is not in good standing where it is registered.',
      },
      update: {},
    })

    await prisma.documentPacket.deleteMany({ where: { subjectCompanyId: ctx.subVendorId } })
    const res = await json(
      await nightlyWatch(
        req('GET', '/api/cron/watch', undefined, { authorization: 'Bearer cover-chase-test' })
      )
    )
    expect(res.status, JSON.stringify(res.body)).toBe(200)

    const asked = await prisma.documentPacket.findFirst({
      where: { subjectCompanyId: ctx.subVendorId, cancelledAt: null },
      select: { items: { select: { key: true } } },
    })
    expect(asked, 'nobody asked the supplier for anything').toBeTruthy()
    const keys = asked!.items.map((i) => i.key)
    // Still asked for the thing that triggered the chase...
    expect(keys).toContain('INSURANCE_GL')
    // ...and now also for the thing the buyer's own line requires.
    expect(keys).toContain('GOOD_STANDING')
  }, 120_000)

  it('and the automation log says in plain English why it asked, and that cancelling undoes it', async () => {
    const logged = await prisma.automationLog.findFirst({
      where: { action: 'PACKET_REOPENED' },
      orderBy: { at: 'desc' },
      select: { reason: true, reversible: true },
    })
    expect(logged).toBeTruthy()
    expect(logged!.reversible).toBe(true)
    expect(logged!.reason.length).toBeGreaterThan(20)
  })

  it('the placement thread reads the sub-vendor’s cover as not started yet, rather than as the stored clear', async () => {
    as(ctx.sellerEmail)
    const res = await json(
      await placement(req('GET', `/api/placements/${ctx.placementId}`), {
        params: Promise.resolve({ id: ctx.placementId }),
      })
    )
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const gl = res.body.data.compliance.supplierCover.find((c: any) => c.type === 'INSURANCE_GL')
    expect(gl, 'the sub-vendor’s cover is not on the thread at all').toBeTruthy()
    // The stored status is the fact about the record. The standing is
    // what is true today, and they disagree.
    expect(gl.status).toBe('CLEAR')
    expect(gl.standing).toBe('NOT_YET_VALID')
    expect(gl.says).toContain('does not start until')
  }, 60_000)

  it('and the thread says the firm below cannot put anybody forward, in the same words the submission door uses', async () => {
    as(ctx.sellerEmail)
    const res = await json(
      await placement(req('GET', `/api/placements/${ctx.placementId}`), {
        params: Promise.resolve({ id: ctx.placementId }),
      })
    )
    const cover = res.body.data.compliance.subVendorCover
    expect(cover).toBeTruthy()
    expect(cover.vendor).toBe(ctx.subVendorName)
    expect(cover.outcome).toBe('BLOCK')
    expect(cover.says).toContain('until that cover begins')
    expect(cover.fix).toContain('nobody starts before the cover does')
  }, 60_000)

  it('and the moment the cover has begun the same thread reads it as in force, and nobody is chased', async () => {
    await coverFrom(ctx.subVendorId, day(-10), day(355))
    as(ctx.sellerEmail)
    const res = await json(
      await placement(req('GET', `/api/placements/${ctx.placementId}`), {
        params: Promise.resolve({ id: ctx.placementId }),
      })
    )
    const gl = res.body.data.compliance.supplierCover.find((c: any) => c.type === 'INSURANCE_GL')
    expect(gl.standing).toBe('VALID')

    const watched = await json(
      await nightlyWatch(
        req('GET', '/api/cron/watch?dry=1', undefined, { authorization: 'Bearer cover-chase-test' })
      )
    )
    const gaps = watched.body.data.findings.filter(
      (f: any) => f.kind === 'COVER_NOT_STARTED' && f.headline.includes(ctx.subVendorName)
    )
    expect(gaps).toEqual([])
  }, 120_000)
})

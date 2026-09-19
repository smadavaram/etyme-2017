import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'
import { GET as types, POST as defineType, PATCH as changeType } from '@/app/api/document-types/route'
import { contractClearance } from '@/lib/contract-clearance'

/**
 * The document dictionary is the company's, and the validity window has a
 * start.
 *
 * Two facts have to be true against a real database and not only in
 * arithmetic: a firm can add a document type nobody wrote into the enum,
 * and a certificate of insurance whose cover begins next month reads as
 * covering nobody today. The second is the one that was wrong.
 */

const D = '@demo.etyme.local'
const PINNACLE = `world-pinnacle${D}`

const ctx: Record<string, any> = {}

describe('the dictionary is the company’s, and validity has a floor', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    const pinnacle = await prisma.company.findUniqueOrThrow({
      where: { slug: 'world-pinnacle' },
      select: { id: true, name: true },
    })
    ctx.companyId = pinnacle.id
    ctx.companyName = pinnacle.name
  }, 240_000)

  it('a firm that has defined nothing already has an I-9, a W-9 and a certificate of insurance', async () => {
    as(PINNACLE)
    const res = await json(await types(req('GET', '/api/document-types')))
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const keys = res.body.data.types.map((t: any) => t.key)
    expect(keys).toContain('I9_EVERIFY')
    expect(keys).toContain('W9')
    expect(keys).toContain('INSURANCE_GL')
    // Nothing was written to get them. A company that never customizes
    // never has a row, so a default added next month reaches it too.
    expect(await prisma.documentType.count({ where: { companyId: ctx.companyId } })).toBe(0)
  })

  it('a firm can add a document nobody here has ever heard of, without a migration', async () => {
    as(PINNACLE)
    const res = await json(
      await defineType(
        req('POST', '/api/document-types', {
          key: 'SITE_INDUCTION',
          label: 'Site induction certificate',
          hint: 'Issued by the plant after the half-day safety walk.',
          purpose: 'COMPLIANCE',
          validityShape: 'START_AND_END',
          validMonths: 24,
        })
      )
    )
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const back = await json(await types(req('GET', '/api/document-types')))
    const added = back.body.data.types.find((t: any) => t.key === 'SITE_INDUCTION')
    expect(added.label).toBe('Site induction certificate')
    expect(added.shapeSays).toContain('Cover that begins next month')
  })

  it('adding the same code twice is refused in a sentence, not with a code', async () => {
    as(PINNACLE)
    const res = await json(
      await defineType(
        req('POST', '/api/document-types', {
          key: 'SITE_INDUCTION',
          label: 'Site induction',
          purpose: 'COMPLIANCE',
          validityShape: 'NONE',
        })
      )
    )
    expect(res.status).toBe(422)
    expect(res.body.error.message).toContain('Edit that one')
  })

  it('a firm can call our certificate of insurance whatever its own people call it', async () => {
    as(PINNACLE)
    const res = await json(
      await changeType(req('PATCH', '/api/document-types', { key: 'INSURANCE_GL', label: 'Public liability certificate' }))
    )
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const back = await json(await types(req('GET', '/api/document-types')))
    const gl = back.body.data.types.find((t: any) => t.key === 'INSURANCE_GL')
    expect(gl.label).toBe('Public liability certificate')
    // Renaming it does not stop it blocking a start.
    expect(gl.blocks).toBe(true)
  })

  it('a firm says which edition of the I-9 is the current one, and the form to fill in today changes', async () => {
    as(PINNACLE)
    for (const e of [
      { edition: '07/17/2017', effectiveFrom: '2017-09-18', retiredAt: '2023-11-01' },
      { edition: '08/01/2023', effectiveFrom: '2023-08-01' },
    ]) {
      const res = await json(
        await defineType(req('POST', '/api/document-types', { key: 'I9_EVERIFY', ...e, source: 'Federal Register' }))
      )
      expect(res.status, JSON.stringify(res.body)).toBe(200)
    }
    const back = await json(await types(req('GET', '/api/document-types')))
    const i9 = back.body.data.types.find((t: any) => t.key === 'I9_EVERIFY')
    expect(i9.editionToUse).toBe('08/01/2023')
  })

  it('recording an edition against a document the issuer does not reissue is refused, and says why', async () => {
    as(PINNACLE)
    const res = await json(
      await defineType(req('POST', '/api/document-types', { key: 'DEGREE', edition: 'v2', effectiveFrom: '2024-01-01' }))
    )
    expect(res.status).toBe(409)
    expect(res.body.error.message).toContain('not marked as a form that gets reissued')
  })

  it('a certificate of insurance whose cover begins next month is stored with its start, and covers nobody today', async () => {
    // The firm's only general liability certificate is the new one. Its
    // seeded, currently-valid certificate is cleared out first, because a
    // firm holding both is the separate case — and the right answer there
    // is that it is covered, which the unit suite holds.
    await prisma.verification.deleteMany({ where: { companyId: ctx.companyId, type: 'INSURANCE_GL' } })

    const start = day(30)
    const cert = await prisma.verification.create({
      data: {
        companyId: ctx.companyId,
        type: 'INSURANCE_GL',
        status: 'CLEAR',
        // Printed today by the broker; the policy period starts in a month.
        issuedAt: day(0),
        validFrom: start,
        expiresAt: day(395),
        verifiedAt: day(0),
        uploadedById: (await prisma.person.findFirstOrThrow({ select: { id: true } })).id,
      },
      select: { id: true, validFrom: true },
    })
    expect(cert.validFrom?.getTime()).toBe(start.getTime())

    const rows = await prisma.verification.findMany({
      where: { companyId: ctx.companyId, type: { in: ['INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER'] } },
      select: { type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true, verifiedAt: true },
    })

    const verdict = contractClearance({
      personName: 'Priya Raman',
      personVerifications: [
        { type: 'I9_EVERIFY', status: 'CLEAR' },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: day(300) },
      ],
      supplierName: ctx.companyName,
      supplierCertificates: rows,
      on: new Date(),
      extraHeld: [{ key: 'NDA', expiresAt: null, accepted: true }],
    })

    expect(verdict.outcome).toBe('BLOCK')
    expect(verdict.says.toLowerCase()).not.toContain('cleared to start')
  })

  it('and the moment the cover has started, the same firm clears', async () => {
    await prisma.verification.updateMany({
      where: { companyId: ctx.companyId, type: 'INSURANCE_GL' },
      data: { validFrom: day(-10) },
    })
    const rows = await prisma.verification.findMany({
      where: { companyId: ctx.companyId, type: { in: ['INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER'] } },
      select: { type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true, verifiedAt: true },
    })
    const verdict = contractClearance({
      personName: 'Priya Raman',
      personVerifications: [
        { type: 'I9_EVERIFY', status: 'CLEAR' },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: day(300) },
      ],
      supplierName: ctx.companyName,
      supplierCertificates: rows,
      on: new Date(),
      extraHeld: [{ key: 'NDA', expiresAt: null, accepted: true }],
    })
    expect(verdict.outcome).not.toBe('BLOCK')
  })

  it('an I-9 records the document it was completed from, and reads back as backed by it', async () => {
    const person = await prisma.person.findFirstOrThrow({ select: { id: true } })
    const passport = await prisma.verification.create({
      data: {
        personId: person.id,
        type: 'PASSPORT',
        status: 'CLEAR',
        issuedAt: day(-400),
        expiresAt: day(1200),
        uploadedById: person.id,
      },
      select: { id: true },
    })
    const i9 = await prisma.verification.create({
      data: {
        personId: person.id,
        type: 'I9_EVERIFY',
        status: 'CLEAR',
        issuedAt: day(-20),
        formEdition: '08/01/2023',
        uploadedById: person.id,
      },
      select: { id: true },
    })
    await prisma.documentBacking.create({
      data: { formId: i9.id, evidenceId: passport.id, satisfiedKey: 'PASSPORT', recordedById: person.id },
    })

    const back = await prisma.verification.findUniqueOrThrow({
      where: { id: i9.id },
      select: { formEdition: true, backedBy: { select: { evidence: { select: { type: true } } } } },
    })
    expect(back.formEdition).toBe('08/01/2023')
    expect(back.backedBy.map((b) => b.evidence.type)).toEqual(['PASSPORT'])
  })
})

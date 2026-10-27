import { describe, it, expect, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as myPapers, PUT as putOwn } from '@/app/api/me/papers/route'
import { POST as documents } from '@/app/api/documents/route'

/**
 * A paper put on file by its holder before anybody asks (release walk,
 * 2026-10-27). Colleen Byrne is Byrne Critical Care LLC, a one-person
 * firm: she files the firm's W-9 and certificate, and her own nursing
 * license. A candidate with no firm files her license by its number.
 * Neither paper is examined, so neither clears a start.
 */

const it_: Record<string, any> = {}

function form(fields: Record<string, string>, file?: { name: string; type: string; text: string }): NextRequest {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  if (file) f.set('file', new File([file.text], file.name, { type: file.type }))
  return new NextRequest('http://localhost:3000/api/me/papers', { method: 'PUT', body: f })
}

describe('papers put on file by their holder', () => {
  beforeAll(async () => {
    await freshWorld()
    const colleen = await prisma.person.findFirstOrThrow({ where: { name: 'Colleen Byrne' }, select: { id: true, primaryEmail: true } })
    const firm = await prisma.company.findFirstOrThrow({ where: { kind: 'CONSULTANT_CORP', contexts: { some: { personId: colleen.id } } }, select: { id: true } })
    it_.colleen = colleen
    it_.firm = firm.id
    const nina = await prisma.person.create({ data: { name: 'Nina Okafor', primaryEmail: 'nina.okafor.own@gmail.com' } })
    // The seat a candidate's own sign-up makes: CONSULTANT, of no firm.
    await prisma.context.create({ data: { personId: nina.id, type: 'CONSULTANT', side: 'SELL', grantReason: 'Signed up herself' } })
    it_.nina = nina
  }, 240_000)

  it('a one-person firm puts its own W-9, insurance and license on file from Paperwork, and is never asked to ask herself', async () => {
    as(it_.colleen.primaryEmail)
    const view = await json(await myPapers(req('GET', '/api/me/papers?view=own')))
    expect(view.status, JSON.stringify(view.body)).toBe(200)
    expect(view.body.data.firm.id).toBe(it_.firm)
    expect(view.body.data.menu.slice(0, 3).map((m: any) => m.key)).toEqual(['W9', 'INSURANCE_GL', 'INSURANCE_WC'])

    const w9 = await json(await putOwn(form({ key: 'W9', about: 'MY_FIRM', edition: 'Rev. March 2024' }, { name: 'w9.pdf', type: 'application/pdf', text: '%PDF-1.4 w9' })))
    expect(w9.status, JSON.stringify(w9.body)).toBe(201)
    const gl = await json(await putOwn(form(
      { key: 'INSURANCE_GL', about: 'MY_FIRM', validFrom: '2026-09-01', validUntil: '2027-08-31' },
      { name: 'coi.pdf', type: 'application/pdf', text: '%PDF-1.4 coi' },
    )))
    expect(gl.status, JSON.stringify(gl.body)).toBe(201)
    const rn = await json(await putOwn(form(
      { key: 'PROFESSIONAL_LICENSE', about: 'ME', number: 'RN-301122', issuer: 'Wisconsin Board of Nursing', validUntil: '2027-02-28' },
      { name: 'rn.pdf', type: 'application/pdf', text: '%PDF-1.4 rn' },
    )))
    expect(rn.status, JSON.stringify(rn.body)).toBe(201)
    expect(rn.body.data.says).toContain('Your professional license is on file, runs out Feb 28, 2027. Nobody has examined it yet')

    const coi = await prisma.verification.findUniqueOrThrow({ where: { id: gl.body.data.verificationId }, include: { documents: true } })
    expect([coi.companyId, coi.status, coi.uploadedById, coi.verifiedById]).toEqual([it_.firm, 'PENDING', it_.colleen.id, null])
    expect(coi.documents[0].fileUrl).toBe(`/api/documents/${gl.body.data.docId}/file`)
    const kept = await prisma.docInstance.findUniqueOrThrow({ where: { id: gl.body.data.docId }, include: { file: true } })
    expect([kept.status, kept.subjectType, kept.subjectId, kept.file?.sizeBytes]).toEqual(['KEPT', 'COMPANY', it_.firm, 12])

    const after = await json(await myPapers(req('GET', '/api/me/papers?view=own')))
    expect(after.body.data.onFile.map((f: any) => [f.key, f.about, f.says]).sort()).toEqual([
      ['INSURANCE_GL', 'MY_FIRM', 'On file, not examined'],
      ['PROFESSIONAL_LICENSE', 'ME', 'On file, not examined'],
      ['W9', 'MY_FIRM', 'On file, not examined'],
    ])

    // Her asks list is unchanged by what she kept: a kept paper answers no ask.
    const asks = await json(await myPapers(req('GET', '/api/me/papers')))
    expect(JSON.stringify(asks.body)).not.toContain(gl.body.data.docId)

    // Nobody asks herself for a document.
    const t = await json(await documents(req('POST', '/api/documents', { type: 'template', name: 'Site badge', audience: 'GENERAL', needsSignature: false })))
    if (t.status === 201) {
      const self = await json(await documents(req('POST', '/api/documents', { type: 'instance', templateId: t.body.data.template.id, subjectType: 'PERSON', subjectId: it_.colleen.id })))
      expect(self.status).toBe(409)
      expect(self.body.error.message).toBe('You cannot ask yourself for a document. Put your own papers on file from Paperwork instead.')
    }
  })

  it('a worker adds her own license or certificate from Your paperwork', async () => {
    as(it_.nina.primaryEmail)
    const view = await json(await myPapers(req('GET', '/api/me/papers?view=own')))
    expect(view.status, JSON.stringify(view.body)).toBe(200)
    expect(view.body.data.firm).toBeNull()
    expect(view.body.data.menu.map((m: any) => m.key)).toEqual(['PROFESSIONAL_LICENSE', 'DEGREE', 'EDUCATION_EVALUATION'])

    const rn = await json(await putOwn(req('PUT', '/api/me/papers', { key: 'PROFESSIONAL_LICENSE', number: 'RN-88', issuer: 'Ohio Board of Nursing', validUntil: '2028-01-31' })))
    expect(rn.status, JSON.stringify(rn.body)).toBe(201)
    const v = await prisma.verification.findUniqueOrThrow({ where: { id: rn.body.data.verificationId } })
    expect([v.personId, v.status, v.referenceId, v.provider]).toEqual([it_.nina.id, 'PENDING', 'RN-88', 'Ohio Board of Nursing'])
  })

  it('an I-9 and a background check are never collected before an offer, even offered freely', async () => {
    as(it_.nina.primaryEmail)
    for (const key of ['I9_EVERIFY', 'PASSPORT', 'BACKGROUND_CHECK']) {
      const r = await json(await putOwn(req('PUT', '/api/me/papers', { key, validUntil: '2030-01-01' })))
      expect(r.status, key).toBe(422)
      expect(r.body.error.code).toBe('NOT_OWN_PAPER')
    }
    expect(await prisma.verification.count({ where: { personId: it_.nina.id, type: { in: ['I9_EVERIFY', 'PASSPORT', 'BACKGROUND_CHECK'] } } })).toBe(0)
  })
})

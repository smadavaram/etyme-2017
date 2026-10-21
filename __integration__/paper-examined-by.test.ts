import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { POST as examinePOST } from '@/app/api/documents/[id]/examine/route'

/**
 * Who looked at a paper, and when, is a fact on the paper.
 *
 * Until the schema carried `examinedById` and `examinedAt`, a paper
 * accepted by HR and a paper that merely arrived looked the same to every
 * reader but the note. Accepting it now writes the two columns; sending it
 * back clears them, because a paper sent back is not held and nobody has
 * examined what will come next.
 */

const HR_AT_HALCYON = 'world-halcyon@demo.etyme.local'
const HIM = 'samuel.adeyinka@seed.etyme.invalid'

let docId = ''
let hrId = ''

describe('a paper examined', () => {
  beforeAll(async () => {
    await freshWorld()
    const [hr, person] = await Promise.all([
      prisma.person.findUniqueOrThrow({ where: { primaryEmail: HR_AT_HALCYON }, select: { id: true } }),
      prisma.person.findUniqueOrThrow({ where: { primaryEmail: HIM }, select: { id: true } }),
    ])
    hrId = hr.id
    const seat = await prisma.context.findFirstOrThrow({ where: { personId: hr.id, revokedAt: null, companyId: { not: null } }, select: { companyId: true } })
    const template = await prisma.docTemplate.create({ data: { companyId: seat.companyId!, name: 'Resume', audience: 'CANDIDATE' } })
    const doc = await prisma.docInstance.create({
      data: { templateId: template.id, subjectType: 'PERSON', subjectId: person.id, status: 'UPLOADED', sentAt: new Date(), fileName: 'resume.pdf' },
    })
    docId = doc.id
  })

  it('accepting a paper records who examined it and when', async () => {
    as(HR_AT_HALCYON)
    const res = await json(await examinePOST(req('POST', `/api/documents/${docId}/examine`, { verdict: 'ACCEPT' }), { params: Promise.resolve({ id: docId }) }))
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const doc = await prisma.docInstance.findUniqueOrThrow({ where: { id: docId }, select: { examinedById: true, examinedAt: true } })
    expect(doc.examinedById).toBe(hrId)
    expect(doc.examinedAt).not.toBeNull()
  })

  it('sending a paper back clears who examined it, because what comes next has not been looked at', async () => {
    as(HR_AT_HALCYON)
    const res = await json(await examinePOST(req('POST', `/api/documents/${docId}/examine`, { verdict: 'SEND_BACK', reason: 'This is last year’s resume' }), { params: Promise.resolve({ id: docId }) }))
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const doc = await prisma.docInstance.findUniqueOrThrow({ where: { id: docId }, select: { examinedById: true, examinedAt: true, status: true } })
    expect(doc.status).toBe('SENT')
    expect(doc.examinedById).toBeNull()
    expect(doc.examinedAt).toBeNull()
  })
})

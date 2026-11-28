import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { POST as examinePOST } from '@/app/api/documents/[id]/examine/route'
import { POST as uploadPOST } from '@/app/api/documents/[id]/upload/route'

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

  it('a paper sent back and sent again reaches each seat at the asking firm once per answer, never the same line twice', async () => {
    // Sent back by the last sentence, so it is asked for again: he answers, it is sent back, he answers again.
    as(HIM)
    const one = await json(await uploadPOST(req('POST', `/api/documents/${docId}/upload`, { fileUrl: 'https://files.example/resume-1.pdf', fileName: 'resume-1.pdf' }), { params: Promise.resolve({ id: docId }) }))
    expect(one.status, JSON.stringify(one.body)).toBe(200)
    as(HR_AT_HALCYON)
    const back = await json(await examinePOST(req('POST', `/api/documents/${docId}/examine`, { verdict: 'SEND_BACK', reason: 'The wrong year again' }), { params: Promise.resolve({ id: docId }) }))
    expect(back.status, JSON.stringify(back.body)).toBe(200)
    as(HIM)
    const two = await json(await uploadPOST(req('POST', `/api/documents/${docId}/upload`, { fileUrl: 'https://files.example/resume-2.pdf', fileName: 'resume-2.pdf' }), { params: Promise.resolve({ id: docId }) }))
    expect(two.status, JSON.stringify(two.body)).toBe(200)
    // The notices are written without waiting; give them a moment to land.
    await new Promise((r) => setTimeout(r, 500))
    const told = await prisma.notification.findMany({ where: { entityId: docId, personId: hrId }, select: { title: true } })
    const titles = told.map((t) => t.title).filter((t) => t.includes('uploaded'))
    expect(titles.length).toBeGreaterThanOrEqual(2)
    expect(new Set(titles).size, titles.join(' | ')).toBe(titles.length)
    expect(titles.some((t) => t.endsWith('uploaded Resume again'))).toBe(true)
  })
})

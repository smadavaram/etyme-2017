import { describe, it, expect, beforeAll } from 'vitest'
import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { as, req, json, prisma, freshWorld } from './harness'
import { PUT as putOwn } from '@/app/api/me/papers/route'
import { GET as documentsGet } from '@/app/api/documents/route'
import { paperExaminersAt } from '@/lib/notify/paper-examiners'
import { SAME_FILE_ELSEWHERE } from '@/lib/document-stages/degree'

/**
 * Walk 8, item 7 (2026-11-09), on the seeded world. Ingrid Sørensen is
 * Pinnacle Resourcing's, on its line to Northbend Athletic. Helena Marsh
 * is Techpeple's, under Computer Systems; Pinnacle holds nothing of
 * hers. Lucía Fernández is on Pinnacle's own running line. The walker
 * filed the same bytes for all of them, and Pinnacle's HR read Helena's
 * name. Pinnacle may read Lucía's name and never Helena's, and the degree
 * Ingrid put on her own record has to be on a list Pinnacle's HR works.
 */

const ctx: Record<string, any> = {}
const LABEL = 'Degree certificate and transcripts'
const SAME_AS_HELENAS = '%PDF-1.4 a degree certificate the walker reused'
const SAME_AS_LUCIAS = '%PDF-1.4 a second certificate the walker reused'
const sha = (text: string) => createHash('sha256').update(Buffer.from(text)).digest('hex')

function degreeForm(fileText: string): NextRequest {
  const f = new FormData()
  for (const [k, v] of Object.entries({
    key: 'DEGREE', about: 'ME', issuer: 'University of Copenhagen',
    qualification: 'Bachelor of Science in Computer Science', year: '2015',
  })) f.set(k, v)
  f.set('file', new File([fileText], 'degree.pdf', { type: 'application/pdf' }))
  return new NextRequest('http://localhost:3000/api/me/papers', { method: 'PUT', body: f })
}

/** A degree already on somebody's own record, with the file's bytes, the way her own upload keeps it. */
async function degreeOnTheirRecord(personId: string, fileText: string) {
  await prisma.verification.create({
    data: {
      personId, type: 'DEGREE', status: 'PENDING', provider: 'Some university', uploadedById: personId,
      documents: { create: { fileName: 'degree.pdf', fileUrl: '/api/me/papers?file=x', contentType: 'application/pdf', sizeBytes: fileText.length, bytes: Buffer.from(fileText), fileHash: sha(fileText) } },
    },
  })
}

/** The notices Pinnacle's examiners got about her degree since `since`, waiting a moment for the bulk write. */
async function hrNotices(since: Date) {
  for (let i = 0; i < 30; i++) {
    const rows = await prisma.notification.findMany({
      where: { personId: { in: ctx.hr }, companyId: ctx.pinnacle.id, title: 'Ingrid Sørensen put a degree certificate on file', createdAt: { gte: since } },
      select: { body: true, entityId: true },
    })
    if (rows.length) return rows
    await new Promise((r) => setTimeout(r, 100))
  }
  return []
}

describe('the same degree file stays inside the reading firm’s walls', () => {
  beforeAll(async () => {
    await freshWorld()
    const [ingrid, helena, lucia] = await Promise.all(
      ['Ingrid Sørensen', 'Helena Marsh', 'Lucía Fernández'].map((name) =>
        prisma.person.findFirstOrThrow({ where: { name }, select: { id: true, name: true, primaryEmail: true } })),
    )
    const line = await prisma.sellContract.findFirstOrThrow({ where: { personId: ingrid.id, state: { notIn: ['ENDED', 'CANCELLED'] } }, select: { company: { select: { id: true, name: true } } } })
    Object.assign(ctx, { ingrid, helena, lucia, pinnacle: line.company })

    // Ingrid signs in as herself: the seat a worker's own sign-up makes, where the seed gave her none.
    if (!(await prisma.context.findFirst({ where: { personId: ingrid.id, revokedAt: null } }))) {
      await prisma.context.create({ data: { personId: ingrid.id, type: 'CONSULTANT', side: 'SELL', grantReason: 'Signed in herself' } })
    }
    ctx.hr = await paperExaminersAt(ctx.pinnacle.id, ingrid.id)
    const hrSeat = await prisma.person.findUniqueOrThrow({ where: { id: ctx.hr[0] }, select: { primaryEmail: true } })
    ctx.hrEmail = hrSeat.primaryEmail

    await degreeOnTheirRecord(helena.id, SAME_AS_HELENAS)
    await degreeOnTheirRecord(lucia.id, SAME_AS_LUCIAS)
    ctx.since = new Date()
  }, 240_000)

  it('the seeded world is the walk’s: Pinnacle holds Lucía Fernández on its own line, and nothing of Helena Marsh’s', async () => {
    const firm = ctx.pinnacle.id
    const holds = async (personId: string) => (await Promise.all([
      prisma.context.count({ where: { personId, companyId: firm, type: 'EMPLOYEE', revokedAt: null } }),
      prisma.sellContract.count({ where: { personId, OR: [{ companyId: firm }, { clientCompanyId: firm }, { endClientCompanyId: firm }] } }),
      prisma.buyContractCandidate.count({ where: { personId, buyContract: { companyId: firm } } }),
      prisma.benchListing.count({ where: { companyId: firm, state: 'GRANTED', revokedAt: null, consultant: { personId } } }),
    ])).reduce((a, b) => a + b, 0)
    expect(ctx.pinnacle.name).toBe('Pinnacle Resourcing')
    expect(ctx.hr.length).toBeGreaterThan(0)
    expect(await holds(ctx.lucia.id)).toBeGreaterThan(0)
    expect(await holds(ctx.helena.id)).toBe(0)
  })

  it('a duplicate degree file filed for a worker at another firm is said to her employer’s HR without naming them or their firm', async () => {
    as(ctx.ingrid.primaryEmail)
    const put = await json(await putOwn(degreeForm(SAME_AS_HELENAS)))
    expect(put.status, JSON.stringify(put.body)).toBe(201)
    ctx.firstReply = put.body.data

    const notices = await hrNotices(ctx.since)
    expect(notices.length).toBeGreaterThan(0)
    for (const n of notices) {
      expect(n.body).toContain(SAME_FILE_ELSEWHERE)
      expect(n.body).not.toContain('Helena')
      expect(n.body).not.toMatch(/Techpeple|Computer Systems/)
    }
    ctx.firstNotice = notices[0]
  })

  it('nothing about the worker at the other firm is written or told by the check, and Pinnacle’s own log records it', async () => {
    expect(await prisma.accessLog.count({ where: { subjectId: ctx.helena.id, at: { gte: ctx.since } } })).toBe(0)
    expect(await prisma.notification.count({ where: { personId: ctx.helena.id, createdAt: { gte: ctx.since } } })).toBe(0)
    const ours = await prisma.accessLog.findMany({
      where: { subjectId: ctx.ingrid.id, actorCompanyId: ctx.pinnacle.id, action: 'COMPLIANCE_CHECK', at: { gte: ctx.since } },
      select: { reason: true },
    })
    expect(ours.some((r) => (r.reason ?? '').includes('same degree file'))).toBe(true)
  })

  it('the worker is never told another person’s name or that the file is anybody else’s', () => {
    expect(ctx.firstReply.says).not.toContain('Helena')
    expect(ctx.firstReply.says).not.toContain('another person')
  })

  it('a worker’s degree on file is shown to her employer’s HR beside her other papers with the three doors', async () => {
    as(ctx.hrEmail)
    const list = await json(await documentsGet(req('GET', '/api/documents?view=instances')))
    expect(list.status, JSON.stringify(list.body)).toBe(200)
    const rows = (list.body.data.instances as any[]).filter((r) => r.subject === 'Ingrid Sørensen' && r.template.name === LABEL)
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row.status).toBe('UPLOADED')
    expect(row.examinedAt).toBeNull()
    expect(row.degree.says).toContain(SAME_FILE_ELSEWHERE)
    expect(row.degree.says).not.toContain('Helena')
    expect(row.degree.doors.map((d: any) => d.kind)).toEqual(['TRANSCRIPT', 'PROVIDER', 'SEND_BACK'])
    // The notice opens that paper, and the paper waits on HR's look.
    expect(ctx.firstNotice.entityId).toBe(row.id)
    expect(list.body.data.waitingOnYou?.count ?? 0).toBeGreaterThan(0)
    const file = await prisma.docFile.findUniqueOrThrow({ where: { docInstanceId: row.id }, select: { fileHash: true } })
    expect(file.fileHash).toBe(sha(SAME_AS_HELENAS))
  })

  it('the same degree sent twice is one paper on the firm’s Paperwork, not two', async () => {
    as(ctx.ingrid.primaryEmail)
    expect((await putOwn(degreeForm(SAME_AS_HELENAS))).status).toBe(201)
    const papers = await prisma.docInstance.count({
      where: { template: { companyId: ctx.pinnacle.id, name: LABEL }, subjectType: 'PERSON', subjectId: ctx.ingrid.id, file: { fileHash: sha(SAME_AS_HELENAS) } },
    })
    expect(papers).toBe(1)
  })

  it('a duplicate degree file filed for this firm’s own worker names that worker to this firm’s HR', async () => {
    const since = new Date()
    as(ctx.ingrid.primaryEmail)
    expect((await putOwn(degreeForm(SAME_AS_LUCIAS))).status).toBe(201)
    const notices = await hrNotices(since)
    expect(notices.length).toBeGreaterThan(0)
    // HR hears of this upload by a notice that names Lucía. The notice for
    // the upload in the sentence before this one is written without waiting,
    // so on a busy machine it can land after `since` and be read here too;
    // it names nobody, which is its own rule. So: this upload's notice names
    // Lucía, and nothing HR was sent names the other firm's worker.
    expect(notices.some((n) => n.body.includes('This file was already filed by Lucía Fernández.'))).toBe(true)
    for (const n of notices) expect(n.body).not.toContain('Helena')
  })
})

import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'
import { POST as documents } from '@/app/api/documents/route'
import { POST as send } from '@/app/api/documents/[id]/send/route'
import { POST as upload } from '@/app/api/documents/[id]/upload/route'
import { POST as sign } from '@/app/api/documents/[id]/sign/route'
import { GET as myPapers } from '@/app/api/me/papers/route'

/**
 * Pinnacle asks Tariq for a W-9 and an NDA. He is told, uploads one and
 * signs the other from his own page, and Pinnacle sees both on file.
 * Brightmoor, who asked for nothing, can touch none of it.
 */

const D = '@demo.etyme.local'
const PINNACLE = `world-pinnacle${D}`
const BRIGHTMOOR = `world-brightmoor${D}`
const WORKER = 'tariq.al.amin@seed.etyme.invalid'
const call = async (fn: any, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

const it_: Record<string, any> = {}

describe('paperwork asked for, answered, on file', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    const pinnacle = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-pinnacle' }, select: { id: true } })
    const tariq = await prisma.person.create({ data: { name: 'Tariq Al-Amin', primaryEmail: WORKER } })
    it_.worker = tariq.id
    const profile = await prisma.consultantProfile.create({ data: { personId: tariq.id, skills: ['Power BI'], location: 'Portland, OR', visibility: 'VERIFIED', workAuth: 'USC' } })
    await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: pinnacle.id, tier: 'RETAINED', state: 'GRANTED', invitedAt: day(-30), respondedAt: day(-29), grantedAt: day(-29) } })
    await prisma.context.create({ data: { personId: tariq.id, companyId: pinnacle.id, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' } })
  }, 240_000)

  it('Pinnacle adds a W-9 and an NDA to its library and asks Tariq for both', async () => {
    as(PINNACLE)
    const w9 = await json(await documents(req('POST', '/api/documents', { type: 'template', name: 'W-9', audience: 'CANDIDATE', needsSignature: false })))
    const nda = await json(await documents(req('POST', '/api/documents', { type: 'template', name: 'Mutual NDA', audience: 'CANDIDATE', needsSignature: true })))
    expect(w9.status, JSON.stringify(w9.body)).toBe(201)
    for (const [key, t] of [['w9', w9], ['nda', nda]] as const) {
      const made = await json(await documents(req('POST', '/api/documents', { type: 'instance', templateId: t.body.data.template.id, subjectType: 'PERSON', subjectId: it_.worker })))
      it_[key] = made.body.data.instance.id
      expect((await prisma.docInstance.findUniqueOrThrow({ where: { id: it_[key] } })).status).toBe('PENDING')
      const sent = await call(send, 'POST', `/api/documents/${it_[key]}/send`, it_[key], {})
      expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()
      expect((await prisma.docInstance.findUniqueOrThrow({ where: { id: it_[key] } })).status).toBe('SENT')
    }
  })

  it('Tariq is told by email, in a sentence that says who asks and what to do', async () => {
    for (let i = 0; i < 20; i++) {
      const n = await prisma.notification.findMany({ where: { personId: it_.worker, entityId: { in: [it_.w9, it_.nda] } } })
      if (n.length === 2) break
      await new Promise((r) => setTimeout(r, 50))
    }
    const notes = await prisma.notification.findMany({ where: { personId: it_.worker, entityId: { in: [it_.w9, it_.nda] } }, orderBy: { title: 'asc' } })
    expect(notes.map((n) => [n.title, n.channel])).toEqual([
      ['Pinnacle Resourcing asks for Mutual NDA', 'EMAIL'],
      ['Pinnacle Resourcing asks for W-9', 'EMAIL'],
    ])
  })

  it('his own page lists both, each with the one thing to do', async () => {
    as(WORKER)
    const r = await json(await myPapers(req('GET', '/api/me/papers')))
    expect(r.body.data.papers.map((p: any) => [p.name, p.todo]).sort()).toEqual([['Mutual NDA', 'sign'], ['W-9', 'upload']])
  })

  it('he uploads the W-9 — on file; he cannot merely upload the NDA', async () => {
    as(WORKER)
    const up = await call(upload, 'POST', `/api/documents/${it_.w9}/upload`, it_.w9, { fileUrl: 'https://files.example/w9.pdf', fileName: 'w9.pdf' })
    expect(up.body?.error, JSON.stringify(up.body)).toBeUndefined()
    expect(up.body.data.says).toBe('W-9 is on file. Thank you.')
    const no = await call(upload, 'POST', `/api/documents/${it_.nda}/upload`, it_.nda, { fileUrl: 'https://files.example/nda.pdf' })
    expect(no.status).toBe(409)
    expect(no.body.error.code).toBe('NEEDS_SIGNATURE')
  })

  it('he signs the NDA as himself — signed, with his name on it', async () => {
    as(WORKER)
    const s = await call(sign, 'POST', `/api/documents/${it_.nda}/sign`, it_.nda, { attests: true })
    expect(s.body?.error, JSON.stringify(s.body)).toBeUndefined()
    const row = await prisma.docInstance.findUniqueOrThrow({ where: { id: it_.nda } })
    expect([row.status, row.signedById]).toEqual(['SIGNED', it_.worker])
    expect(row.signedAt).not.toBeNull()
  })

  it('Pinnacle sees both on file, and nothing is asked of him any more', async () => {
    as(WORKER)
    const r = await json(await myPapers(req('GET', '/api/me/papers')))
    expect(r.body.data.papers.every((p: any) => p.todo === null)).toBe(true)
    expect(r.body.data.papers.map((p: any) => p.word).sort()).toEqual(['On file', 'Signed'])
  })

  it('a firm that asked for nothing cannot touch the request, and is told nothing is there', async () => {
    as(BRIGHTMOOR)
    const r = await call(send, 'POST', `/api/documents/${it_.w9}/send`, it_.w9, {})
    expect(r.status).toBe(404)
  })
})

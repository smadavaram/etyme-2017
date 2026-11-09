import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { as, req, json, prisma, freshWorld } from './harness'
import { DEMO_COOKIE, read as readCookie } from '@/lib/demo-session'
import { POST as demo } from '@/app/api/demo/route'
import { GET as askGet, POST as askPost } from '@/app/api/conversations/twin/route'
import { POST as signUp } from '@/app/api/auth/password/signup/route'
import { verifyEmail } from '@/lib/password-door'
import { NOT_KEPT_IN_DEMO, KEEP_ONE_AT, appendTurn } from '@/lib/ask-etyme-thread'

/**
 * Walk 8, item 12 (2026-11-09): a visitor's own demo kept no Ask Etyme
 * conversation and told the visitor to open their own demo, which is
 * where they already were. Walked here through the real doors: the demo
 * door that makes a visitor's own sandbox, a seeded seat every visitor
 * shares, and the sign-up the advice now names.
 */

const ASK = '/api/conversations/twin'
const OWNER = 'mara.quill@quillworks.test'
const PASSWORD = 'harbor lantern drifts east'

describe('a visitor’s own demo keeps its conversations, and a shared seat says which door keeps one', () => {
  const savedKey = process.env.RESEND_API_KEY
  let visitor = { email: '', personId: '', companyId: '' }

  beforeAll(async () => {
    await freshWorld()
    // No email key: the confirmation link is kept on the notice, where the walk reads it.
    delete process.env.RESEND_API_KEY
    const res = await demo(req('POST', '/api/demo', { side: 'CLIENT' }) as NextRequest)
    const body = (await res.json()).data
    const cookie = new RegExp(`${DEMO_COOKIE}=([^;]+)`).exec(res.headers.get('set-cookie') ?? '')?.[1] ?? ''
    const email = readCookie(cookie) ?? ''
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email }, select: { id: true } })
    visitor = { email, personId: person.id, companyId: body.companyId }
  }, 600_000)

  afterAll(() => {
    if (savedKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = savedKey
  })

  it('the demo door seats the visitor at a reserved address in a sandbox of their own, which is what the record says', async () => {
    expect(visitor.email).toMatch(/^[0-9a-f]{12}@demo\.etyme\.local$/)
    const company = await prisma.company.findUniqueOrThrow({ where: { id: visitor.companyId }, select: { isDemo: true } })
    expect(company.isDemo).toBe(true)
  })

  it('a visitor’s own demo keeps its conversations across a reload, listed newest first under their first questions', async () => {
    as(visitor.email)
    const opened = await json(await askGet(req('GET', ASK)))
    expect(opened.status).toBe(200)
    expect(opened.body.data.thread).toMatchObject({ saved: true, notKeptBecause: null })

    const first = await json(await askPost(req('POST', ASK, { text: 'Which bills are unpaid?' })))
    expect(first.status).toBe(200)
    expect(first.body.data).toMatchObject({ kept: true, notKeptBecause: null })
    const firstId = first.body.data.threadId as string
    expect(typeof firstId).toBe('string')

    const made = await json(await askPost(req('POST', ASK, { start: true })))
    expect(made.status).toBe(200)
    const secondId = made.body.data.thread.id as string
    const second = await json(await askPost(req('POST', ASK, { text: 'Who is near the time limit?', threadId: secondId })))
    expect(second.body.data).toMatchObject({ kept: true, threadId: secondId })

    // The reload: a fresh read of the list and of the older conversation.
    const listed = await json(await askGet(req('GET', `${ASK}?only=threads`)))
    expect(listed.status).toBe(200)
    expect(listed.body.data.threads.map((t: { id: string; title: string }) => [t.id, t.title])).toEqual([
      [secondId, 'Who is near the time limit?'],
      [firstId, 'Which bills are unpaid?'],
    ])
    const older = await json(await askGet(req('GET', `${ASK}?thread=${firstId}`)))
    expect(older.body.data.thread).toMatchObject({ id: firstId, saved: true, title: 'Which bills are unpaid?' })
    expect(older.body.data.thread.turns.map((t: { speaker: string; text: string }) => t.speaker)).toEqual(['PERSON', 'ETYME'])
    expect(older.body.data.thread.turns[0].text).toBe('Which bills are unpaid?')

    // Kept on the record, under the visitor's own sandbox and nowhere else.
    const rows = await prisma.askEtymeThread.findMany({ where: { personId: visitor.personId }, select: { companyId: true } })
    expect(rows.map((r) => r.companyId)).toEqual([visitor.companyId, visitor.companyId])
  }, 300_000)

  it('a shared seeded demo seat keeps none, says which door keeps one, and nothing is written for it', async () => {
    const shared = 'world-pinnacle-recruiter@demo.etyme.local'
    const seat = await prisma.context.findFirstOrThrow({
      where: { person: { primaryEmail: shared }, revokedAt: null, company: { slug: 'world-pinnacle' } },
      select: { id: true, personId: true, company: { select: { isDemo: true } } },
    })
    expect(seat.company?.isDemo).toBe(false)
    as(shared)
    const hello = await json(await askGet(req('GET', ASK, undefined, { 'x-context-id': seat.id })))
    expect(hello.status).toBe(200)
    expect(hello.body.data.thread).toEqual({ saved: false, notKeptBecause: NOT_KEPT_IN_DEMO, earlier: false, turns: [] })
    const asked = await json(await askPost(req('POST', ASK, { text: 'What needs me today?' }, { 'x-context-id': seat.id })))
    expect(asked.body.data).toMatchObject({ kept: false, turnId: null, notKeptBecause: NOT_KEPT_IN_DEMO })
    expect(NOT_KEPT_IN_DEMO).toContain(KEEP_ONE_AT.label)
    expect(await prisma.askEtymeThread.count({ where: { personId: seat.personId } })).toBe(0)
  }, 300_000)

  it('the door the advice names leads to a seat that keeps one: a company signed up and confirmed keeps its first question', async () => {
    expect(KEEP_ONE_AT.href).toBe('/signup')
    const r = await json(await signUp(req('POST', '/api/auth/password/signup', {
      as: 'company', email: OWNER, password: PASSWORD, personName: 'Mara Quill', name: 'Quillworks',
      type: 'client', country: 'US', currency: 'USD', address: 'quillworks',
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const owner = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER }, select: { id: true } })
    const notice = await prisma.notification.findFirstOrThrow({
      where: { personId: owner.id, body: { contains: '/verify/' } }, orderBy: { createdAt: 'desc' }, select: { body: true },
    })
    const token = /\/verify\/([A-Za-z0-9_-]+)/.exec(notice.body)![1]
    expect(await verifyEmail(token)).toMatchObject({ ok: true })

    as(OWNER)
    const asked = await json(await askPost(req('POST', ASK, { text: 'What needs me today?' })))
    expect(asked.status).toBe(200)
    expect(asked.body.data).toMatchObject({ kept: true, notKeptBecause: null })
    const listed = await json(await askGet(req('GET', `${ASK}?only=threads`)))
    expect(listed.body.data.threads.map((t: { title: string }) => t.title)).toEqual(['What needs me today?'])
  }, 300_000)

  it('a sandbox’s kept conversations are deleted with the sandbox’s firm, so removing one leaves none of the visitor’s questions behind', async () => {
    // A bare sandbox, the shape the thirty-day job removes: one firm the demo
    // door would name, one visitor at a reserved address. The seat is read
    // from the record, as the caller check reads it.
    const firm = await prisma.company.create({ data: { slug: 'demo-0a1b2c3d4e5f', name: 'Sandbox to remove', kind: 'CLIENT', isDemo: true } })
    const role = await prisma.role.create({ data: { companyId: firm.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    const person = await prisma.person.create({ data: { name: 'You', primaryEmail: '0a1b2c3d4e5f@demo.etyme.local' } })
    await prisma.context.create({ data: { personId: person.id, companyId: firm.id, roleId: role.id, type: 'EMPLOYEE' } })
    const company = await prisma.company.findUniqueOrThrow({ where: { id: firm.id }, select: { id: true, name: true, isDemo: true } })
    const said = await appendTurn({ person: { id: person.id, primaryEmail: '0a1b2c3d4e5f@demo.etyme.local' }, company }, { speaker: 'PERSON', text: 'Who applied?' })
    expect(said).toMatchObject({ ok: true, saved: true })
    expect(await prisma.askEtymeTurn.count({ where: { thread: { personId: person.id } } })).toBe(1)

    await prisma.company.delete({ where: { id: firm.id } })
    expect(await prisma.askEtymeThread.count({ where: { personId: person.id } })).toBe(0)
    expect(await prisma.askEtymeTurn.count({ where: { thread: { personId: person.id } } })).toBe(0)
  }, 300_000)
})

import { describe, it, expect, beforeAll, vi } from 'vitest'
import { prisma, resetDatabase } from './harness'

const h = vi.hoisted(() => ({ caller: null as any }))
vi.mock('@/lib/api-context', () => ({ getCallerContext: async () => ({ caller: h.caller, error: null }) }))

import { GET as LIST } from '@/app/api/page-asks/route'
import { GET as ONE, POST as ACT } from '@/app/api/page-asks/[id]/route'
import {
  writePageAsk, listPageAsks, assignPageAsk, markPageAskAnswered, closePageAsk, pageAskDecisions, backfillPageAsks,
} from '@/lib/page-asks'
import { firmAskNotice } from '@/lib/public-site/firm-page'
import { owedFrom } from '@/lib/owed-count'

/**
 * Record 102, item 1: public Ask submissions no longer vanish. Made-up
 * firms on reserved domains.
 */
const s: Record<string, string> = {}
const firm = async (slug: string) =>
  (await prisma.company.create({ data: { name: slug, slug, kind: 'VENDOR', currency: 'USD', domain: `${slug}.example` }, select: { id: true } })).id
const person = async (name: string, email: string) => (await prisma.person.create({ data: { name, primaryEmail: email }, select: { id: true } })).id
const seat = (personId: string, name: string, companyId: string, permissions: string[]) => ({
  person: { id: personId, name, primaryEmail: `${name}@x.example`, timezone: null },
  company: { id: companyId, name: 'f' }, context: { id: `ctx-${personId}`, type: 'VENDOR', companyId, roleId: null }, permissions,
})
const url = (q = '') => ({ url: `http://localhost/api/page-asks${q}` }) as any
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const post = (id: string, body: unknown) => ACT({ json: async () => body, url: 'http://localhost/api/page-asks/x' } as any, ctx(id))

beforeAll(async () => {
  await resetDatabase()
  s.tapin = await firm('tapin-test')
  s.other = await firm('otherfirm-test')
  s.sharath = await person('Sharath Rao', 'sharath@tapin-test.example')
  s.oliver = await person('Oliver Stone', 'oliver@tapin-test.example')
  s.clerk = await person('Pat Clerk', 'pat@tapin-test.example')
  s.stranger = await person('Sam Other', 'sam@otherfirm-test.example')
})

describe('a question asked on a firm’s public page', () => {
  it('a question asked on a firm’s page is one record the firm can list and search', async () => {
    const a = await writePageAsk({ companyId: s.tapin, asked: 'Do you have a Java developer free in January?', replyTo: 'Dana@Corvane.example', name: 'Dana Whitfield', companyName: 'Corvane Packaging' })
    s.a = a.id
    const b = await writePageAsk({ companyId: s.tapin, asked: 'Can you send rates for a data engineer?', replyTo: 'lee@harlow.example' })
    s.b = b.id
    await writePageAsk({ companyId: s.other, asked: 'A question for the other firm', replyTo: 'x@y.example' })
    const mine = await listPageAsks(s.tapin)
    expect(mine.map((r) => r.id).sort()).toEqual([a.id, b.id].sort())
    expect(mine.find((r) => r.id === a.id)).toMatchObject({ status: 'OPEN', replyTo: 'dana@corvane.example', assigneePersonId: null })
  })

  it('a search finds a question by its words, the asker’s name, her company and her address', async () => {
    expect((await listPageAsks(s.tapin, { q: 'java developer' })).map((r) => r.id)).toEqual([s.a])
    expect((await listPageAsks(s.tapin, { q: 'WHITFIELD' })).map((r) => r.id)).toEqual([s.a])
    expect((await listPageAsks(s.tapin, { q: 'corvane packaging' })).map((r) => r.id)).toEqual([s.a])
    expect((await listPageAsks(s.tapin, { q: 'harlow.example' })).map((r) => r.id)).toEqual([s.b])
    expect(await listPageAsks(s.tapin, { q: 'nothing like this' })).toEqual([])
  })

  it('an open question nobody has taken is one decision card, and a seat that may not answer sees none', async () => {
    const cards = await pageAskDecisions({ permissions: ['submissions.create'], company: { id: s.tapin } })
    expect(cards.map((c) => c.entityId).sort()).toEqual([s.a, s.b].sort())
    expect(cards.find((c) => c.entityId === s.a)!.title).toContain('Dana Whitfield asked on your page: Do you have a Java developer')
    expect(await pageAskDecisions({ permissions: ['timesheets.read'], company: { id: s.tapin } })).toEqual([])
    expect((await pageAskDecisions({ permissions: ['*'], company: { id: s.other } })).map((c) => c.entityId)).not.toContain(s.a)
  })

  it('the number on Ask Etyme counts a question as it counts any decision in the queue', async () => {
    const cards = await pageAskDecisions({ permissions: ['*'], company: { id: s.tapin } })
    expect(owedFrom({ data: { decisions: [{ type: 'TIMESHEET_APPROVAL' }, ...cards] } })).toBe(1 + cards.length)
  })

  it('taking a question records who and when, and it stops being a card', async () => {
    const r = await assignPageAsk(s.a, s.tapin, s.oliver)
    expect(r.ok).toBe(true)
    const row = (await listPageAsks(s.tapin)).find((x) => x.id === s.a)!
    expect(row.assigneePersonId).toBe(s.oliver)
    expect(row.assignedAt).not.toBeNull()
    const cards = await pageAskDecisions({ permissions: ['*'], company: { id: s.tapin } })
    expect(cards.map((c) => c.entityId)).toEqual([s.b])
  })

  it('a second seat cannot take a question from the person who has it, in a sentence', async () => {
    const r = await assignPageAsk(s.a, s.tapin, s.sharath)
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect((r as any).says).toContain('Oliver already has this question')
  })

  it('a question can be given to another seat only if that seat puts candidates forward here', async () => {
    const bad = await assignPageAsk(s.b, s.tapin, s.sharath, s.stranger)
    expect(bad).toMatchObject({ ok: false, status: 422 })
  })

  it('answering records the day and holds the question for whoever answered it; closing records who closed it', async () => {
    const ans = await markPageAskAnswered(s.b, s.tapin, s.sharath)
    expect(ans.ok).toBe(true)
    let row = (await listPageAsks(s.tapin, { status: 'ANSWERED' }))[0]
    expect(row).toMatchObject({ id: s.b, assigneePersonId: s.sharath })
    expect(row.answeredAt).not.toBeNull()
    const closed = await closePageAsk(s.b, s.tapin, s.sharath)
    expect(closed.ok).toBe(true)
    row = (await listPageAsks(s.tapin, { status: 'CLOSED' }))[0]
    expect(row.closedAt).not.toBeNull()
    expect((await prisma.pageAsk.findUnique({ where: { id: s.b } }))!.closedById).toBe(s.sharath)
    expect(await markPageAskAnswered(s.b, s.tapin, s.sharath)).toMatchObject({ ok: false, status: 409 })
  })
})

describe('who may read it', () => {
  it('a seat at another firm never reads it, and the attempt is on the trail before the refusal is sent', async () => {
    h.caller = seat(s.stranger, 'Sam', s.other, ['*'])
    const before = await prisma.accessLog.count({ where: { allowed: false } })
    const res = await ONE(url(), ctx(s.a))
    expect(res.status).toBe(404)
    expect(JSON.stringify(await res.json())).not.toContain('Java')
    expect(await prisma.accessLog.count({ where: { allowed: false } })).toBe(before + 1)
    const act = await post(s.a, { act: 'close' })
    expect(act.status).toBe(404)
    expect((await prisma.pageAsk.findUnique({ where: { id: s.a } }))!.status).toBe('OPEN')
    const list = await (await LIST(url())).json()
    expect(list.data.asks.map((r: any) => r.id)).not.toContain(s.a)
  })

  it('a seat that does not put candidates forward is refused in a sentence, and the refusal is logged', async () => {
    h.caller = seat(s.clerk, 'Pat', s.tapin, ['timesheets.read'])
    const before = await prisma.accessLog.count({ where: { allowed: false } })
    const res = await LIST(url())
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toContain('people there who put candidates forward')
    expect(await prisma.accessLog.count({ where: { allowed: false } })).toBe(before + 1)
  })

  it('the Owner reads the list and finds a question by search through the route', async () => {
    h.caller = seat(s.sharath, 'Sharath', s.tapin, ['*'])
    const res = await LIST(url('?q=corvane'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.asks.map((r: any) => r.id)).toEqual([s.a])
    expect(JSON.stringify(body)).toContain('dana@corvane.example')
  })

  it('Assign to me through the route takes an unassigned question and says so', async () => {
    const q = await writePageAsk({ companyId: s.tapin, asked: 'Another question', replyTo: 'q@z.example' })
    h.caller = seat(s.oliver, 'Oliver', s.tapin, ['submissions.create'])
    const res = await post(q.id, { act: 'assign' })
    expect(res.status).toBe(200)
    expect((await res.json()).data.message).toContain('Yours now')
    expect((await post(q.id, { act: 'nonsense' })).status).toBe(422)
  })
})

describe('the backfill', () => {
  it('the backfill makes one record per stored question and none twice', async () => {
    const asked = firmAskNotice({ email: 'old@corvane.example', asked: 'Lost to view on production', name: 'Kay Old', companyName: 'Corvane' })
    const mk = (i: number, kind: 'FIRST' | 'COPY') =>
      prisma.notification.create({
        data: { personId: [s.sharath, s.oliver][i], companyId: s.tapin, type: 'SYSTEM', title: asked.title, body: asked.body, data: { pageAsk: kind, fromPublicPage: true, replyTo: 'old@corvane.example' } },
        select: { id: true },
      })
    const first = await mk(0, 'FIRST')
    await mk(1, 'COPY')
    const before = await prisma.pageAsk.count()

    const dry = await backfillPageAsks(prisma)
    expect(dry).toMatchObject({ found: 1, made: 1, already: 0 })
    expect(await prisma.pageAsk.count()).toBe(before)

    const done = await backfillPageAsks(prisma, { write: true })
    expect(done.made).toBe(1)
    expect(await prisma.pageAsk.count()).toBe(before + 1)
    const made = (await prisma.pageAsk.findFirst({ where: { sourceNotificationId: first.id } }))!
    expect(made).toMatchObject({ asked: 'Lost to view on production', replyTo: 'old@corvane.example', name: 'Kay Old', companyName: 'Corvane', status: 'OPEN', companyId: s.tapin })

    const again = await backfillPageAsks(prisma, { write: true })
    expect(again).toMatchObject({ found: 1, already: 1, made: 0 })
    expect(await prisma.pageAsk.count()).toBe(before + 1)
  })
})

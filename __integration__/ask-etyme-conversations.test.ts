import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as askGet, POST as askPost, DELETE as askDelete, PATCH as askPatch } from '@/app/api/conversations/twin/route'
import { NOT_YOUR_CONVERSATION } from '@/app/api/conversations/twin/thread-id'
import { ensureDefaultRoles } from '@/lib/company-roles'

/**
 * Ask Etyme keeps every conversation and lists them, through its own
 * route (founder, 2026-11-03, "Conversations are kept and listed"; the
 * column of 2026-11-08). Walked as two people at Pinnacle: Rae, who keeps
 * several conversations, and Dev, who tries to open one of hers by its id.
 */

const RAE = 'rae.several@pinnacle-staff.test'
const DEV = 'dev.several@pinnacle-staff.test'

describe('a seat keeps several Ask Etyme conversations, and the mark still reads one queue', () => {
  let rae = { id: '', seat: '' }
  let dev = { id: '', seat: '' }
  const asRae = (method: string, url = '/api/conversations/twin', body?: unknown) => { as(RAE); return req(method, url, body, { 'x-context-id': rae.seat }) }
  const asDev = (method: string, url = '/api/conversations/twin', body?: unknown) => { as(DEV); return req(method, url, body, { 'x-context-id': dev.seat }) }
  let first = ''
  let second = ''

  beforeAll(async () => {
    await freshWorld()
    const pinnacle = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-pinnacle' }, select: { id: true, kind: true } })
    await ensureDefaultRoles(pinnacle.id, pinnacle.kind)
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: pinnacle.id, name: 'Accounts Receivable' }, select: { id: true } })
    const seat = async (email: string, name: string) => {
      const person = await prisma.person.create({ data: { primaryEmail: email, name }, select: { id: true } })
      const ctx = await prisma.context.create({
        data: { personId: person.id, companyId: pinnacle.id, type: 'EMPLOYEE', roleId: role.id, grantReason: 'Joined on the domain' },
        select: { id: true },
      })
      return { id: person.id, seat: ctx.id }
    }
    rae = await seat(RAE, 'Rae Okafor')
    dev = await seat(DEV, 'Dev Raman')
  }, 600_000)

  it('the first question, with no conversation named, makes the seat’s first conversation, titled by that question, and says which it went in', async () => {
    const asked = await json(await askPost(asRae('POST', undefined, { text: 'Which bills are unpaid?' })))
    expect(asked.status).toBe(200)
    expect(asked.body.data.kept).toBe(true)
    first = asked.body.data.threadId
    expect(typeof first).toBe('string')
    const listed = await json(await askGet(asRae('GET', '/api/conversations/twin?only=threads')))
    expect(listed.status).toBe(200)
    expect(listed.body.data.threads.map((t: { id: string; title: string }) => [t.id, t.title])).toEqual([[first, 'Which bills are unpaid?']])
  })

  it('New conversation makes an empty one that leads the list, and opening it shows the greeting with no lines above it', async () => {
    const made = await json(await askPost(asRae('POST', undefined, { start: true })))
    expect(made.status).toBe(200)
    second = made.body.data.thread.id
    expect(made.body.data.thread.title).toBeNull()
    const listed = await json(await askGet(asRae('GET', '/api/conversations/twin?only=threads')))
    expect(listed.body.data.threads.map((t: { id: string }) => t.id)).toEqual([second, first])

    const opened = await json(await askGet(asRae('GET', `/api/conversations/twin?thread=${second}`)))
    expect(opened.status).toBe(200)
    expect(opened.body.data.answer.kind).toBe('NEEDS')
    expect(opened.body.data.thread).toMatchObject({ id: second, saved: true, turns: [] })
  })

  it('a question asked in a conversation named goes in that one, with its answer, and the other conversation is unchanged', async () => {
    const asked = await json(await askPost(asRae('POST', undefined, { text: 'Who is on the bench?', threadId: second })))
    expect(asked.body.data).toMatchObject({ kept: true, threadId: second })
    const there = await json(await askGet(asRae('GET', `/api/conversations/twin?only=thread&thread=${second}`)))
    expect(there.body.data.thread.title).toBe('Who is on the bench?')
    expect(there.body.data.thread.turns.map((t: { speaker: string }) => t.speaker)).toEqual(['PERSON', 'ETYME'])
    const older = await json(await askGet(asRae('GET', `/api/conversations/twin?only=thread&thread=${first}`)))
    expect(older.body.data.thread.turns.map((t: { text: string }) => t.text)[0]).toBe('Which bills are unpaid?')
    expect(older.body.data.thread.turns).toHaveLength(2)
  })

  it('a reload that names the older conversation reads that one, not the newest', async () => {
    const reload = await json(await askGet(asRae('GET', `/api/conversations/twin?thread=${first}`)))
    expect(reload.body.data.thread.id).toBe(first)
    expect(reload.body.data.thread.title).toBe('Which bills are unpaid?')
    // With none named, the newest: the one spoken in last.
    const plain = await json(await askGet(asRae('GET')))
    expect(plain.body.data.thread.id).toBe(second)
  })

  it('Clear empties the conversation open and no other', async () => {
    const cleared = await json(await askDelete(asRae('DELETE', `/api/conversations/twin?thread=${first}`)))
    expect(cleared).toMatchObject({ status: 200, body: { data: { saved: true } } })
    const emptied = await json(await askGet(asRae('GET', `/api/conversations/twin?only=thread&thread=${first}`)))
    expect(emptied.body.data.thread.turns).toEqual([])
    const kept = await json(await askGet(asRae('GET', `/api/conversations/twin?only=thread&thread=${second}`)))
    expect(kept.body.data.thread.turns).toHaveLength(2)
  })

  it('several conversations never split one queue: the mark’s number is the same whichever conversation is open', async () => {
    const plain = await json(await askGet(asRae('GET', '/api/conversations/twin?only=owed')))
    const named = await json(await askGet(asRae('GET', `/api/conversations/twin?only=owed&thread=${first}`)))
    expect(plain.status).toBe(200)
    expect(named.body.data.total).toBe(plain.body.data.total)
  })

  it('a link to another person’s conversation is refused in a sentence on every door, nothing is kept in it, and each attempt is logged against her', async () => {
    const before = await prisma.askEtymeTurn.count({ where: { threadId: second } })
    const logged = () => prisma.accessLog.count({ where: { subjectId: rae.id, actorPersonId: dev.id, allowed: false, action: 'ASK_ETYME_THREAD_VIEW' } })

    const opened = await json(await askGet(asDev('GET', `/api/conversations/twin?thread=${second}`)))
    expect(opened).toMatchObject({ status: 404, body: { error: { code: 'NO_SUCH_THREAD', message: NOT_YOUR_CONVERSATION } } })
    expect(JSON.stringify(opened.body)).not.toContain('Who is on the bench?')

    const asked = await json(await askPost(asDev('POST', undefined, { text: 'What needs me today?', threadId: second })))
    expect(asked.status).toBe(404)
    const marked = await json(await askPatch(asDev('PATCH', undefined, { approvalId: 'none', state: 'LATER', threadId: second })))
    expect(marked.status).toBe(404)
    const cleared = await json(await askDelete(asDev('DELETE', `/api/conversations/twin?thread=${second}`)))
    expect(cleared.status).toBe(404)

    expect(await prisma.askEtymeTurn.count({ where: { threadId: second } })).toBe(before)
    expect((await prisma.askEtymeThread.findUniqueOrThrow({ where: { id: second }, select: { clearedAt: true } })).clearedAt).toBeNull()
    expect(await logged()).toBe(4)
    // Dev's own list holds none of Rae's.
    const his = await json(await askGet(asDev('GET', '/api/conversations/twin?only=threads')))
    expect(his.body.data.threads).toEqual([])
  })
})

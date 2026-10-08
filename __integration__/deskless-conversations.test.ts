import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as list } from '@/app/api/conversations/route'
import { GET as readThread, POST as writeThread } from '@/app/api/conversations/messages/route'

/**
 * Sign-up walk, round four: the one door opens Conversations to a seat
 * with no desk, because its menu shows it. The list then handed that
 * seat every thread at the company. Seated here the way round four
 * seated Mo — a person, an EMPLOYEE seat, and Northbend Athletic's own
 * Member role, which holds no permission — and walked against two
 * threads at Northbend: one that names Mo, one that does not.
 */

const PROGRAM = 'world-nike-programme@demo.etyme.local'
const MO = 'mo.conversations@walk4.example'
const REFUSED = 'That conversation is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.'

describe('a Member with no desk at Northbend Athletic reads only the conversations that name them', () => {
  let mo = ''
  let theirs = ''
  let notTheirs = ''

  beforeAll(async () => {
    await freshWorld()
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: firm.id, name: 'Member' }, select: { id: true, permissions: true } })
    expect(role.permissions).toEqual([])
    mo = (await prisma.person.create({ data: { primaryEmail: MO, name: 'Mo Haddad' }, select: { id: true } })).id
    await prisma.context.create({
      data: { personId: mo, companyId: firm.id, type: 'EMPLOYEE', roleId: role.id, grantReason: 'Joined on the domain' },
    })
    const manager = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: PROGRAM }, select: { id: true, name: true } })
    const now = new Date().toISOString()
    const make = async (title: string, people: { personId: string; name: string }[], body: string) => {
      const c = await prisma.conversation.create({
        data: {
          companyId: firm.id, topic: 'GENERAL', title,
          participants: people.map((p) => ({ ...p, companyId: firm.id, joinedAt: now })) as unknown as object,
        },
        select: { id: true },
      })
      await prisma.message.create({ data: { conversationId: c.id, authorId: manager.id, body, type: 'TEXT' } })
      return c.id
    }
    theirs = await make('Your first week', [{ personId: manager.id, name: manager.name }, { personId: mo, name: 'Mo Haddad' }], 'Welcome, Mo.')
    notTheirs = await make('Supplier rates for next quarter', [{ personId: manager.id, name: manager.name }], 'Veritan at $92 an hour.')
  }, 600_000)

  it('the Member’s conversation list holds the thread that names them and no other', async () => {
    as(MO)
    const r = await json(await list(req('GET', '/api/conversations?limit=50')))
    expect(r.status).toBe(200)
    const ids = r.body.data.conversations.map((c: any) => c.id)
    expect(ids).toEqual([theirs])
    expect(JSON.stringify(r.body)).not.toContain('$92')
  })

  it('the Member opens the thread that names them', async () => {
    as(MO)
    const r = await json(await readThread(req('GET', `/api/conversations/messages?conversationId=${theirs}`)))
    expect(r.status).toBe(200)
    expect(r.body.data.messages.map((m: any) => m.body)).toEqual(['Welcome, Mo.'])
  })

  it('a company thread that does not name the Member is refused in the door’s own sentence, and its words never reach them', async () => {
    as(MO)
    const r = await json(await readThread(req('GET', `/api/conversations/messages?conversationId=${notTheirs}`)))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe(REFUSED)
    expect(JSON.stringify(r.body)).not.toContain('$92')
  })

  it('the Member cannot write on a thread that does not name them, and nothing is written', async () => {
    as(MO)
    const r = await json(await writeThread(req('POST', '/api/conversations/messages', { conversationId: notTheirs, body: 'Hello?' })))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe(REFUSED)
    expect(await prisma.message.count({ where: { conversationId: notTheirs, authorId: mo } })).toBe(0)
  })

  it('the Northbend program manager, who has a desk, still reads every thread at the company', async () => {
    as(PROGRAM)
    const r = await json(await list(req('GET', '/api/conversations?limit=50')))
    expect(r.status).toBe(200)
    const ids = r.body.data.conversations.map((c: any) => c.id)
    expect(ids).toContain(theirs)
    expect(ids).toContain(notTheirs)
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const all = await prisma.conversation.count({
      where: { archivedAt: null, OR: [{ companyId: firm.id }, { withCompanyId: firm.id }] },
    })
    expect(ids.length).toBe(Math.min(50, all))
    const read = await json(await readThread(req('GET', `/api/conversations/messages?conversationId=${notTheirs}`)))
    expect(read.status).toBe(200)
  })
})

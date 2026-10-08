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

/**
 * Sign-up walk, round five, problem 5: Karthik Menon is Teleworld's own
 * W2 validation engineer. His seat holds two reads — the lines that name
 * him and his own weeks — and no desk. The round-four narrowing asked
 * only for a seat with no permission at all, so his Conversations page
 * showed Teleworld's commercial thread with Corveldt Aerospace about
 * Meera Balakrishnan's rate and start date, a deal he is not on.
 * Teleworld's own seat — Sunil Raghavan, the delivery manager who works
 * the firm's deals (Teleworld seats no separate account manager) —
 * still reads every thread.
 */
const KARTHIK = 'karthik.menon@seed.etyme.invalid'
const TELEWORLD_DESK = 'world-teleworld@demo.etyme.local'
const MEERA_ASK = 'Can Meera Balakrishnan start inside three weeks'

describe('Karthik Menon, a worker seated at Teleworld with only the reads of his own work, reads no thread he is not on', () => {
  let teleworld = ''
  let karthik = ''
  let meeraThread = ''
  let firmThreads: { id: string; participants: unknown }[] = []

  beforeAll(async () => {
    await freshWorld()
    teleworld = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-teleworld' }, select: { id: true } })).id
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: KARTHIK }, select: { id: true } })
    karthik = person.id
    const seat = await prisma.context.findFirstOrThrow({
      where: { personId: karthik, companyId: teleworld },
      select: { role: { select: { permissions: true } } },
    })
    expect([...(seat.role?.permissions ?? [])].sort()).toEqual(['assignments.read', 'timesheets.read'])
    const ask = await prisma.message.findFirstOrThrow({
      where: { body: { startsWith: MEERA_ASK }, conversation: { OR: [{ companyId: teleworld }, { withCompanyId: teleworld }] } },
      select: { conversationId: true },
    })
    meeraThread = ask.conversationId
    firmThreads = await prisma.conversation.findMany({
      where: { archivedAt: null, OR: [{ companyId: teleworld }, { withCompanyId: teleworld }] },
      select: { id: true, participants: true },
    })
  }, 600_000)

  it('Karthik’s conversation list holds no Teleworld thread that does not name him, and never the Corveldt thread about Meera’s rate and start date', async () => {
    as(KARTHIK)
    const r = await json(await list(req('GET', '/api/conversations?limit=50')))
    expect(r.status).toBe(200)
    const ids: string[] = r.body.data.conversations.map((c: any) => c.id)
    const named = firmThreads
      .filter((t) => Array.isArray(t.participants) && (t.participants as any[]).some((p) => p?.personId === karthik))
      .map((t) => t.id)
    expect(ids.sort()).toEqual(named.sort())
    expect(ids).not.toContain(meeraThread)
    expect(JSON.stringify(r.body)).not.toContain('Meera Balakrishnan')
  })

  it('opening the Corveldt thread about Meera is refused to Karthik in the door’s own sentence, and its words never reach him', async () => {
    as(KARTHIK)
    const r = await json(await readThread(req('GET', `/api/conversations/messages?conversationId=${meeraThread}`)))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('That conversation is not part of your seat at Teleworld Solutions. Ask your company’s owner if you need it.')
    expect(JSON.stringify(r.body)).not.toContain('inclusive of expenses')
  })

  it('Karthik cannot write on the Corveldt thread, and nothing is written', async () => {
    as(KARTHIK)
    const r = await json(await writeThread(req('POST', '/api/conversations/messages', { conversationId: meeraThread, body: 'Is she joining us?' })))
    expect(r.status).toBe(403)
    expect(await prisma.message.count({ where: { conversationId: meeraThread, authorId: karthik } })).toBe(0)
  })

  it('Teleworld’s delivery manager, who works the firm’s deals, still reads every Teleworld thread, the Corveldt one about Meera among them', async () => {
    as(TELEWORLD_DESK)
    const r = await json(await list(req('GET', '/api/conversations?limit=50')))
    expect(r.status).toBe(200)
    const ids: string[] = r.body.data.conversations.map((c: any) => c.id)
    expect(ids).toContain(meeraThread)
    expect(ids.length).toBe(Math.min(50, firmThreads.length))
    const read = await json(await readThread(req('GET', `/api/conversations/messages?conversationId=${meeraThread}`)))
    expect(read.status).toBe(200)
    expect(read.body.data.messages.map((m: any) => m.body).join(' ')).toContain(MEERA_ASK)
  })
})

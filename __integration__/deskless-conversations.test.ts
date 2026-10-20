import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as list } from '@/app/api/conversations/route'
import { GET as readMessages, POST as writeThread } from '@/app/api/conversations/messages/route'
import { getCallerContext } from '@/lib/api-context'
import { readThread, appendTurn, markCard, clearThread, NOT_KEPT_IN_DEMO } from '@/lib/ask-etyme-thread'
import { GET as askGet, POST as askPost, PATCH as askPatch, DELETE as askDelete } from '@/app/api/conversations/twin/route'
import { ONLY_THE_RECORD } from '@/app/api/conversations/twin/transaction'
import { NOT_THEIR_RATE, FILE_IT_YOURSELF, NEVER_FILES, WORKER_CLOSE } from '@/app/api/conversations/twin/worker'
import { ensureDefaultRoles } from '@/lib/company-roles'

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
    const r = await json(await readMessages(req('GET', `/api/conversations/messages?conversationId=${theirs}`)))
    expect(r.status).toBe(200)
    expect(r.body.data.messages.map((m: any) => m.body)).toEqual(['Welcome, Mo.'])
  })

  it('a company thread that does not name the Member is refused in the door’s own sentence, and its words never reach them', async () => {
    as(MO)
    const r = await json(await readMessages(req('GET', `/api/conversations/messages?conversationId=${notTheirs}`)))
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
    const read = await json(await readMessages(req('GET', `/api/conversations/messages?conversationId=${notTheirs}`)))
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
    const r = await json(await readMessages(req('GET', `/api/conversations/messages?conversationId=${meeraThread}`)))
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
    const read = await json(await readMessages(req('GET', `/api/conversations/messages?conversationId=${meeraThread}`)))
    expect(read.status).toBe(200)
    expect(read.body.data.messages.map((m: any) => m.body).join(' ')).toContain(MEERA_ASK)
  })
})

// ── One Ask Etyme conversation per seat, saved (founder, 2026-10-18) ──
//
// The door is lib/ask-etyme-thread; the route and the screen over it are
// conversation's. Walked against real seats resolved by the one caller
// check, at addresses that are not reserved: a seeded demo seat is shared
// by every visitor who asks for it, so it keeps no thread (the last
// sentence here), and these people have to be somebody's own.

describe('one Ask Etyme conversation per seat, kept on the record, and read by nobody else', () => {
  const AVERY = 'avery.recruits@pinnacle-staff.test'
  const JUN = 'jun.accounts@pinnacle-staff.test'
  let pinnacle = { id: '', name: '' }
  let nike = { id: '' }
  let avery = { id: '', seat: '' }
  let jun = { id: '', seat: '', nikeSeat: '' }
  let question = ''
  let averyTurn = ''

  /** The caller the one check resolves for this person at this seat. */
  async function seatOf(email: string, contextId: string) {
    as(email)
    const { caller, error } = await getCallerContext(req('GET', '/api/conversations/twin', undefined, { 'x-context-id': contextId }))
    if (error || !caller) throw new Error(`${email} could not be seated`)
    return caller
  }

  beforeAll(async () => {
    await freshWorld()
    const p = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-pinnacle' }, select: { id: true, name: true } })
    pinnacle = p
    nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const role = (companyId: string, name: string) =>
      prisma.role.findFirstOrThrow({ where: { companyId, name }, select: { id: true } })
    const seat = async (personId: string, companyId: string, roleName: string) =>
      (await prisma.context.create({
        data: { personId, companyId, type: 'EMPLOYEE', roleId: (await role(companyId, roleName)).id, grantReason: 'Joined on the domain' },
        select: { id: true },
      })).id
    avery.id = (await prisma.person.create({ data: { primaryEmail: AVERY, name: 'Avery Lund' }, select: { id: true } })).id
    jun.id = (await prisma.person.create({ data: { primaryEmail: JUN, name: 'Jun Takeda' }, select: { id: true } })).id
    avery.seat = await seat(avery.id, pinnacle.id, 'Recruiter')
    jun.seat = await seat(jun.id, pinnacle.id, 'Account Manager')
    jun.nikeSeat = await seat(jun.id, nike.id, 'Member')

    // One question Ask Etyme put to Pinnacle's people: send a bill.
    const asked = await prisma.twinAction.create({
      data: {
        companyId: pinnacle.id, twinKind: 'SUPPLIER', actorType: 'TWIN', actorId: 'SUPPLIER', onAuthorityOfRole: 'Owner',
        tier: 'NEEDS_APPROVAL', outcome: 'AWAITING_APPROVAL', action: 'bill.send', entityType: 'Invoice', entityId: 'inv-thread-walk',
        partyCompanyIds: [pinnacle.id], ruleCited: 'bill.send', rationale: 'A drafted bill waits for a yes.', surface: 'CRON', payload: {},
      },
      select: { id: true },
    })
    question = (await prisma.twinApproval.create({
      data: { twinActionId: asked.id, companyId: pinnacle.id, needsPermission: 'invoices.issue' },
      select: { id: true },
    })).id
  }, 600_000)

  it('a person’s question and Ask Etyme’s answer are kept on their own thread, and read back after a reload in the order they were said, the answer’s card with them', async () => {
    const me = await seatOf(AVERY, avery.seat)
    const asked = await appendTurn(me, { speaker: 'PERSON', text: 'What needs me today?' })
    expect(asked).toMatchObject({ ok: true, saved: true })
    const answer = { kind: 'NEEDS', says: 'One bill waits for you.', items: [{ n: 1, approvalId: question, title: 'INV-1042' }] }
    const said = await appendTurn(me, { speaker: 'ETYME', text: answer.says, answer, cardApprovalIds: [question] })
    if (!said.ok || !said.saved) throw new Error('Ask Etyme’s answer was not kept')
    averyTurn = said.turn.id

    // A reload is a new read from the record, nothing held on the screen.
    const back = await readThread(await seatOf(AVERY, avery.seat))
    if (!back.ok) throw new Error(back.says)
    expect(back.thread.saved).toBe(true)
    expect(back.thread.turns.map((t) => [t.speaker, t.text])).toEqual([
      ['PERSON', 'What needs me today?'], ['ETYME', 'One bill waits for you.'],
    ])
    expect(back.thread.turns[1].answer).toEqual(answer)
    expect(back.thread.turns[1].cardApprovalIds).toEqual([question])
    expect(back.thread.turns[1].cards).toEqual({})
    expect(await prisma.askEtymeThread.count({ where: { personId: avery.id, companyId: pinnacle.id } })).toBe(1)
  })

  it('a person reads their own Ask Etyme thread and nobody else’s, and a read of another person’s thread is refused and logged before the refusal is returned', async () => {
    const theirs = await seatOf(JUN, jun.seat)
    await appendTurn(theirs, { speaker: 'PERSON', text: 'Which client owes us the most?' })

    const me = await seatOf(AVERY, avery.seat)
    const r = await readThread(me, { personId: jun.id })
    expect(r).toEqual({
      ok: false, status: 403, code: 'NOT_YOUR_THREAD',
      says: 'An Ask Etyme conversation is read only by the person it belongs to. Nobody else at Pinnacle Resourcing can open it, and nobody at another company.',
    })
    expect(JSON.stringify(r)).not.toContain('owes us the most')
    // Awaited by the door, so the row is there the moment the refusal is.
    const logged = await prisma.accessLog.findMany({ where: { subjectId: jun.id, actorPersonId: avery.id } })
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatchObject({ action: 'ASK_ETYME_THREAD_VIEW', allowed: false, actorCompanyId: pinnacle.id })

    // Asking for oneself by id is the same as asking for one's own.
    const own = await readThread(me, { personId: avery.id })
    if (!own.ok) throw new Error(own.says)
    expect(own.thread.turns.map((t) => t.text)).not.toContain('Which client owes us the most?')
  })

  it('the same person seated at two companies keeps two threads, and the seat at Northbend Athletic never reads what was said at Pinnacle', async () => {
    const atNike = await seatOf(JUN, jun.nikeSeat)
    const empty = await readThread(atNike)
    if (!empty.ok) throw new Error(empty.says)
    expect(empty.thread.turns).toEqual([])
    await appendTurn(atNike, { speaker: 'PERSON', text: 'Who is near the time limit?' })

    const atPinnacle = await readThread(await seatOf(JUN, jun.seat))
    if (!atPinnacle.ok) throw new Error(atPinnacle.says)
    expect(atPinnacle.thread.turns.map((t) => t.text)).toEqual(['Which client owes us the most?'])
    expect(await prisma.askEtymeThread.count({ where: { personId: jun.id } })).toBe(2)
  })

  it('a card answered in Ask Etyme stays answered after a reload, and a card answered somewhere else — on Teams — reads answered too, because the record wins', async () => {
    const me = await seatOf(AVERY, avery.seat)
    const later = await markCard(me, { turnId: averyTurn, approvalId: question, state: 'LATER' })
    expect(later).toMatchObject({ ok: true, saved: true })
    let back = await readThread(me)
    if (!back.ok) throw new Error(back.says)
    expect(back.thread.turns[1].cards[question].state).toBe('LATER')

    await prisma.twinApproval.update({ where: { id: question }, data: { decision: 'APPROVED', decidedAt: new Date(), surface: 'TEAMS' } })
    back = await readThread(me)
    if (!back.ok) throw new Error(back.says)
    expect(back.thread.turns[1].cards[question].state).toBe('APPROVED')

    // A card that is not on the line is refused, and nothing is marked.
    const stray = await markCard(me, { turnId: back.thread.turns[0].id, approvalId: question, state: 'APPROVED' })
    expect(stray).toMatchObject({ ok: false, code: 'NOT_A_CARD', says: 'That card is not on this line of your conversation.' })
  })

  it('a card on somebody else’s thread cannot be marked: the attempt is refused, logged against them, and changes nothing', async () => {
    const before = await prisma.askEtymeTurn.findUniqueOrThrow({ where: { id: averyTurn }, select: { cards: true } })
    const r = await markCard(await seatOf(JUN, jun.seat), { turnId: averyTurn, approvalId: question, state: 'REJECTED' })
    expect(r).toEqual({ ok: false, status: 404, code: 'NOT_IN_YOUR_THREAD', says: 'That line is not in your Ask Etyme conversation.' })
    const after = await prisma.askEtymeTurn.findUniqueOrThrow({ where: { id: averyTurn }, select: { cards: true } })
    expect(after.cards).toEqual(before.cards)
    expect(await prisma.accessLog.count({ where: { subjectId: avery.id, actorPersonId: jun.id, allowed: false, action: 'ASK_ETYME_THREAD_VIEW' } })).toBe(1)
  })

  it('Clear starts over: the lines said so far stay on the record and are no longer shown, and the next line is shown', async () => {
    const me = await seatOf(AVERY, avery.seat)
    const cleared = await clearThread(me)
    expect(cleared).toMatchObject({ ok: true, saved: true })
    let back = await readThread(me)
    if (!back.ok) throw new Error(back.says)
    expect(back.thread.turns).toEqual([])
    expect(back.thread.clearedAt).not.toBeNull()
    expect(await prisma.askEtymeTurn.count({ where: { thread: { personId: avery.id, companyId: pinnacle.id } } })).toBe(2)

    await appendTurn(me, { speaker: 'PERSON', text: 'Starting again.' })
    back = await readThread(me)
    if (!back.ok) throw new Error(back.says)
    expect(back.thread.turns.map((t) => t.text)).toEqual(['Starting again.'])
  })

  it('a candidate with no company seat keeps one Ask Etyme thread of her own, read back after a reload, never mixed with a company’s, and two first lines at once still make one', async () => {
    const email = 'noor.candidate@inbox-mail.test'
    const noor = await prisma.person.create({ data: { primaryEmail: email, name: 'Noor Haddad' }, select: { id: true } })
    const hers = { person: { id: noor.id, primaryEmail: email }, company: null, context: null }

    const [a, b] = await Promise.all([
      appendTurn(hers, { speaker: 'PERSON', text: 'Which week do I still need to file?' }),
      appendTurn(hers, { speaker: 'PERSON', text: 'When am I paid?' }),
    ])
    expect(a).toMatchObject({ ok: true, saved: true })
    expect(b).toMatchObject({ ok: true, saved: true })
    const rows = await prisma.askEtymeThread.findMany({ where: { personId: noor.id }, select: { companyId: true, personOnlyId: true } })
    expect(rows).toEqual([{ companyId: null, personOnlyId: noor.id }])

    const back = await readThread(hers)
    if (!back.ok) throw new Error(back.says)
    expect(back.thread.saved).toBe(true)
    expect(back.thread.turns.map((t) => t.text).sort()).toEqual(['When am I paid?', 'Which week do I still need to file?'])

    // The unique on person and company reads two nulls as different; personOnlyId is what refuses a second.
    await expect(prisma.askEtymeThread.create({ data: { personId: noor.id, companyId: null, personOnlyId: noor.id } })).rejects.toThrow()

    // Avery's own thread with no company is hers alone, and never her Pinnacle thread.
    const me = await seatOf(AVERY, avery.seat)
    await appendTurn({ ...me, company: null }, { speaker: 'PERSON', text: 'Only mine, no firm.' })
    const atPinnacle = await readThread(me)
    if (!atPinnacle.ok) throw new Error(atPinnacle.says)
    expect(atPinnacle.thread.turns.map((t) => t.text)).not.toContain('Only mine, no firm.')
    const ownOnly = await readThread({ ...me, company: null })
    if (!ownOnly.ok) throw new Error(ownOnly.says)
    expect(ownOnly.thread.turns.map((t) => t.text)).toEqual(['Only mine, no firm.'])
  })

  it('a seeded demo seat, which every visitor who asks for it shares, keeps no thread and says why; the shared sample and an API key keep none either', async () => {
    const shared = await prisma.context.findFirstOrThrow({
      where: { companyId: pinnacle.id, person: { primaryEmail: 'world-pinnacle-recruiter@demo.etyme.local' } },
      select: { id: true, personId: true },
    })
    const demoSeat = await seatOf('world-pinnacle-recruiter@demo.etyme.local', shared.id)
    const said = await appendTurn(demoSeat, { speaker: 'PERSON', text: 'Hello from a visitor.' })
    expect(said).toEqual({
      ok: true, saved: false,
      says: 'This conversation is not kept after you leave the page, because other visitors use this demo seat too. Open your own demo to keep one.',
    })
    const read = await readThread(demoSeat)
    if (!read.ok) throw new Error(read.says)
    expect(read.thread).toMatchObject({ saved: false, turns: [] })
    expect(await prisma.askEtymeThread.count({ where: { personId: shared.personId } })).toBe(0)

    const me = await seatOf(AVERY, avery.seat)
    expect(await appendTurn({ ...me, readOnly: true }, { speaker: 'PERSON', text: 'Hi' })).toMatchObject({ ok: true, saved: false })
    expect(await readThread({ ...me, isService: true })).toMatchObject({ ok: false, code: 'NO_PERSON' })
  })
})

// The same thread through Ask Etyme's own route, the way the screen uses
// it: the greeting is rebuilt every time and never kept; every question
// and its answer are; a card's answer is recorded on the line that drew
// it; Clear starts over.
describe('Ask Etyme keeps the conversation through its own route, and the greeting is always today’s', () => {
  const RAE = 'rae.receivables@pinnacle-staff.test'
  let seatId = ''
  let raeId = ''
  let question = ''
  const at = (method: string, body?: unknown, url = '/api/conversations/twin') =>
    req(method, url, body, { 'x-context-id': seatId })

  beforeAll(async () => {
    await freshWorld()
    const pinnacle = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-pinnacle' }, select: { id: true, kind: true } })
    // Accounts Receivable, whoever sends bills, as Pinnacle gets it the next time somebody opens Users & permissions.
    await ensureDefaultRoles(pinnacle.id, pinnacle.kind)
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: pinnacle.id, name: 'Accounts Receivable' }, select: { id: true } })
    raeId = (await prisma.person.create({ data: { primaryEmail: RAE, name: 'Rae Okonkwo' }, select: { id: true } })).id
    seatId = (await prisma.context.create({
      data: { personId: raeId, companyId: pinnacle.id, type: 'EMPLOYEE', roleId: role.id, grantReason: 'Joined on the domain' },
      select: { id: true },
    })).id
    // One question Ask Etyme puts to whoever sends bills at Pinnacle.
    const asked = await prisma.twinAction.create({
      data: {
        companyId: pinnacle.id, twinKind: 'SUPPLIER', actorType: 'TWIN', actorId: 'SUPPLIER', onAuthorityOfRole: 'Owner',
        tier: 'NEEDS_APPROVAL', outcome: 'AWAITING_APPROVAL', action: 'bill.send', entityType: 'Invoice', entityId: 'inv-route-walk',
        partyCompanyIds: [pinnacle.id], ruleCited: 'bill.send', rationale: 'A drafted bill waits for a yes.', surface: 'CRON', payload: {},
      },
      select: { id: true },
    })
    question = (await prisma.twinApproval.create({
      data: { twinActionId: asked.id, companyId: pinnacle.id, needsPermission: 'invoices.issue' },
      select: { id: true },
    })).id
  }, 600_000)

  it('a question and its answer are shown again after a reload, in order, with the card still answered', async () => {
    as(RAE)
    const asked = await json(await askPost(at('POST', { text: 'What needs me today?' })))
    expect(asked.status).toBe(200)
    expect(asked.body.data.answer.kind).toBe('NEEDS')
    expect(asked.body.data.answer.items.map((i: { approvalId: string }) => i.approvalId)).toContain(question)
    expect(asked.body.data).toMatchObject({ kept: true, notKeptBecause: null })
    const turnId: string = asked.body.data.turnId

    // A reply after a yes is kept only once the record bears the yes out.
    const early = await json(await askPatch(at('PATCH', { turnId, approvalId: question, state: 'APPROVED', said: { kind: 'TEXT', says: 'Sent.' } })))
    expect(early.status).toBe(409)
    expect(early.body.error.message).toBe('The record does not show that answer on this question, so it is not kept in your conversation.')

    // The approval route said yes (recorded here as it would record it), and the screen marks the card and keeps the reply.
    await prisma.twinApproval.update({ where: { id: question }, data: { decision: 'APPROVED', decidedAt: new Date(), surface: 'WEB' } })
    const marked = await json(await askPatch(at('PATCH', {
      turnId, approvalId: question, state: 'APPROVED',
      said: { kind: 'TEXT', says: 'Approved Invoice receipt. Done, and recorded in Etyme’s ledger under your name.', links: [
        { label: 'Open Invoice receipt', href: '/dashboard/invoices/inv-route-walk' },
        { label: 'Somewhere else', href: 'https://elsewhere.example/' },
      ] },
    })))
    expect(marked.status).toBe(200)
    expect(marked.body.data).toMatchObject({ kept: true })

    // A reload: the saved lines in the order they were said, then today's greeting, which is not one of them.
    const back = await json(await askGet(at('GET')))
    expect(back.status).toBe(200)
    expect(back.body.data.answer.kind).toBe('NEEDS')
    const thread = back.body.data.thread
    expect(thread).toMatchObject({ saved: true, notKeptBecause: null, earlier: false })
    expect(thread.turns.map((t: { speaker: string; text: string }) => [t.speaker, t.text])).toEqual([
      ['PERSON', 'What needs me today?'],
      ['ETYME', asked.body.data.answer.says],
      ['ETYME', 'Approved Invoice receipt. Done, and recorded in Etyme’s ledger under your name.'],
    ])
    expect(thread.turns[1].cards[question].state).toBe('APPROVED')
    expect(thread.turns[2].approvalId).toBe(question)
    // Only a link inside Etyme is kept on the reply.
    expect(thread.turns[2].answer.links).toEqual([{ label: 'Open Invoice receipt', href: '/dashboard/invoices/inv-route-walk' }])
  })

  it('a general question with no record behind it is refused in one sentence before any model is called, and the refusal is kept like any answer', async () => {
    as(RAE)
    const before = await prisma.modelPrompt.count()
    const r = await json(await askPost(at('POST', { text: 'What is the capital of France?' })))
    expect(r.status).toBe(200)
    expect(r.body.data.answer).toEqual({ kind: 'TEXT', says: ONLY_THE_RECORD })
    expect(await prisma.modelPrompt.count()).toBe(before)
    const back = await json(await askGet(at('GET', undefined, '/api/conversations/twin?only=thread')))
    expect(back.body.data.thread.turns.slice(-2).map((t: { text: string }) => t.text)).toEqual(['What is the capital of France?', ONLY_THE_RECORD])
  })

  it('Clear starts the thread over and the old lines are not shown', async () => {
    as(RAE)
    const cleared = await json(await askDelete(at('DELETE')))
    expect(cleared.status).toBe(200)
    expect(cleared.body.data.saved).toBe(true)
    const back = await json(await askGet(at('GET')))
    expect(back.body.data.thread.turns).toEqual([])
    // The greeting still opens the chat: it is today's, and it was never a line.
    expect(back.body.data.answer.kind).toBe('NEEDS')
    // Kept on the record, unshown.
    expect(await prisma.askEtymeTurn.count({ where: { thread: { personId: raeId } } })).toBe(5)
  })

  it('a seeded demo seat is told its thread is not kept, in one line, with no error', async () => {
    const demo = 'world-pinnacle-recruiter@demo.etyme.local'
    const shared = await prisma.context.findFirstOrThrow({
      where: { person: { primaryEmail: demo } }, select: { id: true, personId: true },
    })
    as(demo)
    const hello = await json(await askGet(req('GET', '/api/conversations/twin', undefined, { 'x-context-id': shared.id })))
    expect(hello.status).toBe(200)
    expect(hello.body.data.answer.kind).toBe('NEEDS')
    expect(hello.body.data.thread).toEqual({ saved: false, notKeptBecause: NOT_KEPT_IN_DEMO, earlier: false, turns: [] })
    const asked = await json(await askPost(req('POST', '/api/conversations/twin', { text: 'What needs me today?' }, { 'x-context-id': shared.id })))
    expect(asked.status).toBe(200)
    expect(asked.body.data).toMatchObject({ kept: false, turnId: null, notKeptBecause: NOT_KEPT_IN_DEMO })
    const cleared = await json(await askDelete(req('DELETE', '/api/conversations/twin', undefined, { 'x-context-id': shared.id })))
    expect(cleared).toMatchObject({ status: 200, body: { data: { saved: false, notKeptBecause: NOT_KEPT_IN_DEMO } } })
    expect(await prisma.askEtymeThread.count({ where: { personId: shared.personId } })).toBe(0)
  })
})

// Ask Etyme for workers (founder, 2026-10-16: the same Ask Etyme, inside
// their own pages). Walked as the seeded Helena Marsh — on Techpeple's
// bench, on site at Northbend Athletic through Computer Systems Inc — and
// Karthik Menon, Teleworld's own W2 with a seat that reads only his own
// work; then a worker whose thread is kept, and a candidate with no
// company seat at all.
describe('a worker reads Ask Etyme about her own work, from her own pages, and Etyme never files for her', () => {
  const HELENA = 'helena.marsh@seed.etyme.invalid'
  const KARTHIK_AT = 'karthik.menon@seed.etyme.invalid'
  const INES = 'ines.okafor@walkthrough.test'
  const SOLO = 'rui.candidate@walkthrough.test'
  let helena = ''
  let techpeple = ''

  beforeAll(async () => {
    await freshWorld()
    helena = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: HELENA }, select: { id: true } })).id
    techpeple = (await prisma.company.findFirstOrThrow({ where: { name: 'Techpeple' }, select: { id: true } })).id
    const ines = await prisma.person.create({ data: { primaryEmail: INES, name: 'Ines Okafor' }, select: { id: true } })
    await prisma.context.create({ data: { personId: ines.id, companyId: techpeple, type: 'CONSULTANT', grantReason: 'Said yes to the bench' } })
    const rui = await prisma.person.create({ data: { primaryEmail: SOLO, name: 'Rui Costa' }, select: { id: true } })
    await prisma.context.create({ data: { personId: rui.id, type: 'CONSULTANT', grantReason: 'Signed up as a candidate' } })
  }, 600_000)

  it('a worker’s greeting opens on her chain in one line, then the week to file, what is signed and what is owed, the papers after the money, and ends on her months against the time limit, with no rate but her own', async () => {
    as(HELENA)
    const r = await json(await askGet(req('GET', '/api/conversations/twin')))
    expect(r.status).toBe(200)
    expect(r.body.data.worker).toBe(true)
    const a = r.body.data.answer
    expect(a.kind).toBe('WORKER')
    expect(a.where).toEqual(['You work at Northbend Athletic through Computer Systems Inc, employed by Techpeple.'])
    // A week that ended and is not filed, with the hours her job runs.
    const file = a.cards.find((c: any) => c.act === 'FILE_WEEK')
    expect(file).toMatchObject({ button: 'File my week', href: '/dashboard/my-work' })
    expect(file.title).toMatch(/^Your week of [A-Z][a-z]{2} \d+–(?:[A-Z][a-z]{2} )?\d+ isn’t filed yet\.$/)
    expect(file.says).toMatch(/^40 hours are expected; file it when you are ready\./)
    // "Etyme never files a week for you" left the greeting.
    expect(a.note).toBeUndefined()
    expect(JSON.stringify(a)).not.toContain(NEVER_FILES)
    const lines = a.more.map((l: any) => l.says)
    const tail = (a.tail ?? []).map((l: any) => l.says)
    // Where the newest week stands, what is owed and for how many unpaid hours, and the rule.
    expect(lines).toContain('A week is owed to you once Techpeple accepts it, not when the client signs it.')
    expect(lines.some((l: string) => /^\$[\d,]+\.\d\d is owed to you, for [\d.]+ hours Techpeple accepted and has not paid yet\.$/.test(l))).toBe(true)
    // Papers that do not stop her work come after the money, as one line with an Upload card each.
    expect(a.papers.says).toMatch(/^Two papers are asked of you: your .+ and your .+\.$/)
    expect(a.papers.cards.map((c: any) => c.button)).toEqual(['Upload', 'Upload'])
    // Her own months at Northbend against its limit, whole months, never rounded up.
    expect(tail[0]).toMatch(/^You are (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen) months? into Northbend Athletic’s eighteen-month time limit\.$/)
    expect(tail).toContain(WORKER_CLOSE)
    // Every firm by name; no rate of any rung, hers included, in the greeting.
    const said = JSON.stringify(a)
    expect(said).not.toMatch(/\$145\.00|\$118\.00|\$90\.00 an hour/)
    expect(said).not.toMatch(/\bdesk\b|program office/i)
    // A seeded seat every visitor shares keeps no thread, and says so.
    expect(r.body.data.thread).toEqual({ saved: false, notKeptBecause: NOT_KEPT_IN_DEMO, earlier: false, turns: [] })
  })

  it('Ask Etyme never files a worker’s week; the card opens her own page, and no week is written', async () => {
    as(HELENA)
    const before = await prisma.timesheet.count({ where: { personId: helena } })
    const r = await json(await askPost(req('POST', '/api/conversations/twin', { text: 'File my week' })))
    expect(r.status).toBe(200)
    expect(r.body.data.answer.says).toBe(FILE_IT_YOURSELF)
    expect(r.body.data.answer.cards.map((c: any) => [c.act, c.href])).toEqual([['FILE_WEEK', '/dashboard/my-work']])
    expect(await prisma.timesheet.count({ where: { personId: helena } })).toBe(before)
  })

  it('a worker asks what she is owed and reads the employer’s acceptance, never the client’s signature, as the moment it became owed', async () => {
    as(HELENA)
    const r = await json(await askPost(req('POST', '/api/conversations/twin', { text: 'What am I owed?' })))
    expect(r.status).toBe(200)
    const a = r.body.data.answer
    expect(a.says).toMatch(/^\$[\d,]+\.\d\d is owed to you, for [\d.]+ hours Techpeple accepted and has not paid yet\. Checked just now\.$/)
    expect(a.more.map((l: any) => l.says)).toContain('A week is owed to you once Techpeple accepts it, not when the client signs it.')
    // Every week in the owed table is one Techpeple accepted; none is waiting on a signature.
    const accepted = await prisma.timesheet.findMany({
      where: { personId: helena, OR: [{ employerAcceptedAt: { not: null } }, { assertions: { some: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' } } }] },
      select: { id: true },
    })
    const ids = new Set(accepted.map((t) => t.id))
    for (const row of a.table.rows) expect(ids.has(row.href.split('/').pop())).toBe(true)
    // And what one firm charges another for her is never said.
    const rate = await json(await askPost(req('POST', '/api/conversations/twin', { text: 'What does Northbend pay for me?' })))
    expect(rate.body.data.answer.says).toBe(NOT_THEIR_RATE)
  })

  it('Karthik Menon, an integrator’s own W2 with no desk, reads his own chain and weeks, never his firm’s queue', async () => {
    as(KARTHIK_AT)
    const r = await json(await askGet(req('GET', '/api/conversations/twin')))
    expect(r.status).toBe(200)
    const a = r.body.data.answer
    expect(a.kind).toBe('WORKER')
    expect(a.where[0]).toMatch(/^You (work|worked) at Corveldt Aerospace.*, employed by Teleworld Solutions\.$/)
    // His firm's book never: no colleague, no invoice receipt; a time limit only as his own months at his own site.
    expect(JSON.stringify(a)).not.toMatch(/Meera|invoice receipt/i)
    for (const l of (a.tail ?? []).map((x: any) => x.says).filter((x: string) => /time limit/.test(x))) expect(l).toMatch(/^You (are|have reached) .*Corveldt Aerospace’s/)
    const consent = await json(await askPost(req('POST', '/api/conversations/twin', { text: 'Who has my consent?' })))
    expect(consent.body.data.answer.more.map((l: any) => l.says)).toContain(
      'Teleworld Solutions employs you, so it puts you forward without asking. You are told each time.'
    )
  })

  it('a worker’s saved thread is kept exactly as any seat’s: her question and the answer come back after a reload, at her own seat', async () => {
    as(INES)
    const asked = await json(await askPost(req('POST', '/api/conversations/twin', { text: 'Who has my consent?' })))
    expect(asked.status).toBe(200)
    expect(asked.body.data).toMatchObject({ kept: true, notKeptBecause: null })
    const back = await json(await askGet(req('GET', '/api/conversations/twin')))
    expect(back.body.data.answer.kind).toBe('WORKER')
    expect(back.body.data.thread.turns.map((t: any) => [t.speaker, t.text])).toEqual([
      ['PERSON', 'Who has my consent?'], ['ETYME', asked.body.data.answer.says],
    ])
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: INES }, select: { id: true } })
    expect(await prisma.askEtymeThread.count({ where: { personId: person.id, companyId: techpeple } })).toBe(1)
  })

  it('a candidate with no company seat keeps her own Ask Etyme thread, read back after a reload', async () => {
    as(SOLO)
    const r = await json(await askGet(req('GET', '/api/conversations/twin')))
    expect(r.status).toBe(200)
    expect(r.body.data.answer.kind).toBe('WORKER')
    expect(r.body.data.answer.says).toBe('Nothing needs you today. Checked just now.')
    expect(r.body.data.answer.more.map((l: any) => l.says)).toContain('Nobody has placed you yet. Firms find you through Your page.')
    expect(r.body.data.thread).toMatchObject({ saved: true, notKeptBecause: null, turns: [] })
    const asked = await json(await askPost(req('POST', '/api/conversations/twin', { text: 'What am I owed?' })))
    expect(asked.body.data).toMatchObject({ kept: true, notKeptBecause: null })
    expect(asked.body.data.answer.says).toBe('Nothing is owed to you right now. Checked just now.')
    // The reload: her question and the answer come back under the greeting.
    const back = await json(await askGet(req('GET', '/api/conversations/twin')))
    expect(back.body.data.thread.turns.map((t: any) => [t.speaker, t.text])).toEqual([
      ['PERSON', 'What am I owed?'], ['ETYME', asked.body.data.answer.says],
    ])
    const rui = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: SOLO }, select: { id: true } })
    expect(await prisma.askEtymeThread.findMany({ where: { personId: rui.id }, select: { companyId: true, personOnlyId: true } }))
      .toEqual([{ companyId: null, personOnlyId: rui.id }])
    // Clear starts her over, and the greeting stands.
    const cleared = await json(await askDelete(req('DELETE', '/api/conversations/twin')))
    expect(cleared.body.data).toMatchObject({ saved: true, notKeptBecause: null })
    const after = await json(await askGet(req('GET', '/api/conversations/twin')))
    expect(after.body.data.thread.turns).toEqual([])
    expect(after.body.data.answer.kind).toBe('WORKER')
  })
})

describe('a one-person firm is the firm and the worker in one greeting', () => {
  let email = ''
  let seat = ''
  beforeAll(async () => {
    await freshWorld()
    const byrne = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-byrne-critical-care' }, select: { id: true } })
    const owner = await prisma.context.findFirstOrThrow({
      where: { companyId: byrne.id, type: 'EMPLOYEE' },
      select: { id: true, person: { select: { primaryEmail: true } } },
    })
    email = owner.person.primaryEmail
    seat = owner.id
  }, 600_000)

  it('Colleen Byrne’s greeting at her own corporation says her latest week and that the client signed it, with a link to the week', async () => {
    as(email)
    const res = await json(await askGet(req('GET', '/api/conversations/twin', undefined, { 'x-context-id': seat })))
    expect(res.status).toBe(200)
    expect(res.body.data.party).toBe('SOLO')
    const week = (res.body.data.answer.more as Array<{ says: string; links?: Array<{ text: string; href: string }> }>)
      .find((l) => l.says.startsWith('Your week of '))
    expect(week?.says).toMatch(/^Your week of [A-Z][a-z]{2} \d{1,2}–.+ is signed by /)
    expect(week?.links?.[0].href).toMatch(/^\/dashboard\/weeks\//)
  })
})

import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { GET as list, POST as open } from '@/app/api/conversations/route'
import { GET as read, POST as reply } from '@/app/api/conversations/messages/route'

/**
 * A client talks to one supplier about a role, and about a candidate.
 *
 * The founder, on the 2017 rule: "we did not want demand side to be
 * spammed and cold-messaged by supply side, but important conversations
 * initiated from demand side should be solved." So Nike writes to
 * Pinnacle from the role; Pinnacle is told and answers; Pinnacle cannot
 * start one; a firm not on the role cannot see it exists; and Nike's own
 * Discussion never leaves Nike. Walked as the routes the screens call,
 * on the seeded world.
 */

const D = '@demo.etyme.local'
const NIKE_PM = `world-nike-programme${D}`

/** Notices are fire-and-forget; give the bell a moment to ring. */
async function noticesAbout(threadId: string, atLeast: number, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const rows = await prisma.notification.findMany({ where: { entityId: threadId }, orderBy: { createdAt: 'asc' } })
    if (rows.length >= atLeast) return rows
    await new Promise((r) => setTimeout(r, 50))
  }
  return prisma.notification.findMany({ where: { entityId: threadId }, orderBy: { createdAt: 'asc' } })
}

let nike: { id: string; pmPersonId: string }
let role: { id: string; title: string }
let pinnacle: { id: string; name: string; seat: string; staff: string[] }
let stranger: { id: string; name: string; seat: string }
let meiLin: { email: string; submissionId: string }
let roleThread: string
let candidateThread: string

describe('Nike writes to Pinnacle about a role, and Pinnacle answers', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    const n = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const pm = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: NIKE_PM }, select: { id: true } })
    nike = { id: n.id, pmPersonId: pm.id }

    const r = await prisma.requirement.findFirstOrThrow({
      where: { companyId: nike.id, title: 'Workday HCM integration lead' },
      select: { id: true, title: true, invitations: { select: { toCompanyId: true } } },
    })
    role = { id: r.id, title: r.title }
    const onRole = r.invitations.map((i) => i.toCompanyId)

    const staffOf = (c: { contexts: { personId: string; person: { primaryEmail: string } }[] }) => ({
      seat: c.contexts[0].person.primaryEmail,
      staff: c.contexts.map((x) => x.personId),
    })
    const staffSelect = {
      where: { revokedAt: null, type: { in: ['EMPLOYEE', 'PARTNER'] as any } },
      select: { personId: true, person: { select: { primaryEmail: true } } },
      orderBy: { grantedAt: 'asc' as const },
    }

    const pin = await prisma.company.findUniqueOrThrow({
      where: { slug: 'world-pinnacle' },
      select: { id: true, name: true, contexts: staffSelect },
    })
    pinnacle = { id: pin.id, name: pin.name, ...staffOf(pin) }

    // A vendor in the world that Nike never asked to work this role.
    const other = await prisma.company.findFirstOrThrow({
      where: { kind: 'VENDOR', id: { notIn: [...onRole, pinnacle.id] }, contexts: { some: { revokedAt: null, type: 'EMPLOYEE' } } },
      select: { id: true, name: true, contexts: staffSelect },
    })
    stranger = { id: other.id, name: other.name, seat: staffOf(other).seat }

    const ml = await prisma.submission.findFirstOrThrow({
      where: { toCompanyId: nike.id, requirementId: role.id, person: { name: 'Mei-Lin Chao' } },
      select: { id: true, person: { select: { primaryEmail: true } } },
    })
    meiLin = { email: ml.person.primaryEmail, submissionId: ml.id }
  }, 120_000)

  it('the program desk opens a thread with Pinnacle from the role, with its first question', async () => {
    as(NIKE_PM)
    const res = json(await open(req('POST', '/api/conversations', {
      topic: 'REQUIREMENT', topicId: role.id, withCompanyId: pinnacle.id,
      initialMessage: 'Can your Workday people start before the end of the month?',
    })))
    const r = await res
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.status).toBe(201)
    expect(r.body.data.conversation.existing).toBe(false)
    expect(r.body.data.conversation.title).toBe(role.title)
    roleThread = r.body.data.conversation.id
  })

  it("Pinnacle's people are told in the app, in a line that says who asked and about what", async () => {
    const rows = await noticesAbout(roleThread, 1)
    expect(rows.length, 'nobody at Pinnacle was told').toBeGreaterThan(0)
    expect(rows.every((n) => pinnacle.staff.includes(n.personId))).toBe(true)
    expect(rows.every((n) => n.type === 'CONVERSATION' && n.channel === 'IN_APP')).toBe(true)
    expect(rows[0].title).toMatch(new RegExp(`^.+ at Nike on ${role.title}$`))
    expect(rows[0].body).toBe('Can your Workday people start before the end of the month?')
  })

  it('Pinnacle sees the thread as one Nike opened with them, and answers on it', async () => {
    as(pinnacle.seat)
    const mine = await json(await list(req('GET', '/api/conversations')))
    const row = mine.body.data.conversations.find((c: any) => c.id === roleThread)
    expect(row, 'the thread is not in Pinnacle’s list').toBeTruthy()
    expect(row.side).toBe('ANSWERS')
    expect(row.otherCompany.name).toBe('Nike')

    const r = await json(await reply(req('POST', '/api/conversations/messages', {
      conversationId: roleThread, body: 'Two of them can. I will confirm names by Friday.',
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
  })

  it('the answer reaches the desk that asked, and the rest of Pinnacle is not told about its own reply', async () => {
    const rows = await noticesAbout(roleThread, 2)
    const toNike = rows.filter((n) => n.personId === nike.pmPersonId)
    expect(toNike).toHaveLength(1)
    expect(toNike[0].title).toMatch(new RegExp(`^.+ at ${pinnacle.name} on ${role.title}$`))
    // Every notice on this thread went to one side or the other; nobody
    // was told about their own note.
    const pinnacleHeard = rows.filter((n) => pinnacle.staff.includes(n.personId))
    expect(pinnacleHeard.every((n) => n.title.includes('at Nike'))).toBe(true)
  })

  it('both sides read the same thread, each note marked with the firm that wrote it', async () => {
    as(NIKE_PM)
    const r = await json(await read(req('GET', `/api/conversations/messages?conversationId=${roleThread}`)))
    expect(r.status).toBe(200)
    expect(r.body.data.messages.map((m: any) => m.authorCompany)).toEqual(['Nike', pinnacle.name])
    expect(r.body.data.thread.withCompany.id).toBe(pinnacle.id)
  })

  it('Pinnacle cannot open a thread with Nike; it is told to submit or answer the invitation instead', async () => {
    as(pinnacle.seat)
    const r = await json(await open(req('POST', '/api/conversations', {
      topic: 'REQUIREMENT', topicId: role.id, withCompanyId: nike.id, initialMessage: 'We have great people!',
    })))
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('SUPPLY_ANSWERS')
    expect(r.body.error.message).toBe(
      `Nike opens the conversation on ${role.title}; ${pinnacle.name} answers it. ` +
      'Submit a candidate, or answer the invitation, and they hear from you that way.'
    )
  })

  it('a firm that was never asked to work the role cannot read the thread, and is not told it exists', async () => {
    as(stranger.seat)
    const r = await json(await read(req('GET', `/api/conversations/messages?conversationId=${roleThread}`)))
    expect(r.status).toBe(404)
    const mine = await json(await list(req('GET', '/api/conversations')))
    expect(mine.body.data.conversations.some((c: any) => c.id === roleThread)).toBe(false)
  })

  it('Nike cannot write to a firm that is not on the role, and is told to invite them first', async () => {
    as(NIKE_PM)
    const r = await json(await open(req('POST', '/api/conversations', {
      topic: 'REQUIREMENT', topicId: role.id, withCompanyId: stranger.id, initialMessage: 'Hello?',
    })))
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('NOT_ON_THE_ROLE')
    expect(r.body.error.message).toBe(
      `${stranger.name} has not been asked to work ${role.title}. Invite them and the conversation opens with the invitation.`
    )
  })

  it("Nike's own Discussion on the role stays at Nike; Pinnacle's list never shows it", async () => {
    as(NIKE_PM)
    const own = await json(await open(req('POST', '/api/conversations', {
      topic: 'REQUIREMENT', topicId: role.id, title: role.title, initialMessage: 'Between us: Pinnacle is our first choice.',
    })))
    expect(own.status, JSON.stringify(own.body)).toBe(201)
    const ownId = own.body.data.conversation.id
    expect(ownId).not.toBe(roleThread)

    as(pinnacle.seat)
    const theirs = await json(await list(req('GET', `/api/conversations?topic=REQUIREMENT&topicId=${role.id}`)))
    const ids = theirs.body.data.conversations.map((c: any) => c.id)
    expect(ids).toContain(roleThread)
    expect(ids).not.toContain(ownId)
    const peek = await json(await read(req('GET', `/api/conversations/messages?conversationId=${ownId}`)))
    expect(peek.status).toBe(404)
  })

  it('a question about Mei-Lin goes to Pinnacle, who sent her, and to no other firm', async () => {
    as(NIKE_PM)
    const wrong = await json(await open(req('POST', '/api/conversations', {
      topic: 'SUBMISSION', topicId: meiLin.submissionId, withCompanyId: stranger.id, initialMessage: 'Is she available?',
    })))
    expect(wrong.status).toBe(403)
    expect(wrong.body.error.message).toBe(`Mei-Lin Chao came from ${pinnacle.name}, not ${stranger.name}.`)

    const right = await json(await open(req('POST', '/api/conversations', {
      topic: 'SUBMISSION', topicId: meiLin.submissionId, withCompanyId: pinnacle.id, initialMessage: 'Is she available from the 1st?',
    })))
    expect(right.status, JSON.stringify(right.body)).toBe(201)
    expect(right.body.data.conversation.title).toBe(`Mei-Lin Chao · ${role.title}`)
    candidateThread = right.body.data.conversation.id
  })

  it('asking again lands on the same thread rather than a second one', async () => {
    as(NIKE_PM)
    const again = await json(await open(req('POST', '/api/conversations', {
      topic: 'SUBMISSION', topicId: meiLin.submissionId, withCompanyId: pinnacle.id,
    })))
    expect(again.status).toBe(200)
    expect(again.body.data.conversation).toMatchObject({ id: candidateThread, existing: true })
  })

  it("Mei-Lin, on Pinnacle's bench, cannot read what the two firms say about her", async () => {
    as(meiLin.email)
    const r = await json(await read(req('GET', `/api/conversations/messages?conversationId=${candidateThread}`)))
    expect(r.status).toBe(404)
  })
})

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * The sign-in door a firm holds can never take over somebody's account
 * (2026-11-16, found by a reader who built none of it).
 *
 * The door sent anybody with no password and no stored sign-in to choose
 * a password. Somebody who signs in by an email link, by LinkedIn, by a
 * directory, or who only ever answered an invitation, has neither. So
 * the firm holding the copied link could press Continue, choose a
 * password on her account, and sign in as her, again and again for 72
 * hours.
 *
 * Now the door gives a first password only to a record nobody has ever
 * used, by any door (`everCameIn` in lib/notify/sign-in-link), it is
 * spent on the first press, and every press is logged.
 *
 * Every address is on a reserved domain; the address check is told these
 * are reachable, so the door treats them as real people.
 */

const reachable = new Set<string>()
vi.mock('@/lib/password', async (orig) => {
  const real: any = await orig()
  return { ...real, demoEmail: (e: string) => (reachable.has(String(e).toLowerCase()) ? false : real.demoEmail(e)) }
})
vi.mock('@/lib/notification-delivery', async (orig) => {
  const real: any = await orig()
  return { ...real, demoAddress: (e: string) => (reachable.has(String(e).toLowerCase()) ? false : real.demoAddress(e)) }
})
const sent: { to: string; title: string; body: string }[] = []
let senderOn = false
vi.mock('@/lib/senders', async (orig) => {
  const real: any = await orig()
  return {
    ...real,
    emailSender: () => (senderOn ? { channel: 'EMAIL', send: async (to: string, title: string, body: string) => { sent.push({ to, title, body }) } } : null),
  }
})

const { POST: invite } = await import('@/app/api/access/invite/route')
const { POST: makeSignIn } = await import('@/app/api/notifications/sign-in-link/route')
const { POST: enterDoor } = await import('@/app/api/answer/sign-in/[token]/route')
const { readSignInDoorPage } = await import('@/lib/notify/sign-in-link-door')

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'

/** One person per door: each has used Etyme in exactly one way, and has no password. */
const USED = {
  googleSignIn: 'ana.google@harborline-tech.example',
  emailLinkSignIn: 'ben.emaillink@harborline-tech.example',
  emailLinkFirstSignInOnly: 'bea.firstlink@harborline-tech.example',
  linkedInSignIn: 'cora.linkedin@harborline-tech.example',
  directory: 'dev.directory@harborline-tech.example',
  seatUsedElsewhere: 'eli.seat@harborline-tech.example',
  answeredAnInvitation: 'fay.answered@harborline-tech.example',
  mailboxProved: 'gus.verified@harborline-tech.example',
  endedSessions: 'hal.sessions@harborline-tech.example',
} as const
const NEW_HIRE = 'ivy.newhire@northwind-staffing.example'
const SECOND_HIRE = 'jon.newhire@northwind-staffing.example'

const ids: Record<string, string> = {}

const post = async (personId: string) => {
  as(BRIGHTMOOR)
  return json(await makeSignIn(req('POST', '/api/notifications/sign-in-link', { personId })))
}
const tokenIn = (link: string) => link.split('/answer/sign-in/')[1].trim()
/** Continue on the door's page, pressed by whoever holds the link. */
const enter = async (token: string) => {
  delete process.env.DEV_BYPASS_AUTH
  const res = await enterDoor(req('POST', `/api/answer/sign-in/${token}`), { params: Promise.resolve({ token }) })
  return { status: res.status, to: res.headers.get('location') ?? '' }
}
const resets = (personId: string) => prisma.emailToken.count({ where: { personId, purpose: 'RESET' } })

beforeAll(async () => {
  await freshWorld()
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? 'integration-test-secret'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
  for (const e of [...Object.values(USED), NEW_HIRE, SECOND_HIRE]) reachable.add(e)

  const elsewhere = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-pinnacle' }, select: { id: true } })
  const make = async (email: string, name: string, data: Record<string, unknown> = {}) =>
    (await prisma.person.create({ data: { primaryEmail: email, name, ...data }, select: { id: true } })).id

  ids.googleSignIn = await make(USED.googleSignIn, 'Ana Google')
  await prisma.credential.create({ data: { personId: ids.googleSignIn, provider: 'GOOGLE', providerId: 'google-subject-ana', email: USED.googleSignIn } })

  ids.emailLinkSignIn = await make(USED.emailLinkSignIn, 'Ben Emaillink')
  await prisma.credential.create({ data: { personId: ids.emailLinkSignIn, provider: 'EMAIL', providerId: USED.emailLinkSignIn, email: USED.emailLinkSignIn } })

  // Her first sign-in by email link wrote no Credential row: the sign-up made her record and her own seat.
  ids.emailLinkFirstSignInOnly = await make(USED.emailLinkFirstSignInOnly, 'Bea Firstlink')
  await prisma.context.create({ data: { personId: ids.emailLinkFirstSignInOnly, type: 'CONSULTANT' } })

  // LinkedIn writes no Credential row: only the sign-in ledger names her as the actor.
  ids.linkedInSignIn = await make(USED.linkedInSignIn, 'Cora Linkedin')
  await prisma.accessLog.create({ data: { subjectId: ids.linkedInSignIn, actorPersonId: ids.linkedInSignIn, action: 'LOGIN_SUCCEEDED', allowed: true, reason: `${USED.linkedInSignIn} signed in through LINKEDIN.` } })

  ids.directory = await make(USED.directory, 'Dev Directory')
  await prisma.externalIdentity.create({ data: { personId: ids.directory, companyId: elsewhere.id, issuer: 'https://login.harborline-tech.example', subject: 'dev-1', email: USED.directory } })

  ids.seatUsedElsewhere = await make(USED.seatUsedElsewhere, 'Eli Seat')
  await prisma.context.create({ data: { personId: ids.seatUsedElsewhere, companyId: elsewhere.id, type: 'EMPLOYEE', lastUsedAt: new Date() } })

  ids.answeredAnInvitation = await make(USED.answeredAnInvitation, 'Fay Answered')
  const profile = await prisma.consultantProfile.create({ data: { personId: ids.answeredAnInvitation }, select: { id: true } })
  await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: elsewhere.id, tier: 'MARKETING', state: 'GRANTED', invitedAt: new Date(), respondedAt: new Date() } })

  ids.mailboxProved = await make(USED.mailboxProved, 'Gus Verified', { emailVerifiedAt: new Date() })
  ids.endedSessions = await make(USED.endedSessions, 'Hal Sessions', { sessionVersion: 1, sessionsEndedAt: new Date() })

  // Every one of them, and two new hires, invited to a seat at Brightmoor.
  as(BRIGHTMOOR)
  const names: Record<string, string> = { [NEW_HIRE]: 'Ivy Newhire', [SECOND_HIRE]: 'Jon Newhire' }
  for (const email of [...Object.values(USED), NEW_HIRE, SECOND_HIRE]) {
    const r = await json(await invite(req('POST', '/api/access/invite', { email, name: names[email] ?? email.split('@')[0] })))
    expect([200, 201], JSON.stringify(r.body)).toContain(r.status)
  }
  ids.newHire = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: NEW_HIRE }, select: { id: true } })).id
  ids.secondHire = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: SECOND_HIRE }, select: { id: true } })).id
}, 300_000)

afterEach(() => {
  senderOn = false
  delete process.env.NOTIFY_FROM_EMAIL
  delete process.env.RESEND_API_KEY
})

describe('the sign-in door a firm holds never takes over an account', () => {
  it('a firm holding a sign-in link can never set a password on an account somebody has used, by any door', async () => {
    for (const [door, email] of Object.entries(USED)) {
      const personId = ids[door]
      const resetsBefore = await resets(personId)
      const made = await post(personId)
      expect(made.status, `${door}: ${JSON.stringify(made.body)}`).toBe(200)
      expect(made.body.data.state, door).toBe('KEPT')
      const went = await enter(tokenIn(made.body.data.link))
      expect(went.status, door).toBe(303)
      expect(went.to, door).toBe(`http://localhost:3000/login?email=${encodeURIComponent(email)}`)
      // The door made no set-password link (the invitation's own letter is not the door's).
      expect(await resets(personId), door).toBe(resetsBefore)
      expect((await prisma.person.findUniqueOrThrow({ where: { id: personId } })).passwordHash, door).toBeNull()
    }
  })

  it('a person who signs in by email link is sent to sign in as usual, never to choose a password, from a firm\'s link', async () => {
    // Once signed in by email link (no Credential row yet), and signed in by it again (a Credential row).
    for (const who of ['emailLinkFirstSignInOnly', 'emailLinkSignIn'] as const) {
      const personId = ids[who]
      const email = USED[who]
      const resetsBefore = await resets(personId)
      // Where no email can leave: the link the firm copies.
      const kept = await post(personId)
      expect((await enter(tokenIn(kept.body.data.link))).to, who).toBe(`http://localhost:3000/login?email=${encodeURIComponent(email)}`)

      // Where email can leave: the link in her mailbox does the same.
      process.env.NOTIFY_FROM_EMAIL = 'hello@notify.example'
      process.env.RESEND_API_KEY = 'test-key-never-used'
      senderOn = true
      const mailed = await post(personId)
      expect(mailed.body.data.state, who).toBe('SENT')
      const letter = sent.filter((m) => m.to === email).at(-1)!
      const link = letter.body.split('\n').find((l) => l.includes('/answer/sign-in/'))!
      expect((await enter(tokenIn(link))).to, who).toBe(`http://localhost:3000/login?email=${encodeURIComponent(email)}`)
      senderOn = false
      delete process.env.NOTIFY_FROM_EMAIL
      delete process.env.RESEND_API_KEY

      expect(await resets(personId), who).toBe(resetsBefore)
      expect((await prisma.person.findUniqueOrThrow({ where: { id: personId } })).passwordHash, who).toBeNull()
    }
  })

  it('a firm\'s own new hire, who has never used Etyme, still chooses a first password from the link', async () => {
    const before = await resets(ids.newHire)
    const made = await post(ids.newHire)
    const went = await enter(tokenIn(made.body.data.link))
    expect(went.to).toMatch(/\/reset\/[A-Za-z0-9_-]+$/)
    expect(await resets(ids.newHire)).toBe(before + 1)
  })

  it('a sign-in link is spent once it has issued a set-password link', async () => {
    const before = await resets(ids.secondHire)
    const made = await post(ids.secondHire)
    const token = tokenIn(made.body.data.link)
    const first = await enter(token)
    expect(first.to).toMatch(/\/reset\/[A-Za-z0-9_-]+$/)
    expect(await resets(ids.secondHire)).toBe(before + 1)

    // A second press makes nothing, and goes back to the page, which says the link was used.
    const second = await enter(token)
    expect(second.to).toBe(`http://localhost:3000/answer/sign-in/${encodeURIComponent(token)}`)
    expect(await resets(ids.secondHire)).toBe(before + 1)
    expect(await readSignInDoorPage(token)).toEqual({ ok: false, firmName: 'Brightmoor Staffing', used: true })

    // A newer link replaces it, and works once in its turn.
    const fresh = tokenIn((await post(ids.secondHire)).body.data.link)
    expect(await readSignInDoorPage(fresh)).toEqual({ ok: true, firmName: 'Brightmoor Staffing' })
    expect((await enter(fresh)).to).toMatch(/\/reset\/[A-Za-z0-9_-]+$/)
    expect((await enter(fresh)).to).toBe(`http://localhost:3000/answer/sign-in/${encodeURIComponent(fresh)}`)
  })

  it('every use and every refusal of the sign-in door is logged, and no row holds a link', async () => {
    const personId = ids.newHire
    const since = new Date(Date.now() - 1000)
    const old = tokenIn((await post(personId)).body.data.link)
    const live = tokenIn((await post(personId)).body.data.link)
    const rowsNow = () => prisma.accessLog.findMany({ where: { subjectId: personId, at: { gte: since } }, orderBy: { at: 'asc' }, select: { allowed: true, reason: true, actorPersonId: true } })
    const before = (await rowsNow()).length

    // A replaced link: refused, and the row is written.
    await enter(old)
    let rows = (await rowsNow()).slice(before)
    expect(rows).toHaveLength(1)
    expect(rows[0].allowed).toBe(false)
    expect(rows[0].reason).toMatch(/sign-in link Brightmoor Staffing made/)

    // Continue: one row, with her as the subject and nobody named as the actor.
    await enter(live)
    rows = (await rowsNow()).slice(before)
    expect(rows).toHaveLength(2)
    expect(rows[1].allowed).toBe(true)
    expect(rows[1].actorPersonId).toBeNull()

    // Pressed again: refused, and logged.
    await enter(live)
    rows = (await rowsNow()).slice(before)
    expect(rows).toHaveLength(3)
    expect(rows[2].allowed).toBe(false)
    expect(rows[2].reason).toMatch(/already used/)

    // A token nobody signed names nobody, so there is no person to log it against, and nothing is written about her.
    await enter(`${live}x`)
    expect((await rowsNow()).slice(before)).toHaveLength(3)

    // No row anywhere holds the door's link, its token, or a set-password link.
    const everyRow = [
      ...(await prisma.accessLog.findMany({ where: { at: { gte: since } }, select: { reason: true } })).map((r) => r.reason ?? ''),
      ...(await prisma.automationLog.findMany({ where: { at: { gte: since } }, select: { summary: true, reason: true, payload: true } })).map((r) => JSON.stringify(r)),
    ].join('\n')
    for (const t of [old, live]) {
      expect(everyRow).not.toContain(t)
      expect(everyRow).not.toContain(t.split('.')[0])
    }
    expect(everyRow).not.toMatch(/\/answer\/sign-in\/|\/reset\//)
  })
})

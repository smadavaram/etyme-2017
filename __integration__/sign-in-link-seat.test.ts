import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * A seat a firm invited, never signed in here: the sign-in line never
 * says whether the address has an account elsewhere (2026-11-16).
 *
 * The line drew nothing for an address that signs in anywhere, and
 * "cannot sign in yet" with a link for one that does not. So a firm that
 * seated an address could read off the person's row whether it already
 * has an account. CLAUDE.md: the page never says whether an address has
 * an account. Now the line reads only this firm's own facts, the link is
 * the same for everybody, and the door decides at use: sign in as usual,
 * or choose a password.
 *
 * Two people are invited to seats at Brightmoor, both called Sam: one
 * already signs in at another firm with a password of her own, one has no
 * account. Every address stays on a reserved domain; the address check is
 * told these two are reachable.
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
const { GET: readSignIn, POST: makeSignIn } = await import('@/app/api/notifications/sign-in-link/route')
const { POST: enterDoor } = await import('@/app/api/answer/sign-in/[token]/route')
const { readSignInDoorPage } = await import('@/lib/notify/sign-in-link-door')
const { resetPassword } = await import('@/lib/password-door')
const { GET: today } = await import('@/app/api/today/route')

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'
const WITH_ACCOUNT = 'sam.ortiz@harborline-tech.example'
const WITHOUT = 'sam.brandt@northwind-staffing.example'
const KEPT_HASH = 'a-password-hash-she-set-at-another-firm'

const people = { withAccount: '', without: '' }

const get = async (personId: string) => {
  as(BRIGHTMOOR)
  return json(await readSignIn(req('GET', `/api/notifications/sign-in-link?personId=${personId}`)))
}
const post = async (personId: string) => {
  as(BRIGHTMOOR)
  return json(await makeSignIn(req('POST', '/api/notifications/sign-in-link', { personId })))
}
const tokenIn = (link: string) => link.split('/answer/sign-in/')[1]
/** Continue on the door's page: where the door sends whoever pressed it. */
const enter = async (token: string) => {
  delete process.env.DEV_BYPASS_AUTH
  const res = await enterDoor(req('POST', `/api/answer/sign-in/${token}`), { params: Promise.resolve({ token }) })
  return { status: res.status, to: res.headers.get('location') ?? '' }
}
/** The reply with what differs by person and not by account taken out: the id asked about, the address, the link. */
const same = (body: any, email: string) =>
  JSON.parse(JSON.stringify(body).split(email).join('<address>').replace(/\/answer\/sign-in\/[A-Za-z0-9_.-]+/g, '/answer/sign-in/<token>').replace(/"personId":"[^"]+",?/g, ''))

beforeAll(async () => {
  await freshWorld()
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? 'integration-test-secret'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
  reachable.add(WITH_ACCOUNT); reachable.add(WITHOUT)

  // She already signs in at another firm, with a password of her own.
  const her = await prisma.person.create({ data: { primaryEmail: WITH_ACCOUNT, name: 'Sam Ortiz', passwordHash: KEPT_HASH } })
  people.withAccount = her.id

  as(BRIGHTMOOR)
  for (const [email, name] of [[WITH_ACCOUNT, 'Sam Ortiz'], [WITHOUT, 'Sam Brandt']]) {
    const r = await json(await invite(req('POST', '/api/access/invite', { email, name })))
    expect([200, 201], JSON.stringify(r.body)).toContain(r.status)
  }
  people.without = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: WITHOUT }, select: { id: true } })).id
  const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
  for (const id of [people.withAccount, people.without]) {
    expect(await prisma.context.count({ where: { personId: id, companyId: brightmoor.id, type: 'EMPLOYEE', revokedAt: null } })).toBe(1)
  }
}, 300_000)

afterEach(() => {
  senderOn = false
  delete process.env.NOTIFY_FROM_EMAIL
  delete process.env.RESEND_API_KEY
})

describe('a seat never signed in here', () => {
  it('a seat never signed in here reads the same sign-in line whether or not the address has an account elsewhere, in the words and in the route\'s reply', async () => {
    // Before any link: the same line, the same offer.
    const a = await get(people.withAccount)
    const b = await get(people.without)
    expect(a.status, JSON.stringify(a.body)).toBe(200)
    expect(b.status).toBe(a.status)
    expect(same(a.body, WITH_ACCOUNT)).toEqual(same(b.body, WITHOUT))
    expect(a.body.data).toMatchObject({
      state: 'NONE_YET', show: true,
      says: 'Sam files timesheets in Etyme. If Sam cannot sign in yet, give Sam a sign-in link.',
      action: 'Make a sign-in link', link: null,
    })
    expect(JSON.stringify(a.body)).not.toMatch(/already signs in|has an account|cannot sign in to Etyme yet/)

    // Where no email can leave: both are given a link of the same shape, to copy.
    const resets = () => prisma.emailToken.count({ where: { personId: { in: [people.withAccount, people.without] }, purpose: 'RESET' } })
    const resetsBefore = await resets()
    const pa = await post(people.withAccount)
    const pb = await post(people.without)
    expect(pa.status, JSON.stringify(pa.body)).toBe(200)
    expect(pb.status).toBe(pa.status)
    expect(same(pa.body, WITH_ACCOUNT)).toEqual(same(pb.body, WITHOUT))
    expect(pa.body.data.state).toBe('KEPT')
    expect(pa.body.data.link).toMatch(/\/answer\/sign-in\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    // Making a link reads no account and makes no password link for either: the door decides at use.
    expect(await resets()).toBe(resetsBefore)

    // Where email can leave: the same again, and the same letter but for the name and the link.
    process.env.NOTIFY_FROM_EMAIL = 'hello@notify.example'
    process.env.RESEND_API_KEY = 'test-key-never-used'
    senderOn = true
    const ma = await post(people.withAccount)
    const mb = await post(people.without)
    expect(ma.body.data.state).toBe('SENT')
    expect(same(ma.body, WITH_ACCOUNT)).toEqual(same(mb.body, WITHOUT))
    const [la, lb] = [sent.find((m) => m.to === WITH_ACCOUNT)!, sent.find((m) => m.to === WITHOUT)!]
    expect(same(la.body, WITH_ACCOUNT)).toEqual(same(lb.body, WITHOUT))
  })

  it('a firm\'s own new employee can still be given a way in where no email can leave', async () => {
    const made = await post(people.without)
    expect(made.status).toBe(200)
    expect(made.body.data.says).toBe('No email can leave this deployment. Copy this sign-in link and send it to Sam yourself.')
    const token = tokenIn(made.body.data.link)

    // The page reads the same for every address, and opening it decides nothing.
    const resets = () => prisma.emailToken.count({ where: { personId: people.without, purpose: 'RESET' } })
    const before = await resets()
    expect(await readSignInDoorPage(token)).toEqual({ ok: true, firmName: 'Brightmoor Staffing' })
    expect(await resets()).toBe(before)

    // Continue: she has no way in, so she chooses a password, and it is hers.
    const went = await enter(token)
    expect(went.status).toBe(303)
    expect(went.to).toMatch(/\/reset\/[A-Za-z0-9_-]+$/)
    const done = await resetPassword(went.to.split('/reset/')[1], 'Teal-harbor-lantern-9417')
    expect(done.ok, JSON.stringify(done)).toBe(true)
    expect((await prisma.person.findUniqueOrThrow({ where: { id: people.without } })).passwordHash).not.toBeNull()

    // Her row says the link was opened, not what lay behind it.
    const row = await get(people.without)
    expect(row.body.data.state).toBe('OPENED')
    expect(row.body.data.says).toMatch(/^Sam opened the sign-in link on .+\.$/)
  })

  it('the link a firm copies never sets a password on an account somebody already holds: the door sends her to sign in as usual', async () => {
    const made = await post(people.withAccount)
    const token = tokenIn(made.body.data.link)
    expect(await readSignInDoorPage(token)).toEqual({ ok: true, firmName: 'Brightmoor Staffing' })
    const went = await enter(token)
    expect(went.status).toBe(303)
    expect(went.to).toBe(`http://localhost:3000/login?email=${encodeURIComponent(WITH_ACCOUNT)}`)
    expect(await prisma.emailToken.count({ where: { personId: people.withAccount, purpose: 'RESET' } })).toBe(0)
    expect((await prisma.person.findUniqueOrThrow({ where: { id: people.withAccount } })).passwordHash).toBe(KEPT_HASH)
  })

  it('a newer link replaces the old one, and the old one opens a page that says so', async () => {
    const old = tokenIn((await post(people.without)).body.data.link)
    await post(people.without)
    expect(await readSignInDoorPage(old)).toEqual({ ok: false, firmName: 'Brightmoor Staffing', used: false })
    const went = await enter(old)
    expect(went.to).toBe(`http://localhost:3000/answer/sign-in/${encodeURIComponent(old)}`)
    // A token somebody edited names nobody.
    expect(await readSignInDoorPage(`${old}x`)).toEqual({ ok: false, firmName: null, used: false })
  })

  it('once she has signed in here, her row goes quiet and no new link is made', async () => {
    // She opens her seat here: that, and never a sign-in elsewhere, is signing in here.
    const seat = await prisma.context.findFirstOrThrow({ where: { personId: people.withAccount, company: { slug: 'world-brightmoor' }, revokedAt: null }, select: { id: true } })
    as(WITH_ACCOUNT)
    // Her seat has no role yet, so Today is refused to it in a sentence; she has still come in here.
    expect((await today(req('GET', '/api/today', undefined, { 'x-context-id': seat.id }))).status).toBe(403)
    expect(await prisma.accessLog.count({ where: { actorPersonId: people.withAccount, action: 'INVITE_ACCEPTED', actorCompany: { slug: 'world-brightmoor' } } })).toBe(1)
    const row = await get(people.withAccount)
    expect(row.body.data).toMatchObject({ state: 'SIGNS_IN_HERE', show: false })
    const again = await post(people.withAccount)
    expect(again.status).toBe(409)
    expect(again.body.error).toEqual({ code: 'SIGNS_IN_HERE', message: 'Sam already signs in to Etyme, so there is no link to make. Sam can reset a forgotten password from the sign-in page.' })
  })
})

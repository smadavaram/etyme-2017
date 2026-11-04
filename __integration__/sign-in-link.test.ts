import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * A placed person with no account, and the firm that employs them.
 *
 * The founder's retest of production, 2026-11-03: Rajesh Iyer was placed
 * through Brightmoor and could not sign in, so no week could be filed.
 * No email could leave. The firm now reads the sign-in link on the
 * person's own row, from the one door the screen calls.
 */

// The one sender, faked, so "email can leave" is tested without a letter leaving.
const sent: { to: string; title: string; body: string }[] = []
let senderOn = false
vi.mock('@/lib/senders', async (orig) => {
  const real: any = await orig()
  return {
    ...real,
    emailSender: () => (senderOn ? { channel: 'EMAIL', send: async (to: string, title: string, body: string) => { sent.push({ to, title, body }) } } : null),
  }
})

const { GET: read, POST: make } = await import('@/app/api/notifications/sign-in-link/route')
const { resetPassword } = await import('@/lib/password-door')

const D = '@demo.etyme.local'
const OWNER = `world-brightmoor${D}`
const RECRUITER = `world-brightmoor-recruiter${D}`
const PINNACLE = `world-pinnacle${D}`

const get = async (personId: string) => json(await read(req('GET', `/api/notifications/sign-in-link?personId=${personId}`)))
const post = async (personId: string) => json(await make(req('POST', '/api/notifications/sign-in-link', { personId })))

let brightmoor = ''
let placed = { id: '', name: '' }

beforeAll(async () => {
  await freshWorld()
  brightmoor = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' } })).id
  // Somebody Brightmoor pays direct on a pay line: its own placed W2, and
  // on nobody else's books. The seed also pays Lucía Fernández and Tobias
  // Lindqvist from Pinnacle, and a firm that pays a person direct may hand
  // them a sign-in link, so a pick with no order could land on one of them
  // and read Pinnacle as a stranger that is not one (release pass 37).
  const pinnacle = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-pinnacle' } })).id
  const line = await prisma.buyContractCandidate.findFirstOrThrow({
    where: {
      buyContract: { companyId: brightmoor, vendorCompanyId: null },
      person: {
        buyCandidacies: { none: { buyContract: { companyId: pinnacle } } },
        contexts: { none: { companyId: pinnacle, type: 'EMPLOYEE', revokedAt: null } },
        OR: [
          { consultant: null },
          { consultant: { is: { listings: { none: { companyId: pinnacle, revokedAt: null } } } } },
        ],
      },
    },
    orderBy: { id: 'asc' },
    select: { person: { select: { id: true, name: true } } },
  })
  placed = line.person
  // A real address and no account, as on production.
  await prisma.person.update({
    where: { id: placed.id },
    data: { primaryEmail: `placed-${placed.id}@iyer-family-mail.com`, passwordHash: null },
  })
  await prisma.credential.deleteMany({ where: { personId: placed.id } })
  await prisma.context.updateMany({ where: { personId: placed.id }, data: { lastUsedAt: null } })
}, 300_000)

afterEach(() => {
  senderOn = false
  delete process.env.NOTIFY_FROM_EMAIL
  delete process.env.RESEND_API_KEY
})

describe('a placed person with no account can be handed a way in by the firm that employs them', () => {
  it('a firm that employs a placed person with no account can copy the sign-in link from the person\'s row where no email can leave', async () => {
    as(OWNER)
    const first = await get(placed.id)
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body.data.state).toBe('NONE_YET')
    expect(first.body.data.action).toBe('Make a sign-in link')
    expect(first.body.data.link).toBeNull()

    const made = await post(placed.id)
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(made.body.data.state).toBe('KEPT')
    const name = placed.name.split(' ')[0]
    expect(made.body.data.says).toBe(`No email can leave this deployment. Copy this sign-in link and send it to ${name} yourself.`)
    expect(made.body.data.link).toMatch(/\/reset\/[A-Za-z0-9_-]+$/)

    // Read again, the row shows the same link: the notice keeps it.
    const again = await get(placed.id)
    expect(again.body.data.link).toBe(made.body.data.link)

    // Never a second record of the person.
    expect(await prisma.person.count({ where: { name: placed.name } })).toBe(1)
    // The kept notice never reaches anybody's list.
    const notice = await prisma.notification.findFirstOrThrow({ where: { personId: placed.id, companyId: brightmoor, type: 'ACCOUNT_MAIL' }, orderBy: { createdAt: 'desc' } })
    expect(notice.status).toBe('READ')
    expect(notice.deliveryState).toBe('NOT_CONFIGURED')
  })

  it('a new link replaces the old one, and the old one stops working', async () => {
    as(OWNER)
    const before = (await get(placed.id)).body.data.link
    const after = (await post(placed.id)).body.data.link
    expect(after).not.toBe(before)
    const oldToken = before.split('/reset/')[1]
    const r = await resetPassword(oldToken, 'Teal-harbor-lantern-9417')
    expect(r.ok).toBe(false)
  })

  it('the link is drawn only for a seat that may invite, and every read is logged', async () => {
    const logsBefore = await prisma.accessLog.count({ where: { subjectId: placed.id } })

    as(RECRUITER)
    const recruiter = await get(placed.id)
    expect(recruiter.status).toBe(403)
    expect(recruiter.body.error.message).toMatch(/Only the account owner or an admin at Brightmoor/)

    as(PINNACLE)
    const stranger = await get(placed.id)
    expect([403, 404]).toContain(stranger.status)
    expect(stranger.body.data).toBeUndefined()

    as(OWNER)
    const owner = await get(placed.id)
    expect(owner.status).toBe(200)

    const rows = await prisma.accessLog.findMany({
      where: { subjectId: placed.id }, orderBy: { at: 'asc' }, skip: logsBefore,
      select: { allowed: true, reason: true },
    })
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(rows.filter((r) => !r.allowed).length).toBeGreaterThanOrEqual(2)
    expect(rows.some((r) => r.allowed && /sign in/.test(r.reason ?? ''))).toBe(true)
  })

  it('where email can leave, the row says it was sent and offers Send again', async () => {
    process.env.NOTIFY_FROM_EMAIL = 'hello@notify.example'
    process.env.RESEND_API_KEY = 'test-key-never-used'
    senderOn = true
    as(OWNER)
    const before = await get(placed.id)
    expect(before.body.data.action).toBe('Send a sign-in link')
    expect(before.body.data.link).toBeNull()

    const r = await post(placed.id)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.state).toBe('SENT')
    expect(r.body.data.says).toMatch(/was sent a sign-in link on .+, to /)
    expect(r.body.data.action).toBe('Send again')
    expect(r.body.data.link).toBeNull()
    expect(sent.at(-1)?.body).toMatch(/\/reset\/[A-Za-z0-9_-]+/)
    // Sent, the link lives in the mailbox only.
    const notice = await prisma.notification.findFirstOrThrow({ where: { personId: placed.id, companyId: brightmoor, type: 'ACCOUNT_MAIL' }, orderBy: { createdAt: 'desc' } })
    expect(notice.body).not.toMatch(/\/reset\//)
  })

  it('once the person sets a password from the link, the row draws nothing and no new link is made', async () => {
    as(OWNER)
    const link = (await post(placed.id)).body.data.link as string
    const done = await resetPassword(link.split('/reset/')[1], 'Teal-harbor-lantern-9417')
    expect(done.ok, JSON.stringify(done)).toBe(true)
    const row = await get(placed.id)
    expect(row.body.data.show).toBe(false)
    const again = await post(placed.id)
    expect(again.status).toBe(409)
    expect(again.body.error.message).toMatch(/already signs in/)
  })
})

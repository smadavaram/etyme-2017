import { describe, it, expect, beforeAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * Before her yes, the sign-in line never says whether her address has an
 * account (batch five, 2026-11-16).
 *
 * The line drew nothing for an address that already signs in, and "cannot
 * sign in yet" for one that does not. So a firm that asked a stranger's
 * address could read off Bench, or the Candidates drawer, whether that
 * address has an account. CLAUDE.md: the page never says whether an
 * address has an account, and before her yes a firm reads only what it
 * typed.
 *
 * Two people are asked onto Brightmoor's bench: one whose record another
 * firm keeps and who already signs in, one Brightmoor typed in itself with
 * no account. Each is walked twice: at an address no mailbox uses, and at
 * one an email could reach (the address check is told so here, so every
 * address in this file stays on a reserved domain).
 */

const reachable = new Set<string>()
vi.mock('@/lib/password', async (orig) => {
  const real: any = await orig()
  return { ...real, demoEmail: (e: string) => (reachable.has(String(e).toLowerCase()) ? false : real.demoEmail(e)) }
})

const { POST: addConsultant } = await import('@/app/api/consultants/route')
const { GET: readSignIn, POST: makeSignIn } = await import('@/app/api/notifications/sign-in-link/route')

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'
const PINNACLE = 'world-pinnacle@demo.etyme.local'

const HAS_ACCOUNT_EMAIL = 'mara.okafor@harborline-tech.example'
const NO_ACCOUNT_EMAIL = 'ivo.brandt@northwind-staffing.example'

const people = { withAccount: '', without: '' }

const get = async (personId: string) => {
  as(BRIGHTMOOR)
  return json(await readSignIn(req('GET', `/api/notifications/sign-in-link?personId=${personId}`)))
}
const post = async (personId: string) => {
  as(BRIGHTMOOR)
  return json(await makeSignIn(req('POST', '/api/notifications/sign-in-link', { personId })))
}
/** The reply, less the id the firm asked about, which it sent itself. */
const replyBut = (body: any) => {
  if (!body?.data) return body
  const { personId: _id, ...rest } = body.data
  return { data: rest }
}

async function listingAt(personId: string) {
  return prisma.benchListing.findFirstOrThrow({
    where: { consultant: { personId }, company: { slug: 'world-brightmoor' }, revokedAt: null },
    select: { id: true, state: true },
  })
}

beforeAll(async () => {
  await freshWorld()
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? 'integration-test-secret'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'

  // Another firm keeps her record, and she signs in with a password of her own.
  as(PINNACLE)
  const kept = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Mara Okafor', email: HAS_ACCOUNT_EMAIL, skills: ['Python'] })))
  expect([200, 201], JSON.stringify(kept.body)).toContain(kept.status)
  people.withAccount = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: HAS_ACCOUNT_EMAIL }, select: { id: true } })).id
  await prisma.person.update({ where: { id: people.withAccount }, data: { passwordHash: 'a-password-hash-set-by-her' } })

  // Brightmoor asks her at that address, and types in somebody new with no account.
  as(BRIGHTMOOR)
  const asked = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Rosa Lind', email: HAS_ACCOUNT_EMAIL, skills: ['Java'] })))
  expect([200, 201], JSON.stringify(asked.body)).toContain(asked.status)
  const typed = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Ivo Brandt', email: NO_ACCOUNT_EMAIL, skills: ['Java'] })))
  expect([200, 201], JSON.stringify(typed.body)).toContain(typed.status)
  people.without = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: NO_ACCOUNT_EMAIL }, select: { id: true, passwordHash: true } })).id

  expect((await listingAt(people.withAccount)).state).toBe('INVITED')
  expect((await listingAt(people.without)).state).toBe('INVITED')
  const without = await prisma.person.findUniqueOrThrow({ where: { id: people.without }, select: { passwordHash: true, _count: { select: { credentials: true } } } })
  expect(without.passwordHash).toBeNull()
  expect(without._count.credentials).toBe(0)
}, 300_000)

describe('before her yes', () => {
  for (const mailboxes of [false, true]) {
    const where = mailboxes ? 'at an address an email could reach' : 'at an address no mailbox uses'
    it(`before her yes the sign-in line on her row reads the same whether or not her address has an account, in the words and in the route's reply, ${where}`, async () => {
      reachable.clear()
      if (mailboxes) { reachable.add(HAS_ACCOUNT_EMAIL); reachable.add(NO_ACCOUNT_EMAIL) }

      const a = await get(people.withAccount)
      const b = await get(people.without)
      expect(a.status, JSON.stringify(a.body)).toBe(200)
      expect(b.status).toBe(a.status)
      expect(replyBut(b.body)).toEqual(replyBut(a.body))
      // Nothing is drawn, nothing is offered, and no name is in it.
      expect(a.body.data).toMatchObject({ state: 'AWAITING_YES', show: false, says: '', note: null, action: null, link: null })
      expect(JSON.stringify(a.body)).not.toMatch(/Mara|Okafor|Rosa|Ivo|Brandt|signs in/)

      // Pressing for a link anyway is refused in one sentence for both.
      const pa = await post(people.withAccount)
      const pb = await post(people.without)
      expect(pa.status).toBe(409)
      expect(pb.status).toBe(pa.status)
      expect(pb.body).toEqual(pa.body)
      expect(pa.body.error).toEqual({
        code: 'AWAITING_HER_YES',
        message: 'This person has not said yes to your bench invitation, so there is no sign-in link to make. The invitation is their way in.',
      })
      // No link was made for either.
      expect(await prisma.emailToken.count({ where: { personId: { in: [people.withAccount, people.without] }, purpose: 'RESET' } })).toBe(0)
    })
  }

  it('a person who said no reads the same as one who has not answered yet, whether or not her address has an account', async () => {
    reachable.clear()
    reachable.add(HAS_ACCOUNT_EMAIL); reachable.add(NO_ACCOUNT_EMAIL)
    const ids = [people.withAccount, people.without]
    for (const id of ids) await prisma.benchListing.update({ where: { id: (await listingAt(id)).id }, data: { state: 'DECLINED', respondedAt: new Date() } })
    try {
      const [a, b] = [await get(ids[0]), await get(ids[1])]
      expect(replyBut(b.body)).toEqual(replyBut(a.body))
      expect(a.body.data.state).toBe('AWAITING_YES')
      expect((await post(ids[0])).body).toEqual((await post(ids[1])).body)
    } finally {
      for (const id of ids) await prisma.benchListing.update({ where: { id: (await listingAt(id)).id }, data: { state: 'INVITED', respondedAt: null } })
    }
  })

  it('every read and every refused press before her yes is logged as a read of her', async () => {
    const before = await prisma.accessLog.count({ where: { subjectId: people.withAccount } })
    await get(people.withAccount)
    await post(people.withAccount)
    const rows = await prisma.accessLog.findMany({
      where: { subjectId: people.withAccount }, orderBy: { at: 'asc' }, skip: before, select: { allowed: true },
    })
    expect(rows.map((r) => r.allowed)).toEqual([true, false])
  })
})

describe('after her yes', () => {
  it('after her yes the sign-in line reads the same whether or not her address has an account, and offers both the same link', async () => {
    reachable.clear()
    reachable.add(HAS_ACCOUNT_EMAIL); reachable.add(NO_ACCOUNT_EMAIL)
    for (const id of [people.withAccount, people.without]) {
      await prisma.benchListing.update({ where: { id: (await listingAt(id)).id }, data: { state: 'GRANTED', grantedAt: new Date(), respondedAt: new Date() } })
    }

    // Her account is never read for the line (2026-11-16): she already
    // signs in elsewhere, and her row reads as his, who has no account.
    const a = await get(people.withAccount)
    expect(a.status).toBe(200)
    expect(a.body.data).toMatchObject({
      state: 'NONE_YET', show: true,
      says: 'Mara files timesheets in Etyme. If Mara cannot sign in yet, give Mara a sign-in link.',
      action: 'Make a sign-in link',
    })
    const b = await get(people.without)
    expect(b.status).toBe(200)
    expect(b.body.data).toMatchObject({
      state: 'NONE_YET', show: true,
      says: 'Ivo files timesheets in Etyme. If Ivo cannot sign in yet, give Ivo a sign-in link.',
      action: 'Make a sign-in link',
    })
    // Both are given the same kind of link; the door decides at use.
    for (const id of [people.withAccount, people.without]) {
      const p = await post(id)
      expect(p.status, JSON.stringify(p.body)).toBe(200)
      expect(p.body.data.state).toBe('KEPT')
      expect(p.body.data.link).toMatch(/\/answer\/sign-in\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    }
  })
})

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * Bench check-ins lists each message once (fix list, layer five, F3).
 *
 * The tester read one person's check-in twice on Bench check-ins, both
 * marked as not sent. This file walks the doors that write a check-in
 * on the seeded world, where no email can leave and where the sender
 * refuses, and reads the page's own route after each one.
 */

// The one sender, faked: off (no email can leave), or refusing every letter.
let senderRefuses = false
vi.mock('@/lib/senders', async (orig) => {
  const real: any = await orig()
  return {
    ...real,
    emailSender: () => (senderRefuses ? { channel: 'EMAIL', send: async () => { throw new Error('The sender refused it.') } } : null),
  }
})

const { POST: addConsultant } = await import('@/app/api/consultants/route')
const { POST: nudge } = await import('@/app/api/bench/listings/[id]/nudge/route')
const { POST: invite } = await import('@/app/api/consultants/invite/route')
const { GET: readTexts } = await import('@/app/api/texts/route')

const OWNER = 'world-brightmoor@demo.etyme.local'

/** Wait for a send the route does not wait on (`askByEmail` sends and returns). */
async function settled(personId: string, rows: number) {
  for (let i = 0; i < 50; i++) {
    const n = await prisma.textMessage.count({ where: { personId, status: { not: 'PENDING' } } })
    if (n >= rows) return
    await new Promise((r) => setTimeout(r, 50))
  }
}

async function listed(personId: string) {
  as(OWNER)
  const r = await json(await readTexts(req('GET', '/api/texts?limit=100')))
  expect(r.status).toBe(200)
  return (r.body.data.messages as { id: string; person: { id: string }; status: string }[]).filter((m) => m.person.id === personId)
}

async function ask(name: string, email: string) {
  as(OWNER)
  const r = await json(await addConsultant(req('POST', '/api/consultants', { name, email, skills: ['Java'] })))
  expect([200, 201]).toContain(r.status)
  const person = await prisma.person.findFirstOrThrow({ where: { primaryEmail: email }, select: { id: true } })
  const listing = await prisma.benchListing.findFirstOrThrow({
    where: { consultant: { personId: person.id }, company: { slug: 'world-brightmoor' }, revokedAt: null },
    select: { id: true },
  })
  return { personId: person.id, listingId: listing.id }
}

beforeAll(async () => {
  await freshWorld()
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? 'integration-test-secret'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
}, 300_000)

afterEach(() => {
  senderRefuses = false
  delete process.env.NOTIFY_FROM_EMAIL
  delete process.env.RESEND_API_KEY
})

describe('Bench check-ins lists each message once', () => {
  it('one check-in that did not send is listed once, where no email can leave', async () => {
    const { personId } = await ask('Marisol Quintero', 'marisol.quintero@harborline-tech.com')
    await settled(personId, 1)
    expect(await prisma.textMessage.count({ where: { personId } })).toBe(1)
    const rows = await listed(personId)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('NOT_CONFIGURED')
  })

  it('one check-in the sender refused is listed once, marked as not sent', async () => {
    senderRefuses = true
    process.env.NOTIFY_FROM_EMAIL = 'bench@northwind-staffing.com'
    process.env.RESEND_API_KEY = 'test-key'
    const { personId } = await ask('Teodor Vasquez', 'teodor.vasquez@harborline-tech.com')
    await settled(personId, 1)
    expect(await prisma.textMessage.count({ where: { personId } })).toBe(1)
    const rows = await listed(personId)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('FAILED')
  })

  it('asking the same person a second time sends nothing new, so the page still lists one message', async () => {
    const { personId } = await ask('Ines Halvorsen', 'ines.halvorsen@harborline-tech.com')
    await settled(personId, 1)
    as(OWNER)
    const again = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Ines Halvorsen', email: 'ines.halvorsen@harborline-tech.com', skills: ['Java'] })))
    expect(again.status).toBe(409)
    expect(await listed(personId)).toHaveLength(1)
  })

  it('one address written twice in Invite by email sends one check-in, and the page lists it once', async () => {
    const email = 'yusra.lindgren@harborline-tech.com'
    as(OWNER)
    const r = await json(await invite(req('POST', '/api/consultants/invite', { list: `Yusra Lindgren <${email}>\n${email}` })))
    expect(r.status).toBe(200)
    const person = await prisma.person.findFirstOrThrow({ where: { primaryEmail: email }, select: { id: true } })
    await settled(person.id, 1)
    await new Promise((res) => setTimeout(res, 200))
    expect(await prisma.textMessage.count({ where: { personId: person.id } })).toBe(1)
    expect(await listed(person.id)).toHaveLength(1)
  })

  it('pressing Resend is a second try, and only then does the page list two messages', async () => {
    const { personId, listingId } = await ask('Kofi Brennan', 'kofi.brennan@harborline-tech.com')
    await settled(personId, 1)
    expect(await listed(personId)).toHaveLength(1)
    as(OWNER)
    const r = await json(await nudge(req('POST', `/api/bench/listings/${listingId}/nudge`, { copyOnly: false }), { params: Promise.resolve({ id: listingId }) }))
    expect(r.status).toBe(200)
    const rows = await listed(personId)
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((m) => m.id)).size).toBe(2)
    // Each try is its own row, and the log names the second as the Resend.
    const resent = await prisma.automationLog.findFirstOrThrow({ where: { action: 'BENCH_INVITATION_RESENT', payload: { path: ['listingId'], equals: listingId } } })
    expect(rows.map((m) => m.id)).toContain((resent.payload as any).messageId)
  })
})

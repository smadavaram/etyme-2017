import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * Before her yes, a firm reads only what it typed (batch five, the walk of
 * 2026-11-16).
 *
 * The walker asked somebody onto a firm's bench under one name, at an
 * address whose record is another person's own. Bench and Candidates
 * showed the name the firm typed. Bench check-ins showed the name on her
 * own record, with the letter greeting her by her own first name, and the
 * sample-person line on her row read her own first name too. This file
 * walks the same path on the seeded world: another firm keeps her record,
 * then Brightmoor asks her at that address under a name of its own.
 */

const { POST: addConsultant } = await import('@/app/api/consultants/route')
const { GET: readTexts } = await import('@/app/api/texts/route')
const { GET: readSignIn, POST: makeSignIn } = await import('@/app/api/notifications/sign-in-link/route')
const { POST: answerInvite } = await import('@/app/api/bench-invite/[token]/route')
const { signInvite } = await import('@/lib/bench-invite')

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'
const PINNACLE = 'world-pinnacle@demo.etyme.local'

const OWN_NAME = 'Daniel Osei'
const TYPED = 'Theo Marchetti'

/** The address no mailbox uses, so the row is the sample-person line. */
const SAMPLE_EMAIL = 'daniel.osei@harborline-tech.example'

let personId = ''
let listingId = ''

async function settled(id: string, rows: number) {
  for (let i = 0; i < 50; i++) {
    const n = await prisma.textMessage.count({ where: { personId: id, status: { not: 'PENDING' } } })
    if (n >= rows) return
    await new Promise((r) => setTimeout(r, 50))
  }
}

async function rowsFor(id: string) {
  as(BRIGHTMOOR)
  const r = await json(await readTexts(req('GET', '/api/texts?limit=100')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return (r.body.data.messages as { person: { id: string; name: string }; body: string | null; bodyWaits: string | null; direction: string }[])
    .filter((m) => m.person.id === id)
}

const signInRow = async (id: string) => {
  as(BRIGHTMOOR)
  return json(await readSignIn(req('GET', `/api/notifications/sign-in-link?personId=${id}`)))
}

beforeAll(async () => {
  await freshWorld()
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? 'integration-test-secret'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'

  // Another firm keeps her record, under her own name.
  as(PINNACLE)
  const kept = await json(await addConsultant(req('POST', '/api/consultants', { name: OWN_NAME, email: SAMPLE_EMAIL, skills: ['Python'] })))
  expect([200, 201], JSON.stringify(kept.body)).toContain(kept.status)
  personId = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: SAMPLE_EMAIL }, select: { id: true } })).id

  // Brightmoor asks her at that address, under a name it typed.
  as(BRIGHTMOOR)
  const asked = await json(await addConsultant(req('POST', '/api/consultants', { name: TYPED, email: SAMPLE_EMAIL, skills: ['Java'] })))
  expect([200, 201], JSON.stringify(asked.body)).toContain(asked.status)
  const listing = await prisma.benchListing.findFirstOrThrow({
    where: { consultant: { personId }, company: { slug: 'world-brightmoor' }, revokedAt: null },
    select: { id: true, state: true, firmName: true },
  })
  expect(listing.state).toBe('INVITED')
  expect(listing.firmName).toBe(TYPED)
  listingId = listing.id

  // The letter Brightmoor sent her, as Bench check-ins lists it: it
  // greets her by her own first name, which is what she reads.
  await settled(personId, 1)
  const letter = await prisma.textMessage.findFirstOrThrow({
    where: { personId, company: { slug: 'world-brightmoor' }, direction: 'OUT', aboutId: listingId },
    select: { body: true },
  })
  expect(letter.body).toMatch(/\bDaniel\b/)
}, 300_000)

describe('Bench check-ins before her yes', () => {
  it('Bench check-ins names a person asked and not answered by the name the firm typed, never the name on her own record', async () => {
    const rows = await rowsFor(personId)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.person.name).toBe(TYPED)
      expect(JSON.stringify(r)).not.toMatch(/Daniel|Osei/)
    }
  })

  it('the letter that greets her by her own name is not shown to the firm before her yes, and the row says when it will be', async () => {
    const rows = await rowsFor(personId)
    for (const r of rows.filter((m) => m.direction === 'OUT')) {
      expect(r.body).toBeNull()
      expect(r.bodyWaits).toBe(`This letter is shown here once ${TYPED} says yes. Until then you read only what you typed.`)
    }
    // The letter she receives keeps her own name: only she reads it.
    const letter = await prisma.textMessage.findFirstOrThrow({ where: { personId, direction: 'OUT' }, orderBy: { at: 'asc' } })
    expect(letter.body).not.toMatch(new RegExp(TYPED))
  })

  it('renaming her own record does not change the row the firm reads before her yes', async () => {
    await prisma.person.update({ where: { id: personId }, data: { name: 'Daniela Osei-Mensah' } })
    try {
      const rows = await rowsFor(personId)
      for (const r of rows) {
        expect(r.person.name).toBe(TYPED)
        expect(JSON.stringify(r)).not.toMatch(/Daniela|Mensah/)
      }
    } finally {
      await prisma.person.update({ where: { id: personId }, data: { name: OWN_NAME } })
    }
  })
})

describe('the sample-person line before her yes', () => {
  it('the sample-person line names her as the firm typed her before her yes', async () => {
    const row = await signInRow(personId)
    expect(row.status, JSON.stringify(row.body)).toBe(200)
    expect(row.body.data.state).toBe('DEMO')
    expect(row.body.data.says).toBe(`Theo is a sample person. No email can reach ${SAMPLE_EMAIL}, so there is nothing to send.`)
    expect(JSON.stringify(row.body)).not.toMatch(/Daniel|Osei/)

    as(BRIGHTMOOR)
    const pressed = await json(await makeSignIn(req('POST', '/api/notifications/sign-in-link', { personId })))
    expect(pressed.status).toBe(422)
    expect(pressed.body.error.message).toBe(`Theo is a sample person. No email can reach ${SAMPLE_EMAIL}, so no sign-in link can be sent.`)
  })

  it('where the firm typed no name, the sample-person line says This person, never the name on her own record', async () => {
    await prisma.benchListing.update({ where: { id: listingId }, data: { firmName: null } })
    try {
      const row = await signInRow(personId)
      expect(row.status).toBe(200)
      expect(row.body.data.says).toBe(`This person is a sample person. No email can reach ${SAMPLE_EMAIL}, so there is nothing to send.`)
      // Bench check-ins names her by the address the firm asked at.
      const rows = await rowsFor(personId)
      for (const r of rows) expect(r.person.name).toBe(SAMPLE_EMAIL)
    } finally {
      await prisma.benchListing.update({ where: { id: listingId }, data: { firmName: TYPED } })
    }
  })
})

describe('a no is not a yes', () => {
  it('when she says no from the invitation link, the firm\'s notice and its log name her as the firm typed her, never by the name on her own record', async () => {
    const since = new Date()
    const token = signInvite(listingId)
    const r = await json(await answerInvite(req('POST', `/api/bench-invite/${token}`, { said: 'DECLINE' }), { params: Promise.resolve({ token }) }))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    try {
      const log = await prisma.automationLog.findFirstOrThrow({
        where: { action: 'BENCH_CONSENT_DECLINED', payload: { path: ['listingId'], equals: listingId } },
        select: { summary: true },
      })
      const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, name: true } })
      expect(log.summary).toBe(`${TYPED} declined being marketed by ${firm.name}`)
      // The notice is fire-and-forget: wait for it.
      let notices: { title: string }[] = []
      for (let i = 0; i < 50 && notices.length === 0; i++) {
        notices = await prisma.notification.findMany({ where: { companyId: firm.id, type: 'BENCH', entityId: listingId, createdAt: { gte: since } }, select: { title: true } })
        if (notices.length === 0) await new Promise((res) => setTimeout(res, 50))
      }
      expect(notices.length).toBeGreaterThan(0)
      for (const n of notices) {
        expect(n.title).toBe(`${TYPED} said no to your bench invitation`)
        expect(n.title).not.toMatch(/Daniel|Osei/)
      }
      // Still before her yes, Bench check-ins still names her as typed.
      for (const row of await rowsFor(personId)) expect(row.person.name).toBe(TYPED)
    } finally {
      await prisma.benchListing.update({ where: { id: listingId }, data: { state: 'INVITED', revokedAt: null } })
    }
  })
})

describe('after her yes', () => {
  it('once she says yes, Bench check-ins and her row read her own name and the letter as it went', async () => {
    await prisma.benchListing.update({ where: { id: listingId }, data: { state: 'GRANTED', grantedAt: new Date() } })
    const rows = await rowsFor(personId)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.person.name).toBe(OWN_NAME)
      expect(r.bodyWaits).toBeNull()
    }
    expect(rows.some((r) => r.direction === 'OUT' && /\bDaniel\b/.test(r.body ?? ''))).toBe(true)

    const row = await signInRow(personId)
    expect(row.body.data.says).toBe(`Daniel is a sample person. No email can reach ${SAMPLE_EMAIL}, so there is nothing to send.`)
  })
})

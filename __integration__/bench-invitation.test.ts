import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { POST as createListing } from '@/app/api/bench/listings/route'
import { GET as readInviteRoute, POST as answerInvite } from '@/app/api/bench-invite/[token]/route'
import { POST as submit } from '@/app/api/submissions/route'

/**
 * The whole point of the consent work, end to end.
 *
 * A vendor adds somebody to their bench. That is now a question, not a
 * fact: the listing starts INVITED, the consultant gets a signed link,
 * and nobody can be submitted until they answer.
 *
 * The consultant has no seat — no Context row, nothing to sign in with —
 * which is why the link has to carry its own authority. Without it,
 * INVITED would be a deadlock rather than consent.
 */

const VENDOR = 'owner@invite-flow.test'
let listingId = ''
let token = ''
let personId = ''
let companyId = ''
let requirementId = ''

beforeAll(async () => {
  await resetDatabase()
  process.env.NEXTAUTH_SECRET = 'integration-test-secret'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'

  const company = await prisma.company.create({
    data: { name: 'Invite Flow Ltd', slug: 'invite-flow', kind: 'VENDOR', currency: 'USD' },
  })
  companyId = company.id
  const role = await prisma.role.create({
    data: { companyId, name: 'Owner', permissions: ['*'], isDefault: true },
  })
  const owner = await prisma.person.create({ data: { name: 'Owner', primaryEmail: VENDOR } })
  await prisma.context.create({
    data: { personId: owner.id, companyId, roleId: role.id, type: 'EMPLOYEE', grantReason: 'test' },
  })

  const person = await prisma.person.create({
    data: { name: 'Ravi Patel', primaryEmail: 'ravi@invite-flow.test' },
  })
  personId = person.id
  await prisma.consultantProfile.create({
    data: { personId, skills: ['Java'], location: 'Dallas, Texas', visibility: 'VERIFIED' },
  })

  const client = await prisma.company.create({
    data: { name: 'A Client', slug: 'invite-flow-client', kind: 'CLIENT', currency: 'USD' },
  })
  const rq = await prisma.requirement.create({
    data: {
      companyId: client.id, title: 'Java Developer', skills: ['Java'],
      location: 'Dallas, Texas', status: 'OPEN',
    },
  })
  requirementId = rq.id
}, 180_000)

describe('adding somebody to a bench is a question, not a fact', () => {
  it('creates the listing as invited rather than granted', async () => {
    as(VENDOR)
    const profile = await prisma.consultantProfile.findUniqueOrThrow({ where: { personId } })
    const r = await json(
      await createListing(req('POST', '/api/bench/listings', { consultantId: profile.id, tier: 'MARKETING' }))
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()

    const listing = await prisma.benchListing.findFirstOrThrow({ where: { consultantId: profile.id } })
    listingId = listing.id
    expect(listing.state).toBe('INVITED')
    expect(listing.invitedAt).not.toBeNull()
  }, 60_000)

  it('records the invitation as a message, so somebody can see it was sent', async () => {
    const msg = await prisma.textMessage.findFirst({
      where: { personId, aboutType: 'LISTING', aboutId: listingId },
    })
    expect(msg, 'no invitation message was recorded').toBeTruthy()
    expect(msg!.body).toMatch(/ask you before every single submission/i)
    // The row is written before the attempt and settled after, and the
    // send is deliberately not awaited — a slow mail provider must not
    // hold up a listing that was correctly created. So PENDING here is
    // the send still in flight, and NOT_CONFIGURED is the honest status
    // in a test run with no provider. Neither is a failure.
    expect(['SENT', 'PENDING', 'NOT_CONFIGURED']).toContain(msg!.status)
  })

  it('refuses to submit them while the invitation is unanswered', async () => {
    as(VENDOR)
    const r = await json(
      await submit(req('POST', '/api/submissions', {
        requirementId, personIds: [personId], rate: 9000, fromCompanyId: companyId,
      }))
    )
    const item = r.body.data.results[0]
    expect(item.status).toBe('error')
    expect(item.error).toMatch(/have not answered your invitation/i)
  }, 60_000)
})

describe('and the consultant answers without an account', () => {
  it('opens the link and is asked, with nothing changed by opening it', async () => {
    const { signInvite } = await import('@/lib/bench-invite')
    token = signInvite(listingId)

    const r = await json(
      await readInviteRoute(req('GET', `/api/bench-invite/${token}`), {
        params: Promise.resolve({ token }),
      })
    )
    expect(r.body.data.vendor).toBe('Invite Flow Ltd')
    expect(r.body.data.awaiting).toBe(true)

    // A GET must not consent. Mail scanners open every link before the
    // person does.
    const still = await prisma.benchListing.findUniqueOrThrow({ where: { id: listingId } })
    expect(still.state).toBe('INVITED')
  }, 60_000)

  it('accepts, and the grant is stamped when they agreed', async () => {
    const before = await prisma.benchListing.findUniqueOrThrow({ where: { id: listingId } })
    const r = await json(
      await answerInvite(req('POST', `/api/bench-invite/${token}`, { said: 'ACCEPT' }), {
        params: Promise.resolve({ token }),
      })
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()

    const after = await prisma.benchListing.findUniqueOrThrow({ where: { id: listingId } })
    expect(after.state).toBe('GRANTED')
    // The timestamp now means the moment somebody agreed, rather than
    // the moment a vendor typed their name.
    expect(after.grantedAt.getTime()).toBeGreaterThan(before.invitedAt!.getTime() - 1)
    expect(after.respondedAt).not.toBeNull()
  }, 60_000)

  it('cannot be answered twice', async () => {
    const r = await json(
      await answerInvite(req('POST', `/api/bench-invite/${token}`, { said: 'DECLINE' }), {
        params: Promise.resolve({ token }),
      })
    )
    expect(r.status).toBe(409)
  }, 60_000)

  it('and now the submission goes through', async () => {
    as(VENDOR)
    const r = await json(
      await submit(req('POST', '/api/submissions', {
        requirementId, personIds: [personId], rate: 9000, fromCompanyId: companyId,
      }))
    )
    const item = r.body.data.results[0]
    // No error at all is the outcome being asserted. Before they
    // answered, this same call came back with "they have not answered
    // your invitation yet".
    expect(item.error, JSON.stringify(item)).toBeUndefined()
    expect(item.status).not.toBe('error')
  }, 60_000)
})

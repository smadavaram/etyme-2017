import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { POST as listPOST } from '@/app/api/bench/listings/route'
import { POST as nudgePOST } from '@/app/api/bench/listings/[id]/nudge/route'

/**
 * The bench invitation a firm emails names the pay terms it stated on the
 * listing (2026-10-06).
 *
 * A firm may state what it would pay somebody when it lists them, and a
 * yes agrees those terms. The person's page and the link already print
 * them; the email that carries the link did not, so the first thing the
 * person read about a yes said nothing about pay. `inviteText` now takes
 * the terms (lib/bench-invite), and every door that sends an invitation
 * passes what is on the listing it wrote — listing somebody, adding a
 * consultant, sending the invitation again, sharing a person on, and a
 * rolloff sent to the bench.
 *
 * Read off the message row `send` writes before it tries to deliver, so
 * what is asserted is the body that went out.
 */

const D = '@demo.etyme.local'
const OWNER = `world-brightmoor${D}`
const SEED = '@seed.etyme.invalid'

/** The ids of the invitations already written, so a resend is told apart from the first. */
async function before(): Promise<string[]> {
  return (await prisma.textMessage.findMany({ where: { aboutType: 'LISTING' }, select: { id: true } })).map((m) => m.id)
}

async function sentFor(listingId: string, earlier: string[]) {
  // `send` is not awaited by the route, so the row lands a moment later.
  for (let i = 0; i < 50; i++) {
    const m = await prisma.textMessage.findFirst({
      where: { aboutType: 'LISTING', aboutId: listingId, id: { notIn: earlier } },
      orderBy: { at: 'desc' },
    })
    if (m) return m
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`No invitation was written for listing ${listingId}`)
}

let stated = ''
let unstated = ''

beforeAll(async () => {
  await freshWorld()
  process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'https://etyme.test'
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'integration-test-secret'
  const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
  // Two seeded people Brightmoor has never listed, with an address to write to.
  const free = await prisma.consultantProfile.findMany({
    where: {
      person: { primaryEmail: { endsWith: SEED } },
      listings: { none: { companyId: brightmoor.id } },
      ownCompanyId: null,
    },
    select: { id: true },
    take: 2,
    orderBy: { id: 'asc' },
  })
  expect(free).toHaveLength(2)
  ;[stated, unstated] = free.map((f) => f.id)
}, 600_000)

describe('the invitation a firm sends', () => {
  let listingId = ''

  it('the invitation a firm sends names the terms it stated on the listing', async () => {
    const at = await before()
    as(OWNER)
    const r = await json(
      await listPOST(req('POST', '/api/bench/listings', { consultantId: stated, tier: 'MARKETING', termsEngagementType: 'W2', termsPayRateCents: 9_000 }))
    )
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    listingId = r.body.data.listing.id
    const msg = await sentFor(listingId, at)
    expect(msg.body).toContain('If you say yes, you also agree our pay terms: $90/hr, as our employee (W2), when we place you.')
    expect(msg.body).not.toContain('We have not stated any pay terms yet')
  })

  it('sending the invitation again names the same terms', async () => {
    const at = await before()
    as(OWNER)
    const r = await json(await nudgePOST(req('POST', `/api/bench/listings/${listingId}/nudge`, {}), { params: Promise.resolve({ id: listingId }) }))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const msg = await sentFor(listingId, at)
    expect(msg.body).toContain('If you say yes, you also agree our pay terms: $90/hr, as our employee (W2), when we place you.')
  })

  it('an invitation from a listing with no terms says none were stated, so a yes agrees only that the firm may put them forward', async () => {
    const at = await before()
    as(OWNER)
    const r = await json(await listPOST(req('POST', '/api/bench/listings', { consultantId: unstated, tier: 'MARKETING' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const msg = await sentFor(r.body.data.listing.id, at)
    expect(msg.body).toContain('We have not stated any pay terms yet, so saying yes agrees only that we may put you forward.')
    expect(msg.body).not.toContain('you also agree our pay terms')
  })
})

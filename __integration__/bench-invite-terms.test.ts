import { describe, it, expect, beforeAll } from 'vitest'
import { req, json, freshWorld, prisma } from './harness'
import { GET as openLink, POST as answerLink } from '@/app/api/bench-invite/[token]/route'
import { signInvite } from '@/lib/bench-invite'

/**
 * The emailed bench invitation and the pay terms on it, on the seeded
 * world (2026-10-06).
 *
 * Marisol Quintero is asked by Brightmoor Staffing and has not answered.
 * A firm may state terms when it lists somebody; the person's own page
 * showed them beside the yes, and the link she is emailed did not — a
 * yes through the link granted the listing and agreed nothing she had
 * read. The link now prints the terms and its yes agrees them only by
 * sending back what it printed.
 *
 * Terms are written onto her listing directly here: the listing doors
 * that write them are tested in bench-listing-terms. This file is about
 * the link that reads them.
 */

const SEED = '@seed.etyme.invalid'
const withToken = (token: string) => ({ params: Promise.resolve({ token }) })
let marisolListing = ''
let token = ''

const open = async (t: string) => json(await openLink(req('GET', `/api/bench-invite/${t}`), withToken(t)))
const answer = async (t: string, body: unknown) => json(await answerLink(req('POST', `/api/bench-invite/${t}`, body), withToken(t)))

beforeAll(async () => {
  await freshWorld()
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'integration-test-secret'
  const l = await prisma.benchListing.findFirstOrThrow({
    where: { consultant: { person: { name: 'Marisol Quintero' } }, company: { slug: 'world-brightmoor' } },
  })
  marisolListing = l.id
  token = signInvite(l.id)
}, 180_000)

describe('the link Marisol Quintero is emailed, on the seeded world', () => {
  it('with no pay stated, the link says Brightmoor has stated none and that a yes agrees only that it may put her forward', async () => {
    const r = await open(token)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.awaiting).toBe(true)
    expect(r.body.data.terms).toMatchObject({
      seen: null,
      says: 'Brightmoor Staffing has not stated any pay terms yet. Saying yes agrees only that they may put you forward. It agrees no pay.',
    })
  })

  it('once Brightmoor states W2 at $90, the link prints those terms in her own page’s words before she answers', async () => {
    await prisma.benchListing.update({
      where: { id: marisolListing },
      data: { termsEngagementType: 'W2', termsPayRateCents: 9_000, termsStatedAt: new Date() },
    })
    const r = await open(token)
    expect(r.body.data.terms).toMatchObject({
      seen: { engagementType: 'W2', payRateCents: 9_000 },
      says: 'Brightmoor Staffing says it would pay you $90/hr, as its employee (W2), when it places you. Saying yes agrees these terms.',
    })
    // Opening the link agrees nothing: mail scanners open every link.
    const row = await prisma.benchListing.findUniqueOrThrow({ where: { id: marisolListing } })
    expect(row).toMatchObject({ state: 'INVITED', termsAgreedAt: null })
  })

  it('a yes through the link that does not carry the terms is refused in a sentence, and the listing stays unanswered', async () => {
    const r = await answer(token, { said: 'ACCEPT' })
    expect(r.status).toBe(409)
    expect(r.body.error).toMatchObject({ code: 'TERMS_NOT_SEEN', field: 'termsSeen' })
    expect(r.body.error.message).toBe(
      'Brightmoor Staffing says it would pay you $90/hr, as its employee (W2), when it places you. Read these terms, then say yes again — your yes agrees them.'
    )
    const row = await prisma.benchListing.findUniqueOrThrow({ where: { id: marisolListing } })
    expect(row).toMatchObject({ state: 'INVITED', termsAgreedAt: null })
  })

  it('a yes carrying terms the firm has since changed is refused, so nobody agrees a figure they never read', async () => {
    const r = await answer(token, { said: 'ACCEPT', termsSeen: { engagementType: 'W2', payRateCents: 8_000 } })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('TERMS_NOT_SEEN')
    expect((await prisma.benchListing.findUniqueOrThrow({ where: { id: marisolListing } })).state).toBe('INVITED')
  })

  it('her yes carrying the terms the link showed grants the listing and agrees W2 at $90, recorded as her own answer from the link', async () => {
    const seen = (await open(token)).body.data.terms.seen
    const r = await answer(token, { said: 'ACCEPT', termsSeen: seen })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data).toMatchObject({ state: 'GRANTED', termsAgreed: true })
    expect(r.body.data.says).toContain('You agreed: Brightmoor Staffing pays you $90/hr, as its employee (W2), when it places you.')

    const row = await prisma.benchListing.findUniqueOrThrow({ where: { id: marisolListing } })
    expect(row.state).toBe('GRANTED')
    expect(row.termsAgreedAt).toBeInstanceOf(Date)

    const log = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'BENCH_CONSENT_GIVEN', payload: { path: ['listingId'], equals: marisolListing } },
    })
    expect(log.summary).toContain('agreed the pay terms stated with the listing')
    expect(log.payload).toMatchObject({ via: 'LINK', termsAgreed: { engagementType: 'W2', payRateCents: 9_000 } })
    expect(log.reversible).toBe(false)
  })

  it('opening the link again afterwards reads the terms as agreed', async () => {
    const r = await open(token)
    expect(r.body.data.awaiting).toBe(false)
    expect(r.body.data.terms.says).toBe('You agreed: Brightmoor Staffing pays you $90/hr, as its employee (W2), when it places you.')
  })
})

describe('a listing with no terms, and a no', () => {
  it('a yes through the link to a listing with no terms grants it and agrees no pay', async () => {
    const profile = await prisma.consultantProfile.findFirstOrThrow({ where: { person: { primaryEmail: { endsWith: SEED } }, listings: { none: {} } } })
    const nimbus = await prisma.company.findFirstOrThrow({ where: { slug: 'world-nimbus' } })
    const l = await prisma.benchListing.create({
      data: { consultantId: profile.id, companyId: nimbus.id, tier: 'MARKETING', state: 'INVITED', invitedAt: new Date() },
    })
    const t = signInvite(l.id)
    const r = await answer(t, { said: 'ACCEPT', termsSeen: null })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data).toMatchObject({ state: 'GRANTED', termsAgreed: false })
    expect(r.body.data.says).toContain('has not said what it would pay you, so this yes lets it market you and agrees no pay.')
    expect((await prisma.benchListing.findUniqueOrThrow({ where: { id: l.id } })).termsAgreedAt).toBeNull()
  })

  it('saying no to a listing with terms needs no terms sent back and agrees nothing', async () => {
    const profile = await prisma.consultantProfile.findFirstOrThrow({ where: { person: { primaryEmail: { endsWith: SEED } }, listings: { none: {} } } })
    const nimbus = await prisma.company.findFirstOrThrow({ where: { slug: 'world-nimbus' } })
    const l = await prisma.benchListing.create({
      data: {
        consultantId: profile.id, companyId: nimbus.id, tier: 'MARKETING', state: 'INVITED', invitedAt: new Date(),
        termsEngagementType: 'IND_1099', termsPayRateCents: 11_000, termsStatedAt: new Date(),
      },
    })
    const r = await answer(signInvite(l.id), { said: 'DECLINE', note: 'Not looking right now' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const row = await prisma.benchListing.findUniqueOrThrow({ where: { id: l.id } })
    expect(row).toMatchObject({ state: 'DECLINED', termsAgreedAt: null })
  })
})

import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { POST as addConsultant } from '@/app/api/consultants/route'
import { POST as createListing } from '@/app/api/bench/listings/route'
import { POST as respond } from '@/app/api/me/benches/[id]/respond/route'
import { GET as myBenches, PATCH as myBenchesPATCH } from '@/app/api/me/benches/route'
import { PATCH as grant } from '@/app/api/bench/listings/[id]/grant/route'

/**
 * Terms written on a listing, by the listing doors, and agreed by the
 * person's own yes (2026-10-06).
 *
 * A listing is consent to be marketed, never consent to be employed. A
 * firm that already knows how it would engage somebody and what it would
 * pay may say so when it lists them; the person reads it beside the yes,
 * and the yes agrees it. Demand reads the columns (`termsOnRecordFor`);
 * this file is the writer.
 */

const OWNER = 'owner@listing-terms.test'
const ANA = 'ana.ferreira@listing-terms.test'
const BEN = 'ben.okafor@listing-terms.test'
const CHLOE = 'chloe.ng@listing-terms.test'
let ownerId = ''

const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

const listingOf = (email: string) =>
  prisma.benchListing.findFirstOrThrow({ where: { consultant: { person: { primaryEmail: email } } } })

beforeAll(async () => {
  await resetDatabase()
  const company = await prisma.company.create({
    data: { name: 'Larkspur Nursing Partners', slug: 'larkspur', kind: 'VENDOR', currency: 'USD' },
  })
  const role = await prisma.role.create({ data: { companyId: company.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const owner = await prisma.person.create({ data: { name: 'Dana Larkspur', primaryEmail: OWNER } })
  ownerId = owner.id
  await prisma.context.create({ data: { personId: owner.id, companyId: company.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'test' } })
}, 180_000)

describe('a firm states terms when it lists somebody', () => {
  it('a firm may state W2 at $90 when it lists somebody, and the person sees those terms when asked', async () => {
    as(OWNER)
    const r = await json(await addConsultant(req('POST', '/api/consultants', {
      name: 'Ana Ferreira', email: ANA, skills: ['ICU nursing'], location: 'Phoenix, AZ',
      termsEngagementType: 'W2', termsPayRateCents: 9_000,
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.listing).toMatchObject({ termsEngagementType: 'W2', termsPayRateCents: 9_000, termsAgreedAt: null })
    expect(r.body.data.message).toContain('Larkspur Nursing Partners employs Ana Ferreira at $90/hr.')

    const row = await listingOf(ANA)
    expect(row).toMatchObject({ termsEngagementType: 'W2', termsPayRateCents: 9_000, termsStatedById: ownerId, termsAgreedAt: null })
    expect(row.termsStatedAt).toBeInstanceOf(Date)

    // Ana opens her own page: the ask, with the terms beside it.
    as(ANA)
    const page = await json(await myBenches(req('GET', '/api/me/benches')))
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    const asked = page.body.data.invited.find((i: any) => i.listingId === row.id)
    expect(asked.terms).toMatchObject({
      engagementType: 'W2', payRateCents: 9_000, rate: '$90/hr', agreed: false,
      says: 'Larkspur Nursing Partners says it would pay you $90/hr, as its employee (W2), when it places you.',
    })
  })

  it('a $0 rate, a rate with no engagement type, and "employed by another firm" are refused at the door in the terms page’s words, and nobody is added', async () => {
    as(OWNER)
    const zero = await json(await addConsultant(req('POST', '/api/consultants', {
      name: 'Zero Rate', email: 'zero@listing-terms.test', termsEngagementType: 'W2', termsPayRateCents: 0,
    })))
    expect(zero.status).toBe(422)
    expect(zero.body.error).toMatchObject({ code: 'NO_RATE', field: 'termsPayRateCents' })
    expect(zero.body.error.message).toBe('Say what Larkspur Nursing Partners pays Zero Rate. An empty rate is a missing rate, not a free placement.')

    const untyped = await json(await addConsultant(req('POST', '/api/consultants', {
      name: 'No Type', email: 'notype@listing-terms.test', termsPayRateCents: 9_000,
    })))
    expect(untyped.status).toBe(422)
    expect(untyped.body.error.code).toBe('NO_TYPE')

    const other = await json(await addConsultant(req('POST', '/api/consultants', {
      name: 'Other Employer', email: 'other@listing-terms.test', termsEngagementType: 'OTHER_EMPLOYER', termsPayRateCents: 9_000,
    })))
    expect(other.status).toBe(422)
    expect(other.body.error.code).toBe('THROUGH_THE_EMPLOYER')

    const added = await prisma.person.count({ where: { primaryEmail: { in: ['zero@listing-terms.test', 'notype@listing-terms.test', 'other@listing-terms.test'] } } })
    expect(added).toBe(0)
  })
})

describe('the person’s yes', () => {
  it('saying yes to a listing with terms agrees them; saying yes to one without agrees only the marketing', async () => {
    // Ana's listing carries terms; her yes, with the terms her page showed, agrees them.
    const ana = await listingOf(ANA)
    as(ANA)
    const yes = await call(respond, 'POST', `/api/me/benches/${ana.id}/respond`, ana.id, {
      said: 'ACCEPT', termsSeen: { engagementType: 'W2', payRateCents: 9_000 },
    })
    expect(yes.status, JSON.stringify(yes.body)).toBe(200)
    expect(yes.body.data).toMatchObject({ state: 'GRANTED', termsAgreed: true })
    expect(yes.body.data.says).toContain('You agreed: Larkspur Nursing Partners pays you $90/hr, as its employee (W2), when it places you.')
    const agreed = await listingOf(ANA)
    expect(agreed.state).toBe('GRANTED')
    expect(agreed.termsAgreedAt).toBeInstanceOf(Date)
    const log = await prisma.automationLog.findFirstOrThrow({ where: { action: 'BENCH_CONSENT_GIVEN', payload: { path: ['listingId'], equals: ana.id } } })
    expect(log.summary).toContain('agreed the pay terms stated with the listing')

    // Ben is listed with nothing said about pay; his yes agrees the marketing and no pay.
    as(OWNER)
    const ben = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Ben Okafor', email: BEN })))
    expect(ben.status, JSON.stringify(ben.body)).toBe(201)
    const benRow = await listingOf(BEN)
    expect(benRow).toMatchObject({ termsEngagementType: null, termsPayRateCents: null, termsStatedAt: null, termsStatedById: null })
    as(BEN)
    const benYes = await call(respond, 'POST', `/api/me/benches/${benRow.id}/respond`, benRow.id, { said: 'ACCEPT' })
    expect(benYes.status, JSON.stringify(benYes.body)).toBe(200)
    expect(benYes.body.data).toMatchObject({ state: 'GRANTED', termsAgreed: false })
    expect(benYes.body.data.says).toContain('Larkspur Nursing Partners has not said what it would pay you, so this yes lets it market you and agrees no pay.')
    expect((await listingOf(BEN)).termsAgreedAt).toBeNull()
  })

  it('a yes carrying terms other than the ones on the listing is refused, and the listing stays unanswered', async () => {
    as(OWNER)
    const r = await json(await addConsultant(req('POST', '/api/consultants', {
      name: 'Chloe Ng', email: CHLOE, termsEngagementType: 'IND_1099', termsPayRateCents: 11_000,
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const chloe = await listingOf(CHLOE)
    as(CHLOE)
    const stale = await call(respond, 'POST', `/api/me/benches/${chloe.id}/respond`, chloe.id, {
      said: 'ACCEPT', termsSeen: { engagementType: 'IND_1099', payRateCents: 10_000 },
    })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('TERMS_NOT_SEEN')
    expect(stale.body.error.message).toBe(
      'Larkspur Nursing Partners says it would pay you $110/hr, as an independent contractor (1099), when it places you. Read these terms, then say yes again — your yes agrees them.'
    )
    expect(await listingOf(CHLOE)).toMatchObject({ state: 'INVITED', termsAgreedAt: null })

    // A no needs no terms read and agrees nothing.
    const no = await call(respond, 'POST', `/api/me/benches/${chloe.id}/respond`, chloe.id, { said: 'DECLINE' })
    expect(no.status, JSON.stringify(no.body)).toBe(200)
    expect(await listingOf(CHLOE)).toMatchObject({ state: 'DECLINED', termsAgreedAt: null })
  })

  it('terms stated on a listing the person already said yes to without reading them are agreed later from their own page', async () => {
    // Ben said yes when the listing carried no terms. No door states terms
    // on a listing after the yes yet, so the row is set here directly, the
    // way a yes through the emailed link leaves terms unagreed.
    const ben = await listingOf(BEN)
    await prisma.benchListing.update({
      where: { id: ben.id },
      data: { termsEngagementType: 'W2', termsPayRateCents: 8_500, termsStatedAt: new Date(), termsStatedById: ownerId },
    })
    as(BEN)
    const page = await json(await myBenches(req('GET', '/api/me/benches')))
    const bench = page.body.data.benches.find((b: any) => b.listingId === ben.id)
    expect(bench.terms).toMatchObject({ agreed: false, rate: '$85/hr' })

    const wrong = await json(await myBenchesPATCH(req('PATCH', '/api/me/benches', { listingId: ben.id, agreeTerms: { engagementType: 'W2', payRateCents: 9_000 } })))
    expect(wrong.status).toBe(409)
    expect((await listingOf(BEN)).termsAgreedAt).toBeNull()

    const ok = await json(await myBenchesPATCH(req('PATCH', '/api/me/benches', { listingId: ben.id, agreeTerms: { engagementType: 'W2', payRateCents: 8_500 } })))
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    expect(ok.body.data.message).toBe('You agreed: Larkspur Nursing Partners pays you $85/hr, as its employee (W2), when it places you.')
    expect((await listingOf(BEN)).termsAgreedAt).toBeInstanceOf(Date)
    expect(await prisma.automationLog.count({
      where: { action: 'BENCH_CONSENT_GIVEN', reversible: false, payload: { path: ['said'], equals: 'AGREE_TERMS' } },
    })).toBe(1)
  })
})

describe('the other listing door', () => {
  it('asking somebody again after they took a listing back states terms afresh, and the old agreement does not survive', async () => {
    const ana = await listingOf(ANA)
    expect(ana.termsAgreedAt).toBeInstanceOf(Date)
    await prisma.benchListing.update({ where: { id: ana.id }, data: { revokedAt: new Date() } })

    as(OWNER)
    const again = await json(await createListing(req('POST', '/api/bench/listings', {
      consultantId: ana.consultantId, tier: 'MARKETING', termsEngagementType: 'IND_1099', termsPayRateCents: 9_500,
    })))
    expect(again.status, JSON.stringify(again.body)).toBe(201)
    expect(again.body.data.message).toContain('Larkspur Nursing Partners pays Ana Ferreira $95/hr as an independent contractor.')
    expect(await listingOf(ANA)).toMatchObject({
      state: 'INVITED', termsEngagementType: 'IND_1099', termsPayRateCents: 9_500, termsStatedById: ownerId, termsAgreedAt: null,
    })

    // Through the older grant door, a yes that did not carry the terms is refused the same way.
    as(ANA)
    const bare = await call(grant, 'PATCH', `/api/bench/listings/${ana.id}/grant`, ana.id, {})
    expect(bare.status).toBe(409)
    expect(bare.body.error.code).toBe('TERMS_NOT_SEEN')
    const seen = await call(grant, 'PATCH', `/api/bench/listings/${ana.id}/grant`, ana.id, { termsSeen: { engagementType: 'IND_1099', payRateCents: 9_500 } })
    expect(seen.status, JSON.stringify(seen.body)).toBe(200)
    expect((await listingOf(ANA)).termsAgreedAt).toBeInstanceOf(Date)
  })

  it('asking again with nothing said about pay clears the terms the person agreed before they took it back', async () => {
    const ana = await listingOf(ANA)
    await prisma.benchListing.update({ where: { id: ana.id }, data: { revokedAt: new Date() } })
    as(OWNER)
    const again = await json(await createListing(req('POST', '/api/bench/listings', { consultantId: ana.consultantId, tier: 'MARKETING' })))
    expect(again.status, JSON.stringify(again.body)).toBe(201)
    expect(await listingOf(ANA)).toMatchObject({
      termsEngagementType: null, termsPayRateCents: null, termsStatedAt: null, termsStatedById: null, termsAgreedAt: null,
    })
  })
})

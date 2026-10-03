import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { day } from '@/lib/seed-days'

import { POST as addConsultant } from '@/app/api/consultants/route'
import { GET as bench } from '@/app/api/bench/route'
import { POST as askForListing } from '@/app/api/bench/listings/route'
import { PATCH as changeListing } from '@/app/api/bench/listings/[id]/route'
import { PATCH as grantListing } from '@/app/api/bench/listings/[id]/grant/route'
import { POST as share } from '@/app/api/bench/share/route'
import { GET as myBenches, PATCH as myTerms } from '@/app/api/me/benches/route'
import { POST as respond } from '@/app/api/me/benches/[id]/respond/route'
import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as submitCandidates } from '@/app/api/submissions/route'

/**
 * A new consultant reaches a prime, on the seeded world.
 *
 * Break #2 of the founder's lifecycle walk, 2026-09-28: "New consultants
 * land at Retained/Internal and can never surface to primes. Ticking the
 * consultant's consent doesn't change their visibility."
 *
 * Three causes, one symptom. The Consultants page added everybody as
 * Retained; nothing in the product ever wrote a listing's tier again; and
 * the partner's network bench read the tier and ignored the consent. So a
 * person who said yes reached nobody, and a person who had said nothing
 * could reach everybody.
 *
 * CloudEPA sells through Computer Systems (they trade on the Harlow
 * Health chain), and Computer Systems supplies Northbend Athletic.
 */

const D = '@demo.etyme.local'
const SUB = `world-cloudepa${D}`
const PRIME = `world-computer-systems${D}`
const OTHER_BENCH = `world-consultis${D}`
const STRANGER = `world-halcyon${D}`
const NIKE = { programme: `world-nike-programme${D}`, hiring: `world-nike-hiring${D}` }
const LENA = 'lena.ostrova@seed.etyme.invalid'

const co: Record<string, string> = {}
const it_: Record<string, any> = {}

const withId = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

async function networkNames(email: string): Promise<string[]> {
  as(email)
  const r = await json(await bench(req('GET', '/api/bench?scope=network')))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return [...r.body.data.tiers.RETAINED, ...r.body.data.tiers.MARKETING].map((l: any) => l.consultant.person.name)
}

describe('a new consultant reaches the prime their bench vendor sells through', () => {
  beforeAll(async () => {
    await freshWorld()
    for (const slug of ['world-cloudepa', 'world-computer-systems', 'world-nike', 'world-consultis', 'world-vertex-global', 'world-halcyon']) {
      co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug } })).id
    }
  }, 600_000)

  it('a consultant CloudEPA adds is marketed unless it chooses otherwise, and waits on their answer', async () => {
    as(SUB)
    const r = await json(await addConsultant(req('POST', '/api/consultants', {
      name: 'Lena Ostrova', email: LENA,
      skills: ['Supply planning', 'SAP IBP'], location: 'Portland, OR', workAuth: 'GC',
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.listing.tier).toBe('MARKETING')
    expect(r.body.data.listing.status).toBe('INVITED')
    it_.listing = r.body.data.listing.id
    it_.consultantId = r.body.data.consultant.id
    it_.personId = r.body.data.consultant.personId
  })

  it('the prime cannot see somebody who has not yet answered', async () => {
    expect(await networkNames(PRIME)).not.toContain('Lena Ostrova')
  })

  it('her own page asks her, and does not yet count CloudEPA as marketing her', async () => {
    as(LENA)
    const r = await json(await myBenches(req('GET', '/api/me/benches')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.invited.map((b: any) => b.company)).toContain('CloudEPA')
    expect(r.body.data.benches.map((b: any) => b.company)).not.toContain('CloudEPA')
  })

  it('she agrees to be marketed from her own page, and the prime now sees her on its network bench', async () => {
    as(LENA)
    const r = await withId(respond, 'POST', `/api/me/benches/${it_.listing}/respond`, it_.listing, { said: 'ACCEPT' })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.state).toBe('GRANTED')

    expect(await networkNames(PRIME)).toContain('Lena Ostrova')

    as(PRIME)
    const n = await json(await bench(req('GET', '/api/bench?scope=network')))
    const row = n.body.data.tiers.MARKETING.find((l: any) => l.consultant.person.name === 'Lena Ostrova')
    expect(row.reach).toBe('NETWORK')
    expect(row.company.name).toBe('CloudEPA')
  })

  it('a firm that does not trade with CloudEPA still does not see her', async () => {
    expect(await networkNames(STRANGER)).not.toContain('Lena Ostrova')
  })

  it('CloudEPA may keep her to itself, and the prime stops seeing her', async () => {
    as(SUB)
    const r = await withId(changeListing, 'PATCH', `/api/bench/listings/${it_.listing}`, it_.listing, { tier: 'RETAINED' })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.listing.tier).toBe('RETAINED')
    expect(await networkNames(PRIME)).not.toContain('Lena Ostrova')

    // On her trail: who moved her, and what that did.
    const trail = await prisma.accessLog.findFirst({
      where: { subjectId: it_.personId, actorCompanyId: co['world-cloudepa'], action: 'MARKETING_REQUEST' },
      orderBy: { at: 'desc' },
    })
    expect(trail?.reason).toContain('from marketing to retained')
  })

  it('and may show her to its network again, and the prime sees her again', async () => {
    as(SUB)
    const r = await withId(changeListing, 'PATCH', `/api/bench/listings/${it_.listing}`, it_.listing, { tier: 'MARKETING' })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(await networkNames(PRIME)).toContain('Lena Ostrova')
  })

  it('the prime cannot change a listing that lives on CloudEPA’s bench, and is not told it exists', async () => {
    as(PRIME)
    const r = await withId(changeListing, 'PATCH', `/api/bench/listings/${it_.listing}`, it_.listing, { tier: 'RETAINED' })
    expect(r.status).toBe(404)
    const row = await prisma.benchListing.findUniqueOrThrow({ where: { id: it_.listing } })
    expect(row.tier).toBe('MARKETING')
  })

  it('a person has one retained bench: a second firm cannot retain her while CloudEPA does', async () => {
    as(SUB)
    await withId(changeListing, 'PATCH', `/api/bench/listings/${it_.listing}`, it_.listing, { tier: 'RETAINED' })

    as(OTHER_BENCH)
    const asked = await json(await askForListing(req('POST', '/api/bench/listings', { consultantId: it_.consultantId, tier: 'MARKETING' })))
    expect(asked.body?.error, JSON.stringify(asked.body)).toBeUndefined()
    it_.otherListing = asked.body.data.listing.id

    const r = await withId(changeListing, 'PATCH', `/api/bench/listings/${it_.otherListing}`, it_.otherListing, { tier: 'RETAINED' })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('RETAINED_ELSEWHERE')
    expect(r.body.error.message).not.toContain('CloudEPA')

    as(SUB)
    await withId(changeListing, 'PATCH', `/api/bench/listings/${it_.listing}`, it_.listing, { tier: 'MARKETING' })
  })

  it('granting through the listing door records her consent, so the submission gate would accept it', async () => {
    as(LENA)
    const r = await withId(grantListing, 'PATCH', `/api/bench/listings/${it_.otherListing}/grant`, it_.otherListing)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const row = await prisma.benchListing.findUniqueOrThrow({ where: { id: it_.otherListing } })
    expect(row.state).toBe('GRANTED')
    expect(row.respondedAt).not.toBeNull()
  })

  it('Northbend raises a role and sends it to Computer Systems', async () => {
    const cc = await prisma.costCenter.findFirstOrThrow({ where: { companyId: co['world-nike'], code: { startsWith: 'APPS-' } } })
    as(NIKE.hiring)
    const r = await json(await raiseRequisition(req('POST', '/api/requisitions', {
      title: 'Supply planning lead', skills: ['Supply planning', 'SAP IBP'],
      location: 'Beaverton, OR', billMin: 3200, billMax: 4500, months: 6, headcount: 1, hoursPerWeek: 40,
      costCenterId: cc.id, neededBy: day(7).toISOString(),
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.requisition = r.body.data.requisition.id

    as(NIKE.programme)
    const sent = await withId(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, {
      vendors: [{ companyId: co['world-computer-systems'], payMin: 3400, payMax: 4400 }],
    })
    expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()
  })

  it('the prime asks to represent her, she agrees, and the prime submits her to Northbend', async () => {
    as(PRIME)
    const asked = await json(await askForListing(req('POST', '/api/bench/listings', { consultantId: it_.consultantId, tier: 'MARKETING' })))
    expect(asked.body?.error, JSON.stringify(asked.body)).toBeUndefined()
    it_.primeListing = asked.body.data.listing.id

    // Asked is not agreed: the gate still refuses on an unanswered ask.
    const early = await json(await submitCandidates(req('POST', '/api/submissions', {
      requirementId: it_.requisition, personIds: [it_.personId], rate: 3900, fromCompanyId: co['world-computer-systems'],
    })))
    expect(early.body?.data?.results?.[0]?.submissionId ?? null).toBeNull()

    as(LENA)
    const yes = await withId(respond, 'POST', `/api/me/benches/${it_.primeListing}/respond`, it_.primeListing, { said: 'ACCEPT' })
    expect(yes.body?.error, JSON.stringify(yes.body)).toBeUndefined()

    as(PRIME)
    const r = await json(await submitCandidates(req('POST', '/api/submissions', {
      requirementId: it_.requisition, personIds: [it_.personId], rate: 3900, fromCompanyId: co['world-computer-systems'],
    })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const item = r.body.data.results[0]
    expect(item.submissionId, JSON.stringify(item)).toBeTruthy()
    it_.submission = item.submissionId
  })

  it('she takes CloudEPA’s listing back, and the prime no longer sees her on its network bench', async () => {
    as(LENA)
    const r = await json(await myTerms(req('PATCH', '/api/me/benches', { revokeListing: it_.listing })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.message).toContain('no firm it works with sees you')

    expect(await networkNames(PRIME)).not.toContain('Lena Ostrova')

    // The firm is told why she left its bench.
    const logged = await prisma.automationLog.findFirst({
      where: { companyId: co['world-cloudepa'], action: 'BENCH_LISTING_REVOKED' },
    })
    expect(logged).not.toBeNull()
  })

  it('what the prime already submitted on its own consent stays where it is', async () => {
    const s = await prisma.submission.findUniqueOrThrow({ where: { id: it_.submission } })
    expect(s.fromCompanyId).toBe(co['world-computer-systems'])
  })

  it('a listing CloudEPA shares with a partner is an invitation she answers, never born granted', async () => {
    // Somebody seeded on CloudEPA's bench who agreed to be marketed by it.
    const seeded = await prisma.benchListing.findFirstOrThrow({
      where: { companyId: co['world-cloudepa'], state: 'GRANTED', revokedAt: null, tier: 'MARKETING' },
      select: { id: true, consultantId: true },
    })
    as(SUB)
    const r = await json(await share(req('POST', '/api/bench/share', { listingIds: [seeded.id], toCompanyId: co['world-vertex-global'] })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.shared).toBe(1)
    const at = await prisma.benchListing.findUniqueOrThrow({
      where: { consultantId_companyId: { consultantId: seeded.consultantId, companyId: co['world-vertex-global'] } },
    })
    expect(at.state).toBe('INVITED')
  })

  it('CloudEPA cannot pass on somebody who took its listing back', async () => {
    as(SUB)
    const r = await json(await share(req('POST', '/api/bench/share', { listingIds: [it_.listing], toCompanyId: co['world-vertex-global'] })))
    expect(r.body.data.shared).toBe(0)
    const passed = await prisma.benchListing.findUnique({
      where: { consultantId_companyId: { consultantId: it_.consultantId, companyId: co['world-vertex-global'] } },
    })
    expect(passed).toBeNull()
  })
})

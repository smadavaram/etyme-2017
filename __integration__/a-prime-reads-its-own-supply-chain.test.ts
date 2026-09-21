import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as compliance } from '@/app/api/compliance/route'

/**
 * A prime's own compliance page is about the firm it pays, not the firm
 * it bills.
 *
 * ── How it came to be empty ──────────────────────────────────────────
 *
 * `__integration__/full-spine.test.ts` closed a real hole: a supplier
 * calling `/api/compliance?clientCompanyId=<its client>` was served the
 * client's own page — the client's governance rules, and every other
 * supplier at that client standing on them. That is a 403 now and stays
 * one.
 *
 * What it left behind is this. With the named read refused, a prime's
 * only remaining door is `/api/compliance` with nothing on it, which
 * resolves to its own company — and the query underneath asked
 * `endClientFilter`, which means "who works at *this* site". CloudEPA's
 * people work at Harlow Health's site, not at Computer Systems'. So the
 * page a prime is left with answered: nobody, no supplier, no cover.
 *
 * The one thing a prime genuinely needs from a compliance page is
 * whether the sub-vendor it pays is insured and whether that sub's
 * people are cleared — its own exposure, its own counterparty, no NDA
 * anywhere near it. The route now asks for both halves: the placements
 * at this company's own sites, and the placements it pays for.
 *
 * ── The chain this walks ─────────────────────────────────────────────
 *
 *   Harlow Health      the client, pays Computer Systems
 *   Computer Systems   the prime, pays CloudEPA
 *   CloudEPA           the sub, employs the person
 */

const D = '@demo.etyme.local'
const PRIME = `world-computer-systems${D}`
const CLIENT = `world-harlow-health${D}`

const co = { prime: '', sub: '', client: '' }

beforeAll(async () => {
  await resetDatabase()
  await seedWorld()
  co.prime = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-computer-systems' } })).id
  co.sub = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-cloudepa' } })).id
  co.client = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-harlow-health' } })).id

  // The shape the sentences below depend on, asserted rather than
  // assumed: the sub sells to the prime, and the work is at the client.
  const leg = await prisma.sellContract.findFirst({
    where: { companyId: co.sub, clientCompanyId: co.prime },
    select: { endClientCompanyId: true },
  })
  expect(leg, 'the seeded world no longer has CloudEPA selling to Computer Systems').not.toBeNull()
  expect(leg!.endClientCompanyId).toBe(co.client)
}, 240_000)

describe('a prime reads its own supply chain on its own compliance page', () => {
  it('names the sub-vendor it pays, and says whether that firm’s cover is current', async () => {
    as(PRIME)
    const { status, body } = await json(await compliance(req('GET', '/api/compliance')))
    expect(status).toBe(200)

    const firms = body.data.verifications.companies
    const cloudepa = firms.find((f: any) => f.companyId === co.sub)
    expect(cloudepa, 'the firm the prime pays was missing from its own compliance page').toBeTruthy()
    // Its own counterparty, so its own name — nothing is withheld from
    // the firm that signed the contract.
    expect(cloudepa.nameWithheld).toBe(false)
    expect(cloudepa.name).toContain('CloudEPA')
    expect(cloudepa.cover).not.toBeNull()
    expect(['PASS', 'WARN', 'BLOCK']).toContain(cloudepa.cover.outcome)
    expect(cloudepa.cover.says.length).toBeGreaterThan(20)
  })

  it('shows the people that firm has on site, so their paperwork can be read', async () => {
    as(PRIME)
    const { body } = await json(await compliance(req('GET', '/api/compliance')))
    expect(body.data.verifications.persons.length).toBeGreaterThan(0)
  })

  it('still reads nothing of the client it bills — that page is the client’s', async () => {
    // The refusal `full-spine` holds is untouched: this is the other
    // door, and it must not become a way round it. A prime's own page
    // carries its supply chain and not its customer's book.
    as(PRIME)
    const { body } = await json(await compliance(req('GET', '/api/compliance')))
    expect(body.data.client.name).toContain('Computer Systems')
    expect(JSON.stringify(body), 'the client’s name reached the prime’s own page')
      .not.toContain('Harlow Health')
  })

  it('leaves the client’s own page reading the whole chain, masked at the rung below the one it pays', async () => {
    // The half that already worked, pinned so the union above cannot
    // quietly widen what a client reads.
    as(CLIENT)
    const { status, body } = await json(await compliance(req('GET', '/api/compliance')))
    expect(status).toBe(200)
    const firms = body.data.verifications.companies
    expect(firms.find((f: any) => f.companyId === co.prime).nameWithheld).toBe(false)
    const sub = firms.find((f: any) => f.companyId === co.sub)
    expect(sub, 'the sub is still counted at the client').toBeTruthy()
    expect(sub.nameWithheld, 'a sub-vendor’s name is the prime’s to keep').toBe(true)
    expect(sub.suppliedThrough).toContain('Computer Systems')
    expect(JSON.stringify(body)).not.toContain('CloudEPA')
  })
})

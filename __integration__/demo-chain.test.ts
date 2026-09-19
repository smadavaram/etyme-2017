import { describe, it, expect, beforeAll } from 'vitest'
import { resetDatabase, prisma } from './harness'
import { seedChain, CHAIN, type Seat } from '@/lib/demo-chain'

/**
 * The demo had three doors and the schema knows five kinds of company,
 * so an MSP and a GSI had no way in at all — and a prime vendor and a
 * bench vendor got the same world despite sitting on opposite sides of
 * the same trade.
 *
 * Each door also seeded a two-party world: a client and its suppliers,
 * or a vendor and its client. The business is five-party. A demo showing
 * two of them is not a small version of the product, it is a different
 * product — the one where nothing is subcontracted.
 */

beforeAll(async () => { await resetDatabase() }, 180_000)

const seats: Seat[] = ['CLIENT', 'MSP', 'GSI', 'PRIME', 'BENCH']

describe('every seat in the chain has a way in', () => {
  it.each(seats)('seats a visitor as the %s', async (seat) => {
    const person = await prisma.person.create({
      data: { name: 'You', primaryEmail: `you-${seat.toLowerCase()}@demo.test` },
    })
    const out = await seedChain({
      personId: person.id, personName: 'You', seat, slug: `demo-${seat.toLowerCase()}`,
    })

    expect(out.seat).toBe(seat)

    // They own a company, and it is the right one.
    const ctx = await prisma.context.findFirstOrThrow({
      where: { personId: person.id },
      include: { company: true },
    })
    expect(ctx.companyId).toBe(out.companyId)
    expect(ctx.company!.kind).toBe(CHAIN.find((f) => f.seat === seat)!.kind)
  }, 120_000)
})

describe('and every seat sees the whole chain, not two parties', () => {
  it('creates all five firms whichever door was used', async () => {
    // A chain with four of its five links missing is the two-party demo
    // again, which is the thing being fixed.
    const companies = await prisma.company.findMany({
      where: { slug: { startsWith: 'demo-msp-' } },
    })
    expect(companies.length).toBe(CHAIN.length)
  })

  it('gives an MSP a real GSI to buy from and a real client to bill', async () => {
    const msp = await prisma.company.findFirstOrThrow({ where: { slug: 'demo-msp-msp' } })
    const links = await prisma.counterparty.findMany({
      where: { companyId: msp.id },
      include: { otherCompany: { select: { kind: true } } },
    })
    const kinds = links.map((l) => `${l.relationship}:${l.otherCompany.kind}`).sort()
    // Buys from the GSI below, bills the client above. Neither existed
    // in the old demo, because the MSP itself did not.
    expect(kinds).toContain('SUPPLIER:GSI')
    expect(kinds).toContain('CLIENT:CLIENT')
  })

  it('puts the consultants on the bench vendor, where a person actually is', async () => {
    // Everybody above them in the chain sees the same person as a line
    // on a bill. That difference is the product.
    const bench = await prisma.company.findFirstOrThrow({ where: { slug: 'demo-client-bench' } })
    const listings = await prisma.benchListing.count({ where: { companyId: bench.id } })
    expect(listings).toBeGreaterThan(0)
  })

  it('leaves the seeded bench granted, so the demo is workable on arrival', async () => {
    // New listings created *during* a demo start INVITED — that is where
    // the consent flow shows itself. The ones seeded with it are
    // already agreed, or the visitor lands on a bench they cannot use.
    const bench = await prisma.company.findFirstOrThrow({ where: { slug: 'demo-client-bench' } })
    const states = await prisma.benchListing.findMany({
      where: { companyId: bench.id }, select: { state: true },
    })
    expect(states.every((s) => s.state === 'GRANTED')).toBe(true)
  })
})

describe('what a demo placement carries', () => {
  it('a demo placement carries its cycles, so the thread\'s timeline is not empty', async () => {
    // The demo chain built its contracts through Prisma, never through
    // the routes that generate cycles, so the eighth station on every
    // demo the founder opened read empty. The seed writes them now.
    const sells = await prisma.sellContract.findMany({
      where: { company: { isDemo: true }, endDate: { not: null } },
      select: { id: true, buyLinks: { select: { buyContractId: true } } },
    })
    expect(sells.length).toBeGreaterThan(0)
    for (const s of sells) {
      expect(await prisma.cycle.count({ where: { sellContractId: s.id } }), `sell ${s.id}`).toBeGreaterThan(0)
      for (const l of s.buyLinks) {
        expect(await prisma.cycle.count({ where: { buyContractId: l.buyContractId } }), `buy ${l.buyContractId}`).toBeGreaterThan(0)
      }
    }
  })
})

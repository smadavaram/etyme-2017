import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as ap } from '@/app/api/ap/route'
import { POST as raiseOrder } from '@/app/api/purchase-orders/route'

/**
 * What the money screens do differently once a firm is here.
 *
 * `a-seat-is-possession` pins the predicate: a seat is possession, and
 * the architect's sweep writes `claimedAt` for every seeded firm that
 * holds one. This is the other half — the three money answers that turn
 * on it, which were all coming out the wrong way while every unit test
 * around them stayed green. The arithmetic was right; the world it ran
 * against was not.
 *
 * Two of the three get quieter and one gets stricter:
 *
 *   · the payment chain stops going blind past a supplier that is here
 *   · accounts payable stops listing that supplier as off the platform
 *   · **a supplier may no longer record a purchase order in the name of
 *     a client that is here** — which is a gate closing, not a sentence
 *     changing, and is the one worth a test of its own
 *
 * That third one is the trap the gate exists for: a commitment in a
 * client's name that nobody at that client made. Before the sweep every
 * seeded client looked like a firm that had never heard of us, so the
 * carve-out swallowed the rule.
 */

const D = '@demo.etyme.local'

const id = { supplier: '', client: '' }

describe('the money screens read who is actually here', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    id.supplier = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-computer-systems' } })).id
    id.client = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' } })).id
  }, 600_000)

  it('does not call the payment chain blind past a supplier that is here', async () => {
    as(`world-computer-systems${D}`)
    const { status, body } = await json(await ap(req('GET', '/api/ap')))
    expect(status).toBe(200)
    const chains: any[] = body.data.chains ?? []
    expect(chains.length, 'no chain to read, so this sentence proves nothing').toBeGreaterThan(0)

    for (const c of chains.filter((x) => x.beyond?.blind)) {
      const firm = await prisma.company.findFirst({
        where: { name: c.beyond.lastPartyName },
        select: { claimedAt: true },
      })
      expect(
        firm?.claimedAt ?? null,
        `${c.beyond.lastPartyName} has somebody seated at it and the chain still calls it blind`
      ).toBeNull()
    }
  })

  it('lists no supplier as off the platform that has somebody seated at it', async () => {
    as(`world-computer-systems${D}`)
    const { body } = await json(await ap(req('GET', '/api/ap')))
    const offPlatform = (body.data.gaps ?? []).find((g: string) => g.includes('not on the platform'))
    if (!offPlatform) return

    const seated = await prisma.company.findMany({
      where: { contexts: { some: {} } },
      select: { name: true },
    })
    for (const firm of seated) {
      expect(offPlatform, `${firm.name} has a seat and is listed as off the platform`).not.toContain(firm.name)
    }
  })

  it('refuses a supplier recording a purchase order in the name of a client that is here', async () => {
    // The gate that the unclaimed world was quietly defeating. A client
    // with a program office of its own raises its own orders; recording
    // one for them puts a commitment in their name that nobody at their
    // firm made.
    as(`world-computer-systems${D}`)
    const { status, body } = await json(
      await raiseOrder(
        req('POST', '/api/purchase-orders', {
          issuedById: id.client,
          issuedToId: id.supplier,
          number: 'SEAT-GATE-1',
          amount: 50_000,
        })
      )
    )
    expect(status).toBe(403)
    expect(body.error.message).toContain('is on Etyme')
    expect(body.error.message).toContain('theirs to raise')
  })

  it('tells that supplier what to do instead, rather than stopping dead', async () => {
    as(`world-computer-systems${D}`)
    const { body } = await json(
      await raiseOrder(
        req('POST', '/api/purchase-orders', {
          issuedById: id.client, issuedToId: id.supplier, number: 'SEAT-GATE-2', amount: 50_000,
        })
      )
    )
    expect(body.error.message).toMatch(/ask their program office or AP desk/i)
  })

  it('still lets a supplier record the order a client that is not here handed it on paper', async () => {
    // The carve-out survives, and it has to: `SellContract.workOrderId`
    // exists for exactly this, and without it the four commercial terms
    // on an order are unreachable for every supplier whose client is
    // not on Etyme.
    const shell = await prisma.company.create({
      data: {
        slug: 'seat-gate-shell', name: 'Harrowgate Components', kind: 'CLIENT',
        currency: 'USD', claimedAt: null, listedById: id.supplier,
      },
    })
    as(`world-computer-systems${D}`)
    const { status, body } = await json(
      await raiseOrder(
        req('POST', '/api/purchase-orders', {
          issuedById: shell.id, issuedToId: id.supplier, number: 'SEAT-GATE-3', amount: 50_000,
        })
      )
    )
    expect(status, JSON.stringify(body)).toBe(201)
  })

  it('records who typed in an order raised on a shell client\'s behalf', async () => {
    // It becomes theirs to see the day they join, so the row has to say
    // it was not theirs to begin with.
    const order = await prisma.workOrder.findFirstOrThrow({
      where: { number: 'SEAT-GATE-3' },
      select: { recordedById: true, issuedToId: true },
    })
    expect(order.recordedById).toBe(id.supplier)
    expect(order.issuedToId).toBe(id.supplier)
  })
})

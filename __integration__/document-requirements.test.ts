import { describe, it, expect, beforeAll } from 'vitest'
import { resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { requirementsFor } from '@/lib/document-requirements'

/**
 * The loop of documents, on the seeded world.
 *
 * "Ensure the loop of documents never cracks between parties."
 * — the founder, 2026-09-21.
 *
 * A demo where every document is on file proves nothing about a loop. So
 * one of these sentences is about the crack: Cavanaugh Glassworks sent
 * Wrenfield Technical a purchase order for one season and nobody ever
 * papered an agreement. The requirement is real, the paper is absent,
 * and the screen can now say so.
 */

describe('what every order asks for on paper', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
  }, 600_000)

  it('every seeded order carries a required set', async () => {
    const orders = await prisma.workOrder.findMany({
      where: { issuedBy: { slug: { startsWith: 'world-' } } },
      select: { id: true, number: true, documentRequirements: { select: { documentTypeKey: true } } },
    })

    expect(orders.length).toBeGreaterThan(10)
    const bare = orders.filter((o) => o.documentRequirements.length === 0)
    expect(
      bare.map((o) => o.number),
      'these orders ask for no paperwork at all, which is never what a buyer means'
    ).toEqual([])

    // Every one of them asks for the supplier's cover and its standing.
    for (const o of orders) {
      const keys = o.documentRequirements.map((r) => r.documentTypeKey)
      expect(keys, o.number).toContain('INSURANCE_GL')
      expect(keys, o.number).toContain('GOOD_STANDING')
    }
  })

  it('a client asks for the document it invented itself, and it reaches the line', async () => {
    // The whole reason the table exists. A furnace floor induction is not
    // a staffing document, no migration created it, and it reaches the
    // line through the client's own order like anything else.
    const cavanaugh = await prisma.company.findFirst({
      where: { slug: 'world-corning' },
      select: { id: true, name: true },
    })
    const order = await prisma.workOrder.findFirst({
      where: { issuedById: cavanaugh!.id },
      select: { id: true, documentRequirements: { select: { documentTypeKey: true, owedBy: true } } },
    })
    const induction = order!.documentRequirements.find((r) => r.documentTypeKey === 'HOT_FLOOR_INDUCTION')
    expect(induction, 'Cavanaugh asks every supplier for its own hot floor induction').toBeTruthy()
    expect(induction!.owedBy).toBe('WORKER')

    const line = await prisma.sellContract.findFirst({
      where: { workOrderId: order!.id },
      select: { id: true },
    })
    const answer = await requirementsFor({ sellContractId: line!.id })
    expect(answer!.items.map((i) => i.key)).toContain('HOT_FLOOR_INDUCTION')
    const onLine = answer!.items.find((i) => i.key === 'HOT_FLOOR_INDUCTION')!
    expect(onLine.from).toBe('ORDER')
    expect(onLine.says).toContain('Cavanaugh Glassworks')
    // The company's own type is named in the company's own words.
    expect(onLine.label).toBe('Hot floor induction')
  })

  it('Cavanaugh’s no-agreement order requires an MSA that is not on file', async () => {
    const wrenfield = await prisma.company.findFirst({ where: { slug: 'world-wrenfield' }, select: { id: true } })
    const order = await prisma.workOrder.findFirst({
      where: { issuedToId: wrenfield!.id },
      select: { id: true, msaId: true, documentRequirements: { select: { documentTypeKey: true, note: true } } },
    })

    expect(order, 'Cavanaugh raised a purchase order to Wrenfield').toBeTruthy()
    // The crack: the order asks for an agreement and there is none.
    expect(order!.msaId).toBeNull()
    const msa = order!.documentRequirements.find((r) => r.documentTypeKey === 'MSA')
    expect(msa, 'the order requires a master service agreement').toBeTruthy()
    expect(msa!.note).toContain('no agreement was ever signed')

    const agreements = await prisma.masterAgreement.count({ where: { vendorId: wrenfield!.id } })
    expect(agreements, 'nobody ever papered one').toBe(0)

    // And the line under it says the same thing, through the one door.
    const line = await prisma.sellContract.findFirst({ where: { workOrderId: order!.id }, select: { id: true } })
    const answer = await requirementsFor({ sellContractId: line!.id })
    const item = answer!.items.find((i) => i.key === 'MSA')!
    expect(item.from).toBe('ORDER')
    expect(item.required).toBe(true)
  })

  it('a line reads its order’s set through one door, and the item somebody waived says who and why', async () => {
    const line = await prisma.sellContract.findFirst({
      where: { clientCompany: { slug: 'world-corning' }, person: { name: 'Aisha Bello' } },
      select: { id: true },
    })
    const answer = await requirementsFor({ sellContractId: line!.id })
    expect(answer).toBeTruthy()
    expect(answer!.side).toBe('SELL')
    expect(answer!.order).toBeTruthy()

    const bgc = answer!.items.find((i) => i.key === 'BACKGROUND_CHECK')!
    expect(bgc.from).toBe('LINE')
    expect(bgc.waived).toBe(true)
    expect(bgc.waivedSays).toContain('Miriam Osei')
    expect(bgc.waivedSays).toContain('runs its own screening')
    expect(bgc.says).toContain('set on this line, over')

    // Everything else on the line still comes from the order above it.
    expect(answer!.items.filter((i) => i.from === 'LINE')).toHaveLength(1)
    expect(answer!.items.filter((i) => i.from === 'ORDER').length).toBeGreaterThan(3)
  })

  it('a buy line reads the paperwork of whoever it pays, and a W2 line names no supplier', async () => {
    const w2 = await prisma.buyContract.findFirst({
      where: { vendorCompanyId: null, contractType: 'W2', company: { slug: { startsWith: 'world-' } } },
      select: { id: true },
    })
    const answer = await requirementsFor({ buyContractId: w2!.id })
    expect(answer!.shape).toBe('W2')
    expect(answer!.items.map((i) => i.key)).toContain('I9_EVERIFY')
    expect(answer!.items.find((i) => i.key === 'I9_EVERIFY')!.owedBy).toBe('WORKER')

    const sub = await prisma.buyContract.findFirst({
      where: { vendorCompanyId: { not: null }, company: { slug: { startsWith: 'world-' } } },
      select: { id: true },
    })
    const below = await requirementsFor({ buyContractId: sub!.id })
    expect(below!.shape).toBe('SUB_VENDOR')
    const cover = below!.items.find((i) => i.key === 'INSURANCE_GL')!
    expect(cover.owedBy).toBe('SUPPLIER')
    // The firm being paid is named, because this line knows who it is.
    expect(cover.owedByName).toBeTruthy()
  })

  it('a second seeding writes no second set', async () => {
    const before = await prisma.documentRequirement.count()
    expect(before).toBeGreaterThan(50)
    await seedWorld()
    const after = await prisma.documentRequirement.count()
    expect(after, 'seeding twice must be a no-op, whichever day it happens on').toBe(before)
  }, 600_000)
})

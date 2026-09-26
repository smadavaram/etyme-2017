import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { POST as extend } from '@/app/api/contracts/[id]/extend/route'

/**
 * Extending a placement, and the months nobody was billed for.
 *
 * The route moved the end date, wrote a log line saying it had extended
 * the placement, and stopped. Its own comment claimed it wrote the
 * billing and pay cycles behind it. Nothing did — and nothing looked,
 * because this route had no integration coverage at all. That is how
 * three months of work came to have no hours due, no pay day and no
 * invoice: the consultant kept working and the system stopped asking
 * anybody for anything.
 *
 * Found by reading the retired Rails engine against the rebuild before
 * the Rails tree was deleted. The legacy version generated over
 * [old end, new end]; this one runs the whole contract again and drops
 * the dates already written, which keeps a fortnightly cycle on its
 * original weeks instead of restarting the count.
 */
describe('a placement that is extended is billed for the months it gains', () => {
  let sellId: string
  let buyId: string
  let supplier: string
  let before: { end: Date; buyEnd: Date | null; cycles: number }

  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    const co = await prisma.company.findFirstOrThrow({ where: { slug: 'world-cloudepa' } })
    supplier = 'world-cloudepa@demo.etyme.local'

    const s = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: co.id, state: 'IN_PROGRESS', endDate: { not: null } },
      include: { buyLinks: true },
    })
    sellId = s.id
    buyId = s.buyLinks[0].buyContractId

    const buy = await prisma.buyContract.findUniqueOrThrow({ where: { id: buyId } })
    before = {
      end: s.endDate!,
      buyEnd: buy.endDate,
      cycles: await prisma.cycle.count({
        where: { OR: [{ sellContractId: sellId }, { buyContractId: buyId }] },
      }),
    }

    as(supplier)
    await json(
      await extend(req('POST', `/api/contracts/${sellId}/extend`, { months: 3 }), {
        params: Promise.resolve({ id: sellId }),
      })
    )
  }, 180_000)

  it('the contract runs three months longer than it did', async () => {
    const after = await prisma.sellContract.findUniqueOrThrow({ where: { id: sellId } })
    const expected = new Date(before.end)
    expected.setMonth(expected.getMonth() + 3)
    expect(after.endDate!.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10))
  })

  it('the contract that pays the consultant ends the same day as the one that bills for them', async () => {
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: sellId } })
    const buy = await prisma.buyContract.findUniqueOrThrow({ where: { id: buyId } })
    expect(buy.endDate).not.toBeNull()
    expect(buy.endDate!.toISOString()).toBe(sell.endDate!.toISOString())
    // And it moved, rather than having matched all along.
    expect(buy.endDate!.getTime()).toBeGreaterThan(before.buyEnd!.getTime())
  })

  it('the added months have their own hours, pay and invoice dates', async () => {
    const added = await prisma.cycle.count({
      where: {
        OR: [{ sellContractId: sellId }, { buyContractId: buyId }],
        dueOn: { gt: before.end },
      },
    })
    expect(added).toBeGreaterThan(0)
  })

  it('the log says how many due dates it wrote, not just that it extended', async () => {
    const line = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'CONTRACT_EXTENDED' },
      orderBy: { at: 'desc' },
    })
    const payload = line.payload as { cyclesAdded?: { sell: number; buy: number } }
    expect(payload.cyclesAdded).toBeDefined()
    expect((payload.cyclesAdded!.sell ?? 0) + (payload.cyclesAdded!.buy ?? 0)).toBeGreaterThan(0)
  })

  it('extending a second time bills the next months and no week twice', async () => {
    const afterFirst = await prisma.cycle.count({
      where: { OR: [{ sellContractId: sellId }, { buyContractId: buyId }] },
    })
    expect(afterFirst).toBeGreaterThan(before.cycles)

    as(supplier)
    await json(
      await extend(req('POST', `/api/contracts/${sellId}/extend`, { months: 3 }), {
        params: Promise.resolve({ id: sellId }),
      })
    )

    const rows = await prisma.cycle.findMany({
      where: { OR: [{ sellContractId: sellId }, { buyContractId: buyId }] },
      select: { kind: true, dueOn: true, sellContractId: true, buyContractId: true },
    })
    expect(rows.length).toBeGreaterThan(afterFirst)

    const seen = new Set(
      rows.map((c) => `${c.sellContractId ?? c.buyContractId}:${c.kind}:${c.dueOn.toISOString()}`)
    )
    expect(seen.size, 'a due date was written twice').toBe(rows.length)
  })

  it('a stranger to the contract cannot extend it', async () => {
    as('world-harlow-health@demo.etyme.local')
    const r = await json(
      await extend(req('POST', `/api/contracts/${sellId}/extend`, { months: 3 }), {
        params: Promise.resolve({ id: sellId }),
      })
    )
    // The client is a party and may; a firm on neither side may not.
    as('world-brightmoor@demo.etyme.local')
    const outsider = await json(
      await extend(req('POST', `/api/contracts/${sellId}/extend`, { months: 3 }), {
        params: Promise.resolve({ id: sellId }),
      })
    )
    expect(outsider.status).toBe(403)
    expect(outsider.body.error.message).toMatch(/not a party/i)
    void r
  })
})

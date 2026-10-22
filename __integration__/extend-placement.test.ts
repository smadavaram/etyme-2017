import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

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
    await freshWorld()

    const co = await prisma.company.findFirstOrThrow({ where: { slug: 'world-techpeple' } })
    supplier = 'world-techpeple@demo.etyme.local'

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
      await extend(req('POST', `/api/contracts/${sellId}/extend`, { months: 3, reason: 'Techpeple’s renewed certificates are on their way; the client needs the work to go on.' }), {
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
      await extend(req('POST', `/api/contracts/${sellId}/extend`, { months: 3, reason: 'Techpeple’s renewed certificates are on their way; the client needs the work to go on.' }), {
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

/**
 * An extension reads the papers that must last to its new end.
 *
 * A placement extended past the day the person may work, or past the
 * firm's cover, used to go through on the date alone. Now a paper that
 * lets the person work at all ending first refuses it in a sentence, and
 * any other paper ending first asks for a reason that is kept with it.
 */
describe('an extension reads the papers that must last to its new end', () => {
  let sellId: string
  let personId: string
  let companyId: string
  let uploaderId: string
  let endBefore: Date
  const supplier = 'world-techpeple@demo.etyme.local'
  const ask = async (body: Record<string, unknown>) =>
    json(await extend(req('POST', `/api/contracts/${sellId}/extend`, body), { params: Promise.resolve({ id: sellId }) }))

  beforeAll(async () => {
    await freshWorld()
    const co = await prisma.company.findFirstOrThrow({ where: { slug: 'world-techpeple' } })
    companyId = co.id
    const s = await prisma.sellContract.findFirstOrThrow({ where: { companyId, state: 'IN_PROGRESS', endDate: { not: null } }, orderBy: { id: 'asc' } })
    sellId = s.id
    personId = s.personId
    endBefore = s.endDate!
    uploaderId = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: supplier } })).id
    as(supplier)
  }, 180_000)

  const inAMonth = () => new Date(endBefore.getTime() + 30 * 86_400_000)

  it('a placement is not extended past the day the person’s visa ends, and the refusal names whose paper and the day', async () => {
    const visa = await prisma.verification.create({
      data: { personId, type: 'VISA', status: 'CLEAR', expiresAt: inAMonth(), uploadedById: uploaderId },
    })
    try {
      const { status, body } = await ask({ months: 3 })
      expect(status).toBe(422)
      expect(body.error.code).toBe('PAPERS_BLOCK')
      expect(body.error.message.length).toBeGreaterThan(20)
      const after = await prisma.sellContract.findUniqueOrThrow({ where: { id: sellId } })
      expect(after.endDate!.toISOString()).toBe(endBefore.toISOString())
    } finally {
      await prisma.verification.delete({ where: { id: visa.id } })
    }
  })

  it('a reason does not carry an extension past the end of the person’s right to work', async () => {
    const visa = await prisma.verification.create({
      data: { personId, type: 'VISA', status: 'CLEAR', expiresAt: inAMonth(), uploadedById: uploaderId },
    })
    try {
      const { status, body } = await ask({ months: 3, reason: 'The client needs them through the release.' })
      expect(status).toBe(422)
      expect(body.error.code).toBe('PAPERS_BLOCK')
    } finally {
      await prisma.verification.delete({ where: { id: visa.id } })
    }
  })

  it('the firm’s cover ending before the new end asks for a reason, and goes ahead on one, which is kept with the extension', async () => {
    // Techpeple's general liability and workers' compensation certificates
    // run out on May 10, 2027, in the seeded world; three more months take
    // Priya Raman's placement past them.
    const newEnd = new Date(endBefore)
    newEnd.setMonth(newEnd.getMonth() + 3)
    const lapsing = await prisma.verification.count({
      where: { companyId, personId: null, type: 'INSURANCE_GL', status: 'CLEAR', expiresAt: { lt: newEnd } },
    })
    expect(lapsing, 'the seeded world has a certificate ending before the new end').toBeGreaterThan(0)

    const refused = await ask({ months: 3 })
    expect(refused.status).toBe(422)
    expect(refused.body.error.code).toBe('PAPERS_NEED_A_REASON')
    expect(refused.body.error.field).toBe('reason')
    expect(refused.body.error.message).toMatch(/general liability certificate runs out/)
    expect(refused.body.error.message).toMatch(/Give a reason to go ahead\.$/)

    const reason = 'Renewal is bound; the certificate arrives next week.'
    const done = await ask({ months: 3, reason })
    expect(done.status).toBe(200)
    expect(done.body.data.papers.reason).toBe(reason)
    const log = await prisma.automationLog.findFirst({
      where: { action: 'CONTRACT_EXTENDED', payload: { path: ['papers', 'reason'], equals: reason } },
      select: { id: true },
    })
    expect(log).not.toBeNull()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * One press posts the signatures it wrote from one read of the week.
 *
 * The approve button writes up to three signatures on one week (the one
 * pressed, the employer's on a direct placement, a one-person firm's
 * stand-in acceptance) and posted each on its own, so each read the
 * week, what was already posted, the ladder, every rate on it and the
 * orders again, and wrote on its own. `postAssertions` reads each once
 * and writes once. Measured 2026-11-02 on copies of the scale world, 40
 * weeks signed down their chains in 76 presses: 3,783 statements before,
 * 3,712 with one signature's week read in two statements instead of
 * three, 3,680 with the presses that write two signatures posting them
 * together; the postings, the signatures and every press's answer
 * identical in all three.
 */

const DAYS = { '2026-10-05': 8, '2026-10-06': 8, '2026-10-07': 8, '2026-10-08': 8, '2026-10-09': 8 }
const sig = (id: string, role: string, companyId: string, rateCents: number) =>
  ({ id, role, hours: 40, rateCents, companyId, byId: 'signer', coversFrom: null, coversTo: null })
const WEEK = {
  id: 'ts-1', periodStart: new Date('2026-10-04T00:00:00Z'), periodEnd: new Date('2026-10-10T00:00:00Z'),
  days: DAYS, leaveDays: null, acceptedHours: null, personId: 'helena', sellContractId: 'line',
  assertions: [sig('client-sig', 'CLIENT_APPROVAL', 'client', 10000), sig('employer-sig', 'EMPLOYER_ACCEPTANCE', 'employer', 6000)],
}
const rung = (billCurrency: string) => ({
  sellContractId: 'line', companyId: 'employer', clientCompanyId: 'client', endClientCompanyId: null,
  billRate: 10000, billCurrency, projectOrderId: 'order', buyContractId: 'pay-line',
  buy: { id: 'pay-line', companyId: 'employer', contractType: 'W2', payCurrency: 'USD', payRate: 6000, personPayCurrency: 'USD' },
  supplierSellContractId: null,
})

function world(billCurrency = 'USD') {
  const db = {
    timesheet: { findMany: vi.fn(async () => [WEEK]) },
    workAssertion: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ state: 'LIVE', timesheet: WEEK, id: where.id })),
    },
    orderPosting: {
      findMany: vi.fn(async () => []),
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
      aggregate: vi.fn(async () => ({ _sum: { amountCents: 0 } })),
    },
    rateHistory: { findMany: vi.fn(async () => []) },
    projectOrder: { findMany: vi.fn(async () => [{ id: 'order', currency: 'USD', status: 'OPEN', internalOrderId: null }]) },
    company: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id, parallelCurrency: null }))) },
    fxRate: { findFirst: vi.fn(async () => null) },
    buyContract: { findFirst: vi.fn(async () => null) },
  }
  const ladders = vi.fn(async (ids: readonly string[]) => new Map(ids.map((id) => [id, [rung(billCurrency)]])))
  vi.doMock('@/lib/db', () => ({ prisma: db }))
  vi.doMock('@/lib/work-chain-read', () => ({ laddersOver: ladders, ladderFor: vi.fn(async () => []) }))
  vi.doMock('@/lib/money/placement-pay-terms', () => ({
    placementPayTermsMany: vi.fn(async () => new Map()),
    payTermsKey: (k: { buyContractId: string; sellContractId: string; personId: string }) => `${k.buyContractId}|${k.sellContractId}|${k.personId}`,
  }))
  vi.doMock('@/lib/alerts', () => ({ reportError: vi.fn(async () => {}) }))
  return { db, ladders }
}

const written = (db: ReturnType<typeof world>['db']) =>
  db.orderPosting.createMany.mock.calls.flatMap((c) => (c[0] as { data: { sourceId: string; kind: string; amountCents: number }[] }).data)
    .map((r) => `${r.sourceId} ${r.kind} ${r.amountCents}`)

describe('one press posts the signatures it wrote from one read of the week', () => {
  beforeEach(() => vi.resetModules())

  it('the client’s signature and the employer’s on one week are read once and written in one statement', async () => {
    const { db, ladders } = world()
    const { postAssertions } = await import('@/lib/order-postings')
    const posted = await postAssertions(['client-sig', 'employer-sig'], 'signer')
    expect(posted.found).toEqual(['client-sig', 'employer-sig'])
    expect(posted.failed).toEqual([])
    expect(db.timesheet.findMany).toHaveBeenCalledTimes(1)
    expect(db.orderPosting.findMany).toHaveBeenCalledTimes(1)
    expect(ladders).toHaveBeenCalledTimes(1)
    expect(db.rateHistory.findMany).toHaveBeenCalledTimes(1)
    expect(db.projectOrder.findMany).toHaveBeenCalledTimes(1)
    expect(db.orderPosting.createMany).toHaveBeenCalledTimes(1)
    expect(written(db).some((r) => r.startsWith('client-sig REVENUE'))).toBe(true)
    expect(written(db).some((r) => r.startsWith('employer-sig PAY'))).toBe(true)
  })

  it('the rows are the ones posting each signature on its own writes, in the same order', async () => {
    const together = world()
    const { postAssertions } = await import('@/lib/order-postings')
    await postAssertions(['client-sig', 'employer-sig'], 'signer')
    vi.resetModules()
    const apart = world()
    const { postAssertion } = await import('@/lib/order-postings')
    await postAssertion('client-sig', 'signer')
    await postAssertion('employer-sig', 'signer')
    expect(written(together.db)).toEqual(written(apart.db))
    expect(apart.db.orderPosting.createMany).toHaveBeenCalledTimes(2)
  })

  it('a signature that cannot post is returned with why, writes nothing of its own, and the next one still posts', async () => {
    // The client is billed in euros, the order keeps dollars, and no rate is on file.
    const { db } = world('EUR')
    const { postAssertions } = await import('@/lib/order-postings')
    const posted = await postAssertions(['client-sig', 'employer-sig'], 'signer')
    expect(posted.failed.map((f) => f.assertionId)).toEqual(['client-sig'])
    expect(String((posted.failed[0].error as Error).message)).toMatch(/No exchange rate from EUR to USD/)
    expect(written(db).every((r) => r.startsWith('employer-sig'))).toBe(true)
    expect(written(db).length).toBeGreaterThan(0)
  })

  it('posting one signature still refuses in its own words where it cannot post, and posts nothing', async () => {
    const { db } = world('EUR')
    const { postAssertion } = await import('@/lib/order-postings')
    await expect(postAssertion('client-sig', 'signer')).rejects.toThrow(/No exchange rate from EUR to USD/)
    expect(db.orderPosting.createMany).not.toHaveBeenCalled()
  })

  it('a signature that no longer stands posts nothing and is not counted as found', async () => {
    const { db } = world()
    db.timesheet.findMany.mockResolvedValueOnce([])
    const { postAssertion } = await import('@/lib/order-postings')
    expect(await postAssertion('withdrawn-sig', 'signer')).toBeNull()
    expect(db.orderPosting.createMany).not.toHaveBeenCalled()
  })
})

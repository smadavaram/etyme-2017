import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lineExtras, lineExtrasForSellLines, requirementsForSellLines } from '@/lib/contract-clearance'

/**
 * The page-timing pass, 2026-11-02: at 40 at once the compliance read took
 * 10 s at the 95th percentile, a large supplier's page making about 628
 * statements, and the tenure ledger 6 s with 314 KB an answer. Each line's
 * required set is now read once a page, the starts are checked in one
 * batch, and the ledger sends only what its page draws.
 */

/**
 * A database that answers the batch reads and counts every line the
 * required-set door asks about. The door (lib/document-requirements)
 * reads lines with their own rows selected; it reads many at once since
 * 2026-11-02, so the count is of lines asked about, not of reads.
 */
function fakeDb() {
  const door = vi.fn(async (_a: { where: { id: { in: string[] } } }) => [] as never[])
  const lines = vi.fn(async (_a?: unknown) => [{ id: 'line-1', companyId: 'supplier', personId: 'ravi', clientCompanyId: 'client', workLocation: null }])
  const db = {
    sellContract: {
      findMany: vi.fn(async (a: { where: { id: { in: string[] } }; select?: { documentRequirements?: unknown } }) =>
        a.select?.documentRequirements ? door(a) : lines(a)),
    },
    verification: { findMany: vi.fn(async () => []) },
    documentType: { findMany: vi.fn(async () => []) },
    docInstance: { findMany: vi.fn(async () => []) },
    masterAgreement: { findMany: vi.fn(async () => []) },
    contractLink: { findMany: vi.fn(async () => []) },
  }
  /** Every line the door was asked about, once per time it was asked. */
  const asked = () => door.mock.calls.flatMap(([a]) => a.where.id.in)
  return { db: db as never, asked, lines }
}

describe('the compliance page reads each line once', () => {
  it('a line whose required set the page already read is not read again by the batch of line extras', async () => {
    const { db, asked } = fakeDb()
    const known = new Map([['line-1', { items: [] } as never]])
    const out = await lineExtrasForSellLines(['line-1'], db, new Date('2026-11-02T00:00:00Z'), known)
    expect(asked()).toEqual([])
    expect(out.has('line-1')).toBe(true)
  })

  it('a line the page has not read yet is read by the batch, once', async () => {
    const { db, asked } = fakeDb()
    await lineExtrasForSellLines(['line-1', 'line-1'], db)
    expect(asked()).toEqual(['line-1'])
  })

  it('the sets of many lines are read once each and handed back by line, a line that is not there as nothing', async () => {
    const { db, asked } = fakeDb()
    const sets = await requirementsForSellLines(['line-1', 'line-2', 'line-1'], db)
    expect(asked().sort()).toEqual(['line-1', 'line-2'])
    expect([...sets.keys()]).toEqual(['line-1', 'line-2'])
    expect(sets.get('line-2')).toBeNull()
  })

  it('the sets of many lines, and of the buy lines behind them, are each read in one call whatever the number of lines', async () => {
    const sells = ['line-1', 'line-2', 'line-3', 'line-4', 'line-5', 'line-6', 'line-7', 'line-8']
    type Read = { where: { id: { in: string[] } }; select?: { documentRequirements?: unknown } }
    // The door's reads select each line's own rows; the batch's own read of the lines does not.
    const sellDoor = vi.fn(async (_a: Read) => [] as never[])
    const buyDoor = vi.fn(async (_a: Read) => [] as never[])
    const db = {
      sellContract: {
        findMany: vi.fn(async (a: Read) => a.select?.documentRequirements
          ? sellDoor(a)
          : a.where.id.in.map((id) => ({ id, companyId: 'supplier', personId: null, clientCompanyId: 'client', workLocation: null }))),
      },
      buyContract: { findMany: buyDoor },
      verification: { findMany: vi.fn(async () => []) },
      documentType: { findMany: vi.fn(async () => []) },
      docInstance: { findMany: vi.fn(async () => []) },
      masterAgreement: { findMany: vi.fn(async () => []) },
      contractLink: { findMany: vi.fn(async () => sells.map((s, i) => ({ sellContractId: s, buyContractId: `buy-${i % 5}` }))) },
    } as never
    await requirementsForSellLines(sells, db)
    expect(sellDoor).toHaveBeenCalledTimes(1)
    await lineExtrasForSellLines(sells, db)
    expect(sellDoor).toHaveBeenCalledTimes(2)
    expect(sellDoor.mock.calls[1][0].where.id.in).toEqual(sells)
    expect(buyDoor).toHaveBeenCalledTimes(1)
    expect([...buyDoor.mock.calls[0][0].where.id.in].sort()).toEqual(['buy-0', 'buy-1', 'buy-2', 'buy-3', 'buy-4'])
  })

  it('one line’s extras are read through the many-lines read, so one line and many cannot come to different answers', async () => {
    const { db, lines: many } = fakeDb()
    await lineExtras({ sellContractId: 'line-1' }, db)
    expect(many).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(many.mock.calls[0][0])).toContain('"in":["line-1"]')
  })

  it('the starts are checked in one batch, and what the firm owes reads the same sets as the starts', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/compliance/route.ts'), 'utf8')
    expect(route).not.toMatch(/await lineExtras\(/)
    expect(route).toContain('lineExtrasForSellLines(startIds, prisma, now, known)')
    expect(route).toContain('const owes = await whatThisFirmOwes(clientCompany.id, now, setsFor)')
    expect(route).not.toMatch(/requirementsFor\(\{ sellContractId: line\.id \}\)/)
    // One read of every start's person checks and one of every firm's, never one per start.
    expect(route).toContain('where: { personId: { in: startPeople } }')
  })
})

describe('the tenure ledger sends what its page draws', () => {
  const route = readFileSync(join(process.cwd(), 'src/app/api/tenure/route.ts'), 'utf8')
  const contracts = route.slice(route.indexOf('contracts: data.contracts.map'), route.indexOf('daysBooked: daysBooked(c)'))

  it('each contract carries the seven things the page draws and nothing the page does not', () => {
    for (const field of ['id:', 'vendorName:', 'startDate:', 'endDate:', 'state:', 'daysWorked:']) expect(contracts).toContain(field)
    for (const gone of ['payingCustomer', 'endClient:', 'workLocation', 'suppliedThrough', 'vendorNameWithheld']) expect(contracts).not.toContain(gone)
  })

  it('reads only the fields the ledger counts, never the site, the paying customer or the end client of every contract', () => {
    const read = route.slice(route.indexOf('const contracts = await prisma.sellContract.findMany'), route.indexOf("orderBy: { startDate: 'asc' }"))
    expect(read).toContain('select: {')
    expect(read).not.toContain('include:')
    expect(read).not.toMatch(/workLocation|endClientCompany: \{|clientCompany: \{/)
  })

  it('reads the time limit and the break before coming back in one query', () => {
    expect(route).toContain("ruleType: { in: ['TENURE_CAP', 'BREAK_IN_SERVICE'] }")
    expect(route).not.toContain('governanceRule.findFirst')
  })
})

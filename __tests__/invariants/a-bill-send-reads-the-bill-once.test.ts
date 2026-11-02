import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A bill's sending reads the bill once (money's forty sends on the
 * founder-scale world, 2026-11-02: p95 15.6 s, and most of it was this
 * file reading the whole bill twice, once to tell the payer's people and
 * once to send the letter, each with a chain read per week, one week after
 * another, about 300 statements a send).
 */

const chains = vi.hoisted(() => ({ calls: [] as string[][], fail: false, other: new Set<string>() }))
vi.mock('@/lib/week-approval', () => ({
  offPlatformRecord: vi.fn(),
  // The architect's one read of who signs many weeks (`weekSignersFor`).
  weekSignersFor: vi.fn(async (ids: readonly string[]) => {
    chains.calls.push([...ids])
    if (chains.fail) throw new Error('chains unreadable')
    return new Map(ids.map((id) => [id, chains.other.has(id) ? 'Talvern Medical' : 'Northbend Athletic']))
  }),
}))

import { writePayerNoticesIn, handedOn, type BillRead } from '@/lib/notify/bill-delivery'

const week = (id: string, line: string, start: string) => ({
  id, periodStart: new Date(`${start}T00:00:00Z`), periodEnd: new Date(`${start}T00:00:00Z`),
  clientApprovedAt: new Date('2026-10-05T00:00:00Z'), clientApprovedById: null, sellContractId: line,
  weekApprovals: [{ approverName: 'Dana Whitfield' }],
})
const lineOn = (t: ReturnType<typeof week>, person: string) => ({
  hours: 40, rateCents: 9000, amountCents: 360000, description: null, personId: person, expenseId: null, milestoneId: null,
  person: { name: person, primaryEmail: `${person.toLowerCase().replace(/ /g, '.')}@example.invalid` },
  timesheet: t,
  sellContract: { companyId: 'brightmoor', clientCompanyId: 'northbend', company: { id: 'brightmoor', name: 'Brightmoor Staffing' }, clientCompany: { id: 'northbend', name: 'Northbend Athletic' } },
})

/** A bill of six weeks on two people's lines, and a transaction that answers what the read asks. */
function fakeTx(status = 'SUBMITTED') {
  const bill = {
    id: 'inv-1', number: 'IN-1042', status, total: 2160000, paid: 0, currency: 'USD',
    dueAt: new Date('2026-12-01T00:00:00Z'), periodStart: new Date('2026-10-01T00:00:00Z'), periodEnd: new Date('2026-10-31T00:00:00Z'), billToId: null,
    remitTo: null,
    engagement: { msa: { vendorId: 'brightmoor', clientId: 'northbend', vendor: { id: 'brightmoor', name: 'Brightmoor Staffing' }, client: { id: 'northbend', name: 'Northbend Athletic' } } },
    workOrder: null,
    invoiceLines: [
      lineOn(week('w1', 'line-helena', '2026-10-04'), 'Helena Marsh'),
      lineOn(week('w2', 'line-helena', '2026-10-11'), 'Helena Marsh'),
      lineOn(week('w3', 'line-helena', '2026-10-18'), 'Helena Marsh'),
      lineOn(week('w4', 'line-omar', '2026-10-04'), 'Omar Haddad'),
      lineOn(week('w5', 'line-omar', '2026-10-11'), 'Omar Haddad'),
      lineOn(week('w6', 'line-omar', '2026-10-18'), 'Omar Haddad'),
    ],
  }
  const created: unknown[] = []
  const tx = {
    invoice: { findUnique: vi.fn(async () => bill) },
    company: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'northbend'
          ? { id: 'northbend', name: 'Northbend Athletic', claimedAt: new Date('2026-09-01T00:00:00Z'), kind: 'CLIENT' }
          : { id: 'brightmoor', name: 'Brightmoor Staffing' }),
    },
    person: { findMany: vi.fn(async () => []) },
    notification: { count: vi.fn(async () => 0), create: vi.fn(async (a: unknown) => { created.push(a); return a }) },
    context: { findMany: vi.fn(async () => [{ personId: 'p-renata', person: { name: 'Renata Kowal', primaryEmail: 'renata@example.invalid' }, role: { name: 'AP Clerk' } }]) },
  }
  return { tx: tx as never, bill, created, reads: () => tx.invoice.findUnique.mock.calls.length }
}

beforeEach(() => { chains.calls.length = 0; chains.fail = false; chains.other.clear() })

describe('a bill’s sending reads the bill once', () => {
  it('telling the payer’s people hands back the bill it read, so the letter after it does not read it again', async () => {
    const f = fakeTx()
    const told = await writePayerNoticesIn(f.tx, { invoiceId: 'inv-1' })
    expect(told.written).toBe(1)
    expect(f.reads()).toBe(1)
    expect(told.read?.bill.id).toBe('inv-1')
    expect(handedOn(told.read, 'inv-1')).toBe(told.read)
  })

  it('who signed a bill’s weeks is read once for the whole bill, one week per person’s line, never once per week', async () => {
    const f = fakeTx()
    const told = await writePayerNoticesIn(f.tx, { invoiceId: 'inv-1' })
    // Six weeks on two lines: one read, of one week from each line, and the client at the top named.
    expect(chains.calls).toHaveLength(1)
    expect([...chains.calls[0]].sort()).toEqual(['w1', 'w4'])
    expect(told.read?.facts.signedBy).toBe('Northbend Athletic')
    expect(told.read?.weeks).toHaveLength(6)
  })

  it('a signer that cannot be read leaves the name out rather than guessing one', async () => {
    chains.fail = true
    const told = await writePayerNoticesIn(fakeTx().tx, { invoiceId: 'inv-1' })
    expect(told.read?.facts.signedBy).toBeNull()
    // The payer is still told: the name is a sentence's, never the sending's.
    expect(told.written).toBe(1)
  })

  it('weeks signed at the top by two different firms leave the signer unnamed rather than naming one of them', async () => {
    chains.other.add('w4')
    const told = await writePayerNoticesIn(fakeTx().tx, { invoiceId: 'inv-1' })
    expect(told.read?.facts.signedBy).toBeNull()
  })

  it('a read handed on stands for the delivery only where it is the same bill and reads as sent; anything else is read again', () => {
    const sent = { bill: { id: 'inv-1', status: 'SUBMITTED' } } as unknown as BillRead
    expect(handedOn(sent, 'inv-1')).toBe(sent)
    expect(handedOn(sent, 'inv-2')).toBeNull()
    // Read before the sending committed: still raised, so the delivery reads it again.
    expect(handedOn({ bill: { id: 'inv-1', status: 'ISSUED' } } as unknown as BillRead, 'inv-1')).toBeNull()
    expect(handedOn(null, 'inv-1')).toBeNull()
    expect(handedOn(undefined, 'inv-1')).toBeNull()
  })

  it('the delivery takes the read it is handed, and money’s callers may hand it on without changing what is sent', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/lib/notify/bill-delivery.ts', 'utf8')
    expect(src).toContain('const w = handedOn(a.read, a.invoiceId) ?? (await readWhole(a.invoiceId))')
    expect(src).toMatch(/read\?: BillRead \| null/)
  })
})

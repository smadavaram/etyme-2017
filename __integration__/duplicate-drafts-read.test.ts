import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as invoiceList } from '@/app/api/invoices/route'
import { duplicateDraftsAt } from '@/lib/money/duplicate-drafts'

/**
 * Two drafts that hold one week, read against the real database.
 *
 * Walk 7, 2026-11-08: `GET /api/invoices?duplicates=drafts` answered 500
 * on every Bills open, because the read selected `Invoice.createdAt`, a
 * column `Invoice` does not have. The unit tests fed the pure function
 * hand-made bills and never ran the select, so the fault passed them and
 * failed on the first real read. This file runs the select on the seeded
 * world, so a column that does not exist fails the build.
 */

const AR = 'world-brightmoor-ar@demo.etyme.local'

let first = ''
let second = ''

describe('two drafts that hold one week, read against the real database', () => {
  beforeAll(async () => {
    await freshWorld()
    const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    // One of Brightmoor's own sell lines with a person on it, and an
    // agreement's engagement to hang a bill on.
    const line = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: brightmoor.id, engagementId: { not: null } },
      select: { id: true, personId: true, engagementId: true },
      orderBy: { startDate: 'asc' },
    })
    const periodStart = new Date('2026-04-05T00:00:00Z')
    const periodEnd = new Date('2026-04-11T00:00:00Z')
    const draft = async (number: string, at: Date) =>
      prisma.invoice.create({
        data: {
          engagementId: line.engagementId!,
          number,
          periodStart,
          periodEnd,
          currency: 'USD',
          total: '100.00',
          dueAt: new Date('2026-05-11T00:00:00Z'),
          status: 'DRAFT',
          invoiceLines: {
            create: [{
              sellContractId: line.id, personId: line.personId, hours: '1.00',
              rateCents: 10_000, amountCents: 10_000, createdAt: at,
            }],
          },
        },
        select: { id: true },
      })
    // The later draft is written first, so the repair cannot be keeping
    // whichever row the database happens to return first.
    second = (await draft('IN-WALK7-LATER', new Date('2026-04-13T10:00:00Z'))).id
    first = (await draft('IN-WALK7-FIRST', new Date('2026-04-12T10:00:00Z'))).id
  }, 600_000)

  it('the duplicate-drafts read runs against the real database without an error', async () => {
    const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    await expect(duplicateDraftsAt(brightmoor.id)).resolves.toBeInstanceOf(Array)
  })

  it('a firm’s accounts receivable opening Bills reads the duplicate drafts, not a server error', async () => {
    as(AR)
    const { status, body } = await json(await invoiceList(req('GET', '/api/invoices?duplicates=drafts')))
    expect(status).toBe(200)
    expect(body.mayWithdraw).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('of two drafts over the same person and days, the one drafted first is kept and the later is withdrawn', async () => {
    as(AR)
    const { body } = await json(await invoiceList(req('GET', '/api/invoices?duplicates=drafts')))
    const group = (body.data as { keep: { id: string }; withdraw: { id: string }[]; says: string }[])
      .find((g) => g.keep.id === first || g.withdraw.some((w) => w.id === first))
    expect(group).toBeDefined()
    expect(group!.keep.id).toBe(first)
    expect(group!.withdraw.map((w) => w.id)).toEqual([second])
    expect(group!.says).toContain('keep the first, IN-WALK7-FIRST')
  })
})

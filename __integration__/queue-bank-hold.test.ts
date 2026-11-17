import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { pinnacleReceiptsAtNorthbend } from './seeded-receipts'
import { GET as readDecisions } from '@/app/api/decisions/route'

/**
 * Walk 7, 2026-11-08, item 6: Pinnacle's PR-2026-0441 passed the
 * three-way check, nobody at Northbend had checked Pinnacle's bank
 * details, and the AP clerk's queue read "waits for you to pay it · Pay"
 * while the payment route refused it. The queue now asks the bank gate
 * the payment write asks, and says money's own sentence about the hold.
 */

const AP = 'world-nike-ap@demo.etyme.local'
const s = { pinnacle: '', receipt: '' }

const read = async () => {
  as(AP)
  const r = await json(await readDecisions(req('GET', '/api/decisions')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data as { decisions: any[]; total: number }
}

beforeAll(async () => {
  await freshWorld()
  // By its facts, never its number (seeded-receipts).
  s.receipt = (await pinnacleReceiptsAtNorthbend()).clean
  const pinnacle = await prisma.company.findFirstOrThrow({ where: { name: 'Pinnacle Resourcing' }, select: { id: true } })
  s.pinnacle = pinnacle.id
}, 240_000)

describe('an invoice receipt held on the supplier’s bank details is held on the queue, never "Pay"', () => {
  let before: { decisions: any[]; total: number }

  it('a clean receipt from a supplier whose bank details are checked is "Pay"', async () => {
    before = await read()
    const rows = before.decisions.filter((d) => d.entityId === s.receipt)
    expect(rows.map((d) => d.type)).toEqual(['INVOICE_RECEIPT_TO_PAY'])
  })

  it('once nobody has checked the supplier’s bank details, the same receipt is one held row that says the bank is not checked', async () => {
    await prisma.remitTo.updateMany({ where: { companyId: s.pinnacle }, data: { verifiedAt: null, verifiedById: null, verifiedByCompanyId: null } })
    await prisma.supplierRequest.updateMany({ where: { OR: [{ supplierCompanyId: s.pinnacle }, { firmCompanyId: s.pinnacle }] }, data: { checklist: [] } })
    const after = await read()
    const rows = after.decisions.filter((d) => d.entityId === s.receipt)
    expect(rows, JSON.stringify(rows)).toHaveLength(1)
    expect(rows[0].type).toBe('INVOICE_RECEIPT_HELD')
    expect(rows[0].title).toBe('Held: bank details not checked — Pinnacle Resourcing')
    expect(rows[0].amount).toBeNull()
  })

  it('the AP clerk, who checks where the client has no Finance seat, is told to check them and the row opens the check on that receipt', async () => {
    const after = await read()
    const [row] = after.decisions.filter((d) => d.entityId === s.receipt)
    expect(row.subtitle).toContain('Bank details not checked. Check them, then pay.')
    expect(row.actionUrl).toBe(`/dashboard/invoices/${s.receipt}#pay`)
  })

  it('the count does not change: the receipt counted as "Pay" is counted once as held', async () => {
    const after = await read()
    expect(after.total).toBe(before.total)
    expect(after.decisions.length).toBe(before.decisions.length)
  })
})

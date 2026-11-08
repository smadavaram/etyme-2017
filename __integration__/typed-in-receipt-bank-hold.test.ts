import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { PATCH as payBill } from '@/app/api/ap/bills/route'
import { GET as receipts } from '@/app/api/ap/receipts/route'

/**
 * A typed-in invoice receipt is held on the supplier's bank, on the seeded
 * world, through the real route.
 *
 * Walk 7, 2026-11-08: Brightmoor's AP & Payroll seat opened Consultis'
 * typed-in receipt INV-IHMDQC with Consultis' bank details unchecked, saw
 * no hold and no "Ask Rosalind Tay", pressed Pay, and $4,160 left. The
 * ordinary invoice receipt held the same payment; this door did not ask.
 */

const PAYROLL = 'world-brightmoor-payroll@demo.etyme.local'
const FINANCE = 'world-brightmoor-finance@demo.etyme.local'

let billId = ''
let consultisId = ''

describe('a typed-in invoice receipt is held on the supplier’s bank until somebody checks it', () => {
  beforeAll(async () => {
    await freshWorld()
    const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    const bill = await prisma.vendorBill.findFirstOrThrow({
      where: { companyId: brightmoor.id, number: 'INV-IHMDQC' },
      select: { id: true, vendorCompanyId: true },
    })
    billId = bill.id
    consultisId = bill.vendorCompanyId
    // Staged as the walk staged it: Consultis' bank details not checked.
    await prisma.remitTo.updateMany({
      where: { companyId: consultisId },
      data: { verifiedAt: null, verifiedById: null, verifiedByCompanyId: null },
    })
    await prisma.supplierRequest.deleteMany({
      where: { companyId: brightmoor.id, OR: [{ supplierCompanyId: consultisId }, { firmCompanyId: consultisId }] },
    })
  }, 600_000)

  it('AP & Payroll cannot pay a typed-in receipt to a firm whose bank details nobody checked, and is told whom to ask', async () => {
    as(PAYROLL)
    const { status, body } = await json(await payBill(req('PATCH', '/api/ap/bills', { id: billId, method: 'ACH', reference: 'ACH-W7' })))
    expect(status).toBe(409)
    expect(body.error.code).toBe('BANK_NOT_CHECKED')
    expect(body.error.message).toMatch(/^Bank details not checked\. Ask .+ to check them, then pay\.$/)
    const after = await prisma.vendorBill.findUniqueOrThrow({ where: { id: billId }, select: { paidCents: true, status: true } })
    expect(after.paidCents).toBe(0)
    expect(await prisma.payment.count({ where: { vendorBillId: billId } })).toBe(0)
  })

  it('the invoice receipts screen draws no Pay on that receipt and says the same sentence', async () => {
    as(PAYROLL)
    const { status, body } = await json(await receipts(req('GET', '/api/ap/receipts')))
    expect(status).toBe(200)
    const row = body.data.receipts.find((r: { id: string }) => r.id === billId)
    expect(row.doors.pay.offered).toBe(false)
    expect(row.doors.pay.says).toMatch(/^Bank details not checked\. Ask .+ to check them, then pay\.$/)
    expect(row.doors.pay.bank.mayCheck).toBe(false)
  })

  it('Finance is offered the check on the receipt, records it there, and AP & Payroll may then pay it', async () => {
    as(FINANCE)
    const shown = await json(await receipts(req('GET', '/api/ap/receipts')))
    const row = shown.body.data.receipts.find((r: { id: string }) => r.id === billId)
    expect(row.doors.pay.bank.mayCheck).toBe(true)
    expect(row.doors.pay.says).toBe('Bank details not checked. Check them, then pay.')

    const checked = await json(await payBill(req('PATCH', '/api/ap/bills', { id: billId, act: 'check-bank' })))
    expect(checked.status).toBe(200)
    const remit = await prisma.remitTo.findFirstOrThrow({ where: { companyId: consultisId, verifiedAt: { not: null } }, select: { verifiedById: true } })
    expect(remit.verifiedById).toBeTruthy()

    as(PAYROLL)
    const paid = await json(await payBill(req('PATCH', '/api/ap/bills', { id: billId, method: 'ACH', reference: 'ACH-W7' })))
    expect(paid.status).toBe(200)
    expect(paid.body.data.bill.status).toBe('PAID')
  })

  it('the person who does not check a bank is refused the check in a sentence', async () => {
    await prisma.remitTo.updateMany({ where: { companyId: consultisId }, data: { verifiedAt: null, verifiedById: null, verifiedByCompanyId: null } })
    as(PAYROLL)
    const { status, body } = await json(await payBill(req('PATCH', '/api/ap/bills', { id: billId, act: 'check-bank' })))
    expect(status).toBe(403)
    expect(typeof body.error.message).toBe('string')
    expect(body.error.message.length).toBeGreaterThan(10)
  })
})

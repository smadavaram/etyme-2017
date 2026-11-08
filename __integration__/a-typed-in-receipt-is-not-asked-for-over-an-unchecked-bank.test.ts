import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as receiptOptions } from '@/app/api/ap/receipts/options/route'
import { POST as recordBill } from '@/app/api/ap/bills/route'
import { GET as paymentRuns } from '@/app/api/ap/payment-runs/route'
import { mayPayKeyedReceipt } from '@/lib/money/keyed-receipt'
import { PERFORMERS } from '@/lib/twin/performers'

/**
 * 2026-11-08, after walk 7. The typed-in receipt's Pay button and payment
 * route read the bank (`keyedPayGateNow`), and `mayPayKeyedReceipt` — the
 * door the twin's approve question and the payment run ask — still answered
 * on the three-way check alone. So the twin could put a yes to the AP desk
 * for a payment that could not happen. Every reader now asks one gate.
 */

const D = '@demo.etyme.local'
const NIKE_AP = `world-nike-ap${D}`
const s: Record<string, any> = {}

const options = async (query = '') =>
  json(await receiptOptions(req('GET', `/api/ap/receipts/options${query}`)))

describe('every reader of "may this typed-in receipt be paid" reads the supplier’s bank', () => {
  beforeAll(async () => {
    await freshWorld()
    s.nike = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-nike' } })).id
    as(NIKE_AP)
    let free: any = null
    for (const sup of (await options()).body.data.suppliers as any[]) {
      for (const l of sup.lines) {
        const read = (await options(`?sellContractId=${l.sellContractId}`)).body.data
        const w = (read.weeks as any[]).find((x) => !x.heldBy && !x.says)
        if (w && !free) { free = w; s.line = l.sellContractId; s.vendor = sup.id }
      }
    }
    expect(free, 'a week Northbend signed that no bill holds yet').toBeTruthy()
    const amountCents = Math.round(free.hoursAccepted * free.rateMinor)
    const r = await json(await recordBill(req('POST', '/api/ap/bills', {
      vendorCompanyId: s.vendor,
      sellContractId: s.line,
      number: 'BANK-HELD-1',
      currency: 'USD',
      total: amountCents / 100,
      dueAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      lines: [{ timesheetId: free.timesheetId, hours: free.hoursAccepted, rateCents: free.rateMinor, amountCents }],
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    s.bill = r.body.data.bill.id
  })

  it('a typed-in receipt that passes the check is payable while the supplier’s bank is checked', async () => {
    const gate = await mayPayKeyedReceipt(s.bill)
    expect(gate?.ok, JSON.stringify(gate)).toBe(true)
  })

  it('the same receipt is held, in the bank’s own sentence, once nobody has checked the supplier’s bank', async () => {
    await prisma.remitTo.updateMany({ where: { companyId: s.vendor }, data: { verifiedAt: null } })
    await prisma.supplierRequest.deleteMany({
      where: { companyId: s.nike, OR: [{ supplierCompanyId: s.vendor }, { firmCompanyId: s.vendor }] },
    })
    const gate = await mayPayKeyedReceipt(s.bill)
    expect(gate?.ok).toBe(false)
    expect(gate && !gate.ok && gate.code).toBe('BANK_NOT_CHECKED')
    expect(gate && !gate.ok && gate.says).toMatch(/bank/i)
  })

  it('the twin is not allowed to ask the AP desk to approve a typed-in receipt whose supplier’s bank nobody checked', async () => {
    const refusal = await PERFORMERS['invoice_receipt.approve'].check!({
      companyId: s.nike, action: 'invoice_receipt.approve',
      entity: { type: 'VendorBill', id: s.bill, partyCompanyIds: [s.nike, s.vendor] },
      authorityPersonId: null, approverPersonId: null, ruleCited: 'test', rationale: 'test', payload: {},
    })
    expect(refusal).toMatch(/bank/i)
  })

  it('an approved typed-in receipt over an unchecked bank is left out of a payment run with the bank’s reason, not the check’s', async () => {
    await prisma.vendorBill.update({ where: { id: s.bill }, data: { status: 'APPROVED' } })
    as(NIKE_AP)
    const r = await json(await paymentRuns(req('GET', '/api/ap/payment-runs?currency=USD')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const excluded = (r.body.data.proposed.excluded as any[]).find((e) => e.billId === s.bill)
    expect(excluded, 'the bank-held receipt is listed as left out').toBeTruthy()
    expect(excluded.says).toMatch(/bank/i)
    expect(excluded.says).not.toMatch(/does not pass the check/)
    expect((r.body.data.proposed.lines as any[]).some((l) => JSON.stringify(l).includes(s.bill))).toBe(false)
  })
})

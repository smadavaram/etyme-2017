import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as receiptOptions } from '@/app/api/ap/receipts/options/route'
import { POST as recordBill } from '@/app/api/ap/bills/route'
import { mayPayKeyedReceipt } from '@/lib/money/keyed-receipt'

/**
 * The last of the class "the screen cannot reach the rule", found by the
 * second screen walk, 2026-11-03: Northbend Athletic's AP clerk was
 * offered "Record an invoice receipt" with a supplier list that was
 * always empty, because the form read the caller's own buy lines and a
 * client holds none. A client pays its supplier's sell line to it — the
 * rung it pays — and that line is now its side of the receipt.
 */

const D = '@demo.etyme.local'
const NIKE_AP = `world-nike-ap${D}`
const CS = `world-computer-systems${D}`

const s: Record<string, any> = {}

const options = async (query = '') =>
  json(await receiptOptions(req('GET', `/api/ap/receipts/options${query}`)))

describe('a client’s AP clerk records a typed-in invoice receipt from a supplier it pays', () => {
  beforeAll(async () => {
    await freshWorld()
    s.nike = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-nike' } })).id
    s.cs = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-computer-systems' } })).id
    s.techpeple = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-techpeple' } })).id
  })

  it('a client’s AP clerk recording a typed-in invoice receipt is offered the suppliers it pays, with the person on each line', async () => {
    as(NIKE_AP)
    const r = await options()
    expect(r.status).toBe(200)
    const suppliers = r.body.data.suppliers as any[]
    expect(suppliers.length).toBeGreaterThan(0)
    const cs = suppliers.find((x) => x.id === s.cs)
    expect(cs, 'Computer Systems bills Northbend for Helena Marsh').toBeTruthy()
    const helena = cs.lines.find((l: any) => l.people.includes('Helena Marsh'))
    expect(helena).toBeTruthy()
    expect(helena.sellContractId).toBeTruthy()
    expect(helena.buyContractId).toBeNull()
    expect(helena.key).toBe(`sell:${helena.sellContractId}`)
    expect(helena.rateMinor).toBeGreaterThan(0)
    s.helenaLine = helena.sellContractId
  })

  it('a firm the caller does not trade with is never offered', async () => {
    as(NIKE_AP)
    const suppliers = (await options()).body.data.suppliers as any[]
    const paysOn = new Set(
      (await prisma.sellContract.findMany({ where: { clientCompanyId: s.nike, state: { not: 'DRAFT' } }, select: { companyId: true } }))
        .map((x) => x.companyId)
    )
    for (const sup of suppliers) expect(paysOn.has(sup.id), sup.name).toBe(true)
    // Techpeple employs Helena below Computer Systems; Northbend pays Computer Systems, never Techpeple.
    expect(suppliers.some((x) => x.id === s.techpeple)).toBe(false)
    // And nobody else's line is opened by naming its id.
    const below = await prisma.sellContract.findFirstOrThrow({ where: { companyId: s.techpeple, clientCompanyId: s.cs } })
    expect((await options(`?sellContractId=${below.id}`)).status).toBe(404)
  })

  it('a firm that pays sub-vendors is offered its own buy lines as before', async () => {
    as(CS)
    const suppliers = (await options()).body.data.suppliers as any[]
    const techpeple = suppliers.find((x) => x.id === s.techpeple)
    expect(techpeple).toBeTruthy()
    expect(techpeple.lines.length).toBeGreaterThan(0)
    for (const l of techpeple.lines) {
      expect(l.buyContractId).toBeTruthy()
      expect(l.sellContractId).toBeNull()
    }
  })

  it('a client records a week it signed, typed in from the supplier’s invoice, and the check reads it back', async () => {
    as(NIKE_AP)
    // Every week Northbend signed on a line no bill holds yet; the seed bills most of them.
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
    const r = await recordBill(req('POST', '/api/ap/bills', {
      vendorCompanyId: s.vendor,
      sellContractId: s.line,
      number: 'CS-TYPED-1',
      currency: 'USD',
      total: amountCents / 100,
      dueAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      lines: [{ timesheetId: free.timesheetId, hours: free.hoursAccepted, rateCents: free.rateMinor, amountCents }],
    }))
    const b = await json(r)
    expect(b.status, JSON.stringify(b.body)).toBe(200)
    expect(b.body.data.bill.status).toBe('RECEIVED')
    // Read back from the record with no buy line on it.
    const gate = await mayPayKeyedReceipt(b.body.data.bill.id)
    expect(gate?.ok, JSON.stringify(gate)).toBe(true)
    // And the same week is never offered again.
    const again = (await options(`?sellContractId=${s.line}`)).body.data
    expect((again.weeks as any[]).find((w) => w.timesheetId === free.timesheetId)?.heldBy).toBe('CS-TYPED-1')
  })
})

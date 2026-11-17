import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase, freshWorld } from './harness'
import { mayPayFirm, bankCheckedBy, bankGate } from '@/lib/setup-gates'
import { payToRow, payToOnBill, payToOnBillFor, payToRowsFor } from '@/lib/money/pay-to'
import { partiesOf } from '@/lib/money/invoice-parties'
import { checkPayeeBank } from '@/lib/money/bank-check-read'

/**
 * The pay doors read each customer's own check (records 86 and 87).
 *
 * Before the switch, one check on a supplier's details let every customer
 * pay it. After it, a check counts only for the customer it names, so the
 * seed writes each check as each paying customer's own. These prove that
 * nothing the seeded world paid stops paying, and that a check naming no
 * customer holds every customer. Made-up firms on reserved domains.
 */

/** The gate as it read before the switch: the row in use carries any check, else the newest walk held the bank item. */
async function gateBeforeTheSwitch(payerId: string, payeeId: string): Promise<boolean> {
  const [payTo, walks] = await Promise.all([
    payToRow(payeeId),
    prisma.supplierRequest.findMany({
      where: { companyId: payerId, OR: [{ supplierCompanyId: payeeId }, { firmCompanyId: payeeId }] },
      select: { checklist: true },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),
  ])
  const states = walks.map((w) => (Array.isArray(w.checklist) ? (w.checklist as any[]).find((i) => i?.key === 'BANK')?.state ?? null : null))
  return bankGate({ payee: 'x', remitOnFile: !!payTo, remitVerified: !!payTo?.verifiedAt, walkBankState: states.find((st) => st != null) ?? null }).ok
}

describe('the seeded world, after the switch', () => {
  const pairs = new Map<string, [payer: string, payee: string]>()

  beforeAll(async () => {
    await freshWorld()
    const invoices = await prisma.invoice.findMany({
      select: {
        engagement: { select: { msa: { select: { vendorId: true, clientId: true } } } },
        workOrder: { select: { issuedById: true, issuedToId: true } },
        invoiceLines: { select: { sellContract: { select: { companyId: true, clientCompanyId: true } } } },
      },
    })
    for (const i of invoices) {
      const p = partiesOf({ agreement: i.engagement.msa, order: i.workOrder, lines: i.invoiceLines.map((l) => l.sellContract).filter((c) => c != null) })
      if (p.client && p.vendor) pairs.set(`${p.client.id}>${p.vendor.id}`, [p.client.id, p.vendor.id])
    }
    const receipts = await prisma.vendorBill.findMany({ select: { companyId: true, vendorCompanyId: true }, distinct: ['companyId', 'vendorCompanyId'] })
    for (const r of receipts) pairs.set(`${r.companyId}>${r.vendorCompanyId}`, [r.companyId, r.vendorCompanyId])
  }, 600_000)

  it('every seeded payment that paid before the switch still pays', async () => {
    const paidBefore = []
    for (const [payer, payee] of pairs.values()) if (await gateBeforeTheSwitch(payer, payee)) paidBefore.push([payer, payee] as const)
    expect(paidBefore.length).toBeGreaterThan(20)
    const stopped: string[] = []
    for (const [payer, payee] of paidBefore) {
      const gate = await mayPayFirm(payer, payee)
      if (!gate.ok) stopped.push(`${payer} > ${payee}: ${gate.says}`)
    }
    expect(stopped).toEqual([])
  })

  it('every seeded bill that printed an account before the switch prints the same account to the customer it bills', async () => {
    const changed: string[] = []
    for (const [payer, payee] of pairs.values()) {
      const before = (await payToOnBill(payee)).row?.id ?? null
      if (!before) continue
      const after = (await payToOnBillFor(payee, payer)).row?.id ?? null
      if (after !== before) changed.push(`${payer} > ${payee}`)
    }
    expect(changed).toEqual([])
  })

  it('every seeded check is the paying customer’s own, and none is written for a firm that does not pay', async () => {
    const [msas, orders, sells, buys] = await Promise.all([
      prisma.masterAgreement.findMany({ select: { clientId: true, vendorId: true } }),
      prisma.workOrder.findMany({ select: { issuedById: true, issuedToId: true } }),
      prisma.sellContract.findMany({ select: { clientCompanyId: true, companyId: true } }),
      prisma.buyContract.findMany({ where: { vendorCompanyId: { not: null } }, select: { companyId: true, vendorCompanyId: true } }),
    ])
    const pays = new Set([
      ...pairs.keys(),
      ...msas.map((m) => `${m.clientId}>${m.vendorId}`),
      ...orders.map((o) => `${o.issuedById}>${o.issuedToId}`),
      ...sells.map((c) => `${c.clientCompanyId}>${c.companyId}`),
      ...buys.map((b) => `${b.companyId}>${b.vendorCompanyId}`),
    ])
    const checks = await prisma.bankCheck.findMany({ select: { payerCompanyId: true, remitTo: { select: { companyId: true } } } })
    expect(checks.length).toBeGreaterThan(0)
    expect(checks.map((c) => `${c.payerCompanyId}>${c.remitTo.companyId}`).filter((k) => !pays.has(k))).toEqual([])
  })
})

describe('a check that names no customer', () => {
  const s: Record<string, string> = {}
  const ON = new Date('2026-01-05T09:00:00Z')

  async function firm(slug: string, kind: 'VENDOR' | 'CLIENT'): Promise<string> {
    return (await prisma.company.create({ data: { name: slug, slug, kind, currency: 'USD', domain: `${slug}.example`, claimedAt: ON }, select: { id: true } })).id
  }
  async function financeSeat(companyId: string, name: string): Promise<string> {
    const role = await prisma.role.create({ data: { companyId, name: 'Finance', permissions: ['payments.record'] }, select: { id: true } })
    const person = await prisma.person.create({ data: { name, primaryEmail: `${name.split(' ')[0].toLowerCase()}@${companyId}.example` }, select: { id: true } })
    await prisma.context.create({ data: { personId: person.id, companyId, type: 'EMPLOYEE', roleId: role.id } })
    return person.id
  }

  beforeAll(async () => {
    await resetDatabase()
    s.supplier = await firm('northwind-staffing', 'VENDOR')
    s.a = await firm('harborline-tech', 'CLIENT')
    s.b = await firm('eastfield-ops', 'CLIENT')
    s.aFinance = await financeSeat(s.a, 'Imelda Santoro')
    await financeSeat(s.b, 'Rosalind Tay')
    await prisma.remitTo.create({
      data: {
        companyId: s.supplier, legalName: 'Northwind Staffing LLC', country: 'US', bankName: 'Bellrock Bank', accountName: 'Northwind Staffing LLC',
        accountLast4: '4821', routingLast4: '0021', isDefault: true, verifiedAt: new Date('2026-10-20T10:00:00Z'),
      },
    })
  }, 600_000)

  it('a check that names no customer holds every customer’s payment until that customer checks it', async () => {
    for (const payer of [s.a, s.b]) {
      const gate = await mayPayFirm(payer, s.supplier)
      expect(gate.ok).toBe(false)
      if (!gate.ok) expect(gate.step).toBe('BANK')
      expect((await bankCheckedBy(payer, s.supplier)).checked).toBe(false)
      expect((await payToOnBillFor(s.supplier, payer)).row).toBeNull()
      expect((await payToRowsFor(payer, [s.supplier])).size).toBe(0)
    }

    const done = await checkPayeeBank({ payer: { id: s.a, name: 'harborline-tech' }, payee: { id: s.supplier, name: 'northwind-staffing' }, by: { personId: s.aFinance, name: 'Imelda Santoro' } })
    expect(done.ok).toBe(true)

    expect(await mayPayFirm(s.a, s.supplier)).toEqual({ ok: true })
    expect((await bankCheckedBy(s.a, s.supplier)).checked).toBe(true)
    expect((await payToOnBillFor(s.supplier, s.a)).row?.accountLast4).toBe('4821')
    expect((await payToRowsFor(s.a, [s.supplier])).size).toBe(1)
    // The other customer is held still: one customer's check never counts for another.
    expect((await mayPayFirm(s.b, s.supplier)).ok).toBe(false)
    expect((await payToOnBillFor(s.supplier, s.b)).row).toBeNull()
  })
})

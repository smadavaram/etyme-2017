import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as sendBill } from '@/app/api/invoices/[id]/submit/route'
import { POST as sendBills } from '@/app/api/invoices/submit/route'
import { GET as readInvoice } from '@/app/api/invoices/[id]/route'
import { POST as pay } from '@/app/api/invoices/[id]/payments/route'
import { maySendBill, maySendBills } from '@/lib/money/bill-send'
import { billSend } from '@/lib/money/supplier-bills'
import { draftSend } from '@/lib/today-page'
import { recordInvoicePayment } from '@/lib/money/invoice-payment'
import { mayPayInvoiceReceipt } from '@/lib/invoice-match'
import { partiesOf } from '@/lib/money/invoice-parties'
import { mayIssueBill, mayPayFirm, NO_BILLING_ADDRESS, bankNotChecked } from '@/lib/setup-gates'

/**
 * What a skipped setup step refuses on money's doors, and nothing else
 * (the setup checklist, 2026-10-28): no bill is sent without a billing
 * address, and no firm is paid until its bank details are checked. Each
 * refusal is the gate's own sentence, naming the step, on every door
 * that sends or pays; and the seeded world, whose details are all on
 * file and checked, is refused nowhere.
 */

const AP = 'world-nike-ap@demo.etyme.local'
const withId = (id: string) => ({ params: Promise.resolve({ id }) })
const s = { firm: '', ownerEmail: '', bill: '', billStatus: '', ownerPersonId: '', ownerPerms: [] as string[], receipt: '', payer: '', payee: '', payeeName: '' }

beforeAll(async () => {
  await freshWorld()
  // A bill a firm raised on its own agreement, at a firm whose Owner sends
  // bills. The seeded world sends every bill it raises, so the test puts
  // one back to raised-and-not-sent while it asks, and returns it after.
  const bills = await prisma.invoice.findMany({
    where: { status: { in: ['ISSUED', 'SUBMITTED'] }, engagement: { msaId: { not: null } } },
    select: { id: true, status: true, engagement: { select: { msa: { select: { vendorId: true } } } } },
    orderBy: { number: 'asc' },
  })
  for (const b of bills) {
    const vendorId = b.engagement.msa?.vendorId
    if (!vendorId) continue
    const owner = await prisma.context.findFirst({
      where: { companyId: vendorId, revokedAt: null, role: { name: 'Owner' } },
      select: { personId: true, person: { select: { primaryEmail: true } }, role: { select: { permissions: true } } },
    })
    if (!owner?.person.primaryEmail) continue
    if (!(await mayIssueBill(vendorId)).ok) continue
    Object.assign(s, {
      firm: vendorId, bill: b.id, billStatus: b.status, ownerPersonId: owner.personId,
      ownerEmail: owner.person.primaryEmail!, ownerPerms: owner.role?.permissions ?? [],
    })
    break
  }
  expect(s.bill, 'the seeded world holds a bill raised and not yet sent').not.toBe('')
  // The clean receipt at Northbend Athletic, and who it is between.
  const receipt = await prisma.invoice.findFirstOrThrow({
    where: { number: 'PR-2026-0441' },
    select: {
      id: true,
      engagement: { select: { msa: { select: { vendorId: true, clientId: true } } } },
      workOrder: { select: { issuedById: true, issuedToId: true } },
      invoiceLines: { select: { sellContract: { select: { companyId: true, clientCompanyId: true } } } },
    },
  })
  const parties = partiesOf({
    agreement: receipt.engagement.msa, order: receipt.workOrder,
    lines: receipt.invoiceLines.map((l) => l.sellContract).filter((c) => c != null),
  })
  s.receipt = receipt.id
  s.payer = parties.client!.id
  s.payee = parties.vendor!.id
  s.payeeName = (await prisma.company.findUniqueOrThrow({ where: { id: s.payee }, select: { name: true } })).name
}, 600_000)

/** Take every address a bill could print off a firm, and give them back after. */
async function withoutAddress<T>(companyId: string, f: () => Promise<T>): Promise<T> {
  const [addresses, remits, company] = await Promise.all([
    prisma.companyAddress.findMany({ where: { companyId } }),
    prisma.remitTo.findMany({ where: { companyId }, select: { id: true, addressLines: true } }),
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { billingSameAsLegal: true } }),
  ])
  await prisma.companyAddress.deleteMany({ where: { companyId } })
  await prisma.remitTo.updateMany({ where: { companyId }, data: { addressLines: [] } })
  try {
    return await f()
  } finally {
    await prisma.companyAddress.createMany({ data: addresses })
    for (const r of remits) await prisma.remitTo.update({ where: { id: r.id }, data: { addressLines: r.addressLines } })
    await prisma.company.update({ where: { id: companyId }, data: { billingSameAsLegal: company.billingSameAsLegal } })
  }
}

/** Take the check off a firm's bank details, as a payer would find them, and put it back after. */
async function withUncheckedBank<T>(payerId: string, payeeId: string, f: () => Promise<T>): Promise<T> {
  const remits = await prisma.remitTo.findMany({ where: { companyId: payeeId }, select: { id: true, verifiedAt: true } })
  const walks = await prisma.supplierRequest.findMany({
    where: { companyId: payerId, OR: [{ supplierCompanyId: payeeId }, { firmCompanyId: payeeId }] },
    select: { id: true, checklist: true },
  })
  await prisma.remitTo.updateMany({ where: { companyId: payeeId }, data: { verifiedAt: null } })
  for (const w of walks) {
    const list = Array.isArray(w.checklist) ? (w.checklist as any[]).map((i) => (i?.key === 'BANK' ? { ...i, state: 'SUPPLIED' } : i)) : w.checklist
    await prisma.supplierRequest.update({ where: { id: w.id }, data: { checklist: list as any } })
  }
  try {
    return await f()
  } finally {
    for (const r of remits) await prisma.remitTo.update({ where: { id: r.id }, data: { verifiedAt: r.verifiedAt } })
    for (const w of walks) await prisma.supplierRequest.update({ where: { id: w.id }, data: { checklist: w.checklist as any } })
  }
}

describe('a skipped setup step refuses only the money act that needs it', () => {
  it('a bill is not sent without a billing address, and the refusal names the step, on the route, on Today and in the chat', async () => {
    await prisma.invoice.update({ where: { id: s.bill }, data: { status: 'ISSUED' } })
    try {
    await withoutAddress(s.firm, async () => {
      expect(await mayIssueBill(s.firm)).toEqual({ ok: false, says: NO_BILLING_ADDRESS, step: 'ADDRESSES' })

      // The route: refused before the check writes, in the gate's sentence.
      as(s.ownerEmail)
      const one = await json(await sendBill(req('POST', `/api/invoices/${s.bill}/submit`, {}), withId(s.bill)))
      expect(one.status, JSON.stringify(one.body)).toBe(409)
      expect(one.body.error.message).toBe('Add a billing address under Setup → Addresses, then send the bill.')
      expect(one.body.error.step).toBe('ADDRESSES')
      const many = await json(await sendBills(req('POST', '/api/invoices/submit', { invoiceIds: [s.bill] })))
      expect(many.body.data.submitted).toBe(0)
      expect(many.body.data.results[0].reason).toBe(NO_BILLING_ADDRESS)
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id: s.bill } })).status).toBe('ISSUED')

      // Today: Send is not drawn, and the row says the sentence instead.
      const verdicts = await maySendBills({ personId: s.ownerPersonId, companyId: s.firm, permissions: s.ownerPerms }, [s.bill])
      expect(draftSend(verdicts.get(s.bill))).toEqual({ send: false, refused: NO_BILLING_ADDRESS })

      // The chat: the card's verdict, and the twin's yes on a drafted bill.
      const card = await maySendBill({ personId: s.ownerPersonId, companyId: s.firm, permissions: s.ownerPerms }, { id: s.bill })
      expect(card).toEqual({ ok: false, code: 'SETUP_INCOMPLETE', says: NO_BILLING_ADDRESS, step: 'ADDRESSES' })
      await prisma.invoice.update({ where: { id: s.bill }, data: { status: 'DRAFT' } })
      try {
        const asked = await billSend.check!({ entity: { type: 'Invoice', id: s.bill }, companyId: s.firm } as any)
        expect(asked).toBe(NO_BILLING_ADDRESS)
      } finally {
        await prisma.invoice.update({ where: { id: s.bill }, data: { status: 'ISSUED' } })
      }
    })
    // With the address back, the address no longer stops it.
    expect(await mayIssueBill(s.firm)).toEqual({ ok: true })
    expect((await maySendBill({ personId: s.ownerPersonId, companyId: s.firm, permissions: s.ownerPerms }, { id: s.bill })).ok).toBe(true)
    } finally {
      await prisma.invoice.update({ where: { id: s.bill }, data: { status: s.billStatus as any } })
    }
  })

  it('a firm is not paid until its bank details are checked, and the refusal names the step', async () => {
    const says = bankNotChecked(s.payeeName)
    await withUncheckedBank(s.payer, s.payee, async () => {
      expect(await mayPayFirm(s.payer, s.payee)).toEqual({ ok: false, says, step: 'BANK' })

      // The receipt's page draws no Pay, and says why.
      as(AP)
      const page = await json(await readInvoice(req('GET', `/api/invoices/${s.receipt}`), withId(s.receipt)))
      expect(page.status, JSON.stringify(page.body)).toBe(200)
      expect(page.body.data.payPanel.kind).toBe('HELD')
      expect(page.body.data.payPanel.says).toBe(says)

      // The payment route refuses in the gate's sentence, and nothing is paid.
      const before = await prisma.payment.count({ where: { invoiceId: s.receipt } })
      const r = await json(await pay(req('POST', `/api/invoices/${s.receipt}/payments`, { amount: 1, method: 'ACH', reference: 'T-BANK' }), withId(s.receipt)))
      expect(r.status, JSON.stringify(r.body)).toBe(409)
      expect(r.body.error.code).toBe('BANK_NOT_CHECKED')
      expect(r.body.error.message).toBe(says)
      expect(r.body.error.step).toBe('BANK')

      // The one payment write refuses too, so the twin's yes cannot pay it.
      const direct = await prisma.$transaction((tx) => recordInvoicePayment(tx, {
        invoiceId: s.receipt, amountCents: 100, reference: 'T-BANK-2', appliedById: s.ownerPersonId,
        onBooksOf: s.payer, recordedBy: { companyId: s.payer, companyName: 'Northbend Athletic', personName: 'AP' },
      }))
      expect(direct).toMatchObject({ ok: false, code: 'BANK_NOT_CHECKED', says, step: 'BANK' })
      expect(await prisma.payment.count({ where: { invoiceId: s.receipt } })).toBe(before)

      // And the twin is not asked to put it up for a yes.
      expect(await mayPayInvoiceReceipt(s.receipt)).toMatchObject({ ok: false, code: 'BANK_NOT_CHECKED', says })
    })
    expect(await mayPayFirm(s.payer, s.payee)).toEqual({ ok: true })
    expect(await mayPayInvoiceReceipt(s.receipt)).toMatchObject({ ok: true })
  })

  it('every seeded bill still sends and every seeded payment still pays', async () => {
    const invoices = await prisma.invoice.findMany({
      select: {
        number: true,
        engagement: { select: { msa: { select: { vendorId: true, clientId: true } } } },
        workOrder: { select: { issuedById: true, issuedToId: true } },
        invoiceLines: { select: { sellContract: { select: { companyId: true, clientCompanyId: true } } } },
      },
    })
    const issuers = new Map<string, string>()
    const pairs = new Map<string, string>()
    for (const i of invoices) {
      const p = partiesOf({ agreement: i.engagement.msa, order: i.workOrder, lines: i.invoiceLines.map((l) => l.sellContract).filter((c) => c != null) })
      if (!p.vendor || !p.client) continue
      issuers.set(p.vendor.id, i.number)
      pairs.set(`${p.client.id}|${p.vendor.id}`, i.number)
    }
    const vendorBills = await prisma.vendorBill.findMany({ select: { number: true, companyId: true, vendorCompanyId: true } })
    for (const b of vendorBills) pairs.set(`${b.companyId}|${b.vendorCompanyId}`, b.number)
    expect(issuers.size).toBeGreaterThan(5)
    expect(pairs.size).toBeGreaterThan(5)

    const refusedBills: string[] = []
    for (const [issuer, number] of issuers) {
      const g = await mayIssueBill(issuer)
      if (!g.ok) refusedBills.push(`${(await prisma.company.findUnique({ where: { id: issuer }, select: { name: true } }))?.name} (${number}): ${g.says}`)
    }
    const refusedPays: string[] = []
    for (const [pair, number] of pairs) {
      const [payer, payee] = pair.split('|')
      const g = await mayPayFirm(payer, payee)
      if (!g.ok) refusedPays.push(`${number}: ${g.says}`)
    }
    expect({ refusedBills, refusedPays }).toEqual({ refusedBills: [], refusedPays: [] })
  })
})

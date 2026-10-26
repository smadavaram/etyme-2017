import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as pay } from '@/app/api/invoices/[id]/payments/route'
import { recordInvoicePayment, emitInvoicePaid } from '@/lib/money/invoice-payment'
import { fromPrismaDecimal } from '@/lib/money'

/**
 * One payment, one write.
 *
 * The payment route and the twin's performer both pay an invoice, and a
 * second copy of the writes is how two doors come to record two different
 * things. So the writes are one function, `recordInvoicePayment` in
 * lib/money/invoice-payment, and the route calls it inside its own
 * transaction. This walks a supplier recording money that arrived — the
 * side with no match gate in front — once through the route and once
 * through the function, and reads every row both left behind.
 */

const w = {
  invoice: '',
  number: '',
  currency: 'USD',
  vendor: '',
  vendorName: '',
  ownerEmail: '',
  ownerContext: '',
  ownerId: '',
  ownerName: '',
}

async function owedCents() {
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: w.invoice } })
  return fromPrismaDecimal(inv.total, inv.currency).minor - fromPrismaDecimal(inv.paid, inv.currency).minor
}

/** The function, called the way the route calls it, by the same person. */
function input(amountCents: number | null, reference: string) {
  return {
      invoiceId: w.invoice,
      amountCents,
      method: 'ACH',
      reference,
      appliedById: w.ownerId,
      onBooksOf: w.vendor,
      seatId: null,
      recordedBy: { companyId: w.vendor, companyName: w.vendorName, personName: w.ownerName },
  }
}

/** The function, called the way the route calls it: write, commit, then emit. */
async function viaFunction(amountCents: number | null, reference: string) {
  const done = await prisma.$transaction((tx) => recordInvoicePayment(tx, input(amountCents, reference)))
  await emitInvoicePaid(done)
  return done
}

function paidEvents() {
  return prisma.event.count({ where: { type: 'invoice.paid', subjectId: w.invoice } })
}

async function viaRoute(amount: number, reference: string) {
  as(w.ownerEmail)
  return json(
    await pay(
      req('POST', `/api/invoices/${w.invoice}/payments`, { amount, method: 'ACH', reference }, { 'x-context-id': w.ownerContext }),
      { params: Promise.resolve({ id: w.invoice }) }
    )
  )
}

beforeAll(async () => {
  await freshWorld()
  // A bill a supplier raised on an agreement, with more than $100 still
  // owed, whose firm has an owner who can record what arrived.
  const candidates = await prisma.invoice.findMany({
    where: { status: { in: ['ISSUED', 'SUBMITTED'] }, engagement: { msaId: { not: null } } },
    select: { id: true, number: true, total: true, paid: true, currency: true, engagement: { select: { msa: { select: { vendorId: true } } } } },
    orderBy: { number: 'asc' },
  })
  for (const c of candidates) {
    const owed = fromPrismaDecimal(c.total, c.currency).minor - fromPrismaDecimal(c.paid, c.currency).minor
    const vendorId = c.engagement.msa?.vendorId
    if (!vendorId || owed < 10_000) continue
    const owner = await prisma.context.findFirst({
      where: { companyId: vendorId, role: { name: 'Owner' } },
      select: { id: true, person: { select: { id: true, name: true, primaryEmail: true } }, company: { select: { name: true } } },
    })
    if (!owner?.person.primaryEmail) continue
    Object.assign(w, {
      invoice: c.id, number: c.number, currency: c.currency, vendor: vendorId, vendorName: owner.company?.name ?? '',
      ownerEmail: owner.person.primaryEmail, ownerContext: owner.id, ownerId: owner.person.id, ownerName: owner.person.name,
    })
    break
  }
  expect(w.invoice, 'the seeded world has a supplier bill with money still owed').not.toBe('')
})

describe('one payment, one write', () => {
  it('the payment route and the one payment function record the same rows', async () => {
    const before = await owedCents()

    const r = await viaRoute(10, 'ROUTE-1')
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.status).toBe(201)

    const f = await viaFunction(1000, 'FUNCTION-1')
    expect(f.ok, JSON.stringify(f)).toBe(true)

    const rows = await prisma.payment.findMany({
      where: { invoiceId: w.invoice, reference: { in: ['ROUTE-1', 'FUNCTION-1'] } },
      orderBy: { reference: 'desc' },
    })
    expect(rows).toHaveLength(2)
    const shape = (p: (typeof rows)[number]) => ({
      amount: p.amount.toString(),
      currency: p.currency,
      method: p.method,
      payerCompanyId: p.payerCompanyId,
      receivedByCompanyId: p.receivedByCompanyId,
      appliedById: p.appliedById,
      appliedAt: p.appliedAt != null,
    })
    expect(shape(rows[1])).toEqual(shape(rows[0]))
    expect(rows[0].receivedByCompanyId).toBe(w.vendor)

    const logs = await prisma.automationLog.findMany({
      where: { action: 'PAYMENT_RECORDED', payload: { path: ['invoiceId'], equals: w.invoice } },
      orderBy: { at: 'asc' },
    })
    expect(logs).toHaveLength(2)
    const logShape = (l: (typeof logs)[number]) => {
      const p = l.payload as any
      return {
        companyId: l.companyId,
        reversible: l.reversible,
        reason: l.reason,
        summaryStart: l.summary.split(' recorded on ')[0],
        keys: Object.keys(p).sort(),
        recordedBy: p.recordedBy,
        amount: p.amount,
        method: p.method,
      }
    }
    expect(logShape(logs[1])).toEqual(logShape(logs[0]))
    expect((logs[0].payload as any).recordedBy.side).toBe('SUPPLIER')

    // Both doors told the world, once each, after the commit.
    for (const p of rows) {
      expect(await prisma.event.count({ where: { type: 'invoice.paid', payload: { path: ['paymentId'], equals: p.id } } })).toBe(1)
    }

    expect(await owedCents()).toBe(before - 2000)
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: w.invoice } })
    expect(inv.status).toBe('PARTIALLY_PAID')
  })

  it('a payment over the balance owed is refused in a sentence', async () => {
    const owed = await owedCents()
    const count = await prisma.payment.count({ where: { invoiceId: w.invoice } })

    const f = await viaFunction(owed + 1, 'TOO-MUCH')
    expect(f.ok).toBe(false)
    if (f.ok) return
    expect(f.code).toBe('OVERPAYMENT')
    expect(f.field).toBe('amount')
    expect(f.says).toMatch(/is more than the .+ still owed on bill .+\. Record what actually arrived/)

    // The route says the same sentence, a cent over, with nothing written.
    const r = await viaRoute(owed / 100 + 0.01, 'TOO-MUCH-ROUTE')
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('OVERPAYMENT')
    expect(r.body.error.message).toMatch(/still owed on bill/)

    expect(await prisma.payment.count({ where: { invoiceId: w.invoice } })).toBe(count)
    expect(await owedCents()).toBe(owed)
  })

  it('a payment whose transaction rolls back emits no invoice.paid event', async () => {
    const events = await paidEvents()
    const payments = await prisma.payment.count({ where: { invoiceId: w.invoice } })
    const owed = await owedCents()

    // A later write in the same transaction fails — the twin's ledger line,
    // say — after the payment was recorded inside it.
    let emitted: Promise<unknown> | null = null
    await expect(
      prisma.$transaction(async (tx) => {
        const done = await recordInvoicePayment(tx, input(500, 'ROLLED-BACK'))
        expect(done.ok).toBe(true)
        emitted = Promise.resolve(done.ok ? done.event : null)
        throw new Error('the ledger line after the payment failed')
      })
    ).rejects.toThrow('the ledger line after the payment failed')
    await emitted
    await new Promise((r) => setTimeout(r, 200))

    expect(await paidEvents()).toBe(events)
    expect(await prisma.payment.count({ where: { invoiceId: w.invoice } })).toBe(payments)
    expect(await owedCents()).toBe(owed)
  })

  it('a payment with no amount pays the balance owed', async () => {
    const owed = await owedCents()
    const f = await viaFunction(null, 'THE-REST')
    expect(f.ok, JSON.stringify(f)).toBe(true)
    if (!f.ok) return
    expect(f.amountCents).toBe(owed)
    expect(f.status).toBe('PAID')
    expect(f.invoice.outstandingCents).toBe(0)

    const p = await prisma.payment.findFirstOrThrow({ where: { invoiceId: w.invoice, reference: 'THE-REST' } })
    expect(fromPrismaDecimal(p.amount, w.currency).minor).toBe(owed)
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: w.invoice } })
    expect(inv.status).toBe('PAID')
    expect(await owedCents()).toBe(0)
    expect(await prisma.expense.count({ where: { invoiceId: w.invoice, status: 'INVOICED' } })).toBe(0)

    // And once nothing is owed, a second payment is refused rather than written.
    const again = await viaFunction(null, 'AGAIN')
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.says).toMatch(/already fully paid/)
  })
})

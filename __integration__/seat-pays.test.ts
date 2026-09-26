import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as listInvoices } from '@/app/api/invoices/route'
import { GET as readInvoice } from '@/app/api/invoices/[id]/route'
import { GET as matchInvoice } from '@/app/api/invoices/[id]/match/route'
import { POST as payInvoice } from '@/app/api/invoices/[id]/payments/route'
import { GET as payables } from '@/app/api/ap/route'
import { GET as listContracts } from '@/app/api/contracts/route'
import { GET as listOrders } from '@/app/api/purchase-orders/route'

/**
 * The AP clerk's desk that was not the client's.
 *
 * ── What was broken ──────────────────────────────────────────────────
 *
 * Cavanaugh Glassworks has no contingent workforce office of its own and
 * hands the running of its program to Aptiva Workforce, which places
 * nobody there and never will. Since 2026-09-20 the client can say so:
 * it grants Aptiva a desk in its own program office, and Aptiva acts
 * there under Cavanaugh's rules with every read logged.
 *
 * Every client-facing surface resolved through that seat. **No money
 * route did.** They scoped to `caller.company.id`, so Aptiva's clerk
 * opening the payables of the program it runs was served Aptiva's own
 * books and nothing of Cavanaugh's — which is the whole of what an AP
 * Clerk seat is for.
 *
 * ── What this walks ──────────────────────────────────────────────────
 *
 * The same desk, seated twice. First at Cavanaugh's Program Manager
 * desk, which reads money and does not pay it; then at its AP Clerk
 * desk, which does. The client decides which, and the difference is
 * visible in what the same person at the same firm may do one minute
 * apart. Then the seat is revoked and the book closes in the same
 * second.
 */

const APTIVA = 'world-aptiva@demo.etyme.local'

const id = {
  aptiva: '',
  cavanaugh: '',
  talvern: '',
  seat: '',
  /** Cavanaugh's own supplier invoice, on an order, from Wrenfield. */
  clientInvoice: '',
  /** An invoice on Aptiva's own book, which the seat must never show. */
  ownInvoice: '',
  /** The line Cavanaugh pays, and the line below it that it does not. */
  topContract: '',
  subContract: '',
}

/** Seat Aptiva at one of Cavanaugh's own desks, and only that one. */
async function seatAptivaAt(roleName: string) {
  const role = await prisma.role.findFirstOrThrow({
    where: { companyId: id.cavanaugh, name: roleName },
  })
  const owner = await prisma.context.findFirstOrThrow({
    where: { companyId: id.cavanaugh, role: { name: 'Owner' } },
    select: { personId: true },
  })
  await prisma.programSeat.updateMany({
    where: { clientCompanyId: id.cavanaugh, officeCompanyId: id.aptiva, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  const seat = await prisma.programSeat.create({
    data: {
      clientCompanyId: id.cavanaugh,
      officeCompanyId: id.aptiva,
      roleId: role.id,
      grantedById: owner.personId,
      reason: `Aptiva runs our program and sits at our ${roleName} desk.`,
    },
  })
  id.seat = seat.id
  return seat
}

beforeAll(async () => {
  await resetDatabase()
  await seedWorld()

  id.aptiva = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-aptiva' } })).id
  id.cavanaugh = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-corning' } })).id
  id.talvern = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-terumo-bct' } })).id

  // Cavanaugh's own supplier invoice: Wrenfield Technical billed it for a
  // week of Elsa Thornquist against the purchase order it raised. No MSA
  // behind it, on purpose — this is the invoice that proves the seat
  // reads through the order as well as through an agreement.
  const wrenfield = await prisma.company.findFirstOrThrow({ where: { slug: 'world-wrenfield' } })
  id.clientInvoice = (
    await prisma.invoice.findFirstOrThrow({
      where: {
        status: 'SUBMITTED',
        workOrder: { issuedById: id.cavanaugh, issuedToId: wrenfield.id },
      },
      orderBy: { periodStart: 'desc' },
    })
  ).id

  // Aptiva's own book: it employs Ruben on its own W2 at Harlow Health,
  // and it bills Harlow for him. Nothing in the seeded world raised that
  // invoice, so the fixture raises one — without it, "not its own books"
  // would be proved against an empty set.
  const ownLine = await prisma.sellContract.findFirstOrThrow({
    where: { companyId: id.aptiva },
    select: { id: true, engagementId: true, personId: true, billRate: true },
  })
  const own = await prisma.invoice.create({
    data: {
      engagementId: ownLine.engagementId!,
      number: 'APT-OWN-0001',
      periodStart: new Date('2026-08-01'),
      periodEnd: new Date('2026-08-31'),
      currency: 'USD',
      total: 39_200 / 100,
      dueAt: new Date('2026-09-30'),
      status: 'SUBMITTED',
    },
  })
  await prisma.invoiceLine.create({
    data: {
      invoiceId: own.id,
      sellContractId: ownLine.id,
      personId: ownLine.personId,
      hours: 40,
      rateCents: ownLine.billRate,
      amountCents: 40 * ownLine.billRate,
    },
  })
  id.ownInvoice = own.id

  // The two rungs of one placement at Cavanaugh: Vertex Global bills
  // Cavanaugh, and Sahasra Infotech bills Vertex. The second is the
  // prime's margin and is nobody else's business.
  const vertex = await prisma.company.findFirstOrThrow({ where: { slug: 'world-vertex-global' } })
  id.topContract = (
    await prisma.sellContract.findFirstOrThrow({
      where: { companyId: vertex.id, clientCompanyId: id.cavanaugh },
    })
  ).id
  id.subContract = (
    await prisma.sellContract.findFirstOrThrow({
      where: { clientCompanyId: vertex.id, endClientCompanyId: id.cavanaugh },
    })
  ).id

  await seatAptivaAt('Program Manager')
  as(APTIVA)
}, 300_000)

describe('a program office reads the books of the client that seated it', () => {
  it('a seated program office reads the client’s supplier invoices, not its own', async () => {
    const { status, body } = await json(await listInvoices(req('GET', '/api/invoices?limit=50')))
    expect(status).toBe(200)

    const rows = body.data.invoices
    expect(rows.length).toBeGreaterThan(0)
    expect(body.data.reading.inASeat).toBe(true)
    expect(body.data.reading.company).toBe('Cavanaugh Glassworks')

    // Cavanaugh's own bill is here.
    expect(rows.map((r: any) => r.id)).toContain(id.clientInvoice)
    // Aptiva's is not, and every row is addressed to the client.
    expect(rows.map((r: any) => r.id)).not.toContain(id.ownInvoice)
    for (const row of rows) {
      expect(row.engagement.clientCompany?.id ?? id.cavanaugh).toBe(id.cavanaugh)
    }
  })

  it('the office’s own book is still its own, one named request away', async () => {
    const { status, body } = await json(
      await listInvoices(req('GET', '/api/invoices?books=own&limit=50'))
    )
    expect(status).toBe(200)
    expect(body.data.reading.inASeat).toBe(false)
    expect(body.data.invoices.map((r: any) => r.id)).toContain(id.ownInvoice)
    expect(body.data.invoices.map((r: any) => r.id)).not.toContain(id.clientInvoice)
  })

  it('a seated program office opens the client’s payables rather than the office’s own', async () => {
    const { status, body } = await json(await payables(req('GET', '/api/ap')))
    expect(status).toBe(200)
    expect(body.data.us).toBe('Cavanaugh Glassworks')
    expect(body.data.reading.inASeat).toBe(true)
    // Cavanaugh's suppliers are all on the platform, so what it owes is
    // their invoices rather than keyed-in bills — and the page says which.
    expect(body.data.source).toBe('SUPPLIER_INVOICES')
    expect(body.data.supplierInvoices.rows.length).toBeGreaterThan(0)
  })

  it('a seated program office reads the orders the client raised to its suppliers', async () => {
    const { status, body } = await json(await listOrders(req('GET', '/api/purchase-orders')))
    expect(status).toBe(200)
    expect(body.data.reading.company).toBe('Cavanaugh Glassworks')
    expect(body.data.orders.length).toBeGreaterThan(0)
    const issuers = await prisma.workOrder.findMany({
      where: { id: { in: body.data.orders.map((o: any) => o.id) } },
      select: { issuedById: true, issuedToId: true },
    })
    for (const o of issuers) {
      expect([o.issuedById, o.issuedToId]).toContain(id.cavanaugh)
    }
  })

  it('a seated office never sees a sub-vendor’s rate below the rung the client pays', async () => {
    const { status, body } = await json(
      await listContracts(req('GET', '/api/contracts?side=sell&limit=50'))
    )
    expect(status).toBe(200)

    const ids = body.data.contracts.map((c: any) => c.id)
    // The line Cavanaugh pays, with the rate Cavanaugh pays on it.
    expect(ids).toContain(id.topContract)
    // The line under it — what Sahasra charges Vertex — is the prime's
    // margin and is not in the seat's book at any price.
    expect(ids).not.toContain(id.subContract)
    for (const c of body.data.contracts) {
      expect(c.clientCompany.id).toBe(id.cavanaugh)
    }
  })

  it('a seat at one client shows nothing of another client’s books', async () => {
    const { status, body } = await json(
      await listInvoices(req('GET', `/api/invoices?clientCompanyId=${id.talvern}&limit=50`))
    )
    expect(status).toBe(403)
    expect(String(body.error.message)).toContain('Talvern Medical')

    // And nothing of Talvern's leaks into the book the seat does open.
    const open = await json(await listInvoices(req('GET', '/api/invoices?limit=50')))
    const talvernInvoices = await prisma.invoice.findMany({
      where: { workOrder: { issuedById: id.talvern } },
      select: { id: true },
    })
    for (const t of talvernInvoices) {
      expect(open.body.data.invoices.map((r: any) => r.id)).not.toContain(t.id)
    }
  })

  it('every read in a seat is on the record, naming the desk the client granted', async () => {
    await listInvoices(req('GET', '/api/invoices?limit=5'))
    // Fire-and-forget: the invariant is that it is written, not that the
    // reader waited for it.
    await new Promise((r) => setTimeout(r, 250))
    const logged = await prisma.accessLog.findFirst({
      where: { actorCompanyId: id.aptiva, reason: { contains: 'Program Manager' } },
      orderBy: { at: 'desc' },
    })
    expect(logged).not.toBeNull()
    expect(logged!.reason).toContain('Cavanaugh Glassworks')
    expect(logged!.reason).toContain('Aptiva Workforce')
  })
})

describe('what a seated desk may do with the client’s money', () => {
  it('a seated desk that does not pay is refused, in a sentence naming the client’s rule', async () => {
    const { status, body } = await json(
      await payInvoice(
        req('POST', `/api/invoices/${id.clientInvoice}/payments`, { amount: 100 }),
        { params: Promise.resolve({ id: id.clientInvoice }) }
      )
    )
    expect(status).toBe(403)
    const says = String(body.error.message)
    expect(says).toContain('Cavanaugh Glassworks')
    expect(says).toContain('Program Manager')
    expect(says).toContain('Aptiva Workforce')
    // A sentence, not a code.
    expect(says).not.toContain('payments.record')
  })

  it('a seated AP clerk matches a bill against the client’s order and signed weeks', async () => {
    await seatAptivaAt('AP Clerk')

    const { status, body } = await json(
      await matchInvoice(req('GET', `/api/invoices/${id.clientInvoice}/match`), {
        params: Promise.resolve({ id: id.clientInvoice }),
      })
    )
    expect(status).toBe(200)
    expect(body.data.checks.length).toBeGreaterThan(0)
    // The order behind it is read, with what is left on it.
    expect(body.data.workOrder).not.toBeNull()
    expect(typeof body.data.summary).toBe('string')
  })

  it('a seated AP clerk pays the client’s supplier invoice, on the client’s books', async () => {
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: id.clientInvoice } })
    const outstanding = Number(invoice.total) - Number(invoice.paid)

    const { status, body } = await json(
      await payInvoice(
        req('POST', `/api/invoices/${id.clientInvoice}/payments`, {
          amount: outstanding,
          method: 'ACH',
          reference: 'AP-RUN-0007',
        }),
        { params: Promise.resolve({ id: id.clientInvoice }) }
      )
    )
    expect(status).toBe(201)
    expect(body.data.invoice.status).toBe('PAID')

    // The payment says who paid whom, and the payer is the client — not
    // the office that pressed the button.
    const payment = await prisma.payment.findFirstOrThrow({
      where: { invoiceId: id.clientInvoice },
      orderBy: { receivedAt: 'desc' },
    })
    expect(payment.payerCompanyId).toBe(id.cavanaugh)

    // And the trail names the desk the client granted.
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { companyId: id.cavanaugh, action: 'PAYMENT_RECORDED' },
      orderBy: { at: 'desc' },
    })
    expect(log.reason).toContain('Aptiva Workforce')
    expect(log.reason).toContain('AP Clerk')
    expect(log.reason).toContain('Cavanaugh Glassworks')
    expect(log.reason).toContain(id.seat)
  })

  it('a revoked seat reads no invoice the next second', async () => {
    await prisma.programSeat.updateMany({
      where: { clientCompanyId: id.cavanaugh, officeCompanyId: id.aptiva, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    const one = await json(
      await readInvoice(req('GET', `/api/invoices/${id.clientInvoice}`), {
        params: Promise.resolve({ id: id.clientInvoice }),
      })
    )
    expect(one.status).toBe(404)

    const list = await json(await listInvoices(req('GET', '/api/invoices?limit=50')))
    expect(list.body.data.reading.inASeat).toBe(false)
    expect(list.body.data.invoices.map((r: any) => r.id)).not.toContain(id.clientInvoice)
    // Its own book is still its own.
    expect(list.body.data.invoices.map((r: any) => r.id)).toContain(id.ownInvoice)
  })
})

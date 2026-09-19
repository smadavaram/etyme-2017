/**
 * The money layers the spine never wrote.
 *
 * ── What was missing ─────────────────────────────────────────────────
 *
 * The seeded world has 38 placements, both legs of each, four weeks of
 * hours apiece, invoices and payments. What it did not have was anything
 * ABOVE or BELOW the invoice:
 *
 *   above   the order that authorized the spend in the first place. No
 *           `WorkOrder` existed anywhere, so every ceiling was unreachable,
 *           the milestones screen was permanently empty, and
 *           `cron/auto-approve` read `autoApproveTimesheets` off a row
 *           that did not exist — false on every timesheet in the world,
 *           from the day the job was written.
 *   below   the books. Nothing accumulated against a project, nothing
 *           posted to a ledger, no AP run was ever assembled, and no rate
 *           had ever changed.
 *
 * ── Fill from the work, not from data entry ──────────────────────────
 *
 * Every row here is derived from something the world seed already wrote,
 * through the same function the product uses where one exists:
 *
 *   `postAssertion` (lib/order-postings)  the route that signs a week
 *   `orderFor`                            opens the project order
 *   `entryFor`/`onInvoice` (lib/gl)       decide which accounts are hit
 *
 * Nothing invents a placement, a person or a firm. If a figure here is
 * wrong, it is wrong because the contract it was read off is wrong.
 *
 * ── Honest gap, written down rather than implied ─────────────────────
 *
 * No production route writes `JournalEntry`, `LedgerAccount` or
 * `JournalLine` — `lib/gl` has known how to post since it was written and
 * nothing calls it. So the ledger below is the seed applying gl's own
 * rules to postings the product did make. It fills the export screen; it
 * does not mean a real customer's ledger fills itself. That is a build
 * owed, not a build done.
 */

import type { Prisma } from '@prisma/client'
import { prisma as db } from '@/lib/db'
import { day } from '@/lib/seed-days'
import { postAssertion } from '@/lib/order-postings'
import { DEFAULT_ACCOUNTS, entryFor, onInvoice, onCreditNote, onReceipt } from '@/lib/gl'

export interface SeedContext {
  firmBySlug: Map<string, { id: string }>
  seatBySlug: Map<string, { personId: string; email: string }>
  domain: string
  prefix: string
}

export interface OrderToCash {
  orders: number
  milestones: number
  projectOrders: number
  postings: number
  journalEntries: number
  expenses: number
}

/** The desk that pays, at a seeded client program. */
async function deskAt(ctx: SeedContext, clientSlug: string, key: string) {
  return db.person.findUnique({
    where: { primaryEmail: `${ctx.prefix}${clientSlug}-${key}@${ctx.domain}` },
    select: { id: true },
  })
}

/** Cents to whole currency, for the columns that are Decimal. */
const whole = (cents: number) => cents / 100

export async function seedOrderToCash(ctx: SeedContext): Promise<OrderToCash> {
  const out: OrderToCash = {
    orders: 0, milestones: 0, projectOrders: 0, postings: 0, journalEntries: 0, expenses: 0,
  }

  // ── 1. The client's own coding ──────────────────────────────────────
  //
  // Interface only. It exists so a figure leaving here lands on the right
  // line in the client's own ERP, and it is carried outward by every
  // project order opened underneath it. Written before the orders below,
  // because `orderFor` copies it off the requirement.
  const clients = await db.company.findMany({
    where: { slug: { startsWith: ctx.prefix }, kind: 'CLIENT' },
    select: { id: true, slug: true, name: true },
  })
  for (const client of clients) {
    const code = `IO-${client.id.slice(-4).toUpperCase()}-4711`
    const io =
      (await db.internalOrder.findFirst({ where: { companyId: client.id, code } })) ??
      (await db.internalOrder.create({
        data: {
          companyId: client.id, code,
          name: 'Contingent labor — technology',
          budgetCents: 4_000_000_00, currency: 'USD',
          opensAt: day(-365), isActive: true,
        },
      }))
    // Onto the requisitions it pays for, which is how the code reaches a
    // supplier's books at all.
    await db.requirement.updateMany({
      where: { companyId: client.id, internalOrderId: null },
      data: { internalOrderId: io.id },
    })
  }

  // ── 2. The order layer ──────────────────────────────────────────────
  //
  // One commercial document with three names: the buyer raises a purchase
  // order, the seller files the same paper as its sales order, and the
  // trade calls it a work order. `lib/order-naming` decides which word a
  // given reader is shown; the row here carries both numbers, because an
  // invoice quoting the wrong one is a fortnight of AP email.
  //
  // One order per (buyer, seller) pair rather than one per placement —
  // that is what an order IS. A five-person project is one commitment and
  // five contracts, and the ceiling is the control over all five.
  const running = await db.sellContract.findMany({
    where: {
      state: { in: ['IN_PROGRESS', 'PAUSED'] },
      company: { slug: { startsWith: ctx.prefix } },
      clientCompany: { slug: { startsWith: ctx.prefix } },
    },
    select: {
      id: true, companyId: true, clientCompanyId: true, billRate: true,
      startDate: true, endDate: true, engagementId: true, msaId: true,
      company: { select: { name: true } },
      clientCompany: { select: { id: true, name: true, kind: true, slug: true } },
    },
  })

  interface Pair {
    buyerId: string; sellerId: string; buyerKind: string; buyerSlug: string
    sellerName: string
    rateCents: number; start: Date; end: Date | null
    engagementId: string | null; msaId: string | null
  }
  const pairs = new Map<string, Pair>()
  for (const c of running) {
    if (!c.startDate) continue
    const key = `${c.clientCompanyId}:${c.companyId}`
    const at = pairs.get(key)
    if (!at) {
      pairs.set(key, {
        buyerId: c.clientCompanyId, sellerId: c.companyId,
        buyerKind: c.clientCompany.kind, buyerSlug: c.clientCompany.slug,
        sellerName: c.company.name,
        rateCents: c.billRate, start: c.startDate, end: c.endDate,
        engagementId: c.engagementId, msaId: c.msaId,
      })
    } else {
      at.rateCents += c.billRate
      if (c.startDate < at.start) at.start = c.startDate
      if (c.endDate && (!at.end || c.endDate > at.end)) at.end = c.endDate
    }
  }

  // Where the work happens, for the order's ship-to. Seeded by
  // `seed-standing`, which runs before this.
  const sites = await db.companyLocation.findMany({
    where: { isPrimary: true },
    select: { id: true, companyId: true },
  })
  const siteOf = new Map(sites.map((s) => [s.companyId, s.id]))

  for (const p of pairs.values()) {
    // Deterministic from the two ids, so a second seeding finds the order
    // it wrote the first time rather than raising a duplicate against the
    // unique on (issuedById, number).
    const number = `PO-${day(0).getUTCFullYear()}-${p.sellerId.slice(-5).toUpperCase()}`
    const already = await db.workOrder.findFirst({
      where: { issuedById: p.buyerId, number }, select: { id: true },
    })
    let orderId = already?.id ?? null
    if (!orderId) {
      // A year of the placements underneath it at full time, rounded up
      // to the nearest thousand. A ceiling is a round number somebody
      // signed, never a computed cent — and it has to sit above what has
      // already been billed or the order reads as exhausted on day one.
      const yearCents = p.rateCents * 40 * 52
      const amount = Math.ceil(yearCents / 100_000) * 1_000

      // Silence counts as approval only where the CLIENT said so, on the
      // client's own order. Cavanaugh Glassworks is the program that
      // agreed it; the other two answer their weeks by hand, which is the
      // ordinary case and the one the queue on the desk is for.
      const autoApproves = p.buyerSlug === `${ctx.prefix}corning`

      const raised = await db.workOrder.create({
        data: {
          number,
          sellerNumber: `SO-${p.buyerId.slice(-5).toUpperCase()}`,
          title: `Contingent staffing — ${p.sellerName}`,
          issuedById: p.buyerId,
          issuedToId: p.sellerId,
          // The buyer raised it. A supplier recording paper it was handed
          // is `lib/off-system`'s case and there is no shell here.
          recordedById: p.buyerId,
          amount, currency: 'USD',
          billingBasis: 'TIME', billFrequency: 'MONTHLY',
          paymentTerms: 45,
          autoApproveTimesheets: autoApproves,
          approvalWindowDays: autoApproves ? 5 : null,
          shipToId: siteOf.get(p.buyerId) ?? null,
          engagementId: p.engagementId, msaId: p.msaId,
          status: 'OPEN',
          startDate: p.start,
          // A month past the last placement on it, because an order that
          // closes the day the work does cannot carry the final invoice.
          endDate: p.end ? new Date(p.end.getTime() + 30 * 86_400_000) : null,
          createdAt: p.start,
        },
        select: { id: true },
      })
      orderId = raised.id
      out.orders++
    }

    // Attach what was already running with no order, exactly as
    // `POST /api/purchase-orders` does — without this the order exists
    // and every invoice still fails the match, which reads as the
    // feature not working.
    await db.sellContract.updateMany({
      where: {
        companyId: p.sellerId, clientCompanyId: p.buyerId,
        workOrderId: null, state: { in: ['IN_PROGRESS', 'PAUSED'] },
      },
      data: { workOrderId: orderId },
    })
    // And the buyer's own leg where it bought from this supplier. Never a
    // W2 leg: a purchase order raised to your own employee is a
    // contradiction, which is why `BuyContract.workOrderId` is nullable.
    await db.buyContract.updateMany({
      where: {
        companyId: p.buyerId, vendorCompanyId: p.sellerId,
        workOrderId: null, state: { in: ['IN_PROGRESS', 'PAUSED'] },
      },
      data: { workOrderId: orderId },
    })
  }

  // Every invoice quotes the order its contract bills against, so the
  // three-way match has a PO to check rather than a blank.
  const linesToOrder = await db.invoiceLine.findMany({
    where: { sellContract: { workOrderId: { not: null } }, invoice: { workOrderId: null } },
    select: { invoiceId: true, sellContract: { select: { workOrderId: true } } },
  })
  const invoiceOrder = new Map<string, string>()
  for (const l of linesToOrder) {
    if (l.sellContract?.workOrderId) invoiceOrder.set(l.invoiceId, l.sellContract.workOrderId)
  }
  for (const [invoiceId, workOrderId] of invoiceOrder) {
    await db.invoice.update({ where: { id: invoiceId }, data: { workOrderId } })
  }

  // ── 3. Milestone billing ────────────────────────────────────────────
  //
  // A fixed-price piece of work beside the hourly book: three payments on
  // delivery rather than on hours. Three milestones in three states, so
  // the screen shows the whole shape — one accepted and billed, one
  // handed over and waiting on the client, one not due yet.
  //
  // The gap between `deliveredAt` and `acceptedAt` is the interesting
  // part and the reason both columns exist.
  const gsi = ctx.firmBySlug.get('teleworld')
  const aero = ctx.firmBySlug.get('corveldt')
  if (gsi && aero) {
    const number = `PO-${day(0).getUTCFullYear()}-MS-${gsi.id.slice(-4).toUpperCase()}`
    let order = await db.workOrder.findFirst({
      where: { issuedById: aero.id, number },
      select: { id: true, engagementId: true },
    })
    if (!order) {
      const eng = await db.engagement.findFirst({
        where: { msa: { vendorId: gsi.id, clientId: aero.id } },
        select: { id: true, msaId: true },
      })
      order = await db.workOrder.create({
        data: {
          number,
          sellerNumber: `SO-MS-${aero.id.slice(-4).toUpperCase()}`,
          title: 'DO-178C certification evidence — fixed price',
          issuedById: aero.id, issuedToId: gsi.id, recordedById: aero.id,
          amount: 285_000, currency: 'USD',
          billingBasis: 'MILESTONE', billFrequency: 'CUSTOM',
          paymentTerms: 45, status: 'OPEN',
          shipToId: siteOf.get(aero.id) ?? null,
          engagementId: eng?.id ?? null, msaId: eng?.msaId ?? null,
          startDate: day(-120), endDate: day(180),
          createdAt: day(-120),
        },
        select: { id: true, engagementId: true },
      })
      out.orders++
    }

    const plan: {
      name: string; amountCents: number; dueOn: number; sortOrder: number
      status: string; deliveredOn?: number; acceptedOn?: number; note?: string
    }[] = [
      {
        name: 'Requirements and test plan signed off', amountCents: 95_000_00,
        dueOn: -60, sortOrder: 1, status: 'ACCEPTED', deliveredOn: -64, acceptedOn: -58,
        note: 'Accepted with the traceability matrix attached.',
      },
      {
        name: 'Verification dry run complete', amountCents: 95_000_00,
        dueOn: -2, sortOrder: 2, status: 'DELIVERED', deliveredOn: -5,
        note: 'Handed over on the 5th; the DER has it.',
      },
      {
        name: 'Certification evidence pack', amountCents: 95_000_00,
        dueOn: 60, sortOrder: 3, status: 'PENDING',
      },
    ]
    const accepted: { id: string; name: string; amountCents: number }[] = []
    for (const m of plan) {
      const exists = await db.orderMilestone.findFirst({
        where: { orderId: order.id, name: m.name },
        select: { id: true, name: true, amountCents: true, status: true },
      })
      const by = await deskAt(ctx, 'corveldt', 'programme')
      const row =
        exists ??
        (await db.orderMilestone.create({
          data: {
            orderId: order.id, name: m.name, amountCents: m.amountCents,
            dueOn: day(m.dueOn), sortOrder: m.sortOrder, status: m.status,
            deliveredAt: m.deliveredOn == null ? null : day(m.deliveredOn),
            deliveredById: m.deliveredOn == null ? null : ctx.seatBySlug.get('teleworld')?.personId ?? null,
            acceptedAt: m.acceptedOn == null ? null : day(m.acceptedOn),
            acceptedById: m.acceptedOn == null ? null : by?.id ?? null,
            note: m.note ?? null,
            createdAt: day(-120),
          },
          select: { id: true, name: true, amountCents: true, status: true },
        }))
      if (!exists) out.milestones++
      if (m.status === 'ACCEPTED' || row.status === 'INVOICED') accepted.push(row)
    }

    // The accepted one rides on an invoice as a line of its own: no
    // person, no contract, the acceptance as its receipt.
    for (const m of accepted) {
      if (await db.invoiceLine.findFirst({ where: { milestoneId: m.id } })) continue
      if (!order.engagementId) break
      const inv = await db.invoice.create({
        data: {
          engagementId: order.engagementId,
          workOrderId: order.id,
          number: `IN-MS-${m.id.slice(-8).toUpperCase()}`,
          periodStart: day(-90), periodEnd: day(-58),
          currency: 'USD',
          total: whole(m.amountCents), paid: 0,
          issuedAt: day(-56), dueAt: day(-11),
          status: 'SUBMITTED',
        },
        select: { id: true },
      })
      await db.invoiceLine.create({
        data: {
          invoiceId: inv.id, milestoneId: m.id,
          hours: 0, rateCents: 0, amountCents: m.amountCents,
          description: `Milestone — ${m.name}`,
        },
      })
      await db.orderMilestone.update({ where: { id: m.id }, data: { status: 'INVOICED' } })
    }
  }

  // ── 4. What each project actually earned and cost ───────────────────
  //
  // Through `postAssertion`, which is the function the assert route calls
  // when a week is signed. It opens the project order if there is not one
  // yet, posts REVENUE where the client approved the hours and PAY plus
  // BURDEN where the employer accepted them, to the month the work was
  // done rather than the month it was signed.
  //
  // The seed wrote 104 assertions directly and none of them had ever been
  // posted, so every margin screen read zero on a world with 38 live
  // placements.
  const assertions = await db.workAssertion.findMany({
    where: { state: 'LIVE', role: { not: 'PASS_THROUGH' } },
    select: { id: true, byId: true },
    orderBy: { id: 'asc' },
  })
  for (const a of assertions) {
    try {
      const posted = await postAssertion(a.id, a.byId)
      out.postings += (posted ?? []).filter(Boolean).length
    } catch {
      // A settled order refuses a posting, and an order with no rate for
      // the day refuses one too. Neither is a reason to stop seeding the
      // rest of the world.
    }
  }
  out.projectOrders = await db.projectOrder.count()

  // ── 5. The books ────────────────────────────────────────────────────
  //
  // A chart of accounts for every firm that has postings, and one
  // balanced entry per posting, through `lib/gl`'s own table. Plus the
  // move an invoice makes — out of unbilled revenue, into receivable —
  // and the one a receipt makes, out of receivable into cash.
  const posted = await db.orderPosting.findMany({
    select: {
      id: true, companyId: true, kind: true, amountCents: true, currency: true,
      postedAt: true, says: true, source: true, projectOrderId: true,
      personId: true, clientCompanyId: true,
    },
    orderBy: { id: 'asc' },
  })
  const firmsWithBooks = new Set(posted.map((p) => p.companyId))
  const accountOf = new Map<string, string>() // `${companyId}:${code}` → id
  for (const companyId of firmsWithBooks) {
    for (const a of DEFAULT_ACCOUNTS) {
      const existing = await db.ledgerAccount.findFirst({
        where: { companyId, code: a.code }, select: { id: true },
      })
      const row =
        existing ??
        (await db.ledgerAccount.create({
          data: {
            companyId, code: a.code, name: a.name,
            type: a.type as never, normalSide: a.normalSide as never,
          },
          select: { id: true },
        }))
      accountOf.set(`${companyId}:${a.code}`, row.id)
    }
  }

  /** One balanced entry, keyed so a second seeding writes nothing. */
  async function post(
    companyId: string,
    source: string,
    sourceId: string,
    entry: { postedAt: Date; memo: string; lines: { accountCode: string; debitCents: number; creditCents: number; memo?: string }[] },
    dims: { projectOrderId?: string | null; personId?: string | null; clientCompanyId?: string | null } = {}
  ) {
    if (await db.journalEntry.findFirst({ where: { source: source as never, sourceId } })) return
    const lines: Prisma.JournalLineCreateWithoutEntryInput[] = []
    for (const l of entry.lines) {
      const accountId = accountOf.get(`${companyId}:${l.accountCode}`)
      if (!accountId) return
      lines.push({
        account: { connect: { id: accountId } },
        debitCents: l.debitCents, creditCents: l.creditCents, currency: 'USD',
        ...(dims.personId ? { person: { connect: { id: dims.personId } } } : {}),
        ...(dims.clientCompanyId ? { clientCompany: { connect: { id: dims.clientCompanyId } } } : {}),
        memo: l.memo ?? null,
      })
    }
    await db.journalEntry.create({
      data: {
        companyId, postedAt: entry.postedAt, source: source as never, sourceId,
        memo: entry.memo,
        projectOrderId: dims.projectOrderId ?? null,
        lines: { create: lines },
      },
    })
    out.journalEntries++
  }

  for (const p of posted) {
    await post(
      p.companyId, p.source, p.id,
      entryFor({ kind: p.kind as never, amountCents: p.amountCents, postedAt: p.postedAt, says: p.says }),
      { projectOrderId: p.projectOrderId, personId: p.personId, clientCompanyId: p.clientCompanyId }
    )
  }

  const issued = await db.invoice.findMany({
    where: { status: { in: ['SUBMITTED', 'APPROVED', 'PAID'] } },
    select: {
      id: true, number: true, total: true, issuedAt: true, periodEnd: true,
      invoiceLines: { select: { sellContract: { select: { companyId: true, clientCompanyId: true } } }, take: 1 },
    },
    orderBy: { id: 'asc' },
  })
  for (const inv of issued) {
    const sell = inv.invoiceLines[0]?.sellContract
    if (!sell) continue
    if (!firmsWithBooks.has(sell.companyId)) continue
    const cents = Math.round(Number(inv.total) * 100)
    await post(
      sell.companyId, 'INVOICE', inv.id,
      onInvoice(cents, inv.issuedAt ?? inv.periodEnd, inv.number),
      { clientCompanyId: sell.clientCompanyId }
    )
  }

  const receipts = await db.payment.findMany({
    // Applied cash only. Unapplied cash is ordinary and belongs in the
    // queue somebody works, not in the books against an invoice nobody
    // has decided on yet.
    where: { appliedAt: { not: null }, invoiceId: { not: null }, receivedByCompanyId: { not: null } },
    select: {
      id: true, amount: true, appliedAt: true, receivedByCompanyId: true, payerCompanyId: true,
      invoice: { select: { number: true } },
    },
    orderBy: { id: 'asc' },
  })
  for (const r of receipts) {
    if (!r.receivedByCompanyId || !r.invoice) continue
    if (!firmsWithBooks.has(r.receivedByCompanyId)) continue
    await post(
      r.receivedByCompanyId, 'MANUAL', r.id,
      onReceipt(Math.round(Number(r.amount) * 100), r.appliedAt!, r.invoice.number),
      { clientCompanyId: r.payerCompanyId }
    )
  }

  // ── 6. A credit note, and the exception somebody signed for ─────────
  //
  // Both are AP and AR facts a finance desk meets in its first week, and
  // both were unreachable: nothing had ever been credited back and the
  // three-way match exception queue was empty.
  const toCredit = await db.invoice.findFirst({
    where: { status: 'PAID', invoiceLines: { some: { timesheetId: { not: null } } } },
    select: {
      id: true, number: true, total: true, issuedAt: true, periodEnd: true,
      invoiceLines: { select: { rateCents: true, sellContract: { select: { companyId: true, clientCompanyId: true } } }, take: 1 },
    },
    orderBy: { number: 'asc' },
  })
  if (toCredit && !(await db.creditNote.findFirst({ where: { invoiceId: toCredit.id } }))) {
    // Four hours the client disputed, at the rate the line was billed at.
    // Not a round number somebody liked: the hours times the rate on the
    // invoice, which is what a credit note actually is.
    const rate = toCredit.invoiceLines[0]?.rateCents ?? 0
    const cents = rate * 4
    const seller = toCredit.invoiceLines[0]?.sellContract
    if (cents > 0 && seller) {
      const by = ctx.seatBySlug.get('computer-systems')?.personId ?? null
      await db.creditNote.create({
        data: {
          invoiceId: toCredit.id,
          amount: whole(cents),
          reasonCode: 'HOURS_DISPUTED',
          note: 'Four hours on the Thursday were the client’s own outage. Credited back rather than argued about.',
          issuedAt: day(-3),
          appliedAt: day(-3),
          createdById: by,
        },
      })
      // Into the period the invoice belonged to, not today. March revenue
      // credited in June is a March correction.
      if (firmsWithBooks.has(seller.companyId)) {
        await post(
          seller.companyId, 'REVERSAL', `credit:${toCredit.id}`,
          onCreditNote(cents, toCredit.issuedAt ?? toCredit.periodEnd, toCredit.number, 'HOURS_DISPUTED'),
          { clientCompanyId: seller.clientCompanyId }
        )
      }
    }
  }

  // A match exception, waived by the desk that pays, with the sentence it
  // was waived on. A waiver with no reason is a waiver nobody can defend.
  //
  // The same invoice the credit note is against, which is the honest
  // pairing: the client disputed four hours, so the invoice bills more
  // than the client approved and QUANTITY fails. AP waives it because the
  // credit note is on file — and QUANTITY is waivable for exactly this,
  // while paying twice and arithmetic are not.
  if (toCredit) {
    const payerId = toCredit.invoiceLines[0]?.sellContract?.clientCompanyId ?? null
    if (payerId && !(await db.invoiceMatchOverride.findFirst({ where: { invoiceId: toCredit.id } }))) {
      // Whoever settles bills there. The AP seat where the firm has one,
      // and the seat that was granted first where it does not — a small
      // supplier has one desk doing all of it.
      const ap =
        (await db.context.findFirst({
          where: { companyId: payerId, type: 'EMPLOYEE', role: { name: { contains: 'AP' } } },
          select: { personId: true }, orderBy: { grantedAt: 'asc' },
        })) ??
        (await db.context.findFirst({
          where: { companyId: payerId, type: 'EMPLOYEE' },
          select: { personId: true }, orderBy: { grantedAt: 'asc' },
        }))
      if (ap) {
        await db.invoiceMatchOverride.create({
          data: {
            invoiceId: toCredit.id,
            code: 'QUANTITY',
            reason:
              'Four hours on the Thursday were our own outage and they have credited them back. Paying the invoice against the credit note rather than asking for it to be reissued.',
            byId: ap.personId,
            invoiceTotalCentsAtOverride: Math.round(Number(toCredit.total) * 100),
            createdAt: day(-2),
          },
        })
      }
    }
  }

  // ── 7. The rate on file, and the rise nobody has signed yet ─────────
  //
  // The rate in force on a day is resolved from APPROVED rows only, so
  // the opening row has to be exactly what the contract says or every
  // invoice starts failing the PRICE check. The rise is PROPOSED and
  // therefore does not bill — which is the whole point of it being a
  // separate state.
  const contracts = await db.sellContract.findMany({
    where: { state: 'IN_PROGRESS', company: { slug: { startsWith: ctx.prefix } } },
    select: { id: true, billRate: true, startDate: true, companyId: true, personId: true },
    orderBy: { id: 'asc' },
  })
  for (const c of contracts) {
    if (!c.startDate) continue
    if (await db.rateHistory.findFirst({ where: { contractType: 'SELL', contractId: c.id } })) continue
    const seat = await db.context.findFirst({
      where: { companyId: c.companyId, type: 'EMPLOYEE' },
      select: { personId: true },
      orderBy: { grantedAt: 'asc' },
    })
    if (!seat) continue
    await db.rateHistory.create({
      data: {
        contractType: 'SELL', contractId: c.id,
        rate: c.billRate, rateType: 'HOURLY',
        fromDate: c.startDate, toDate: null,
        reason: 'Agreed at award',
        changedById: seat.personId,
        approvalState: 'APPROVED',
        approvedById: seat.personId, approvedAt: c.startDate,
        createdAt: c.startDate,
      },
    })
  }
  // One asked-for rise, waiting on somebody. Five per cent, on the
  // longest-running placement in the world — which is the conversation
  // that actually happens at renewal.
  const oldest = contracts[0]
  if (oldest && !(await db.rateHistory.findFirst({ where: { contractId: oldest.id, approvalState: 'PROPOSED' } }))) {
    const seat = await db.context.findFirst({
      where: { companyId: oldest.companyId, type: 'EMPLOYEE' },
      select: { personId: true }, orderBy: { grantedAt: 'asc' },
    })
    if (seat) {
      await db.rateHistory.create({
        data: {
          contractType: 'SELL', contractId: oldest.id,
          rate: Math.round(oldest.billRate * 1.05), rateType: 'HOURLY',
          fromDate: day(30), reason: 'Asked for at extension — market has moved and they have the S/4HANA work.',
          changedById: seat.personId,
          previousRate: oldest.billRate,
          approvalState: 'PROPOSED',
          createdAt: day(-2),
        },
      })
    }
  }

  // ── 8. Expenses, filed by the person who incurred them ──────────────
  //
  // Three, because the path has three interesting places to be: one on
  // the desk waiting to be approved, one approved and billable that will
  // ride the next invoice as a line of its own, and one approved and not
  // billable — the firm's own cost, which is the case that proves
  // `billable` is doing work.
  const forExpenses = await db.sellContract.findMany({
    where: { state: 'IN_PROGRESS', company: { slug: { startsWith: ctx.prefix } } },
    select: { id: true, companyId: true, personId: true },
    orderBy: { id: 'asc' },
    take: 3,
  })
  const expensePlan: {
    category: string; billable: boolean; description: string; status: string
    items: { description: string; quantity: number; unitPrice: number }[]
    submittedOn: number; approvedOn?: number
  }[] = [
    {
      category: 'TRAVEL', billable: true, status: 'SUBMITTED',
      description: 'Client site visit — two nights',
      items: [
        { description: 'Flight, SJC–MSN return', quantity: 1, unitPrice: 412.4 },
        { description: 'Hotel, two nights', quantity: 2, unitPrice: 189 },
      ],
      submittedOn: -4,
    },
    {
      category: 'TRAVEL', billable: true, status: 'APPROVED',
      description: 'Quarterly on-site week',
      items: [
        { description: 'Flight, CLT–EWR return', quantity: 1, unitPrice: 288.6 },
        { description: 'Cab fares', quantity: 6, unitPrice: 24.5 },
      ],
      submittedOn: -18, approvedOn: -15,
    },
    {
      category: 'EQUIPMENT', billable: false, status: 'APPROVED',
      description: 'Replacement laptop charger',
      items: [{ description: 'USB-C 96W charger', quantity: 1, unitPrice: 79 }],
      submittedOn: -25, approvedOn: -24,
    },
  ]
  for (const [i, e] of expensePlan.entries()) {
    const c = forExpenses[i]
    if (!c) break
    const existing = await db.expense.findFirst({
      where: { sellContractId: c.id, description: e.description }, select: { id: true },
    })
    if (existing) continue
    const total = e.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0)
    const approver = await db.context.findFirst({
      where: { companyId: c.companyId, type: 'EMPLOYEE' },
      select: { personId: true }, orderBy: { grantedAt: 'asc' },
    })
    await db.expense.create({
      data: {
        companyId: c.companyId, sellContractId: c.id, personId: c.personId,
        category: e.category, billable: e.billable, description: e.description,
        periodStart: day(e.submittedOn - 7), periodEnd: day(e.submittedOn),
        items: e.items as never,
        total: Math.round(total * 100) / 100,
        status: e.status,
        submittedAt: day(e.submittedOn),
        approvedById: e.approvedOn == null ? null : approver?.personId ?? null,
        approvedAt: e.approvedOn == null ? null : day(e.approvedOn),
        createdAt: day(e.submittedOn),
      },
    })
    out.expenses++
  }

  // ── 9. The buy side, and the run that settles it ────────────────────
  //
  // Every prime and integrator in this world bought somebody from a bench
  // vendor, and only one of those legs had ever been billed. A supplier's
  // own AP book opened on one row, so nothing could be assembled into a
  // run — and a payment run is how AP actually pays, one batch on a day,
  // never a bill at a time.
  const legs = await db.buyContract.findMany({
    where: {
      state: 'IN_PROGRESS',
      vendorCompanyId: { not: null },
      company: { slug: { startsWith: ctx.prefix } },
      vendorCompany: { slug: { startsWith: ctx.prefix } },
    },
    select: {
      id: true, companyId: true, vendorCompanyId: true, workOrderId: true,
      candidates: { select: { payRate: true }, take: 1 },
    },
    orderBy: { id: 'asc' },
  })
  for (const [i, leg] of legs.entries()) {
    if (!leg.vendorCompanyId) continue
    const rate = leg.candidates[0]?.payRate ?? 0
    if (!rate) continue
    if (await db.vendorBill.findFirst({ where: { buyContractId: leg.id } })) continue
    const number = `INV-${leg.id.slice(-6).toUpperCase()}`
    if (await db.vendorBill.findFirst({
      where: { companyId: leg.companyId, vendorCompanyId: leg.vendorCompanyId, number },
    })) continue
    // Four weeks at the rate the leg below already says. Nothing invented.
    const cents = rate * 160
    await db.vendorBill.create({
      data: {
        companyId: leg.companyId, vendorCompanyId: leg.vendorCompanyId,
        number, buyContractId: leg.id, workOrderId: leg.workOrderId,
        periodStart: day(-32), periodEnd: day(-4),
        currency: 'USD', totalCents: cents,
        receivedAt: day(-5), dueAt: day(25),
        // Two out of three cleared by whoever checks them; the rest still
        // to be looked at, which is what an AP queue looks like on any
        // ordinary Tuesday.
        status: i % 3 === 2 ? 'RECEIVED' : 'APPROVED',
        createdAt: day(-5),
      },
    })
  }

  // The run itself, on the desk of the firm with the most to pay.
  const payers = await db.vendorBill.groupBy({
    by: ['companyId'],
    where: { status: 'APPROVED', paidAt: null },
    _count: { _all: true },
    orderBy: { _count: { companyId: 'desc' } },
    take: 1,
  })
  const payerId = payers[0]?.companyId
  if (payerId) {
    const bills = await db.vendorBill.findMany({
      where: { companyId: payerId, status: 'APPROVED', paidAt: null },
      select: { id: true, totalCents: true, number: true, vendorCompany: { select: { name: true } } },
      orderBy: { dueAt: 'asc' },
      take: 6,
    })
    const existing = await db.paymentRun.findFirst({
      where: { companyId: payerId, scheduledFor: day(3) }, select: { id: true },
    })
    if (!existing && bills.length > 0) {
      const seat = await db.context.findFirst({
        where: { companyId: payerId, type: 'EMPLOYEE' },
        select: { personId: true }, orderBy: { grantedAt: 'asc' },
      })
      const run = await db.paymentRun.create({
        data: {
          companyId: payerId, currency: 'USD', status: 'APPROVED',
          scheduledFor: day(3),
          totalCents: bills.reduce((s, b) => s + b.totalCents, 0),
          createdById: seat?.personId ?? null,
          approvedById: seat?.personId ?? null,
          createdAt: day(-1),
        },
        select: { id: true },
      })
      for (const b of bills) {
        await db.paymentRunItem.create({
          data: {
            runId: run.id, vendorBillId: b.id, amountCents: b.totalCents,
            // What the remittance advice says it covers. A supplier
            // reading a bank line with no reference has to ring somebody.
            remittance: `${b.number} — ${b.vendorCompany.name}`,
          },
        })
      }
    }
  }

  return out
}

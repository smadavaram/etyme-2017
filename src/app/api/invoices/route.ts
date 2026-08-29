import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { fromPrismaDecimal } from '@/lib/money'
import {
  ageBook, directionOf, BUCKETS,
  type ArInvoice, type Bucket, type Direction,
} from '@/lib/ar-ageing'

/**
 * GET /api/invoices
 *
 * BUILD.md §3: "aging buckets"
 *
 * Returns invoices with ageing classification:
 *   Current  — not yet due
 *   1–30     — 1 to 30 days past due
 *   31–60    — 31 to 60 days past due
 *   61–90    — 61 to 90 days past due
 *   90+      — more than 90 days past due
 *
 * LEGACY_RULES.md §4: Invoice states: DRAFT → ISSUED → SUBMITTED → PAID /
 * PARTIALLY_PAID / CANCELLED
 *
 * ── Three things the summary used to get wrong ───────────────────────
 *
 * The rows on this endpoint were always right. The summary block under
 * them was wrong in three ways at once, and all three had the same
 * shape: a figure that looks perfectly reasonable on screen.
 *
 * **It mixed receivables with payables.** The scope was "the agreement
 * mentions us anywhere", so a prime that both sells to a client and buys
 * from a sub had its own supplier bills summed into `totalOutstanding` —
 * the number the dashboard labels money owed. The bar went UP when the
 * firm owed MORE, and it read as good news. Direction is now decided per
 * invoice by `directionOf`, and the two sides are returned separately
 * with no total across them, because there is no arrangement of a
 * receivable and a payable that makes one figure mean anything.
 *
 * **It added currencies together.** `summary.totalOutstanding +=
 * outstanding` with no partition, so a dollar invoice and a rupee
 * invoice made a number in neither. Everything is now aged one book per
 * currency, by `ageBook`, which is the same code the AR screen uses.
 *
 * **It summed whole-currency Decimals** while every classified row in
 * the AR domain is in minor units, so two conventions met on one screen.
 * The whole response now speaks minor units and says so in `units`.
 *
 * The last one is worth a sentence on its own. `Invoice.total` and
 * `Invoice.paid` are Prisma Decimals in whole currency; `VendorBill`,
 * every rate column and every AR figure are integer minor units. The
 * conversion happens once, here at the edge, through
 * `fromPrismaDecimal` — which reads the exponent from the currency
 * rather than assuming a hundred, because yen has no minor unit and the
 * Kuwaiti dinar has three.
 */

/**
 * Nothing owed on these, and nothing to age.
 *
 * A draft is a working paper: nobody has been asked for the money, so it
 * is not a receivable and it is not a payable. It still appears as a ROW
 * — somebody has to finish it — but it is kept out of the totals, which
 * is what `/api/ar` already does. Two screens disagreeing about whether
 * a draft is owed is the same class of problem as two unit conventions.
 */
const NOT_COUNTABLE = ['DRAFT', 'CANCELLED', 'VOID']

const AGING_KEYS = ['current', '1-30', '31-60', '61-90', '90+'] as const
type AgingKey = (typeof AGING_KEYS)[number]

const BUCKET_TO_KEY: Record<Bucket, AgingKey> = {
  CURRENT: 'current',
  D1_30: '1-30',
  D31_60: '31-60',
  D61_90: '61-90',
  D90_PLUS: '90+',
}

interface CurrencySummary {
  currency: string
  /** Minor units. Never added to another currency's figure. */
  outstandingMinor: number
  /** Everything past due, which is the total less `current`. */
  overdueMinor: number
  buckets: Record<AgingKey, { count: number; minor: number }>
  invoiceCount: number
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'invoices.read')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Requires invoices.read permission' } },
      { status: 403 }
    )
  }

  const url = request.nextUrl
  const status = url.searchParams.get('status')
  const engagementId = url.searchParams.get('engagementId')
  const aging = url.searchParams.get('aging') // current | 1-30 | 31-60 | 61-90 | 90+
  const directionParam = (url.searchParams.get('direction') ?? '').toUpperCase()
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))

  const companyId = caller.company?.id ?? null

  const where: any = {}

  // Scope to caller's company through engagement → MSA → company chain.
  // This stays deliberately two-sided: a prime genuinely wants to see
  // both what it has billed and what it has been billed on one screen.
  // What it must never see is the two ADDED, which is what the summary
  // below now refuses to do.
  if (companyId) {
    where.engagement = {
      msa: {
        OR: [{ vendorId: companyId }, { clientId: companyId }],
      },
    }
  }

  if (status) where.status = status.toUpperCase()
  if (engagementId) where.engagementId = engagementId

  // Ageing bucket filter
  const now = new Date()
  if (aging) {
    switch (aging) {
      case 'current':
        where.dueAt = { gte: now }
        break
      case '1-30':
        where.dueAt = {
          lt: now,
          gte: new Date(now.getTime() - 30 * 86400000),
        }
        break
      case '31-60':
        where.dueAt = {
          lt: new Date(now.getTime() - 30 * 86400000),
          gte: new Date(now.getTime() - 60 * 86400000),
        }
        break
      case '61-90':
        where.dueAt = {
          lt: new Date(now.getTime() - 60 * 86400000),
          gte: new Date(now.getTime() - 90 * 86400000),
        }
        break
      case '90+':
        where.dueAt = { lt: new Date(now.getTime() - 90 * 86400000) }
        break
    }
  }

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        engagement: {
          select: {
            id: true,
            title: true,
            msa: {
              select: {
                vendorId: true,
                clientId: true,
                vendor: { select: { id: true, name: true } },
                client: { select: { id: true, name: true } },
              },
            },
          },
        },
        payments: {
          select: { id: true, amount: true, currency: true, receivedAt: true },
          orderBy: { receivedAt: 'desc' },
        },
      },
      orderBy: { dueAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.invoice.count({ where }),
  ])

  /**
   * Which way this invoice runs for the caller.
   *
   * With no company on the caller — a platform-level session — nothing
   * is ours to collect or to pay, so every row is NEITHER and the
   * summary comes back empty rather than guessing a side.
   */
  const sideOf = (inv: (typeof invoices)[number]): Direction =>
    companyId == null
      ? 'NEITHER'
      : directionOf(
          { vendorId: inv.engagement.msa.vendorId, clientId: inv.engagement.msa.clientId },
          companyId
        )

  // Classify ageing for each invoice
  const classified = invoices
    .map((inv) => {
      const dueDate = new Date(inv.dueAt)
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / 86400000)
      let agingBucket: AgingKey

      if (daysOverdue <= 0) agingBucket = 'current'
      else if (daysOverdue <= 30) agingBucket = '1-30'
      else if (daysOverdue <= 60) agingBucket = '31-60'
      else if (daysOverdue <= 90) agingBucket = '61-90'
      else agingBucket = '90+'

      const totalMinor = fromPrismaDecimal(inv.total, inv.currency).minor
      const paidMinor = fromPrismaDecimal(inv.paid, inv.currency).minor

      return {
        id: inv.id,
        number: inv.number,
        engagement: {
          id: inv.engagement.id,
          title: inv.engagement.title,
          vendorCompany: inv.engagement.msa.vendor,
          clientCompany: inv.engagement.msa.client,
        },
        /** RECEIVABLE — ours to collect. PAYABLE — ours to pay. */
        direction: sideOf(inv),
        periodStart: inv.periodStart.toISOString(),
        periodEnd: inv.periodEnd.toISOString(),
        /** The day it was actually billed. Null on rows raised before it was held. */
        issuedAt: inv.issuedAt ? inv.issuedAt.toISOString() : null,
        currency: inv.currency,
        totalMinor,
        paidMinor,
        outstandingMinor: totalMinor - paidMinor,
        dueAt: inv.dueAt.toISOString(),
        status: inv.status,
        aging: agingBucket,
        daysOverdue: Math.max(0, daysOverdue),
        payments: inv.payments.map((p) => ({
          id: p.id,
          amountMinor: fromPrismaDecimal(p.amount, p.currency ?? inv.currency).minor,
          currency: p.currency ?? inv.currency,
          receivedAt: p.receivedAt.toISOString(),
        })),
      }
    })
    .filter((row) => (directionParam === 'RECEIVABLE' || directionParam === 'PAYABLE'
      ? row.direction === directionParam
      : true))

  // ── The summary ─────────────────────────────────────────────────────
  //
  // Read over the whole book rather than the current page, and split
  // three ways before a single figure is added: by direction, then by
  // currency, then into buckets. Nothing crosses any of those lines.
  const allInvoices = await prisma.invoice.findMany({
    where: {
      ...where,
      dueAt: undefined, // remove the ageing filter for the summary
      status: { notIn: NOT_COUNTABLE },
    },
    select: {
      id: true,
      number: true,
      currency: true,
      total: true,
      paid: true,
      dueAt: true,
      status: true,
      engagement: { select: { msa: { select: { vendorId: true, clientId: true } } } },
    },
    take: 10_000,
  })

  const bySide: Record<'RECEIVABLE' | 'PAYABLE', ArInvoice[]> = {
    RECEIVABLE: [],
    PAYABLE: [],
  }
  let unattributed = 0

  for (const i of allInvoices) {
    const side =
      companyId == null
        ? 'NEITHER'
        : directionOf(
            { vendorId: i.engagement.msa.vendorId, clientId: i.engagement.msa.clientId },
            companyId
          )
    if (side === 'NEITHER') {
      unattributed += 1
      continue
    }
    bySide[side].push({
      id: i.id,
      number: i.number,
      currency: i.currency,
      totalMinor: fromPrismaDecimal(i.total, i.currency).minor,
      paidMinor: fromPrismaDecimal(i.paid, i.currency).minor,
      dueAt: i.dueAt,
      // The summary aggregates by direction and currency, not by
      // customer, so a single key is enough here.
      customerId: side,
      customerName: side,
      status: i.status,
    })
  }

  const summarise = (rows: ArInvoice[]): CurrencySummary[] =>
    ageBook(rows, now).byCurrency.map((cb) => {
      const buckets = Object.fromEntries(
        AGING_KEYS.map((k) => [k, { count: 0, minor: 0 }])
      ) as Record<AgingKey, { count: number; minor: number }>

      for (const b of BUCKETS) {
        buckets[BUCKET_TO_KEY[b]] = cb.buckets[b]
      }

      return {
        currency: cb.currency,
        outstandingMinor: cb.outstandingMinor,
        overdueMinor: cb.overdueMinor,
        buckets,
        invoiceCount: cb.invoices.length,
      }
    })

  const receivable = summarise(bySide.RECEIVABLE)
  const payable = summarise(bySide.PAYABLE)

  const gaps: string[] = []
  if (unattributed > 0) {
    gaps.push(
      `${unattributed} invoice${unattributed === 1 ? '' : 's'} in scope belong${
        unattributed === 1 ? 's' : ''
      } to two other companies and ${unattributed === 1 ? 'is' : 'are'} left out of both ` +
        `totals. That is a scoping problem upstream, not a figure to be shown on either side.`
    )
  }
  if (receivable.length > 1 || payable.length > 1) {
    gaps.push(
      'More than one currency is in play, so there is a book for each and no total across ' +
        'them. Dollars and rupees have no sum.'
    )
  }

  return NextResponse.json({
    data: {
      invoices: classified,
      summary: {
        /** Every amount in this response is in minor units — cents, pence. */
        units: 'MINOR',
        /** Ours to collect. */
        receivable,
        /** Ours to pay. Never added to the line above. */
        payable,
        unattributedCount: unattributed,
        gaps,
        says:
          'What we are owed and what we owe are shown apart and never summed. A prime that ' +
          'both sells and buys used to see its own supplier bills raise the bar labelled ' +
          'money owed to us.',
      },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  })
}

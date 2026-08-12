import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'

/**
 * GET /api/invoices
 *
 * BUILD.md §3: "aging buckets"
 *
 * Returns invoices with aging classification:
 *   Current  — not yet due
 *   1–30     — 1 to 30 days past due
 *   31–60    — 31 to 60 days past due
 *   61–90    — 61 to 90 days past due
 *   90+      — more than 90 days past due
 *
 * LEGACY_RULES.md §4: Invoice states: DRAFT → ISSUED → SUBMITTED → PAID / PARTIALLY_PAID / CANCELLED
 */
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
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))

  const where: any = {}

  // Scope to caller's company through engagement → MSA → company chain
  if (caller.company) {
    where.engagement = {
      msa: {
        OR: [
          { vendorId: caller.company.id },
          { clientId: caller.company.id },
        ],
      },
    }
  }

  if (status) where.status = status.toUpperCase()
  if (engagementId) where.engagementId = engagementId

  // Aging bucket filter
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
                vendor: { select: { id: true, name: true } },
                client: { select: { id: true, name: true } },
              },
            },
          },
        },
        payments: {
          select: { id: true, amount: true, receivedAt: true },
          orderBy: { receivedAt: 'desc' },
        },
      },
      orderBy: { dueAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.invoice.count({ where }),
  ])

  // Classify aging for each invoice
  const classified = invoices.map((inv) => {
    const dueDate = new Date(inv.dueAt)
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / 86400000)
    let agingBucket: string

    if (daysOverdue <= 0) agingBucket = 'current'
    else if (daysOverdue <= 30) agingBucket = '1-30'
    else if (daysOverdue <= 60) agingBucket = '31-60'
    else if (daysOverdue <= 90) agingBucket = '61-90'
    else agingBucket = '90+'

    return {
      id: inv.id,
      number: inv.number,
      engagement: {
        id: inv.engagement.id,
        title: inv.engagement.title,
        vendorCompany: inv.engagement.msa.vendor,
        clientCompany: inv.engagement.msa.client,
      },
      periodStart: inv.periodStart.toISOString(),
      periodEnd: inv.periodEnd.toISOString(),
      currency: inv.currency,
      total: Number(inv.total),
      paid: Number(inv.paid),
      outstanding: Number(inv.total) - Number(inv.paid),
      dueAt: inv.dueAt.toISOString(),
      status: inv.status,
      aging: agingBucket,
      daysOverdue: Math.max(0, daysOverdue),
      payments: inv.payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        receivedAt: p.receivedAt.toISOString(),
      })),
    }
  })

  // Aging summary for the full dataset (unfiltered by aging bucket)
  const allInvoices = await prisma.invoice.findMany({
    where: {
      ...where,
      dueAt: undefined, // remove aging filter for summary
      status: { not: 'CANCELLED' },
    },
    select: { total: true, paid: true, dueAt: true, status: true },
  })

  const summary = {
    totalOutstanding: 0,
    current: 0,
    '1-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
    invoiceCount: allInvoices.length,
  }

  for (const inv of allInvoices) {
    const outstanding = Number(inv.total) - Number(inv.paid)
    if (outstanding <= 0) continue
    summary.totalOutstanding += outstanding
    const daysOver = Math.floor((now.getTime() - inv.dueAt.getTime()) / 86400000)
    if (daysOver <= 0) summary.current += outstanding
    else if (daysOver <= 30) summary['1-30'] += outstanding
    else if (daysOver <= 60) summary['31-60'] += outstanding
    else if (daysOver <= 90) summary['61-90'] += outstanding
    else summary['90+'] += outstanding
  }

  return NextResponse.json({
    data: {
      invoices: classified,
      summary,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  })
}

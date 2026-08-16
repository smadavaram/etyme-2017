import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { expenseScope } from '@/lib/resolve-client-company'

/**
 * GET /api/expenses
 *
 * BUILD.md §6.3: "Client-billable expenses appear on invoices."
 *
 * LEGACY_RULES.md §4.4: Three bill types (salary_advanced, company_expense,
 * client_expense). ClientExpense lifecycle:
 *   pending_expense → not_submitted → submitted → approved → bill_generated →
 *   rejected / invoice_generated → paid
 *
 * Consolidated lifecycle:
 *   DRAFT → SUBMITTED → APPROVED → INVOICED → PAID  or  → REJECTED
 *
 * Expense categories: TRAVEL · EQUIPMENT · TRAINING · RELOCATION · MEALS · OTHER
 * Two kinds:
 *   - billable=true  → client-billable, linked to invoices
 *   - billable=false → internal company expense
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
  const billable = url.searchParams.get('billable') // 'true' | 'false'
  const category = url.searchParams.get('category')
  const sellContractId = url.searchParams.get('sellContractId')
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))

  // Scope to the caller's side: a vendor owns its expenses; a client sees
  // only the billable ones raised against work at their own sites.
  const scope = expenseScope(caller)
  if (!scope) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'No company context' } },
      { status: 403 }
    )
  }

  const where: any = { ...scope }

  if (status) where.status = status.toUpperCase()
  if (billable !== null && billable !== undefined && billable !== '') {
    where.billable = billable === 'true'
  }
  if (category) where.category = category.toUpperCase()
  if (sellContractId) where.sellContractId = sellContractId

  const [expenses, counts] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        person: { select: { id: true, name: true } },
        sellContract: {
          select: {
            id: true,
            billRate: true,
            clientCompany: { select: { id: true, name: true } },
            endClientCompany: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.expense.groupBy({
      by: ['status'],
      where: scope,
      _sum: { total: true },
      _count: true,
    }),
  ])

  // Build summary by status
  const summary: Record<string, { count: number; total: number }> = {}
  let grandTotal = 0
  let billableTotal = 0
  let internalTotal = 0

  for (const row of counts) {
    summary[row.status] = {
      count: row._count,
      total: Number(row._sum.total ?? 0),
    }
    grandTotal += Number(row._sum.total ?? 0)
  }

  // Calculate billable vs internal totals
  const [billableSums, internalSums] = await Promise.all([
    prisma.expense.aggregate({
      where: { ...scope, billable: true },
      _sum: { total: true },
      _count: true,
    }),
    prisma.expense.aggregate({
      where: { ...scope, billable: false },
      _sum: { total: true },
      _count: true,
    }),
  ])

  billableTotal = Number(billableSums._sum.total ?? 0)
  internalTotal = Number(internalSums._sum.total ?? 0)

  return NextResponse.json({
    data: {
      expenses: expenses.map((e) => ({
        id: e.id,
        person: e.person,
        client: e.sellContract.clientCompany,
        sellContractId: e.sellContractId,
        category: e.category,
        billable: e.billable,
        description: e.description,
        periodStart: e.periodStart.toISOString(),
        periodEnd: e.periodEnd.toISOString(),
        items: e.items,
        total: Number(e.total),
        receiptUrl: e.receiptUrl,
        status: e.status,
        submittedAt: e.submittedAt?.toISOString() ?? null,
        approvedAt: e.approvedAt?.toISOString() ?? null,
        rejectedReason: e.rejectedReason,
        createdAt: e.createdAt.toISOString(),
      })),
      summary,
      totals: {
        grand: grandTotal,
        billable: billableTotal,
        billableCount: billableSums._count,
        internal: internalTotal,
        internalCount: internalSums._count,
      },
    },
  })
}

/**
 * POST /api/expenses
 *
 * Create a new expense report. Consultants submit; managers approve.
 * Amount auto-calculated from items: sum(quantity × unitPrice).
 *
 * LEGACY_RULES.md §4.4: "Amount auto-calculated as sum(unit_price × quantity)."
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'invoices.read')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Requires invoices.read permission' } },
      { status: 403 }
    )
  }

  const body = await request.json()
  const {
    sellContractId,
    personId,
    category,
    billable = true,
    description,
    periodStart,
    periodEnd,
    items,
    receiptUrl,
  } = body

  // Validate required fields
  if (!sellContractId || !personId || !category || !description || !periodStart || !periodEnd) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Missing required fields: sellContractId, personId, category, description, periodStart, periodEnd' } },
      { status: 422 }
    )
  }

  // Validate items
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'At least one expense item is required' } },
      { status: 422 }
    )
  }

  // Validate each item
  for (const item of items) {
    if (!item.description || typeof item.quantity !== 'number' || typeof item.unitPrice !== 'number') {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Each item must have description, quantity (number), and unitPrice (number)' } },
        { status: 422 }
      )
    }
    if (item.quantity <= 0 || item.unitPrice < 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Item quantity must be positive and unitPrice must be non-negative' } },
        { status: 422 }
      )
    }
  }

  // Verify sell contract belongs to caller's company
  const sellContract = await prisma.sellContract.findFirst({
    where: {
      id: sellContractId,
      companyId: caller.company?.id,
    },
  })

  if (!sellContract) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Sell contract not found or does not belong to your company' } },
      { status: 404 }
    )
  }

  // Calculate total from items: sum(quantity × unitPrice)
  const total = items.reduce(
    (sum: number, item: { quantity: number; unitPrice: number }) =>
      sum + item.quantity * item.unitPrice,
    0
  )

  const expense = await prisma.expense.create({
    data: {
      companyId: caller.company!.id,
      sellContractId,
      personId,
      category: category.toUpperCase(),
      billable,
      description,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      items,
      total,
      receiptUrl: receiptUrl ?? null,
      status: 'DRAFT',
    },
  })

  return NextResponse.json(
    { data: { expense: { id: expense.id, status: expense.status, total: Number(expense.total) } } },
    { status: 201 }
  )
}

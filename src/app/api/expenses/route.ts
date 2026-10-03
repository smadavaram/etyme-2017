import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { expenseScope } from '@/lib/resolve-client-company'
import { endClientFilter } from '@/lib/resolve-end-client'
import { booksFor, noteMoneyRead, seatedRefusal } from '@/lib/money/seated-books'

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

  // ── Whose expenses ──────────────────────────────────────────────────
  //
  // Every other money page on this product follows the seat a client
  // granted a program office — invoices, purchase orders, accounts
  // payable, contracts — and this one resolved no seat at all. So an
  // office at Cavanaugh Glassworks' desk read Aptiva Workforce's own
  // (empty) expense book on a page whose every neighbour was showing
  // Cavanaugh's, with nothing on the screen to say which.
  //
  // Reads follow the seat. Writing does not: `POST` below still scopes
  // the sell contract to the caller's own company, and the picker on
  // the screen asks for that same book by name, so a control and its
  // route still agree. Whether a seated office should raise an expense
  // onto a client's book is a decision somebody has to make, and it is
  // not made by a read path drifting into a write path.
  let reading = null
  if (caller.company) {
    const whose = await booksFor(caller, request)
    if (whose.error) return whose.error
    reading = whose.books
  }

  const permissions = reading?.caller.permissions ?? caller.permissions
  if (!hasPermission(permissions, 'invoices.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: reading?.seat
            ? seatedRefusal(reading.seat, 'The expense book')
            : askTheDesk({
                doing: 'Reading expenses',
                needs: 'invoices.read',
                kind: caller.company?.kind,
                companyName: caller.company?.name,
              }),
        },
      },
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
  //
  // Seated, the scope is the client's own: the billable expenses raised
  // against work at that client's sites. That is exactly the branch
  // `expenseScope` takes for a client reading its own book, applied to
  // the company whose desk this reader is sitting at — a supplier's
  // internal costs stay with the supplier either way.
  const scope = reading?.seated
    ? { billable: true, sellContract: endClientFilter(reading.companyId) }
    : expenseScope(caller)
  if (!scope) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'No company context' } },
      { status: 403 }
    )
  }
  if (reading) noteMoneyRead(reading, 'Expense book read')

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
            // No `billRate` here, and that is the point.
            //
            // It was selected and never read — not by this response,
            // not by the screen, not by the actions route. A dead
            // select is harmless until the list it sits on is scoped by
            // the SITE the work happens at, which is how a client and
            // now a seat read this page: in a chain the row carries the
            // bottom rung's rate, which is the prime's whole margin by
            // subtraction. `rate-party.test.ts` scans for exactly that
            // shape, and the answer to it is to stop fetching the
            // number rather than to walk it up a chain nothing on this
            // page displays.
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
      // Whose book this is, in the shape every other money route already
      // returns it, so the page frames itself from the same block that
      // decided the rows.
      reading: reading
        ? { company: reading.companyName, inASeat: reading.seated, says: reading.says }
        : null,
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
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Raising an expense',
            needs: 'invoices.read',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
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

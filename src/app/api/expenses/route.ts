import { NextRequest, NextResponse } from 'next/server'
import { notAtACompany } from '@/app/api/people/not-at-a-company'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { isConsultantSeat } from '@/lib/seat'
import { rowFor, rungBilled, rungStatus, APPROVED_BY_EMPLOYER, type AcceptanceRow, type ExpenseBillLine, type ExpenseRow, type Leg } from '@/lib/money/expense-acceptance'
import { acceptancesOn, expenseOf, legsOverMany, linesBelowPaid, EXPENSE_SELECT } from '@/lib/money/expense-acceptance-read'
import { booksFor, noteMoneyRead, seatedRefusal, writingDesk } from '@/lib/money/seated-books'
import { mayFileOwnExpense } from '@/lib/money/own-expense'

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
  // Reads follow the seat, and since 2026-10-06 so do writes (`POST`
  // below and /api/expenses/actions, through `writingDesk`): a write
  // lands in the book the screen was reading, judged by the role it was
  // read under. The raise form picks from the office's own contracts and
  // says so with `?books=own`.
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

  // ── Whose rows ──────────────────────────────────────────────────────
  //
  // A consultant reads their own. A firm reads the expenses it raised —
  // its own workers' — and, since the founder's decision of 2026-10-19
  // that an expense is accepted like a week, the ones it pays for: raised
  // on a line below a line it pays, once the employer has approved them.
  // That is how a middle firm sees its supplier's expenses, and how a
  // client sees every supplier's at its sites.
  //
  // Which of those a payer may read, and what the row says, is
  // `rowFor` in lib/money/expense-acceptance: billable is the agreement
  // between each pair where it says, never the supplier's own flag; a
  // supplier's own cost under an agreement that did not say stays the
  // supplier's; and no row names a firm below the reader's own supplier.
  // So `client` is no longer the line's own customer, which on a deep
  // chain was a firm the reader had no business knowing.
  const consultant = isConsultantSeat(caller)
  if (!consultant && !caller.company) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: notAtACompany('The expense book') } },
      { status: 403 }
    )
  }
  if (reading) noteMoneyRead(reading, 'Expense book read')

  const readerId = reading?.companyId ?? caller.company?.id ?? ''
  const readerName = reading?.companyName ?? caller.company?.name ?? ''
  const narrow: Record<string, unknown> = {}
  if (status) narrow.status = status.toUpperCase()
  if (category) narrow.category = category.toUpperCase()
  if (sellContractId) narrow.sellContractId = sellContractId

  const SELECT = {
    ...EXPENSE_SELECT,
    description: true, periodEnd: true, items: true, receiptUrl: true,
    submittedAt: true, approvedAt: true, rejectedReason: true, createdAt: true,
  } as const

  // A ceiling, said rather than hidden: past it the totals are not
  // offered, because a total over part of a book is a number nobody can
  // stand behind.
  const CEILING = 2000
  let rows: any[]
  if (consultant) {
    rows = await prisma.expense.findMany({
      where: { personId: caller.person.id, ...narrow }, select: SELECT, orderBy: { createdAt: 'desc' }, take: CEILING + 1,
    })
  } else {
    // What this firm pays: the client's own scope under a seat, its own otherwise.
    const paidWhere = reading?.seated && reading.sellContractWhere ? reading.sellContractWhere : { clientCompanyId: readerId }
    const lines = await linesBelowPaid(paidWhere)
    const approved = [...APPROVED_BY_EMPLOYER] as string[]
    // Every approved status, whatever was asked: the status a payer reads
    // is its own rung's, worked out below from its own bills, and the
    // column is the employer's (coordinator's decision, 2026-10-19). The
    // filter asked for is applied to the rung's status after.
    const statusIn = status && !approved.includes(status.toUpperCase()) ? [] : approved
    const { status: _employersColumn, ...paidNarrow } = narrow
    const [ownRows, paidRows] = await Promise.all([
      // Under a seat the book is the client's, and a client raises no expenses.
      reading?.seated
        ? Promise.resolve([] as any[])
        : prisma.expense.findMany({
            where: { companyId: readerId, ...narrow }, select: SELECT, orderBy: { createdAt: 'desc' }, take: CEILING + 1,
          }),
      lines.size === 0 || statusIn.length === 0
        ? Promise.resolve([] as any[])
        : prisma.expense.findMany({
            where: {
              ...paidNarrow,
              sellContractId: sellContractId
                ? (lines.has(sellContractId) ? sellContractId : '__none__')
                : { in: [...lines] },
              companyId: { not: readerId },
              status: { in: statusIn as any },
            },
            select: SELECT, orderBy: { createdAt: 'desc' }, take: CEILING + 1,
          }),
    ])
    rows = [...ownRows, ...paidRows]
  }
  const truncated = rows.length > CEILING

  const [legs, decisions, bills] = consultant
    ? [new Map<string, Leg[]>(), new Map<string, AcceptanceRow[]>(), new Map<string, ExpenseBillLine[]>()]
    : await Promise.all([
        legsOverMany(rows.map((r) => r.sellContractId)),
        acceptancesOn(rows.map((r) => r.id)),
        billsAtRung(readerId, rows.map((r) => r.id)),
      ])

  const shaped = rows
    .map((r) => {
      const view: ExpenseRow | null = consultant
        ? null
        : rowFor({
            expense: expenseOf(r), legsTopFirst: legs.get(r.sellContractId) ?? [], acceptances: decisions.get(r.id) ?? [],
            reader: { id: readerId, name: readerName }, personId: caller.person.id,
            billed: rungBilled(readerId, bills.get(r.id) ?? []),
          })
      // Billed and paid are the reader's own rung's. The column is the
      // employer's, so a firm above it reads its own bills instead.
      const rung = consultant || r.companyId === readerId ? r.status : rungStatus(rungBilled(readerId, bills.get(r.id) ?? []))
      return { r, view, rung }
    })
    .filter(({ view }) => consultant || view!.visible)
    .filter(({ r, rung }) => !status || r.companyId === readerId || consultant || rung === status.toUpperCase())
    .map(({ r, view, rung }) => ({
      id: r.id,
      person: { id: r.personId, name: r.person.name },
      // The one firm on the row: whom the employer bills, or whom a payer
      // is billed by — its own supplier. Never a firm below that.
      client: view?.counterparty ? { id: null, name: view.counterparty.name, role: view.counterparty.role } : null,
      sellContractId: r.sellContractId,
      category: r.category,
      // Billed to this reader, or by this reader upward, under the
      // agreement each pair signed. A consultant reads the employer's flag.
      billable: view ? view.billable : r.billable,
      description: r.description,
      periodStart: r.periodStart.toISOString(),
      periodEnd: r.periodEnd.toISOString(),
      items: r.items,
      total: Number(r.total),
      currency: (r.sellContract.billCurrency ?? 'USD').toUpperCase(),
      receiptUrl: r.receiptUrl,
      status: rung,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      rejectedReason: r.rejectedReason,
      createdAt: r.createdAt.toISOString(),
      own: consultant || r.companyId === readerId,
      chain: view
        ? { state: view.state, line: view.line, upToCents: view.upToCents, notBillableSays: view.notBillableSays }
        : null,
    }))
    .filter((e) => billable == null || billable === '' || e.billable === (billable === 'true'))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))

  // Summed in whole currency, the unit `Expense.total` is kept in, over
  // every row the reader may see — not only the page it was handed.
  const summary: Record<string, { count: number; total: number }> = {}
  let grand = 0, billableTotal = 0, internalTotal = 0, billableCount = 0, internalCount = 0
  const currencies = new Set(shaped.map((e) => e.currency))
  for (const e of shaped) {
    summary[e.status] ??= { count: 0, total: 0 }
    summary[e.status].count++
    summary[e.status].total += e.total
    grand += e.total
    if (e.billable) { billableTotal += e.total; billableCount++ } else { internalTotal += e.total; internalCount++ }
  }
  // Rupees and dollars are never added, and a total over part of a book is not a total.
  const totalsSay =
    truncated ? `More than ${CEILING.toLocaleString('en-US')} expenses match. Narrow the list by status to read its totals.`
    : currencies.size > 1 ? 'These expenses are in more than one currency, so they are not added together.'
    : null
  const round = (n: number) => Math.round(n * 100) / 100

  return NextResponse.json({
    data: {
      expenses: shaped.slice(0, limit),
      summary: totalsSay ? null : summary,
      totals: totalsSay
        ? null
        : {
            grand: round(grand),
            billable: round(billableTotal),
            billableCount,
            internal: round(internalTotal),
            internalCount,
            currency: [...currencies][0] ?? 'USD',
          },
      totalsSay,
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
 * The bills each expense is on at the reader's own rung: lines the reader
 * issued, and lines issued to it. Scoped in the query, so a bill between
 * two firms below the reader is never read at all.
 */
async function billsAtRung(readerId: string, expenseIds: string[]): Promise<Map<string, ExpenseBillLine[]>> {
  const out = new Map<string, ExpenseBillLine[]>()
  if (!readerId || expenseIds.length === 0) return out
  const lines = await prisma.invoiceLine.findMany({
    where: {
      expenseId: { in: expenseIds },
      sellContract: { OR: [{ companyId: readerId }, { clientCompanyId: readerId }] },
      invoice: { status: { notIn: ['VOID', 'CANCELLED'] } },
    },
    select: {
      expenseId: true,
      invoice: { select: { number: true, status: true } },
      sellContract: { select: { companyId: true, clientCompanyId: true, clientCompany: { select: { name: true } } } },
    },
  })
  for (const l of lines) {
    if (!l.expenseId || !l.sellContract) continue
    const list = out.get(l.expenseId) ?? []
    list.push({
      sellerId: l.sellContract.companyId, payerId: l.sellContract.clientCompanyId,
      payerName: l.sellContract.clientCompany.name, number: l.invoice.number, status: l.invoice.status,
    })
    out.set(l.expenseId, list)
  }
  return out
}

/**
 * POST /api/expenses
 *
 * Create a new expense report. Two doors, one rule each:
 *
 * - **The worker's own** (2026-10-20): a worker files their own expense,
 *   on their own placement, in their own name, on the rung their employer
 *   holds (`mayFileOwnExpense` in lib/money/own-expense). It lands
 *   SUBMITTED, waiting on the employer's approval. Nobody files one in
 *   their name through this door.
 * - **The firm's**: a seat that reads invoices raises an expense on one of
 *   its own placements, for the person on that placement, from their
 *   receipt. It lands as a DRAFT the firm submits.
 *
 * Amount auto-calculated from items: sum(quantity × unitPrice).
 *
 * LEGACY_RULES.md §4.4: "Amount auto-calculated as sum(unit_price × quantity)."
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
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
  } = body ?? {}

  // ── The worker's own door ───────────────────────────────────────────
  //
  // Read first, because a worker holds no seat that reads invoices and the
  // firm's door would refuse them for it. A line that names the caller is
  // the caller's own placement, whatever else their seat holds.
  const line = typeof sellContractId === 'string' && sellContractId
    ? await prisma.sellContract.findUnique({
        where: { id: sellContractId },
        select: { id: true, personId: true, companyId: true, clientCompanyId: true, state: true, company: { select: { name: true } } },
      })
    : null
  const deskHolds = caller.company ? (await writingDesk(caller, request)) : null
  const firmMay = Boolean(deskHolds && hasPermission(deskHolds.permissions, 'invoices.read'))
  const ownLine = Boolean(line && line.personId === caller.person.id)

  if (ownLine || (!firmMay && isConsultantSeat(caller))) {
    const rungs = line
      ? await prisma.sellContract.findMany({
          where: { personId: line.personId },
          select: { id: true, personId: true, companyId: true, clientCompanyId: true, state: true, company: { select: { name: true } } },
        })
      : []
    const asRung = (r: NonNullable<typeof line>) => ({ ...r, companyName: r.company.name })
    const verdict = mayFileOwnExpense({
      callerPersonId: caller.person.id,
      askedPersonId: typeof personId === 'string' ? personId : null,
      line: line ? asRung(line) : null,
      rungs: rungs.map(asRung),
    })
    if (!verdict.ok) {
      return NextResponse.json({ error: { code: verdict.code, message: verdict.says } }, { status: verdict.status })
    }
    const invalid = refusedFields({ sellContractId, personId: caller.person.id, category, description, periodStart, periodEnd, items })
    if (invalid) return invalid
    const expense = await prisma.expense.create({
      data: {
        // The firm whose contract bills it: the worker's employer, which
        // approves it before any firm above accepts it.
        companyId: line!.companyId,
        sellContractId: line!.id,
        personId: caller.person.id,
        category: String(category).toUpperCase(),
        billable,
        description,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        items,
        total: totalOf(items),
        receiptUrl: receiptUrl ?? null,
        // Filed by the person who spent it: that is the submission.
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    })
    return NextResponse.json(
      {
        data: {
          expense: { id: expense.id, status: expense.status, total: Number(expense.total) },
          message: `Filed. ${line!.company.name} approves it before it is paid back to you.`,
        },
      },
      { status: 201 }
    )
  }

  // ── The firm's door ─────────────────────────────────────────────────
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'An expense is raised by a company' } },
      { status: 403 }
    )
  }

  // The book the write lands in, and the role it is judged by: the
  // client's under a seat, the caller's own otherwise or with
  // `?books=own`. It was always the caller's own, under the caller's own
  // role, whatever book the screen was showing.
  const desk = deskHolds!
  if (!firmMay) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: desk.seat
            ? seatedRefusal(desk.seat, 'Raising an expense')
            : askTheDesk({
                doing: 'Raising an expense',
                needs: 'invoices.read',
                kind: caller.company.kind,
                companyName: caller.company.name,
              }),
        },
      },
      { status: 403 }
    )
  }

  const invalid = refusedFields({ sellContractId, personId, category, description, periodStart, periodEnd, items })
  if (invalid) return invalid

  // The sell contract must be the desk's own: an expense is raised by the
  // firm whose contract bills it.
  const sellContract = await prisma.sellContract.findFirst({
    where: {
      id: sellContractId,
      companyId: desk.companyId,
    },
  })

  if (!sellContract) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: desk.seat
            // A client bills nobody, so its book holds no contract an
            // expense could ride on — refused in words rather than as a
            // missing contract.
            ? `An expense is raised by the supplier whose contract bills it, and ` +
              `${desk.companyName}'s book holds no such contract. Raise your own firm's ` +
              `expense from your own books.`
            : 'Sell contract not found or does not belong to your company',
        },
      },
      { status: 404 }
    )
  }

  // The expense is the placement's person's: raised from their receipt,
  // in their name, and never in somebody else's on their line.
  if (personId !== sellContract.personId) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_THIS_PERSON',
          message: 'An expense on a placement is the expense of the person on it. Raise it on their own placement, in their name.',
          field: 'personId',
        },
      },
      { status: 422 }
    )
  }

  const expense = await prisma.expense.create({
    data: {
      companyId: desk.companyId,
      sellContractId,
      personId,
      category: category.toUpperCase(),
      billable,
      description,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      items,
      total: totalOf(items),
      receiptUrl: receiptUrl ?? null,
      status: 'DRAFT',
    },
  })

  return NextResponse.json(
    { data: { expense: { id: expense.id, status: expense.status, total: Number(expense.total) } } },
    { status: 201 }
  )
}

/** The fields an expense needs, refused in a sentence where one is missing or wrong. */
function refusedFields(f: {
  sellContractId: unknown; personId: unknown; category: unknown; description: unknown
  periodStart: unknown; periodEnd: unknown; items: unknown
}): NextResponse | null {
  if (!f.sellContractId || !f.personId || !f.category || !f.description || !f.periodStart || !f.periodEnd) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Missing required fields: sellContractId, personId, category, description, periodStart, periodEnd' } },
      { status: 422 }
    )
  }
  if (!Array.isArray(f.items) || f.items.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'At least one expense item is required' } },
      { status: 422 }
    )
  }
  for (const item of f.items) {
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
  return null
}

/** sum(quantity × unitPrice), in whole currency: `Expense.total` is a Decimal. */
function totalOf(items: Array<{ quantity: number; unitPrice: number }>): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
}

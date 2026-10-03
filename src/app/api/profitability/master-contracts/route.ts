import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { nextMasterContractCode } from '@/lib/money/master-contract'
import { MASTER_CONTRACT_WORD } from '@/lib/order-naming'

/**
 * GET  /api/profitability/master-contracts — the company's own roll-ups.
 * POST /api/profitability/master-contracts — open one, by name.
 *
 * The founder, 2026-09-18: *"letting companies tag them to master
 * contract if they want to see contract profitability."* Before this
 * there was nothing to tag a line TO except the buckets `orderFor`
 * opened by itself, which is the system deciding the grouping — the
 * exact thing the correction was about.
 *
 * ── Who may read it, and what they read ──────────────────────────────
 *
 * The NAME of a deal is not a margin. Anybody who may read a contract
 * may see which master contract it is on, or they could not be told what
 * the tag on their own screen means. The BUDGET is money, and comes back
 * only for a seat that may read margin — the same line `/api/profitability`
 * draws, drawn once more here rather than assumed.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, `${MASTER_CONTRACT_WORD.Noun}s`)
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_COMPANY',
          message: `A ${MASTER_CONTRACT_WORD.noun} groups one company's own lines, and your seat is not at one.`,
        },
      },
      { status: 403 }
    )
  }

  if (!hasPermission(caller.permissions, 'assignments.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            `Seeing which ${MASTER_CONTRACT_WORD.noun} a placement is on needs the ` +
            `assignments.read permission.`,
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const mayReadMoney =
    hasPermission(caller.permissions, 'margin.read') || hasPermission(caller.permissions, 'pnl.read')

  const rows = await prisma.projectOrder.findMany({
    where: { companyId, isOverheadPool: false },
    select: {
      id: true, code: true, name: true, status: true, currency: true,
      budgetCents: true, kind: true, opensAt: true, closesAt: true,
      clientCompany: { select: { id: true, name: true } },
      engagement: { select: { id: true, title: true } },
      _count: { select: { sellContracts: true, buyContracts: true } },
    },
    orderBy: [{ status: 'asc' }, { code: 'asc' }],
    take: 500,
  })

  return NextResponse.json({
    data: {
      masterContracts: rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        status: r.status,
        currency: r.currency,
        kind: r.kind,
        client: r.clientCompany,
        engagement: r.engagement,
        /** Null for a seat that may not read money. Never zero. */
        budgetCents: mayReadMoney ? r.budgetCents : null,
        budgetHidden: !mayReadMoney && r.budgetCents != null,
        lines: r._count.sellContracts + r._count.buyContracts,
        /** Only an open one takes another line. */
        open: r.status === 'OPEN',
      })),
      // What the next one would be called, so the form does not ask
      // somebody to invent a numbering scheme.
      nextCode: nextMasterContractCode(rows.map((r) => r.code)),
      mayOpen: hasPermission(caller.permissions, 'assignments.write'),
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, `${MASTER_CONTRACT_WORD.Noun}s`)
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_COMPANY',
          message: `A ${MASTER_CONTRACT_WORD.noun} groups one company's own lines, and your seat is not at one.`,
        },
      },
      { status: 403 }
    )
  }

  if (!hasPermission(caller.permissions, 'assignments.write')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            `Opening a ${MASTER_CONTRACT_WORD.noun} needs the assignments.write permission. ` +
            `Ask whoever runs your company's access.`,
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const body = await request.json().catch(() => ({}) as Record<string, unknown>)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const currency = typeof body.currency === 'string' && body.currency ? body.currency.toUpperCase() : 'USD'
  const budget = body.budgetCents

  if (!name) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          field: 'name',
          message: `Name it after the work — "Northbend platform rebuild", not "${MASTER_CONTRACT_WORD.noun} 2".`,
        },
      },
      { status: 422 }
    )
  }

  if (budget != null && (typeof budget !== 'number' || !Number.isFinite(budget) || budget < 0)) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          field: 'budgetCents',
          message: 'A budget is whole cents, or nothing at all. A deal with no budget is ordinary.',
        },
      },
      { status: 422 }
    )
  }

  const existing = await prisma.projectOrder.findMany({
    where: { companyId },
    select: { code: true },
  })

  const requested = typeof body.code === 'string' && body.code.trim() ? body.code.trim().toUpperCase() : null
  if (requested && existing.some((e) => e.code.toUpperCase() === requested)) {
    return NextResponse.json(
      {
        error: {
          code: 'CODE_TAKEN',
          field: 'code',
          message:
            `${requested} is already one of yours. A code is stable for the life of the work and ` +
            `appears on every export, so it is never reused.`,
        },
      },
      { status: 409 }
    )
  }

  const code = requested ?? nextMasterContractCode(existing.map((e) => e.code))

  const created = await prisma.projectOrder.create({
    data: {
      companyId,
      code,
      name,
      currency,
      budgetCents: typeof budget === 'number' ? Math.round(budget) : null,
      // Deliberately not tied to a client or an engagement here. A
      // company opening one by hand is grouping lines its own way, and
      // guessing the client from the first line it happens to be given
      // would put a name on a deal nobody chose.
      status: 'OPEN',
      opensAt: new Date(),
    },
    select: { id: true, code: true, name: true, currency: true, status: true },
  })

  return NextResponse.json(
    {
      data: {
        masterContract: created,
        message:
          `${MASTER_CONTRACT_WORD.Noun} ${created.code} — ${created.name} is open. ` +
          `Tag the lines that belong to it and its margin reads on the profitability screen.`,
      },
    },
    { status: 201 }
  )
}

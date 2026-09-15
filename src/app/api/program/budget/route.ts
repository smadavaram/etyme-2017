import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { resolveClientCompany } from '@/lib/resolve-client-company'
import { ledgerFor, type AcceptedExpense, type AcceptedWork, type ContractFact } from '@/lib/budget-ledger'
import { policyOf, splitWeeks } from '@/lib/overtime'

/**
 * GET   /api/program/budget   — every cost center, what it has committed and spent
 * POST  /api/program/budget   — set the budget for a period
 *
 * The client's side of the money, which is not the supplier's side
 * turned around: there is no bill here and no margin. A cost center was
 * given an amount, contracts commit against it, accepted work consumes
 * the commitment, and what is left is the answer to the only question
 * this screen exists for — can I afford the next one.
 *
 * The arithmetic is all in `lib/budget-ledger`, on SAP's terms. This
 * route's whole job is gathering honest facts to hand it.
 */

/** The period a budget is set for. A calendar year, which is what a plan is. */
const periodOf = (d: Date) => String(d.getUTCFullYear())

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'The budget')
  if (notStaff) return notStaff

  // A client reads its own budget. A supplier has no business here at
  // all — this is the buying company's plan, not a number about them.
  const { client, error: clientError } = await resolveClientCompany(caller, null)
  if (clientError) return clientError

  const now = new Date()
  const period = periodOf(now)

  const centers = await prisma.costCenter.findMany({
    where: { companyId: client.id, isActive: true },
    orderBy: { code: 'asc' },
    select: {
      id: true, code: true, name: true,
      owner: { select: { id: true, name: true } },
      orgUnit: { select: { name: true } },
      headcountPlans: { where: { period }, select: { annualBudget: true, approvedHeads: true, currency: true } },
      allocations: {
        select: {
          shareBps: true,
          sellContract: {
            select: {
              id: true, state: true, billRate: true, startDate: true, endDate: true,
              person: { select: { name: true } },
              company: { select: { name: true } },
              requirement: { select: { hoursPerWeek: true } },
            },
          },
        },
      },
    },
  })

  const contractIds = centers.flatMap((c) => c.allocations.map((a) => a.sellContract.id))

  // Accepted work and accepted expenses — the cost is incurred when the
  // client signs for it, so the gate is the client's signature, not the
  // invoice and not the payment.
  const [sheets, expenses] = contractIds.length
    ? await Promise.all([
        prisma.timesheet.findMany({
          where: { sellContractId: { in: contractIds }, clientApprovedAt: { not: null } },
          select: {
            id: true, sellContractId: true, totalHours: true, acceptedHours: true,
            days: true, leaveDays: true,
            invoiceLines: { select: { invoice: { select: { status: true } } } },
            sellContract: { select: { overtimeAfterHours: true, overtimeMultiplierBps: true } },
            // What somebody decided about each overtime week on this
            // leg. Without it the multiplier on the contract would be
            // charged to a cost center that never agreed to it, which
            // is the whole reason overtime became a decision.
            overtimeDecisions: {
              select: { weekOf: true, treatment: true, appliedBps: true, overtimeHours: true },
            },
          },
        }),
        prisma.expense.findMany({
          where: { sellContractId: { in: contractIds }, billable: true, status: { in: ['APPROVED', 'INVOICED', 'PAID'] } },
          select: {
            id: true, sellContractId: true, total: true, status: true,
            invoiceLines: { select: { invoice: { select: { status: true } } } },
          },
        }),
      ])
    : [[], []]

  /** Billed, and settled — read off the invoice the line sits on. */
  const cash = (lines: { invoice: { status: string } }[]) => ({
    invoiced: lines.length > 0,
    paid: lines.some((l) => l.invoice.status === 'PAID'),
  })

  const work: AcceptedWork[] = sheets.flatMap((t) => {
    const policy = policyOf(t.sellContract)
    // The overtime split is a weekly judgment on the daily hours, and
    // it is made in one place for the invoice and for this. Leave drawn
    // from the bank is paid but not worked, so it never counts toward
    // the threshold.
    const split = splitWeeks((t.days as Record<string, number>) ?? {}, policy, {
      leaveDays: (t.leaveDays as Record<string, number>) ?? {},
      decisions: t.overtimeDecisions.map((d) => ({
        weekOf: d.weekOf.toISOString().slice(0, 10),
        treatment: d.treatment as 'SAME_RATE' | 'PREMIUM' | 'TIME_OFF',
        appliedBps: d.appliedBps,
        overtimeHours: Number(d.overtimeHours),
      })),
    })
    const settled = cash(t.invoiceLines)

    // ── One row per price, not one row per sheet ──────────────────────
    //
    // A semi-monthly sheet can hold two overtime weeks answered
    // differently — one at the usual rate, one at double time. A single
    // multiplier per sheet cannot say that, so each price gets its own
    // row against the same contract and the ledger adds them up.
    const byBps = new Map<number, number>()
    for (const w of split.weeks) {
      if (w.overtimeHours <= 0 || w.appliedBps == null) continue
      byBps.set(w.appliedBps, (byBps.get(w.appliedBps) ?? 0) + w.overtimeHours)
    }

    // Fewer hours accepted than submitted is the accepted figure, never
    // the submitted one: the client is charged for what it signed for.
    // The cut comes off the ordinary hours — an hour somebody struck
    // out is not the hour a decision was made about.
    const accepted = t.acceptedHours == null ? null : Number(t.acceptedHours)
    const decidedOt = [...byBps.values()].reduce((n, h) => n + h, 0)
    const plain =
      accepted == null
        ? split.regularHours + split.leaveHours
        : Math.max(0, accepted - decidedOt)

    const rows: AcceptedWork[] = [
      {
        contractId: t.sellContractId,
        hours: plain,
        overtimeHours: 0,
        pendingOvertimeHours: split.pendingHours,
        ...settled,
      },
    ]
    for (const [appliedBps, hours] of byBps) {
      rows.push({
        contractId: t.sellContractId,
        hours,
        overtimeHours: hours,
        overtimeAppliedBps: appliedBps,
        ...settled,
      })
    }
    return rows
  })
  const spend: AcceptedExpense[] = expenses.map((e) => ({
    contractId: e.sellContractId,
    amountCents: Math.round(Number(e.total) * 100),
    ...cash(e.invoiceLines),
  }))

  const LIVE = ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION']
  const rows = centers.map((c) => {
    const plan = c.headcountPlans[0]
    const contracts: ContractFact[] = c.allocations.map((a) => ({
      id: a.sellContract.id,
      personName: a.sellContract.person?.name ?? 'somebody',
      supplierName: a.sellContract.company?.name ?? 'a supplier',
      billRateCents: a.sellContract.billRate,
      hoursPerWeek: a.sellContract.requirement?.hoursPerWeek ?? null,
      startDate: a.sellContract.startDate,
      endDate: a.sellContract.endDate,
      live: LIVE.includes(a.sellContract.state),
      shareBps: a.shareBps,
    }))
    const mine = new Set(contracts.map((x) => x.id))
    const ledger = ledgerFor({
      budgetCents: plan ? Math.round(Number(plan.annualBudget) * 100) : null,
      contracts,
      work: work.filter((w) => mine.has(w.contractId)),
      expenses: spend.filter((e) => mine.has(e.contractId)),
      on: now,
    })
    return {
      costCenterId: c.id, code: c.code, name: c.name,
      unit: c.orgUnit?.name ?? null,
      owner: c.owner?.name ?? null,
      ownerId: c.owner?.id ?? null,
      period,
      approvedHeads: plan?.approvedHeads ?? null,
      currency: plan?.currency ?? 'USD',
      ...ledger,
    }
  })

  const total = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + pick(r), 0)
  const budgeted = rows.filter((r) => r.budgetCents != null)

  return NextResponse.json({
    data: {
      period,
      centers: rows,
      // Whoever may type a number in. The program office sets budgets
      // across the program; a lead sets their own, and the screen asks
      // per row rather than hiding the control on all of them.
      mayBudgetAnywhere: hasPermission(caller.permissions, 'governance.write'),
      me: caller.person.id,
      summary: {
        budgetCents: budgeted.length ? budgeted.reduce((n, r) => n + (r.budgetCents ?? 0), 0) : null,
        committedCents: total((r) => r.committedCents),
        actualCents: total((r) => r.actualCents),
        toPayCents: total((r) => r.toPayCents),
        paidCents: total((r) => r.paidCents),
        withoutBudget: rows.length - budgeted.length,
      },
    },
  })
}

/**
 * POST — the budget for a period.
 *
 * Nobody could enter one at all before this: the model was there and
 * only the world seed ever wrote a row, so every budget figure on every
 * screen came from seed data. A plan that cannot be typed in is not a
 * plan.
 *
 * Who: the program office anywhere, and a cost center's named owner on
 * their own. Decided directly — a lead who owns the budget should not
 * have to ask somebody else to record their own number.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Setting a budget')
  if (notStaff) return notStaff
  const { client, error: clientError } = await resolveClientCompany(caller, null)
  if (clientError) return clientError

  const body = await request.json().catch(() => ({}))
  const costCenterId = String(body?.costCenterId ?? '')
  const period = String(body?.period ?? periodOf(new Date())).trim()
  const annualBudget = Number(body?.annualBudget)
  const approvedHeads = Number.isInteger(body?.approvedHeads) ? Number(body.approvedHeads) : null

  const center = await prisma.costCenter.findFirst({
    where: { id: costCenterId, companyId: client.id },
    select: { id: true, code: true, name: true, ownerId: true },
  })
  if (!center) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That cost center is not yours.' } }, { status: 404 })
  }

  const mine = center.ownerId === caller.person.id
  if (!mine && !hasPermission(caller.permissions, 'governance.write')) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_YOURS',
          message:
            `${center.code} belongs to somebody else's desk. Its owner can set its budget, ` +
            'and so can the program office — ask whichever of those you are nearer.',
        },
      },
      { status: 403 }
    )
  }
  if (!Number.isFinite(annualBudget) || annualBudget <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'How much is this cost center approved to spend this period?', field: 'annualBudget' } },
      { status: 422 }
    )
  }
  if (!/^\d{4}(-Q[1-4])?$/.test(period)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A period is a year like 2026, or a quarter like 2026-Q3.', field: 'period' } },
      { status: 422 }
    )
  }

  const plan = await prisma.headcountPlan.upsert({
    where: { costCenterId_period: { costCenterId: center.id, period } },
    create: {
      costCenterId: center.id, period, annualBudget,
      approvedHeads: approvedHeads ?? 0, currency: 'USD',
    },
    update: {
      annualBudget,
      ...(approvedHeads == null ? {} : { approvedHeads }),
    },
  })

  return NextResponse.json({
    data: {
      plan: { period: plan.period, annualBudget: Number(plan.annualBudget), approvedHeads: plan.approvedHeads },
      says:
        `${center.code} is set to $${Math.round(Number(plan.annualBudget)).toLocaleString('en-US')} for ${period}. ` +
        'What is committed and what has been accepted now read against it.',
    },
  })
}

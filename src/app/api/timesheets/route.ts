import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { sellContractScope } from '@/lib/resolve-client-company'
import { mayEnter } from '@/lib/timesheet-authority'
import {
  policyOf, splitWeeks, valueOf, weeksAwaitingDecision, saysAwaiting, treatmentSays,
  type Decision, type Treatment,
} from '@/lib/overtime'

/**
 * GET /api/timesheets
 *
 * Timesheets live on the sell side — they track billable hours
 * against a SellContract.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl
  const status = url.searchParams.get('status')
  const sellContractId = url.searchParams.get('sellContractId')
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))

  // A client approves hours worked at their sites; a vendor sees the hours
  // they bill. Both read the same table through their own side of it.
  const scope = sellContractScope(caller)
  if (!scope) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'No company context' } },
      { status: 403 }
    )
  }

  const where: any = { sellContract: scope }
  if (status) where.status = status.toUpperCase()
  if (sellContractId) where.sellContractId = sellContractId

  const [timesheets, total] = await Promise.all([
    prisma.timesheet.findMany({
      where,
      include: {
        person: { select: { id: true, name: true } },
        sellContract: {
          select: {
            id: true,
            billRate: true,
            billCurrency: true,
            overtimeAfterHours: true,
            overtimeMultiplierBps: true,
            clientCompany: { select: { id: true, name: true } },
            endClientCompany: { select: { id: true, name: true } },
            engagement: { select: { id: true, title: true } },
          },
        },
        // The list has to be able to say "this one has a question on it"
        // before anybody clicks Approve and is refused.
        overtimeDecisions: {
          select: { weekOf: true, treatment: true, appliedBps: true, overtimeHours: true },
        },
      },
      orderBy: { periodStart: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.timesheet.count({ where }),
  ])

  return NextResponse.json({
    data: {
      timesheets: timesheets.map((t) => ({
        id: t.id,
        person: t.person,
        sellContract: {
          id: t.sellContract.id,
          billRate: t.sellContract.billRate,
          billCurrency: t.sellContract.billCurrency,
          clientCompany: t.sellContract.clientCompany,
          endClientCompany: t.sellContract.endClientCompany,
          engagement: t.sellContract.engagement,
        },
        periodStart: t.periodStart.toISOString(),
        periodEnd: t.periodEnd.toISOString(),
        totalHours: Number(t.totalHours),
        status: t.status,
        anomalyScore: t.anomalyScore,
        anomalyReason: t.anomalyReason,
        approvedAt: t.approvedAt?.toISOString() ?? null,
        overtime: overtimeOf(t),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  })
}

/**
 * What this sheet still has to be asked, and what it was already told.
 *
 * A week over the contract's threshold cannot be approved until
 * somebody says what happens to the hours, so the list says which rows
 * hold a question before anybody clicks Approve and is refused. The
 * sentence is the same one the approval route would return, written
 * once in `lib/overtime` so the screen and the refusal cannot disagree.
 */
function overtimeOf(t: {
  person: { name: string }
  days: unknown
  leaveDays: unknown
  sellContract: { billRate: number; overtimeAfterHours: number | null; overtimeMultiplierBps: number | null }
  overtimeDecisions: { weekOf: Date; treatment: string; appliedBps: number; overtimeHours: unknown }[]
}) {
  const policy = policyOf(t.sellContract)
  const decisions: Decision[] = t.overtimeDecisions.map((d) => ({
    weekOf: d.weekOf.toISOString().slice(0, 10),
    treatment: d.treatment as Treatment,
    appliedBps: d.appliedBps,
    overtimeHours: Number(d.overtimeHours),
  }))
  const split = splitWeeks((t.days as Record<string, number>) ?? {}, policy, {
    leaveDays: (t.leaveDays as Record<string, number>) ?? {},
    decisions,
  })
  const waiting = weeksAwaitingDecision(split)

  return {
    afterHours: policy.afterHours,
    multiplierBps: policy.multiplierBps,
    rateCents: t.sellContract.billRate,
    /**
     * What the sheet is worth to bill, priced from each week's own
     * decision. Hours nobody has decided are not in it — a screen that
     * prints 45 billed hours with 40 hours of money against them is the
     * bug this whole feature exists to remove.
     */
    billableCents: valueOf(split, t.sellContract.billRate).totalCents,
    pendingHours: split.pendingHours,
    bankedHours: split.bankedHours,
    leaveHours: split.leaveHours,
    weeks: waiting.map((w) => ({
      weekOf: w.weekOf,
      workedHours: w.workedHours,
      overtimeHours: w.pendingHours,
    })),
    decided: split.weeks
      .filter((w) => w.treatment != null)
      .map((w) => ({
        weekOf: w.weekOf,
        hours: w.overtimeHours + w.bankedHours,
        says: treatmentSays(w.treatment!, w.appliedBps ?? 10_000),
      })),
    says: waiting.length > 0 ? saysAwaiting(waiting, t.person.name, policy) : null,
  }
}

/**
 * POST /api/timesheets
 *
 * Create a timesheet against a sell contract.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json()
  const { sellContractId, periodStart, periodEnd, days, leaveDays } = body

  if (!sellContractId) return err('sellContractId is required', 'sellContractId')
  if (!periodStart) return err('periodStart is required', 'periodStart')
  if (!periodEnd) return err('periodEnd is required', 'periodEnd')
  if (!days || typeof days !== 'object') return err('days object is required (e.g. {"2026-08-01": 8})', 'days')

  const sellContract = await prisma.sellContract.findUnique({
    where: { id: sellContractId },
    select: {
      id: true, personId: true, state: true, billRate: true,
      companyId: true, clientCompanyId: true, endClientCompanyId: true,
    },
  })

  if (!sellContract) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Sell contract not found' } },
      { status: 404 }
    )
  }

  // Whose hours these are. The submit step asked; this one, which is
  // where the week is actually written, did not — so anybody signed in
  // could open a week against any contract in the database, and the
  // approver would see hours the person never entered.
  const allowed = mayEnter(
    { personId: caller.person.id, companyId: caller.company?.id, permissions: caller.permissions },
    {
      personId: sellContract.personId,
      vendorCompanyId: sellContract.companyId,
      clientCompanyId: sellContract.clientCompanyId,
      endClientCompanyId: sellContract.endClientCompanyId,
    }
  )
  if (!allowed.ok) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: allowed.reason } },
      { status: 403 }
    )
  }

  // Calculate total hours
  const totalHours = Object.values(days as Record<string, number>).reduce(
    (sum: number, h) => sum + (typeof h === 'number' ? h : 0),
    0
  )

  // ── Which of those hours were paid leave ────────────────────────────
  //
  // Leave sits inside the day's hours rather than beside them: the
  // consultant is paid for the day either way, and what changes is that
  // the hours were not worked. Recorded per day, because the overtime
  // threshold is judged per week and a sheet total cannot say which
  // week the leave fell in — and leave that counted toward the
  // threshold would manufacture overtime, which would bank more leave.
  const leave: Record<string, number> = {}
  for (const [dayKey, h] of Object.entries((leaveDays ?? {}) as Record<string, unknown>)) {
    const n = Number(h)
    if (!Number.isFinite(n) || n <= 0) continue
    const worked = Number((days as Record<string, number>)[dayKey] ?? 0)
    if (worked <= 0) {
      return err(`There are no hours on ${dayKey} for the leave to come out of.`, 'leaveDays')
    }
    leave[dayKey] = Math.min(n, worked)
  }

  // Simple anomaly detection: > 12 hours in a day or > 60 hours in a week
  let anomalyScore: number | null = null
  let anomalyReason: string | null = null

  const dayValues = Object.values(days as Record<string, number>)
  const maxDay = Math.max(...dayValues.map((v) => (typeof v === 'number' ? v : 0)))

  if (maxDay > 12) {
    anomalyScore = 30
    anomalyReason = `Day with ${maxDay} hours exceeds 12-hour threshold`
  } else if (totalHours > 60) {
    anomalyScore = 50
    anomalyReason = `Total ${totalHours} hours exceeds 60-hour weekly threshold`
  }

  try {
    const timesheet = await prisma.timesheet.create({
      data: {
        sellContractId,
        personId: sellContract.personId,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        days: days as any,
        leaveDays: Object.keys(leave).length > 0 ? (leave as any) : undefined,
        totalHours,
        status: 'OPEN',
        anomalyScore,
        anomalyReason,
      },
    })

    return NextResponse.json({
      data: {
        timesheet: {
          id: timesheet.id,
          totalHours: Number(timesheet.totalHours),
          status: timesheet.status,
          anomalyScore,
          anomalyReason,
          periodStart: timesheet.periodStart.toISOString(),
          periodEnd: timesheet.periodEnd.toISOString(),
        },
        message: anomalyReason
          ? `Timesheet created with anomaly detected: ${anomalyReason}`
          : `Timesheet created: ${totalHours} hours`,
      },
    }, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { error: { code: 'DUPLICATE', message: 'A timesheet already exists for this contract and period' } },
        { status: 409 }
      )
    }
    throw e
  }
}

function err(message: string, field: string) {
  return NextResponse.json(
    { error: { code: 'VALIDATION', message, field } },
    { status: 422 }
  )
}

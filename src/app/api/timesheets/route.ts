import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { payerScope } from '@/lib/resolve-client-company'
import { endClientFilter } from '@/lib/resolve-end-client'
import { payerRung } from '@/lib/chain-top'
import { isConsultantSeat } from '@/lib/seat'
import { mayEnter, mayApprove, approvingOwnHours } from '@/lib/timesheet-authority'
import {
  policyOf, splitWeeks, valueOf, weeksAwaitingDecision, saysAwaiting, treatmentSays,
  type Decision, type Treatment,
} from '@/lib/overtime'

/**
 * GET /api/timesheets
 *
 * Timesheets live on the sell side — they track billable hours
 * against a SellContract.
 *
 * ── Whose rate is on the row ─────────────────────────────────────────
 *
 * Three seats read this list and they are owed three different numbers.
 *
 * A vendor is owed what it bills. That is the rate on its own contract
 * and there is nothing to work out.
 *
 * A client is owed what it pays. In a chain the hours hang off the
 * bottom rung — the leg where the employer is — so reading the rate off
 * the timesheet's own contract printed CloudEPA's $118 on Nike's screen
 * beside the $145 Nike is billed, and the difference is the prime's
 * entire margin. The rows stay, because a client signs the hours of
 * people it never contracted with; the rate is walked up the chain to
 * the contract the client actually pays.
 *
 * A consultant is owed their own pay rate and never the bill rate. This
 * page is not in their nav and their session opens it anyway, and it
 * handed them the markup taken out of their own week.
 *
 * Where the paper cannot say, the rate is null and the row says why. A
 * plausible wrong rate on a timesheet is worse than a blank.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl
  const status = url.searchParams.get('status')
  const sellContractId = url.searchParams.get('sellContractId')
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))

  const onBench = isConsultantSeat(caller)
  const asClient = !onBench && caller.company?.kind === 'CLIENT'

  // Which rows. A client signs the hours of everybody on its sites,
  // whoever employs them, so the rows are the end-client's — and only
  // the rows. What each one costs is settled below, at the rung this
  // client pays, never at the rung underneath it.
  const scope = asClient ? endClientFilter(caller.company!.id) : payerScope(caller)
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
            personId: true,
            companyId: true,
            clientCompanyId: true,
            endClientCompanyId: true,
            startDate: true,
            endDate: true,
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

  const priced = await priceFor(caller, timesheets, { asClient, onBench })

  const actor = {
    personId: caller.person.id,
    companyId: caller.company?.id,
    permissions: caller.permissions,
  }

  return NextResponse.json({
    data: {
      timesheets: timesheets.map((t) => {
        const seen = priced.get(t.id)!
        const parties = {
          personId: t.sellContract.personId,
          vendorCompanyId: t.sellContract.companyId,
          clientCompanyId: t.sellContract.clientCompanyId,
          endClientCompanyId: t.sellContract.endClientCompanyId,
        }
        // The same two checks the approve route makes, in the same
        // order, so the screen never offers a button the server will
        // refuse. A consultant opening their own week is the case this
        // was drawn for: the hours are theirs and the decision is not.
        const own = approvingOwnHours(actor, parties)
        const approve = own
          ? { ok: false, reason: 'Nobody approves their own hours.' }
          : mayApprove(actor, parties)
        const enter = mayEnter(actor, parties)

        return {
          id: t.id,
          person: t.person,
          sellContract: {
            id: t.sellContract.id,
            // Whose paper this row is read against. For a client in a
            // chain that is its own contract, not its supplier's.
            clientCompany: seen.clientCompany,
            endClientCompany: t.sellContract.endClientCompany,
            engagement: seen.engagement,
          },
          rate: seen.rate,
          periodStart: t.periodStart.toISOString(),
          periodEnd: t.periodEnd.toISOString(),
          totalHours: Number(t.totalHours),
          status: t.status,
          anomalyScore: t.anomalyScore,
          anomalyReason: t.anomalyReason,
          approvedAt: t.approvedAt?.toISOString() ?? null,
          mayApprove: approve.ok,
          mayApproveWhyNot: approve.ok ? null : approve.reason,
          maySubmit: enter.ok,
          overtime: overtimeOf(t, seen),
        }
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  })
}

/**
 * What this reader is allowed to see a rate for, and which rate.
 *
 * One pass over the page's rows, two extra queries at most — never a
 * lookup per row.
 */
interface Seen {
  rate: {
    cents: number | null
    currency: string | null
    basis: 'BILL' | 'PAY'
    label: string
    says: string | null
  }
  afterHours: number | null
  multiplierBps: number | null
  clientCompany: { id: string; name: string }
  engagement: { id: string; title: string } | null
}

type Row = {
  id: string
  sellContract: {
    id: string
    personId: string
    companyId: string
    clientCompanyId: string
    startDate: Date
    endDate: Date | null
    billRate: number
    billCurrency: string
    overtimeAfterHours: number | null
    overtimeMultiplierBps: number | null
    clientCompany: { id: string; name: string }
    engagement: { id: string; title: string } | null
  }
}

async function priceFor(
  caller: NonNullable<Awaited<ReturnType<typeof getCallerContext>>['caller']>,
  rows: Row[],
  seat: { asClient: boolean; onBench: boolean }
): Promise<Map<string, Seen>> {
  const out = new Map<string, Seen>()
  if (rows.length === 0) return out

  const asIs = (r: Row): Seen => ({
    rate: {
      cents: r.sellContract.billRate,
      currency: r.sellContract.billCurrency,
      basis: 'BILL',
      label: 'Bill rate',
      says: null,
    },
    afterHours: r.sellContract.overtimeAfterHours,
    multiplierBps: r.sellContract.overtimeMultiplierBps,
    clientCompany: r.sellContract.clientCompany,
    engagement: r.sellContract.engagement,
  })

  // ── The person whose week it is ────────────────────────────────────
  //
  // Their pay, from the agreement that pays them, or nothing. The bill
  // rate is what their agency charges for them and it is not theirs to
  // read — /api/me/work was fixed for exactly this and the fix did not
  // reach the other page the same seat can open.
  if (seat.onBench) {
    const lines = await prisma.buyContractCandidate.findMany({
      where: { personId: caller.person.id, state: 'ACTIVE' },
      select: { payRate: true, payCurrency: true, buyContract: { select: { companyId: true } } },
    })
    const byCompany = new Map(lines.map((l) => [l.buyContract.companyId, l]))
    for (const r of rows) {
      const pay = byCompany.get(r.sellContract.companyId)
      out.set(r.id, {
        rate: {
          cents: pay?.payRate ?? null,
          currency: pay?.payCurrency ?? null,
          basis: 'PAY',
          label: 'Your rate',
          says: pay
            ? null
            : 'Your rate is not recorded on Etyme for this placement. Your agency has it.',
        },
        afterHours: r.sellContract.overtimeAfterHours,
        multiplierBps: r.sellContract.overtimeMultiplierBps,
        clientCompany: r.sellContract.clientCompany,
        engagement: r.sellContract.engagement,
      })
    }
    return out
  }

  if (!seat.asClient) {
    for (const r of rows) out.set(r.id, asIs(r))
    return out
  }

  // ── The client ─────────────────────────────────────────────────────
  //
  // Every rung of every chain these people are on at this client, so
  // each row can be walked up to the contract this client is billed on.
  const rungs = await prisma.sellContract.findMany({
    where: {
      ...endClientFilter(caller.company!.id),
      personId: { in: [...new Set(rows.map((r) => r.sellContract.personId))] },
    },
    select: {
      id: true, personId: true, companyId: true, clientCompanyId: true,
      startDate: true, endDate: true, billRate: true, billCurrency: true,
      overtimeAfterHours: true, overtimeMultiplierBps: true,
      clientCompany: { select: { id: true, name: true } },
      engagement: { select: { id: true, title: true } },
    },
  })

  for (const r of rows) {
    const top = payerRung(r.sellContract, rungs)
    if (!top) {
      // Two legs above this week covering the same days. There is no one
      // contract to price it at, and a guess here is the prime's margin
      // on the client's screen or the client's rate on nobody's.
      out.set(r.id, {
        rate: {
          cents: null,
          currency: null,
          basis: 'BILL',
          label: 'Bill rate',
          says:
            'More than one of your contracts covers this week, so there is no single ' +
            'rate to price it at. Check the contracts for this person.',
        },
        afterHours: null,
        multiplierBps: null,
        clientCompany: r.sellContract.clientCompany,
        engagement: r.sellContract.engagement,
      })
      continue
    }
    out.set(r.id, {
      rate: {
        cents: top.billRate,
        currency: top.billCurrency,
        basis: 'BILL',
        label: 'Bill rate',
        says: null,
      },
      afterHours: top.overtimeAfterHours,
      multiplierBps: top.overtimeMultiplierBps,
      clientCompany: top.clientCompany,
      engagement: top.engagement,
    })
  }
  return out
}

/**
 * What this sheet still has to be asked, and what it was already told.
 *
 * A week over the threshold cannot be approved until somebody says what
 * happens to the hours, so the list says which rows hold a question
 * before anybody clicks Approve and is refused. The sentence is the
 * same one the approval route would return, written once in
 * `lib/overtime` so the screen and the refusal cannot disagree.
 *
 * Hours are a fact and money is a reading of it. Where the reader is
 * owed no rate — a consultant whose pay is not recorded, a week two
 * contracts both cover — the hours still split and the value is null.
 */
function overtimeOf(
  t: {
    person: { name: string }
    days: unknown
    leaveDays: unknown
    overtimeDecisions: { weekOf: Date; treatment: string; appliedBps: number; overtimeHours: unknown }[]
  },
  seen: Seen
) {
  const policy = policyOf({
    overtimeAfterHours: seen.afterHours,
    overtimeMultiplierBps: seen.multiplierBps,
  })
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
    rateCents: seen.rate.cents,
    /**
     * What the sheet is worth at this reader's own rate, priced from
     * each week's own decision. Hours nobody has decided are not in it
     * — a screen that prints 45 billed hours with 40 hours of money
     * against them is the bug this whole feature exists to remove.
     */
    billableCents: seen.rate.cents == null ? null : valueOf(split, seen.rate.cents).totalCents,
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

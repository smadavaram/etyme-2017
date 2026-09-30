import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { decide, signature, summarize, DEFAULT_WINDOW_DAYS } from '@/lib/auto-approval'
import { payerRung } from '@/lib/chain-top'
import { weekFlag } from '@/lib/timesheet-flag'

/**
 * GET /api/cron/auto-approve
 *
 * Approve the timesheets nobody responded to, where the client agreed
 * that silence counts.
 *
 * A contractor works a week, submits, and the manager who approves it is
 * on holiday. Two weeks later the vendor cannot invoice and nobody did
 * anything wrong. This is the term that keeps cash moving, and it only
 * fires where a client signed up to it on their own order.
 *
 * Runs from the daily fan-out. Every decision is written down, including
 * the ones that did nothing — a sheet held on an anomaly is the most
 * useful line in the log and the one somebody will come looking for.
 *
 * ── Whose term it is ────────────────────────────────────────────────
 *
 * The client's, on the order the client itself issued. Until 2026-09-29
 * this read the order on the contract the hours are filed on, which on a
 * direct placement is the client's and in a chain is not: Helena Marsh's
 * week is filed on CloudEPA's contract, under Computer Systems' order to
 * CloudEPA. So a client's own "silence counts" was never read for a
 * chain week, and a prime that switched it on for its sub's order wrote
 * the END CLIENT's approval by silence — the client signing a week on a
 * term it never agreed, at the sub's rate. Now the week is walked up to
 * the rung the client pays (`payerRung` in lib/chain-top), and the term
 * is that rung's order, and only where the client issued it. A lower
 * rung's setting may stand in for that rung's own acceptance one day; it
 * never stands in for the client's signature. Where two contracts above
 * the week cover the same days there is no single order to read, and
 * silence approves nothing.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Only sheets a client has not signed. The employer's acceptance is
  // their own money leaving and nobody agreed it may leave unattended.
  const waiting = await prisma.timesheet.findMany({
    where: { status: 'SUBMITTED', clientApprovedAt: null },
    select: {
      id: true, submittedAt: true, totalHours: true, periodEnd: true,
      clientApprovedAt: true, anomalyScore: true, anomalyReason: true,
      person: { select: { name: true } },
      sellContract: {
        select: {
          id: true,
          personId: true,
          companyId: true,
          clientCompanyId: true,
          endClientCompanyId: true,
          clientCompany: { select: { name: true } },
          endClientCompany: { select: { name: true } },
          endDate: true,
          requirement: { select: { hoursPerWeek: true } },
        },
      },
    },
    take: 2000,
  })

  // Every rung of every chain these people are on, so each week can be
  // walked up to the contract its client pays, and that contract's order
  // read for the client's term.
  const people = [...new Set(waiting.map((t) => t.sellContract.personId))]
  //
  // A rung with no start date is taken as open from the first day, so it
  // overlaps everything and can only make a chain read as ambiguous.
  const rungs = people.length === 0 ? [] : (await prisma.sellContract.findMany({
    where: { personId: { in: people } },
    select: {
      id: true, personId: true, companyId: true, clientCompanyId: true,
      startDate: true, endDate: true, billRate: true,
      workOrder: { select: { issuedById: true, autoApproveTimesheets: true, approvalWindowDays: true } },
    },
  })).map((r) => ({ ...r, startDate: r.startDate ?? new Date(0) }))
  const rungOf = new Map(rungs.map((r) => [r.id, r]))

  /** The rung the client pays for this week, and the client's own term on it — or no term. */
  const termOf = (t: (typeof waiting)[number]) => {
    const client = t.sellContract.endClientCompanyId ?? t.sellContract.clientCompanyId
    const filed = rungOf.get(t.sellContract.id)
    const top = filed ? payerRung(filed, rungs) : null
    const order = top && top.clientCompanyId === client && top.workOrder?.issuedById === client ? top.workOrder : null
    return { client, top, order }
  }
  const terms = new Map(waiting.map((t) => [t.id, termOf(t)]))

  const decisions = waiting.map((t) =>
    decide(
      {
        id: t.id,
        personName: t.person.name,
        // A sheet with no submitted date is one somebody imported. Treat
        // its own creation as the clock start rather than approving it
        // instantly on a null.
        submittedAt: t.submittedAt ?? now,
        totalHours: Number(t.totalHours),
        clientApprovedAt: t.clientApprovedAt,
        anomalyScore: t.anomalyScore,
        anomalyReason: t.anomalyReason,
        windowDays: terms.get(t.id)!.order?.approvalWindowDays ?? null,
        autoApproves: terms.get(t.id)!.order?.autoApproveTimesheets ?? false,
        clientName:
          t.sellContract.endClientCompany?.name ??
          t.sellContract.clientCompany.name,
        // A week that does not fit its contract — over the job's hours,
        // past the last day, or flagged when filed — waits for a person
        // however long the window, in the words the approve route uses.
        flag: weekFlag({
          hours: Number(t.totalHours),
          hoursPerWeek: t.sellContract.requirement?.hoursPerWeek ?? null,
          periodEnd: t.periodEnd,
          contractEnd: t.sellContract.endDate,
          anomalyScore: t.anomalyScore,
          anomalyReason: t.anomalyReason,
        }),
      },
      now
    )
  )

  const approving = decisions.filter((d) => d.verdict === 'APPROVE')

  for (const d of approving) {
    const sheet = waiting.find((t) => t.id === d.sheetId)!
    const { client: clientCompanyId, top } = terms.get(d.sheetId)!
    // Only a week whose client issued the term is ever approved here.
    if (!top) continue

    // Idempotency guard: check if already approved before writing.
    // If this cron runs twice, the timesheet's clientApprovedAt will be
    // set from the first run, so it won't be in the waiting list on the
    // second run. But if two runs happen concurrently before either
    // updates, both could try to approve the same timesheet.
    const existing = await prisma.workAssertion.findFirst({
      where: {
        timesheetId: d.sheetId,
        companyId: clientCompanyId,
        role: 'CLIENT_APPROVAL',
        state: 'LIVE',
      },
    })

    if (existing) continue

    // Named nobody, in the ledger as well as the column. An automatic
    // approval carrying a manager's id is a forged signature wherever it
    // is written down.
    await prisma.workAssertion.create({
      data: {
        timesheetId: d.sheetId,
        // The end client, not the vendor. A client approval asserted by
        // the company that raised the invoice is the vendor approving
        // its own bill, which is the whole thing two signatures exist to
        // prevent.
        companyId: clientCompanyId,
        role: 'CLIENT_APPROVAL',
        hours: Number(sheet.totalHours),
        // The client's own rate on its own leg — the rung it pays — never
        // the rate of the rung the hours are filed on, which in a chain
        // is a supplier's price to its prime.
        rateCents: top.billRate,
        state: 'LIVE',
        byId: null,
        auto: true,
        note: d.says,
      },
    }).catch(() => {})

    // Idempotency guard: re-verify the timesheet status before updating.
    // Another concurrent run may have already approved it.
    const current = await prisma.timesheet.findUnique({
      where: { id: d.sheetId },
      select: { status: true, clientApprovedAt: true },
    })

    if (!current || current.status !== 'SUBMITTED' || current.clientApprovedAt) {
      continue
    }

    await prisma.$transaction([
      prisma.timesheet.update({
        where: { id: d.sheetId },
        // Names nobody, on purpose. An auto-approved sheet carrying a
        // manager's id is a forged signature, and somebody disputing the
        // invoice in four months needs to be able to tell them apart.
        data: signature(now),
      }),
      prisma.automationLog.create({
        data: {
          // The supplier the client's order is to — on a direct placement
          // the firm the hours are filed under, as before.
          companyId: top.companyId,
          action: 'TIMESHEET_AUTO_APPROVED',
          summary: `${sheet.person.name}: ${Number(sheet.totalHours)} hours approved automatically`,
          reason: d.says,
          payload: { timesheetId: d.sheetId, waitedDays: d.waitedDays },
          // Reversible: somebody can withdraw approval and the invoice
          // has not gone yet.
          reversible: true,
        },
      }),
    ])
  }

  // The held ones are logged too, because a sheet sitting on an anomaly
  // for three weeks is the thing nobody notices until a contractor rings.
  for (const d of decisions.filter((x) => x.verdict === 'HELD')) {
    const sheet = waiting.find((t) => t.id === d.sheetId)!
    await prisma.automationLog.create({
      data: {
        companyId: terms.get(d.sheetId)!.top?.companyId ?? sheet.sellContract.companyId,
        action: 'TIMESHEET_HELD_FOR_PERSON',
        summary: `${sheet.person.name}: held for a person, not approved automatically`,
        reason: d.says,
        payload: { timesheetId: d.sheetId, waitedDays: d.waitedDays },
        reversible: false,
      },
    }).catch(() => {})
  }

  const summary = summarize(decisions)

  return NextResponse.json({
    data: {
      ...summary,
      defaultWindowDays: DEFAULT_WINDOW_DAYS,
      considered: decisions.length,
      // Named, so the overnight report is readable rather than a count.
      held: decisions.filter((d) => d.verdict === 'HELD').map((d) => d.says),
      says: summary.says,
    },
  })
}

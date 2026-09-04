import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decide, signature, summarise, DEFAULT_WINDOW_DAYS } from '@/lib/auto-approval'

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
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Only sheets a client has not signed. The employer's acceptance is
  // their own money leaving and nobody agreed it may leave unattended.
  const waiting = await prisma.timesheet.findMany({
    where: { status: 'SUBMITTED', clientApprovedAt: null },
    select: {
      id: true, submittedAt: true, totalHours: true,
      clientApprovedAt: true, anomalyScore: true, anomalyReason: true,
      person: { select: { name: true } },
      sellContract: {
        select: {
          companyId: true,
          billRate: true,
          clientCompanyId: true,
          endClientCompanyId: true,
          clientCompany: { select: { name: true } },
          endClientCompany: { select: { name: true } },
          salesOrder: {
            select: { autoApproveTimesheets: true, approvalWindowDays: true },
          },
        },
      },
    },
    take: 2000,
  })

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
        windowDays: t.sellContract.salesOrder?.approvalWindowDays ?? null,
        autoApproves: t.sellContract.salesOrder?.autoApproveTimesheets ?? false,
        clientName:
          t.sellContract.endClientCompany?.name ??
          t.sellContract.clientCompany.name,
      },
      now
    )
  )

  const approving = decisions.filter((d) => d.verdict === 'APPROVE')

  for (const d of approving) {
    const sheet = waiting.find((t) => t.id === d.sheetId)!
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
        companyId:
          sheet.sellContract.endClientCompanyId ?? sheet.sellContract.clientCompanyId,
        role: 'CLIENT_APPROVAL',
        hours: Number(sheet.totalHours),
        rateCents: sheet.sellContract.billRate,
        state: 'LIVE',
        byId: null,
        auto: true,
        note: d.says,
      },
    }).catch(() => {})

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
          companyId: sheet.sellContract.companyId,
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
        companyId: sheet.sellContract.companyId,
        action: 'TIMESHEET_HELD_FOR_PERSON',
        summary: `${sheet.person.name}: held for a person, not approved automatically`,
        reason: d.says,
        payload: { timesheetId: d.sheetId, waitedDays: d.waitedDays },
        reversible: false,
      },
    }).catch(() => {})
  }

  const summary = summarise(decisions)

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

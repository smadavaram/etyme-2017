import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { hasAnyPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'

/**
 * GET /api/decisions
 *
 * BUILD.md §3 — The machine: "what needs a person right now"
 *
 * Aggregates pending items across all working surfaces into a single
 * prioritized queue. Each item is a decision that requires human input
 * — not an informational notification.
 *
 * Categories:
 *   TIMESHEET_APPROVAL — submitted timesheets awaiting approval
 *   EXPENSE_APPROVAL   — submitted expenses awaiting approval
 *   ROLLOFF_ACTION     — contracts ending soon with no action
 *   SUBMISSION_REVIEW  — submissions waiting for vendor review
 *   INVOICE_OVERDUE    — invoices past due
 *   RATE_CONFIRMATION  — rate changes that need confirmation
 *
 * Each decision has: type, title, subtitle, urgency (HIGH|MEDIUM|LOW),
 * entityType, entityId, dueDate (if applicable), and actionUrl.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'The decision queue')
  if (notStaff) return notStaff

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json({ data: { decisions: [], counts: {} } })
  }

  const now = new Date()
  const decisions: any[] = []

  // ── 1. Timesheets pending approval ────────────────
  if (hasAnyPermission(caller.permissions, ['timesheets.approve'])) {
    const pendingTimesheets = await prisma.timesheet.findMany({
      where: {
        status: 'SUBMITTED',
        sellContract: { companyId },
      },
      include: {
        person: { select: { name: true } },
        sellContract: {
          select: {
            billRate: true,
            clientCompany: { select: { name: true } },
          },
        },
      },
      orderBy: { periodEnd: 'asc' },
      take: 20,
    })

    for (const ts of pendingTimesheets) {
      const daysSinceSubmit = Math.floor(
        (now.getTime() - ts.periodEnd.getTime()) / (1000 * 60 * 60 * 24)
      )

      decisions.push({
        type: 'TIMESHEET_APPROVAL',
        title: `Approve timesheet — ${ts.person.name}`,
        subtitle: `${ts.totalHours}h · ${ts.sellContract.clientCompany?.name ?? 'Unknown client'} · ${ts.periodStart.toISOString().slice(0, 10)} to ${ts.periodEnd.toISOString().slice(0, 10)}`,
        urgency: daysSinceSubmit >= 5 ? 'HIGH' : daysSinceSubmit >= 2 ? 'MEDIUM' : 'LOW',
        entityType: 'TIMESHEET',
        entityId: ts.id,
        dueDate: null,
        actionUrl: '/dashboard/timesheets',
        amount: Number(ts.totalHours) * (ts.sellContract.billRate / 100),
        createdAt: ts.periodEnd.toISOString(),
      })
    }
  }

  // ── 2. Expenses pending approval ──────────────────
  if (hasAnyPermission(caller.permissions, ['invoices.read'])) {
    const pendingExpenses = await prisma.expense.findMany({
      where: {
        companyId,
        status: 'SUBMITTED',
      },
      include: {
        person: { select: { name: true } },
        sellContract: {
          select: {
            clientCompany: { select: { name: true } },
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
      take: 10,
    })

    for (const exp of pendingExpenses) {
      const daysSinceSubmit = exp.submittedAt
        ? Math.floor((now.getTime() - exp.submittedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 0

      decisions.push({
        type: 'EXPENSE_APPROVAL',
        title: `Review expense — ${exp.person.name}`,
        // Expense.total is a Decimal in whole currency, not cents — the
        // schema says so where InvoiceLine is defined. Dividing by a
        // hundred turned a $149.98 expense into "$1.50" on the founder's
        // main screen, and an $1,801 one into "$18.01".
        subtitle: `$${Number(exp.total).toFixed(2)} · ${exp.category} · ${exp.billable ? 'Billable' : 'Internal'} · ${exp.sellContract?.clientCompany?.name ?? ''}`,
        urgency: daysSinceSubmit >= 5 ? 'HIGH' : 'MEDIUM',
        entityType: 'EXPENSE',
        entityId: exp.id,
        dueDate: null,
        actionUrl: '/dashboard/expenses',
        amount: Number(exp.total),
        createdAt: exp.submittedAt?.toISOString() ?? exp.createdAt.toISOString(),
      })
    }
  }

  // ── 3. Rolloff warnings ───────────────────────────
  if (hasAnyPermission(caller.permissions, ['assignments.read'])) {
    const rolloffWindow = new Date(now)
    rolloffWindow.setDate(rolloffWindow.getDate() + 28)

    const endingSoon = await prisma.sellContract.findMany({
      where: {
        companyId,
        state: 'IN_PROGRESS',
        endDate: {
          lte: rolloffWindow,
          gte: now,
        },
      },
      include: {
        person: { select: { name: true } },
        clientCompany: { select: { name: true } },
        endClientCompany: { select: { name: true } },
      },
      orderBy: { endDate: 'asc' },
      take: 10,
    })

    for (const sc of endingSoon) {
      const daysLeft = Math.ceil(
        (sc.endDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      // Check if a rolloff event already exists
      const rolloffEvent = await prisma.rolloffEvent.findFirst({
        where: { sellContractId: sc.id },
      })

      const endClientName = sc.endClientCompany?.name ?? sc.clientCompany?.name ?? 'Unknown'
      decisions.push({
        type: 'ROLLOFF_ACTION',
        title: `Rolloff in ${daysLeft}d — ${sc.person.name}`,
        subtitle: `${endClientName} · $${sc.billRate / 100}/hr · ${rolloffEvent ? 'Event created' : 'No action yet'}`,
        urgency: daysLeft <= 7 ? 'HIGH' : daysLeft <= 14 ? 'MEDIUM' : 'LOW',
        entityType: 'SELL_CONTRACT',
        entityId: sc.id,
        dueDate: sc.endDate!.toISOString(),
        actionUrl: '/dashboard/rolloff',
        amount: null,
        createdAt: sc.endDate!.toISOString(),
      })
    }
  }

  // ── 4. Submissions to review ──────────────────────
  if (hasAnyPermission(caller.permissions, ['submissions.read'])) {
    const pendingSubmissions = await prisma.submission.findMany({
      where: {
        fromCompanyId: companyId,
        status: 'SUBMITTED',
      },
      include: {
        person: { select: { name: true } },
        requirement: { select: { title: true } },
      },
      orderBy: { submittedAt: 'asc' },
      take: 10,
    })

    for (const sub of pendingSubmissions) {
      const daysSinceSubmit = Math.floor(
        (now.getTime() - sub.submittedAt.getTime()) / (1000 * 60 * 60 * 24)
      )

      decisions.push({
        type: 'SUBMISSION_REVIEW',
        title: `Review submission — ${sub.person.name}`,
        subtitle: `${sub.requirement.title} · $${sub.rate / 100}/hr · ${daysSinceSubmit}d since submitted`,
        urgency: daysSinceSubmit >= 7 ? 'HIGH' : daysSinceSubmit >= 3 ? 'MEDIUM' : 'LOW',
        entityType: 'SUBMISSION',
        entityId: sub.id,
        dueDate: null,
        actionUrl: '/dashboard/submissions',
        amount: null,
        createdAt: sub.submittedAt.toISOString(),
      })
    }
  }

  // ── 5. Overdue invoices ───────────────────────────
  if (hasAnyPermission(caller.permissions, ['invoices.read'])) {
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
        dueAt: { lt: now },
        engagement: {
          msa: {
            vendorId: companyId,
          },
        },
      },
      include: {
        engagement: {
          select: {
            title: true,
            msa: {
              select: {
                client: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { dueAt: 'asc' },
      take: 10,
    })

    for (const inv of overdueInvoices) {
      const daysOverdue = Math.floor(
        (now.getTime() - inv.dueAt!.getTime()) / (1000 * 60 * 60 * 24)
      )
      const outstanding = Number(inv.total) - Number(inv.paid)

      decisions.push({
        type: 'INVOICE_OVERDUE',
        title: `Overdue invoice — ${inv.number}`,
        // Same again, and worse here: a $7,600 overdue invoice read
        // "$76.00 outstanding", which is an amount nobody chases.
        subtitle: `${inv.engagement.msa.client.name} · $${outstanding.toFixed(2)} outstanding · ${daysOverdue}d overdue`,
        urgency: daysOverdue >= 60 ? 'HIGH' : daysOverdue >= 30 ? 'MEDIUM' : 'LOW',
        entityType: 'INVOICE',
        entityId: inv.id,
        dueDate: inv.dueAt!.toISOString(),
        actionUrl: '/dashboard/invoices',
        amount: outstanding,
        createdAt: inv.dueAt!.toISOString(),
      })
    }
  }

  // ── Sort by urgency, then by created date ─────────
  const urgencyOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
  decisions.sort((a, b) => {
    const urgDiff = (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3)
    if (urgDiff !== 0) return urgDiff
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  // ── Counts by type ────────────────────────────────
  const counts: Record<string, number> = {}
  for (const d of decisions) {
    counts[d.type] = (counts[d.type] ?? 0) + 1
  }

  return NextResponse.json({
    data: {
      decisions,
      counts,
      total: decisions.length,
    },
  })
}

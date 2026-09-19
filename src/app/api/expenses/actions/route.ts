import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { notifyBulk, type NotifyParams } from '@/lib/notify'

/**
 * POST /api/expenses/actions
 *
 * Batch status transitions for expenses.
 * Actions: submit | approve | reject
 *
 * LEGACY_RULES.md §4.4:
 *   ClientExpense lifecycle:
 *     pending_expense → not_submitted → submitted → approved → bill_generated →
 *     rejected / invoice_generated → paid
 *
 * Consolidated:
 *   DRAFT → SUBMITTED → APPROVED → INVOICED → PAID  or  → REJECTED
 *
 * Transition rules:
 *   submit:  DRAFT → SUBMITTED (consultant submits for review)
 *   approve: SUBMITTED → APPROVED (manager confirms)
 *   reject:  SUBMITTED | APPROVED → REJECTED (with reason)
 *
 * There is no 'invoice' action. An approved client-billable expense rides
 * on the next invoice raised for its engagement (src/lib/expense-billing.ts)
 * and nobody presses anything.
 *
 * ── What each decision is recorded as ───────────────────────────
 *
 * Three names, one per decision, each stated whole below. This route
 * wrote `expense.${action}` — lowercase, dotted, and in nobody else's
 * voice — which was two faults at once. An action assembled at runtime is
 * invisible to the scanner behind `__tests__/invariants/autonomy.test.ts`,
 * so no literal read as no log at all and the ladder in
 * `src/lib/autonomy.ts` never knew these rows existed; and the name it
 * produced could not be queried beside `TIMESHEET_APPROVED` or
 * `PAYMENT_RECORDED`, which are the same shape of act.
 */

/** The three decisions this route takes. There is no fourth. */
type Decision = 'submit' | 'approve' | 'reject'

const DECISIONS: Decision[] = ['submit', 'approve', 'reject']

/** Which statuses each decision may be taken from. */
const FROM: Record<Decision, string[]> = {
  submit: ['DRAFT'],
  approve: ['SUBMITTED'],
  reject: ['SUBMITTED', 'APPROVED'],
}

/**
 * What the log row says, in English.
 *
 * Written per decision rather than interpolated from the verb the API
 * happens to use. `${action} 3 expenses` produced “approve 3 expenses”,
 * which is not a sentence and is not the word a person would use, and
 * “Bulk approve via API” described the transport rather than the reason.
 */
function said(
  decision: Decision,
  count: number,
  by: string,
  why: string | null
): { summary: string; reason: string } {
  const many = count === 1 ? '1 expense' : `${count} expenses`
  if (decision === 'submit') {
    return {
      summary: `Submitted ${many} for review`,
      reason: `${by} sent ${many} to whoever approves expenses here.`,
    }
  }
  if (decision === 'approve') {
    return {
      summary: `Approved ${many}`,
      reason:
        `${by} approved ${many}. A client-billable one rides on the next invoice ` +
        `raised for its engagement.`,
    }
  }
  return {
    summary: `Rejected ${many}`,
    reason: `${by} rejected ${many}: ${why}`,
  }
}

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
  const { action, expenseIds, reason } = body

  if (!action || !Array.isArray(expenseIds) || expenseIds.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'action and expenseIds[] are required' } },
      { status: 422 }
    )
  }

  if (!DECISIONS.includes(action)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `action must be one of: ${DECISIONS.join(', ')}` } },
      { status: 422 }
    )
  }
  const decision: Decision = action

  if (decision === 'reject' && !reason) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'reason is required when rejecting expenses' } },
      { status: 422 }
    )
  }

  // Fetch expenses scoped to caller's company
  const expenses = await prisma.expense.findMany({
    where: {
      id: { in: expenseIds },
      companyId: caller.company?.id,
    },
  })

  if (expenses.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No matching expenses found' } },
      { status: 404 }
    )
  }

  const results: { id: string; status: string; error?: string }[] = []

  for (const expense of expenses) {
    if (!FROM[decision].includes(expense.status)) {
      results.push({
        id: expense.id,
        status: expense.status,
        error: `Cannot ${decision} an expense in ${expense.status} status`,
      })
      continue
    }

    const updateData: any = {}

    switch (decision) {
      case 'submit':
        updateData.status = 'SUBMITTED'
        updateData.submittedAt = new Date()
        break
      case 'approve':
        updateData.status = 'APPROVED'
        updateData.approvedById = caller.person.id
        updateData.approvedAt = new Date()
        break
      case 'reject':
        updateData.status = 'REJECTED'
        updateData.rejectedReason = reason
        break
    }

    await prisma.expense.update({
      where: { id: expense.id },
      data: updateData,
    })

    results.push({
      id: expense.id,
      status: updateData.status,
    })
  }

  // Write automation log
  const successCount = results.filter((r) => !r.error).length
  if (successCount > 0) {
    const words = said(decision, successCount, caller.person.name, reason ?? null)
    await prisma.automationLog.create({
      data: {
        companyId: caller.company!.id,
        action:
          decision === 'submit' ? 'EXPENSE_SUBMITTED'
          : decision === 'approve' ? 'EXPENSE_APPROVED'
          : 'EXPENSE_REJECTED',
        summary: words.summary,
        reason: words.reason,
        payload: { expenseIds: results.filter((r) => !r.error).map((r) => r.id), actor: caller.person.id },
        // Honest, and it used to say a submission could be taken back.
        // Nothing anywhere moves an expense to DRAFT, so a submission
        // cannot be undone, and a rejection is the end of the line for
        // the claim as filed. An approval can be undone while the
        // expense is still unbilled, because reject accepts an APPROVED
        // expense — once it is INVOICED it can no longer be taken back
        // here.
        reversible: decision === 'approve',
      },
    })
  }

  // Notify expense owners about approval/rejection
  if (successCount > 0 && (decision === 'approve' || decision === 'reject')) {
    const processedIds = results.filter((r) => !r.error).map((r) => r.id)
    const processedExpenses = expenses.filter((e) => processedIds.includes(e.id))

    // Group by personId — one notification per person
    const byPerson = new Map<string, number>()
    for (const e of processedExpenses) {
      byPerson.set(e.personId, (byPerson.get(e.personId) ?? 0) + 1)
    }

    const notifications: NotifyParams[] = []
    for (const [personId, count] of byPerson) {
      notifications.push({
        personId,
        companyId: caller.company?.id,
        type: 'EXPENSE',
        title: decision === 'approve'
          ? `${count} expense${count > 1 ? 's' : ''} approved`
          : `${count} expense${count > 1 ? 's' : ''} rejected`,
        body: decision === 'approve'
          ? `Your expense${count > 1 ? 's have' : ' has'} been approved by ${caller.person.name}`
          : `Your expense${count > 1 ? 's have' : ' has'} been rejected by ${caller.person.name}: ${reason}`,
        data: { action: decision, count, reason: reason ?? null },
      })
    }

    if (notifications.length > 0) {
      notifyBulk(notifications)
    }
  }

  return NextResponse.json({
    data: {
      action,
      results,
      processed: successCount,
      errors: results.filter((r) => r.error).length,
    },
  })
}

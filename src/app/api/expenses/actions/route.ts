import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { notifyBulk, type NotifyParams } from '@/lib/notify'

/**
 * POST /api/expenses/actions
 *
 * Batch status transitions for expenses.
 * Actions: submit | approve | reject | invoice
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
 *   invoice: APPROVED → INVOICED (linked to an invoice, client-billable only)
 */
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

  const validActions = ['submit', 'approve', 'reject', 'invoice']
  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `action must be one of: ${validActions.join(', ')}` } },
      { status: 422 }
    )
  }

  if (action === 'reject' && !reason) {
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

  // Validate transitions
  const validTransitions: Record<string, string[]> = {
    submit: ['DRAFT'],
    approve: ['SUBMITTED'],
    reject: ['SUBMITTED', 'APPROVED'],
    invoice: ['APPROVED'],
  }

  const results: { id: string; status: string; error?: string }[] = []

  for (const expense of expenses) {
    const allowed = validTransitions[action]
    if (!allowed.includes(expense.status)) {
      results.push({
        id: expense.id,
        status: expense.status,
        error: `Cannot ${action} an expense in ${expense.status} status`,
      })
      continue
    }

    // For invoice action, only client-billable expenses
    if (action === 'invoice' && !expense.billable) {
      results.push({
        id: expense.id,
        status: expense.status,
        error: 'Only client-billable expenses can be invoiced',
      })
      continue
    }

    const updateData: any = {}

    switch (action) {
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
      case 'invoice':
        updateData.status = 'INVOICED'
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
    await prisma.automationLog.create({
      data: {
        companyId: caller.company!.id,
        action: `expense.${action}`,
        summary: `${action} ${successCount} expense${successCount !== 1 ? 's' : ''}`,
        reason: `Bulk ${action} via API`,
        payload: { expenseIds: results.filter((r) => !r.error).map((r) => r.id), actor: caller.person.id },
        reversible: action === 'submit' || action === 'approve',
      },
    })
  }

  // Notify expense owners about approval/rejection
  if (successCount > 0 && (action === 'approve' || action === 'reject')) {
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
        title: action === 'approve'
          ? `${count} expense${count > 1 ? 's' : ''} approved`
          : `${count} expense${count > 1 ? 's' : ''} rejected`,
        body: action === 'approve'
          ? `Your expense${count > 1 ? 's have' : ' has'} been approved by ${caller.person.name}`
          : `Your expense${count > 1 ? 's have' : ' has'} been rejected by ${caller.person.name}: ${reason}`,
        data: { action, count, reason: reason ?? null },
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

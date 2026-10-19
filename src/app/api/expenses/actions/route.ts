import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { notifyBulk, type NotifyParams } from '@/lib/notify'
import { writingDesk, seatedRefusal, moneyTrailFor } from '@/lib/money/seated-books'
import { askTheDesk } from '@/lib/permissions'
import { rejectRefusal } from '@/lib/money/expense-acceptance'

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
 *   reject:  SUBMITTED | APPROVED → REJECTED (with reason), and never
 *            once a firm above has accepted it
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
        `${by} approved ${many}. A client-billable one rides on the next bill ` +
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

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'An expense belongs to a company' } },
      { status: 403 }
    )
  }

  // The book the decision is taken in, and the role it is judged by: the
  // client's under a seat, the caller's own otherwise or with
  // `?books=own`. The page reads a seated office the client's expenses;
  // approving them acted on the office's own book under its own role.
  const desk = (await writingDesk(caller, request))!
  if (!hasPermission(desk.permissions, 'invoices.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: desk.seat
            ? seatedRefusal(desk.seat, 'Deciding an expense')
            : askTheDesk({
                doing: 'Deciding an expense',
                needs: 'invoices.read',
                kind: caller.company.kind,
                companyName: caller.company.name,
              }),
        },
      },
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

  // Only the desk's own book.
  const expenses = await prisma.expense.findMany({
    where: {
      id: { in: expenseIds },
      companyId: desk.companyId,
    },
  })

  if (expenses.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: desk.seat
            // A supplier's expense is the supplier's own row; the client
            // agreeing to one is not built here, so a seat finds none
            // rather than deciding the office's own.
            ? `${desk.companyName}'s book holds none of these expenses: each is the supplier's ` +
              `own, submitted and decided by the firm that raised it. Your own firm's are on ` +
              `your own books.`
            : 'No matching expenses found',
        },
      },
      { status: 404 }
    )
  }

  const results: { id: string; status: string; error?: string; code?: string }[] = []

  // ── An acceptance above stands ─────────────────────────────────────
  //
  // Once a firm above has accepted an expense (the founder, 2026-10-19:
  // an expense is accepted like a week), it is on that firm's books and
  // on the bill to it. The employer taking its approval back then would
  // leave a bill for money its own worker was told was refused. A
  // send-back above does not stop a rejection: that firm has said it
  // will not pay. `rejectRefusal` says it in one sentence; every firm
  // that accepts is above the employer, and the employer reads the chain
  // above it, so naming the firm hides nobody.
  const acceptedAbove = new Map<string, { companyName: string; acceptedCents: number; createdAt: Date }[]>()
  const words = new Map<string, { personName: string; currency: string }>()
  if (decision === 'reject') {
    const ids = expenses.filter((e) => e.status === 'APPROVED').map((e) => e.id)
    if (ids.length > 0) {
      const [rows, about] = await Promise.all([
        prisma.expenseAcceptance.findMany({
          where: { expenseId: { in: ids }, status: 'ACCEPTED' },
          select: { expenseId: true, acceptedCents: true, createdAt: true, company: { select: { name: true } } },
        }),
        prisma.expense.findMany({
          where: { id: { in: ids } },
          select: { id: true, person: { select: { name: true } }, sellContract: { select: { billCurrency: true } } },
        }),
      ])
      for (const r of rows) {
        const list = acceptedAbove.get(r.expenseId) ?? []
        list.push({ companyName: r.company.name, acceptedCents: r.acceptedCents, createdAt: r.createdAt })
        acceptedAbove.set(r.expenseId, list)
      }
      for (const a of about) {
        words.set(a.id, { personName: a.person.name, currency: (a.sellContract.billCurrency ?? 'USD').toUpperCase() })
      }
    }
  }

  for (const expense of expenses) {
    if (!FROM[decision].includes(expense.status)) {
      results.push({
        id: expense.id,
        status: expense.status,
        error: `Cannot ${decision} an expense in ${expense.status} status`,
      })
      continue
    }

    if (decision === 'reject' && acceptedAbove.has(expense.id)) {
      const w = words.get(expense.id)!
      results.push({
        id: expense.id,
        status: expense.status,
        code: 'ACCEPTED_ABOVE',
        error: rejectRefusal(
          { personName: w.personName, category: expense.category, periodStart: expense.periodStart, currency: w.currency },
          acceptedAbove.get(expense.id)!
        )!,
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
        companyId: desk.companyId,
        action:
          decision === 'submit' ? 'EXPENSE_SUBMITTED'
          : decision === 'approve' ? 'EXPENSE_APPROVED'
          : 'EXPENSE_REJECTED',
        summary: words.summary,
        reason: [moneyTrailFor(desk.seat, words.summary), words.reason].filter(Boolean).join(' '),
        payload: { expenseIds: results.filter((r) => !r.error).map((r) => r.id), actor: caller.person.id },
        // Honest, and it used to say a submission could be taken back.
        // Nothing anywhere moves an expense to DRAFT, so a submission
        // cannot be undone, and a rejection is the end of the line for
        // the claim as filed. An approval can be undone while the
        // expense is still unbilled, because reject accepts an APPROVED
        // expense — once it is INVOICED it can no longer be taken back
        // here, and not once a firm above has accepted it.
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
        companyId: desk.companyId,
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

  // Nothing done, and every one refused because a firm above accepted it:
  // a refusal, said in its own sentence, not a success with errors.
  if (successCount === 0 && results.length > 0 && results.every((r) => r.code === 'ACCEPTED_ABOVE')) {
    return NextResponse.json(
      { error: { code: 'ACCEPTED_ABOVE', message: results.map((r) => r.error).join(' '), results } },
      { status: 409 }
    )
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

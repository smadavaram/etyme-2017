import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, refusalFor } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { needsVerifiedOwnerAt, gateRefusal } from '@/lib/owner-proof'
import { logPaymentRefused } from '@/lib/money/payment-refused'
import { notAtACompany } from '@/app/api/people/not-at-a-company'
import { runPayroll } from '@/lib/money/payroll-run'

/**
 * POST /api/payroll/run
 *
 * Process a payroll batch — mark cycles as completed and log the run.
 *
 * LEGACY_RULES.md §2.5 pipeline:
 *   pending → open → calculated → approved → processed → cleared
 *
 * This endpoint handles the "processed" step: takes a list of buy
 * contract IDs and marks their SALARY_CALCULATE and SALARY_PAY
 * cycles as completed for the current period.
 *
 * PR-01 user story: "As an Accountant, I want to run payroll for a
 * period — see all salaries due, approve the run, generate the
 * export file so that I process payments in one batch instead of
 * per-contract."
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!hasPermission(caller.permissions, 'payroll.run')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: refusalFor(caller, { doing: 'Running payroll', needs: 'payroll.run' }) } },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { buyContractIds, period, action } = body

  if (!buyContractIds || !Array.isArray(buyContractIds) || buyContractIds.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'buyContractIds array is required', field: 'buyContractIds' } },
      { status: 422 }
    )
  }

  if (!action || !['calculate', 'approve', 'process'].includes(action)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'action must be "calculate", "approve", or "process"', field: 'action' } },
      { status: 422 }
    )
  }

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_CONTEXT', message: notAtACompany('Payroll') } },
      { status: 403 }
    )
  }

  // Approving pay and marking it paid wait for a verified Owner, like
  // every other act that pays (founder, 2026-11-11; Layer 7 money review,
  // 2026-11-16), in the gate's own sentence, logged before it is said.
  // Working the figures out pays nobody, so calculate is never held.
  if (action === 'approve' || action === 'process') {
    const owner = await needsVerifiedOwnerAt(companyId, 'PAY_PEOPLE')
    if (!owner.ok) {
      await logPaymentRefused({
        companyId, byPersonId: caller.person.id, door: action === 'approve' ? 'PAYROLL_APPROVE' : 'PAYROLL_PROCESS',
        why: 'OWNER_NOT_VERIFIED', says: owner.says,
      })
      return NextResponse.json(gateRefusal(owner), { status: 403 })
    }
  }

  // The run's own work is lib/money/payroll-run, called by the payroll draft
  // agent as well, in a mode that writes nothing.
  const out = await runPayroll({ companyId, buyContractIds, period, action, runBy: { id: caller.person.id, name: caller.person.name } })
  return NextResponse.json(out.body, { status: out.status })
}

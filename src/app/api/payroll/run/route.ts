import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'

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
      { error: { code: 'FORBIDDEN', message: 'payroll.run permission required' } },
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
      { error: { code: 'NO_CONTEXT', message: 'No company context' } },
      { status: 403 }
    )
  }

  // Verify all buy contracts belong to this company
  const contracts = await prisma.buyContract.findMany({
    where: {
      id: { in: buyContractIds },
      companyId,
    },
    include: {
      candidates: {
        include: { person: { select: { id: true, name: true } } },
      },
      sellLinks: {
        include: {
          sellContract: {
            include: {
              timesheets: {
                where: { status: 'APPROVED' },
                select: { id: true, personId: true, totalHours: true },
              },
            },
          },
        },
      },
      buyCycles: {
        where: {
          kind: { in: ['SALARY_CALCULATE', 'SALARY_PAY'] },
          completedAt: null,
        },
        orderBy: { dueOn: 'asc' },
        take: 1,
      },
    },
  })

  if (contracts.length !== buyContractIds.length) {
    const found = new Set(contracts.map((c) => c.id))
    const missing = buyContractIds.filter((id: string) => !found.has(id))
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Buy contracts not found: ${missing.join(', ')}` } },
      { status: 404 }
    )
  }

  const now = new Date()

  try {
    const result = await prisma.$transaction(async (tx) => {
      const processed: Array<{
        buyContractId: string
        buyContractCandidateId: string
        personName: string
        totalHours: number
        grossPay: number
        cyclesCompleted: number
      }> = []

      for (const bc of contracts) {
        // Cycles sit on the agreement, so completing them is done once per
        // contract rather than once per person.
        const cycleKind =
          action === 'calculate'
            ? 'SALARY_CALCULATE'
            : 'SALARY_PAY'

        const updatedCycles = await tx.cycle.updateMany({
          where: {
            buyContractId: bc.id,
            kind: cycleKind,
            completedAt: null,
          },
          data: {
            completedAt: now,
          },
        })

        // Gross is per candidate at their own rate. Hours are matched by
        // person — paying everyone on the agreement at one rate would be a
        // real financial error once a contract carries more than one person.
        for (const cand of bc.candidates) {
          const approvedHours = bc.sellLinks.reduce(
            (sum, link) =>
              sum +
              link.sellContract.timesheets
                .filter((ts) => ts.personId === cand.personId)
                .reduce((s, ts) => s + Number(ts.totalHours), 0),
            0
          )

          processed.push({
            buyContractId: bc.id,
            buyContractCandidateId: cand.id,
            personName: cand.person.name,
            totalHours: approvedHours,
            grossPay: Math.round(approvedHours * cand.payRate),
            cyclesCompleted: updatedCycles.count,
          })
        }
      }

      // Log the payroll run
      await tx.automationLog.create({
        data: {
          companyId,
          action: 'PAYROLL_RUN',
          summary: `Payroll ${action}: ${processed.length} contracts, $${(
            processed.reduce((s, p) => s + p.grossPay, 0) / 100
          ).toFixed(2)} gross total`,
          reason: `Payroll ${action} initiated by ${caller.person.name}`,
          payload: {
            action,
            period: period ?? null,
            contracts: processed.map((p) => ({
              buyContractId: p.buyContractId,
              person: p.personName,
              hours: p.totalHours,
              grossPay: p.grossPay,
            })),
            runBy: caller.person.id,
            runAt: now.toISOString(),
          },
          reversible: action !== 'process',
        },
      })

      return processed
    })

    const totalGross = result.reduce((s, p) => s + p.grossPay, 0)

    return NextResponse.json({
      data: {
        action,
        contractsProcessed: result.length,
        totalGrossPay: totalGross,
        totalHours: result.reduce((s, p) => s + p.totalHours, 0),
        details: result,
        message: `Payroll ${action} complete: ${result.length} contracts, $${(totalGross / 100).toFixed(2)} gross`,
      },
    })
  } catch (err: any) {
    console.error('Payroll run failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Payroll run failed' } },
      { status: 500 }
    )
  }
}

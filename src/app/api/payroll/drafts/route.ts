import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, refusalFor } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { amount } from '@/lib/money-display'
import { notAtACompany } from '@/app/api/people/not-at-a-company'
import { DRAFT_LABEL, grossSays, peopleIn, type DraftRow } from '@/lib/money/payroll-draft'
import { daySpan } from '@/lib/plain-date'

/**
 * GET /api/payroll/drafts
 *
 * The drafts the payroll agent has prepared for periods that have ended and
 * are not yet run (record 112, chain 4). A draft is what the payroll run
 * would hold, kept as the run's own calculation returned it. Reading it
 * pays nobody and marks nothing; running payroll stays the run's own route
 * and its own gates. Read by whoever reads payroll.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!hasPermission(caller.permissions, 'payroll.read')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: refusalFor(caller, { doing: 'Reading payroll', needs: 'payroll.read' }) } },
      { status: 403 }
    )
  }
  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json({ error: { code: 'NO_CONTEXT', message: notAtACompany('Payroll') } }, { status: 403 })
  }

  const drafts = await prisma.payrollDraft.findMany({
    where: { companyId, state: 'DRAFT' },
    orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
    take: 12,
  })
  return NextResponse.json({
    data: {
      label: DRAFT_LABEL,
      drafts: drafts.map((d) => {
        const rows = d.rows as unknown as DraftRow[]
        return {
          id: d.id,
          period: daySpan(d.periodStart.toISOString().slice(0, 10), d.periodEnd.toISOString().slice(0, 10)),
          periodStart: d.periodStart.toISOString().slice(0, 10),
          periodEnd: d.periodEnd.toISOString().slice(0, 10),
          preparedAt: d.createdAt.toISOString(),
          people: peopleIn(rows),
          totalGross: grossSays(rows),
          rows: rows.map((r) => ({
            person: r.person, hours: r.hours, overtimeHours: r.overtimeHours,
            grossPay: amount(r.grossPay, r.currency), currency: r.currency, held: r.held,
          })),
        }
      }),
    },
  })
}

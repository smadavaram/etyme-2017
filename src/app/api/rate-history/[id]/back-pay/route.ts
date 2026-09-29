import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { isConsultantSeat } from '@/lib/seat'
import { lineFor } from '@/lib/rate-line'
import { proposeBackPay } from '@/lib/money/back-pay'

/**
 * GET /api/rate-history/:id/back-pay
 *
 * What an approved pay change owes on days already paid at the old rate,
 * as a proposal a payroll desk approves — one off-cycle payment per pay
 * period, through `POST /api/payroll/off-cycle` with this change's id.
 * Nothing here pays anybody.
 *
 * Read by the firm that pays the line, at a desk that reads what people
 * cost. Anybody else is told there is nothing here, the same as for a
 * change that does not exist.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params

  const change = await prisma.rateHistory.findUnique({ where: { id }, select: { contractType: true, contractId: true } })
  const line = change && change.contractType.toUpperCase() === 'BUY' ? await lineFor('BUY', change.contractId) : null
  const mine = caller.company?.id ?? null
  if (!change || !line || !mine || isConsultantSeat(caller) || line.payerId !== mine) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'There is no pay change here on a line your company pays.' } },
      { status: 404 }
    )
  }
  if (!hasPermission(caller.permissions, 'consultants.cost')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Reading what somebody is owed',
            needs: 'consultants.cost',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  const p = await proposeBackPay(id)
  if (!p) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such pay change.' } }, { status: 404 })
  }

  return NextResponse.json({
    data: p.applies
      ? {
          applies: true,
          totalCents: p.figure.totalCents,
          currency: p.currency,
          weeks: p.figure.weeks,
          payments: p.figure.periods.map((x) => ({
            periodStart: x.periodStart,
            label: x.label,
            amountCents: x.amountCents,
            sellContractId: x.sellContractId,
            personId: x.personId,
            weeks: x.weeks,
          })),
          says: p.says,
          // The button is offered only to a desk the off-cycle route will
          // accept, so the screen cannot offer a payment it would refuse.
          mayPay: hasPermission(caller.permissions, 'payroll.run'),
        }
      : { applies: false, totalCents: null, weeks: [], payments: [], says: p.says, mayPay: false },
  })
}

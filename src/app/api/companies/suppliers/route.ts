import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { writingDesk, seatedRefusal } from '@/lib/money/seated-books'
import { noteSeatRead } from '@/lib/program-seat'
import { suppliersOf } from '@/lib/suppliers-of'

/**
 * GET /api/companies/suppliers — the firms a purchase order may go to.
 *
 * The picker on Purchase orders read `/api/companies`, which is the
 * caller's own directory. A program office raising an order in a
 * client's seat was offered the office's own counterparties — firms the
 * client has never bought from — while the order itself was written on
 * the client's book. The list and the write disagreed about whose order
 * it was.
 *
 * So this list is read from the same desk the write uses
 * (`writingDesk`): the client's suppliers in a seat, the caller's own
 * with `?books=own` or with no seat. It is the same answer the write
 * checks against (`lib/suppliers-of`), so a firm offered here is a firm
 * the order may go to, and a blocked firm is offered nowhere.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Suppliers belong to a company' } },
      { status: 403 }
    )
  }

  const desk = (await writingDesk(caller, request))!
  if (!hasPermission(desk.permissions, 'invoices.issue') && !hasPermission(desk.permissions, 'vendors.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: desk.seat
            ? seatedRefusal(desk.seat, 'Reading the suppliers a purchase order may go to')
            : askTheDesk({
                doing: 'Reading the suppliers a purchase order may go to',
                needs: 'invoices.issue',
                kind: caller.company.kind,
                companyName: caller.company.name,
              }),
        },
      },
      { status: 403 }
    )
  }

  const suppliers = await suppliersOf(desk.companyId)
  const companies = await prisma.company.findMany({
    where: { id: { in: [...suppliers.ids] } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, kind: true, claimedAt: true },
  })

  if (desk.seat) void noteSeatRead(desk.seat, desk.acting, 'Suppliers a purchase order may go to')

  return NextResponse.json({
    data: {
      buyer: { id: desk.companyId, name: desk.companyName },
      seated: Boolean(desk.seat),
      says: desk.seat
        ? `${desk.companyName}'s suppliers. An order raised here is ${desk.companyName}'s.`
        : null,
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        onEtyme: c.claimedAt != null,
      })),
    },
  })
}

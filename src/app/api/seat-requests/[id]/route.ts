import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { notify } from '@/lib/notify'

/**
 * POST /api/seat-requests/:id   { action: "not-now" }
 *
 * The client answers an MSP's ask with Not now. Only a desk that may
 * grant a seat may answer it (`governance.write`, as `mayGrantSeat`), and
 * only at the client asked. The MSP is told in one line. A grant needs no
 * answer here: the seat itself, made through `POST /api/program/seats`,
 * is what closes an ask.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Seat requests')
  if (notStaff) return notStaff
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  if (body.action !== 'not-now') {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'An ask is answered by granting the seat, or with Not now.' } }, { status: 422 })
  }

  const row = await prisma.programSeatRequest.findUnique({
    where: { id },
    select: { id: true, clientCompanyId: true, closedAt: true, askedById: true, officeCompanyId: true, officeCompany: { select: { name: true } } },
  })
  if (!row || row.clientCompanyId !== caller.company!.id) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such ask was made of this company.' } }, { status: 404 })
  }
  if (!hasPermission(caller.permissions, 'governance.write')) {
    return NextResponse.json(
      { error: { code: 'NOT_YOURS_TO_ANSWER', message: 'Only an owner or the program manager answers an ask for a seat: the people who may grant one.' } },
      { status: 403 }
    )
  }
  if (row.closedAt) {
    return NextResponse.json({ data: { id, says: `You already answered ${row.officeCompany.name}.` } })
  }
  await prisma.programSeatRequest.update({ where: { id }, data: { closedAt: new Date(), closedById: caller.person.id } })
  void notify({
    personId: row.askedById, companyId: row.officeCompanyId, type: 'SYSTEM', entityId: id,
    title: `${caller.company!.name} answered Not now`,
    body: `${caller.person.name} at ${caller.company!.name} answered Not now to your ask for a seat in their program.`,
    data: { href: '/dashboard/program/seats' },
  })
  return NextResponse.json({ data: { id, says: `${row.officeCompany.name} is told Not now.` } })
}

import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'

/**
 * POST /api/onboarding/confirm-start — somebody says the person actually
 * walked in.
 *
 * The fact every invoice stands on. Recorded with a name and a time,
 * never inferred from a contract date — a start date is a plan, and a
 * confirmed start is a fact, and billing runs on facts.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Onboarding')
  if (notStaff) return notStaff

  const body = await request.json().catch(() => ({}))
  const contractId = String(body?.contractId ?? '')

  const contract = await prisma.sellContract.findFirst({
    where: { id: contractId, companyId: caller.company!.id },
    select: { id: true, startConfirmedAt: true, person: { select: { name: true } } },
  })
  if (!contract) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No contract of yours by that id.' } },
      { status: 404 }
    )
  }
  if (contract.startConfirmedAt) {
    return NextResponse.json(
      { error: { code: 'ALREADY', message: 'Already confirmed. A fact does not need saying twice.' } },
      { status: 409 }
    )
  }

  await prisma.sellContract.update({
    where: { id: contract.id },
    data: { startConfirmedAt: new Date(), startConfirmedById: caller.person.id },
  })

  return NextResponse.json({
    data: { says: `${contract.person.name} confirmed on site. Billing now stands on a fact.` },
  })
}

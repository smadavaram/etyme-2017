import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { actingDesk } from '@/lib/program-seat'
import { notify } from '@/lib/notify'
import { recordAccess } from '@/lib/access-log'
import { answeredSays, noSays, readStartIdentity } from './answer'

/**
 * POST /api/program/start-identity — the hiring manager answers "Is the
 * person who started the person you interviewed?" for one start.
 *
 * Body: { contractId, confirmed: true | false }. Written to the client's
 * own line (the contract it pays) with who and when; a second answer
 * replaces the first, because a No pressed by mistake must be undoable by
 * the same person. A No tells the client's HR and the supplier in one
 * sentence (`./answer`).
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Starts')
  if (notStaff) return notStaff

  const desk = await actingDesk(caller)
  const permissions = desk?.permissions ?? caller.permissions
  // Whoever is hiring met the person; the question is theirs.
  if (!desk || !hasPermission(permissions, 'requirements.write')) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_HIRING',
          message: 'Whether the person who started is the person interviewed is for whoever is hiring: a hiring or program manager.',
        },
      },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const read = readStartIdentity(body)
  if (!read.ok) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: read.says, field: read.field } }, { status: 422 })
  }
  const contractId = typeof body?.contractId === 'string' ? body.contractId : ''

  const contract = await prisma.sellContract.findFirst({
    where: {
      id: contractId,
      OR: [{ clientCompanyId: desk.companyId }, { endClientCompanyId: desk.companyId }],
    },
    select: {
      id: true, personId: true, companyId: true,
      person: { select: { name: true } },
      company: { select: { name: true } },
    },
  })
  if (!contract) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `No start at ${desk.companyName} by that id.` } },
      { status: 404 }
    )
  }

  const now = new Date()
  await prisma.sellContract.update({
    where: { id: contract.id },
    data: {
      startIdentityConfirmed: read.confirmed,
      startIdentityConfirmedById: caller.person.id,
      startIdentityConfirmedAt: now,
    },
  })
  await recordAccess([contract.personId], {
    actorPersonId: caller.person.id,
    actorCompanyId: desk.companyId,
    action: 'CONTRACT_VIEW',
    reason: `Answered whether the person who started is the person interviewed: ${read.confirmed ? 'yes' : 'no'}`,
  })

  if (!read.confirmed) {
    const says = noSays({
      personName: contract.person.name,
      answeredBy: caller.person.name,
      supplierName: contract.company.name,
      clientName: desk.companyName,
    })
    const [hr, supplier] = await Promise.all([
      prisma.context.findMany({
        where: {
          companyId: desk.companyId,
          revokedAt: null,
          role: { name: { in: ['HR', 'HR Partner', 'Compliance Officer'] } },
        },
        select: { personId: true },
        take: 5,
      }),
      prisma.context.findMany({
        where: {
          companyId: contract.companyId,
          revokedAt: null,
          role: { permissions: { hasSome: ['assignments.write', 'submissions.read', '*'] } },
        },
        select: { personId: true },
        take: 5,
      }),
    ])
    const title = `${contract.person.name}'s start is held: not the person interviewed`
    for (const h of hr) {
      void notify({ personId: h.personId, companyId: desk.companyId, type: 'CONTRACT', title, body: says, entityId: contract.id })
    }
    for (const s of supplier) {
      void notify({ personId: s.personId, companyId: contract.companyId, type: 'CONTRACT', title, body: says, entityId: contract.id })
    }
  }

  return NextResponse.json({
    data: { contractId: contract.id, confirmed: read.confirmed, says: answeredSays(read.confirmed, contract.person.name) },
  })
}

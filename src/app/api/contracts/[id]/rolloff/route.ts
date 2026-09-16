import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { hasPermission } from '@/lib/permissions'
import { contractSide } from '@/lib/resolve-client-company'

/**
 * POST /api/contracts/:id/rolloff
 *
 * Creates a rolloff event for a sell contract. Signals that the
 * contractor is rolling off and starts the exit checklist.
 *
 * BRD §16: six-party fan-out on rolloff.
 * Checklist: knowledge transfer · final timesheet · access revocation · assets
 *
 * Only IN_PROGRESS or PAUSED contracts can roll off.
 * A contract can only have one rolloff event (unique on sellContractId).
 *
 * Starting somebody's exit is the same authority as ending their
 * contract, and this route asked only for a session — so any account
 * could begin the rolloff of anybody's placement, tell six parties it
 * was happening, and put the person on a bench they had not left.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const actor = { id: caller.person.id }

  const { id } = await params

  const contract = await prisma.sellContract.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      endClientCompany: { select: { id: true, name: true } },
      company: { select: { id: true, name: true } },
      rolloff: true,
    },
  })

  if (!contract) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Contract not found' } },
      { status: 404 }
    )
  }

  const side = contractSide(caller, contract)
  if (!side) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_A_PARTY',
          message: `${caller.company?.name ?? 'Your company'} is not a party to this contract. Only ${contract.company.name}, ${contract.clientCompany.name}${contract.endClientCompany ? ` or ${contract.endClientCompany.name}` : ''} can roll somebody off it.`,
        },
      },
      { status: 403 }
    )
  }

  // The same permission that ends a contract, because this begins the end.
  if (!hasPermission(caller.permissions, 'assignments.terminate')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Rolling somebody off needs the assignments.terminate permission. Ask whoever runs your company\'s access.',
        },
      },
      { status: 403 }
    )
  }

  if (!['IN_PROGRESS', 'PAUSED'].includes(contract.state)) {
    return NextResponse.json(
      { error: { code: 'INVALID_STATE', message: `Cannot roll off a ${contract.state} contract` } },
      { status: 409 }
    )
  }

  if (contract.rolloff) {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: 'Rolloff event already exists for this contract' } },
      { status: 409 }
    )
  }

  const endDate = contract.endDate ?? new Date()

  await prisma.$transaction([
    prisma.rolloffEvent.create({
      data: {
        sellContractId: id,
        endDate,
        notified: {
          client: { name: contract.clientCompany.name, at: new Date().toISOString() },
          vendor: { name: contract.company.name, at: new Date().toISOString() },
        },
        checklist: {
          knowledgeTransfer: false,
          finalTimesheet: false,
          accessRevocation: false,
          assets: false,
        },
      },
    }),
    prisma.automationLog.create({
      data: {
        companyId: contract.clientCompany.id,
        action: 'ROLLOFF_INITIATED',
        summary: `Rolloff initiated for ${contract.person.name} at ${contract.endClientCompany?.name ?? contract.clientCompany.name}, ending ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        reason: 'Initiated via Program dashboard',
        payload: {
          contractId: id,
          personId: contract.person.id,
          vendorId: contract.company.id,
          clientId: contract.clientCompany.id,
          endDate: endDate.toISOString(),
        },
        reversible: false,
      },
    }),
  ])

  void emit({
    type: 'contract.rolled_off',
    companyId: contract.clientCompany.id,
    subjectType: 'SellContract',
    subjectId: id,
    actorPersonId: actor?.id ?? null,
    payload: {
      personId: contract.person.id,
      vendorCompanyId: contract.company.id,
      endClientCompanyId: contract.endClientCompany?.id ?? contract.clientCompany.id,
      endDate: endDate.toISOString(),
    },
  })

  return NextResponse.json({
    data: {
      contractId: id,
      personName: contract.person.name,
      endDate: endDate.toISOString(),
      message: `Rolloff initiated for ${contract.person.name}`,
    },
  })
}

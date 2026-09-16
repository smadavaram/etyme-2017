import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { evaluateGovernance } from '@/lib/governance'
import { hasPermission } from '@/lib/permissions'
import { contractSide } from '@/lib/resolve-client-company'
import { resolvedEndClientId } from '@/lib/resolve-end-client'

/**
 * POST /api/contracts/:id/extend
 *
 * Extends a sell contract's end date by 3 months (default) or a specified number of months.
 * Body: { months?: number } — defaults to 3
 *
 * Only IN_PROGRESS or PAUSED contracts can be extended.
 *
 * Who may is the same question `activate` answers, and this route was not
 * asking it: it checked that somebody was signed in and then moved
 * whatever contract id it was handed. An extension carries the end date
 * forward and writes the billing and pay cycles behind it, so an account
 * with no connection to either company could put months of money on
 * somebody else's placement.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const actor = { id: caller.person.id }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const months = body.months ?? 3

  if (typeof months !== 'number' || months < 1 || months > 24) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'months must be between 1 and 24' } },
      { status: 422 }
    )
  }

  const contract = await prisma.sellContract.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      endClientCompany: { select: { id: true, name: true } },
      workLocation: { select: { id: true, name: true, city: true, state: true, isRemote: true } },
      company: { select: { id: true, name: true } },
    },
  })

  if (!contract) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Contract not found' } },
      { status: 404 }
    )
  }

  // A stranger is told so in words; a party missing the permission is told
  // which one, because "forbidden" on a button on their own screen reads
  // as a fault.
  const side = contractSide(caller, contract)
  if (!side) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_A_PARTY',
          message: `${caller.company?.name ?? 'Your company'} is not a party to this contract. Only ${contract.company.name}, ${contract.clientCompany.name}${contract.endClientCompany ? ` or ${contract.endClientCompany.name}` : ''} can extend it.`,
        },
      },
      { status: 403 }
    )
  }

  if (!hasPermission(caller.permissions, 'assignments.write')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Extending a placement needs the assignments.write permission. Ask whoever runs your company\'s access.',
        },
      },
      { status: 403 }
    )
  }

  if (!['IN_PROGRESS', 'PAUSED'].includes(contract.state)) {
    return NextResponse.json(
      { error: { code: 'INVALID_STATE', message: `Cannot extend a ${contract.state} contract` } },
      { status: 409 }
    )
  }

  // ── Governance check on extension ──
  const endClientId = resolvedEndClientId(contract)

  const governance = await evaluateGovernance({
    personId: contract.personId,
    endClientCompanyId: endClientId,
    vendorCompanyId: contract.companyId,
    triggerPoint: 'EXTENSION',
    subjectType: 'SELL_CONTRACT',
    subjectId: id,
    billRate: contract.billRate,
  })

  if (!governance.canProceed) {
    return NextResponse.json(
      {
        error: {
          code: 'GOVERNANCE_BLOCK',
          message: governance.summary,
          evaluations: governance.evaluations,
        },
      },
      { status: 403 }
    )
  }

  // Warnings: proceed but include in response
  // (contract extensions are critical for compliance — tenure warnings here are especially important)

  const oldEnd = contract.endDate
  const baseDate = oldEnd ?? new Date()
  const newEnd = new Date(baseDate)
  newEnd.setMonth(newEnd.getMonth() + months)

  await prisma.$transaction([
    prisma.sellContract.update({
      where: { id },
      data: { endDate: newEnd },
    }),
    prisma.automationLog.create({
      data: {
        companyId: contract.clientCompany.id,
        action: 'CONTRACT_EXTENDED',
        summary: `${contract.person.name}'s contract at ${contract.endClientCompany?.name ?? contract.clientCompany.name} extended by ${months} month${months !== 1 ? 's' : ''} to ${newEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        reason: 'Extended via Program dashboard',
        payload: {
          contractId: id,
          personId: contract.person.id,
          vendorId: contract.company.id,
          clientId: contract.clientCompany.id,
          oldEndDate: oldEnd?.toISOString() ?? null,
          newEndDate: newEnd.toISOString(),
          months,
        },
        reversible: true,
      },
    }),
  ])

  void emit({
    type: 'contract.extended',
    companyId: contract.clientCompany.id,
    subjectType: 'SellContract',
    subjectId: id,
    actorPersonId: actor?.id ?? null,
    payload: {
      personId: contract.person.id,
      vendorCompanyId: contract.company.id,
      // The end client, not the payer. Tenure accrues where the person
      // works, so this is the id that matters downstream.
      endClientCompanyId: contract.endClientCompany?.id ?? contract.clientCompany.id,
      oldEndDate: oldEnd?.toISOString() ?? null,
      newEndDate: newEnd.toISOString(),
      months,
    },
  })

  const warnings = governance.evaluations.filter((e) => e.outcome === 'WARN')

  return NextResponse.json({
    data: {
      id,
      personName: contract.person.name,
      newEndDate: newEnd.toISOString(),
      message: `Contract extended by ${months} month${months !== 1 ? 's' : ''}`,
      ...(warnings.length > 0 && {
        governanceWarnings: warnings.map((w) => ({
          ruleType: w.ruleType,
          reason: w.reason,
        })),
      }),
    },
  })
}

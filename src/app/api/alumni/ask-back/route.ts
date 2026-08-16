import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { notify } from '@/lib/notify'

/**
 * POST /api/alumni/ask-back
 *
 * Initiates a re-engagement request for an alumni person at a client.
 * Body: { personId: string, clientCompanyId: string }
 *
 * Addendum E §E.2.3: checks the tenure ledger before allowing the
 * action. Inside a break period, returns 409.
 *
 * Creates an AutomationLog entry and returns the request details.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json()
  const { personId, clientCompanyId } = body

  if (!personId || !clientCompanyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'personId and clientCompanyId are required' } },
      { status: 422 }
    )
  }

  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, name: true },
  })

  if (!person) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Person not found' } },
      { status: 404 }
    )
  }

  const client = await prisma.company.findUnique({
    where: { id: clientCompanyId },
    select: { id: true, name: true },
  })

  if (!client) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Client company not found' } },
      { status: 404 }
    )
  }

  // Check if person already has an active contract at this end client
  // Matches contracts where the end client is this company (via endClientFilter)
  const activeContract = await prisma.sellContract.findFirst({
    where: {
      personId,
      ...endClientFilter(clientCompanyId),
      state: { in: ['IN_PROGRESS', 'PAUSED'] },
    },
  })

  if (activeContract) {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: `${person.name} already has an active contract at ${client.name}` } },
      { status: 409 }
    )
  }

  // Check tenure eligibility (Addendum E §E.2.3)
  // Tenure aggregates at the end client — find all contracts where this person
  // worked at this company, regardless of paying customer
  const contracts = await prisma.sellContract.findMany({
    where: {
      personId,
      ...endClientFilter(clientCompanyId),
      state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED'] },
    },
    select: { startDate: true, endDate: true, state: true },
  })

  const now = new Date()
  const totalDays = contracts.reduce((sum, c) => {
    const end = c.endDate ?? now
    return sum + Math.max(0, Math.ceil((end.getTime() - c.startDate.getTime()) / (1000 * 60 * 60 * 24)))
  }, 0)

  // Load tenure cap and break rules
  const tenureRule = await prisma.governanceRule.findFirst({
    where: {
      policy: { companyId: clientCompanyId, isActive: true },
      ruleType: 'TENURE_CAP',
      isActive: true,
    },
  })

  const breakRule = await prisma.governanceRule.findFirst({
    where: {
      policy: { companyId: clientCompanyId, isActive: true },
      ruleType: 'BREAK_IN_SERVICE',
      isActive: true,
    },
  })

  const capDays = tenureRule
    ? Math.round((tenureRule.parameters as any).maxMonths * 30.44)
    : null
  const breakDaysPolicy = breakRule
    ? (breakRule.parameters as any).breakDays
    : null

  if (capDays !== null && totalDays >= capDays && breakDaysPolicy !== null) {
    const lastEnd = contracts
      .filter(c => c.endDate)
      .sort((a, b) => b.endDate!.getTime() - a.endDate!.getTime())[0]?.endDate

    if (lastEnd) {
      const daysSinceEnd = Math.ceil((now.getTime() - lastEnd.getTime()) / (1000 * 60 * 60 * 24))
      if (daysSinceEnd < breakDaysPolicy) {
        const eligible = new Date(lastEnd.getTime() + breakDaysPolicy * 24 * 60 * 60 * 1000)
        return NextResponse.json(
          {
            error: {
              code: 'BREAK_PERIOD',
              message: `${person.name} is in a break period. Eligible ${eligible.toISOString().slice(0, 10)}.`,
              eligibleDate: eligible.toISOString().slice(0, 10),
            },
          },
          { status: 409 }
        )
      }
    }
  }

  // Log the re-engagement request
  await prisma.automationLog.create({
    data: {
      companyId: clientCompanyId,
      action: 'ALUMNI_ASK_BACK',
      summary: `Re-engagement request initiated for ${person.name} at ${client.name}`,
      reason: 'Client requested alumni re-engagement via Program dashboard',
      payload: {
        personId,
        clientCompanyId,
        totalDays,
        tenureCapDays: capDays,
      },
      reversible: true,
    },
  })

  // Notify the vendor company admins about the re-engagement request
  const vendorContexts = await prisma.context.findMany({
    where: {
      companyId: caller.company?.id,
      role: { permissions: { hasSome: ['assignments.write'] } },
    },
    select: { personId: true },
    take: 5,
  })

  for (const ctx of vendorContexts) {
    if (ctx.personId === caller.person.id) continue // don't notify the initiator
    notify({
      personId: ctx.personId,
      companyId: caller.company?.id,
      type: 'CONTRACT',
      title: `Alumni re-engagement: ${person.name}`,
      body: `${caller.person.name} requested to bring back ${person.name} at ${client.name}`,
      data: { personId, clientCompanyId, action: 'ASK_BACK' },
    })
  }

  return NextResponse.json({
    data: {
      personId,
      personName: person.name,
      clientName: client.name,
      message: `Re-engagement request sent for ${person.name}`,
    },
  })
}

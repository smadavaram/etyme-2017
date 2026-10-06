import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { notify } from '@/lib/notify'
import { daysOnSite } from '@/lib/tenure-days'
import { askBack } from '../ask-back-standing'

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
  // The union of the periods, not their sum. A person bought through a
  // prime who bought from a bench vendor has two contracts for the same
  // days at the same site; adding them said somebody three firms deep had
  // been there three times as long, and a cap of eighteen months blocked
  // them at six. `daysOnSite` is the ledger's own arithmetic (Addendum E).
  const totalDays = daysOnSite(contracts, now)

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

  // The same standing the alumni list, the ledger and the award read
  // (lib/tenure-days), so a request the list did not offer a button for
  // is refused here with the same day — or with no day, where the client
  // has no break rule that would reset a passed limit.
  const limitRules = {
    capMonths: tenureRule ? (tenureRule.parameters as any).maxMonths ?? null : null,
    breakDays: breakRule ? (breakRule.parameters as any).breakDays ?? null : null,
  }
  const verdict = askBack(
    contracts.map((c) => ({ startDate: c.startDate, endDate: c.endDate, live: c.state !== 'ENDED' })),
    limitRules,
    now
  )
  if (!verdict.canReengage) {
    const inBreak = verdict.ledgerStatus === 'IN_BREAK'
    return NextResponse.json(
      {
        error: {
          code: inBreak ? 'BREAK_PERIOD' : 'TIME_LIMIT',
          message: `${person.name} cannot be asked back to ${client.name} yet. ${verdict.reengageBlockReason ?? ''}`.trim(),
          eligibleDate: verdict.eligibleDate,
        },
      },
      { status: 409 }
    )
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
        tenureCapMonths: limitRules.capMonths,
        ledgerStatus: verdict.ledgerStatus,
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

import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { sellContractScope } from '@/lib/resolve-client-company'
import { accountFilterFor } from '@/lib/account-walls'
import { andAll } from '@/lib/walls'

/**
 * GET /api/rolloff
 *
 * BUILD.md: window=30|60|90
 *
 * Returns sell contracts ending within the specified window,
 * sorted by urgency (soonest first).
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'The rolloff board')
  if (notStaff) return notStaff

  const url = request.nextUrl
  const window = parseInt(url.searchParams.get('window') ?? '30', 10)

  if (![30, 60, 90].includes(window)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'window must be 30, 60, or 90', field: 'window' } },
      { status: 422 }
    )
  }

  // Scoped to the caller's side of the placement. A client sees people
  // rolling off their own sites; a vendor sees their own bench exposure.
  const scope = sellContractScope(caller)
  if (!scope) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'No company context' } },
      { status: 403 }
    )
  }

  const now = new Date()
  const windowEnd = new Date(now.getTime() + window * 24 * 60 * 60 * 1000)

  // And, inside a firm that separates its accounts, to the accounts this
  // reader belongs to. Who is rolling off another client's account is that
  // client's business, not the whole firm's.
  const wall = await accountFilterFor(
    caller,
    caller.company?.kind === 'CLIENT' ? 'orgUnitId' : 'deliveryUnitId'
  )

  const where: any = {
    endDate: {
      gte: now,
      lte: windowEnd,
    },
    sellContract: andAll(scope, wall.where),
  }

  const rolloffs = await prisma.rolloffEvent.findMany({
    where,
    include: {
      sellContract: {
        include: {
          person: { select: { id: true, name: true } },
          clientCompany: { select: { id: true, name: true } },
          endClientCompany: { select: { id: true, name: true } },
          workLocation: { select: { id: true, name: true, city: true, state: true, isRemote: true } },
          engagement: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: { endDate: 'asc' },
  })

  // Also find sell contracts ending within the window that DON'T have rolloff events yet
  const contractWhere: any = {
    ...scope,
    endDate: {
      gte: now,
      lte: windowEnd,
    },
    state: { in: ['IN_PROGRESS', 'DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'] },
    rolloff: null, // no rolloff event yet
  }

  const untracked = await prisma.sellContract.findMany({
    where: contractWhere,
    include: {
      person: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      endClientCompany: { select: { id: true, name: true } },
      workLocation: { select: { id: true, name: true, city: true, state: true, isRemote: true } },
      engagement: { select: { id: true, title: true } },
    },
    orderBy: { endDate: 'asc' },
  })

  return NextResponse.json({
    data: {
      window,
      tracked: rolloffs.map((r) => ({
        id: r.id,
        sellContractId: r.sellContractId,
        endDate: r.endDate.toISOString(),
        daysLeft: Math.ceil((r.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
        person: r.sellContract.person,
        clientCompany: r.sellContract.clientCompany,
        endClientCompany: r.sellContract.endClientCompany,
        workLocation: r.sellContract.workLocation,
        engagement: r.sellContract.engagement,
        billRate: r.sellContract.billRate,
        checklist: r.checklist,
        claimedById: r.claimedById,
        outcome: r.outcome,
        notified: r.notified,
      })),
      untracked: untracked.map((c) => ({
        sellContractId: c.id,
        endDate: c.endDate!.toISOString(),
        daysLeft: Math.ceil((c.endDate!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
        person: c.person,
        clientCompany: c.clientCompany,
        endClientCompany: c.endClientCompany,
        workLocation: c.workLocation,
        engagement: c.engagement,
        billRate: c.billRate,
      })),
      summary: {
        total: rolloffs.length + untracked.length,
        tracked: rolloffs.length,
        untracked: untracked.length,
        claimed: rolloffs.filter((r) => r.claimedById).length,
        resolved: rolloffs.filter((r) => r.outcome).length,
      },
    },
  })
}

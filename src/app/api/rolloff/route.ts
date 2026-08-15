import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * GET /api/rolloff
 *
 * BUILD.md: window=30|60|90
 *
 * Returns sell contracts ending within the specified window,
 * sorted by urgency (soonest first).
 */
export async function GET(request: NextRequest) {
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const url = request.nextUrl
  const window = parseInt(url.searchParams.get('window') ?? '30', 10)
  const companyId = url.searchParams.get('companyId')

  if (![30, 60, 90].includes(window)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'window must be 30, 60, or 90', field: 'window' } },
      { status: 422 }
    )
  }

  const now = new Date()
  const windowEnd = new Date(now.getTime() + window * 24 * 60 * 60 * 1000)

  const where: any = {
    endDate: {
      gte: now,
      lte: windowEnd,
    },
  }

  if (companyId) {
    where.sellContract = { companyId }
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
    endDate: {
      gte: now,
      lte: windowEnd,
    },
    state: { in: ['IN_PROGRESS', 'DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'] },
    rolloff: null, // no rolloff event yet
  }

  if (companyId) {
    contractWhere.companyId = companyId
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

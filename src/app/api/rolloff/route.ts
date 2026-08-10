import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * GET /api/rolloff
 *
 * BUILD.md: window=30|60|90
 *
 * Returns assignments ending within the specified window,
 * sorted by urgency (soonest first).
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
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
    where.assignment = { employerCompanyId: companyId }
  }

  const rolloffs = await prisma.rolloffEvent.findMany({
    where,
    include: {
      assignment: {
        include: {
          person: { select: { id: true, name: true } },
          engagement: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: { endDate: 'asc' },
  })

  // Also find assignments ending within the window that DON'T have rolloff events yet
  const assignmentWhere: any = {
    endDate: {
      gte: now,
      lte: windowEnd,
    },
    state: { in: ['IN_PROGRESS', 'PENDING', 'ACCEPTED'] },
    rolloff: null, // no rolloff event yet
  }

  if (companyId) {
    assignmentWhere.employerCompanyId = companyId
  }

  const untracked = await prisma.assignment.findMany({
    where: assignmentWhere,
    include: {
      person: { select: { id: true, name: true } },
      engagement: { select: { id: true, title: true } },
    },
    orderBy: { endDate: 'asc' },
  })

  return NextResponse.json({
    data: {
      window,
      tracked: rolloffs.map((r) => ({
        id: r.id,
        assignmentId: r.assignmentId,
        endDate: r.endDate.toISOString(),
        daysLeft: Math.ceil((r.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
        person: r.assignment.person,
        engagement: r.assignment.engagement,
        contractType: r.assignment.contractType,
        payRate: r.assignment.payRate,
        billRate: r.assignment.billRate,
        checklist: r.checklist,
        claimedById: r.claimedById,
        outcome: r.outcome,
        notified: r.notified,
      })),
      untracked: untracked.map((a) => ({
        assignmentId: a.id,
        endDate: a.endDate!.toISOString(),
        daysLeft: Math.ceil((a.endDate!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
        person: a.person,
        engagement: a.engagement,
        contractType: a.contractType,
        payRate: a.payRate,
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

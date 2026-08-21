import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { drawSample, agreement, thisWeek, question, SAMPLE_SIZE } from '@/lib/review'

/**
 * GET /api/checks/queue
 *
 * This week's sample of what the model decided, for a person to look at.
 *
 * Only machine checks. A rule cannot be wrong in an interesting way, and
 * putting rules in here would bury the ones worth reading.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'The check queue')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const now = new Date()

  // Six weeks back. Reviewing a decision from March teaches nothing about
  // the model running today.
  const since = new Date(now.getTime() - 42 * 86400000)

  const [candidates, reviewed] = await Promise.all([
    prisma.check.findMany({
      where: { companyId, checker: 'MODEL', agreed: null, at: { gte: since } },
      orderBy: { at: 'asc' },
      take: 200,
    }),
    prisma.check.findMany({
      where: { companyId, checker: 'MODEL', agreed: { not: null } },
      orderBy: { at: 'desc' },
      take: 50,
      select: { agreed: true, at: true },
    }),
  ])

  const sample = drawSample(
    candidates.map((c) => ({
      id: c.id,
      code: c.code,
      verdict: c.verdict as 'PASS' | 'FAIL',
      reason: c.reason,
      evidence: c.evidence,
      at: c.at,
      agreed: c.agreed,
    })),
    SAMPLE_SIZE
  )

  return NextResponse.json({
    data: {
      sample: sample.map((c) => ({
        id: c.id,
        code: c.code,
        verdict: c.verdict,
        at: c.at.toISOString(),
        ...question(c),
      })),
      waiting: candidates.length,
      agreement: agreement(reviewed),
      week: thisWeek(reviewed, now),
    },
  })
}

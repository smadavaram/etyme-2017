import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { drawSample, agreement, thisWeek, question, SAMPLE_SIZE } from '@/lib/review'

/**
 * GET /api/checks/queue
 *
 * This week's sample of what the machine decided, for a person to look at.
 *
 * Not only submissions. Anything any loop was unsure about lands here —
 * a model's judgement on a CV, a lead that is *probably* the same seat, a
 * quality verdict on a role. The audit found a signpost with nothing
 * behind it: leads were flagged "might be a duplicate — have a look" and
 * there was nowhere to look.
 *
 * Still only model checks and the leads. A rule cannot be wrong in an
 * interesting way, so a loop made entirely of rules — requirement quality
 * is one — has nothing to sample here, and that is correct rather than a
 * gap. The response says so, because an empty queue that means "nothing
 * to review" and an empty queue that means "this surface is never sampled"
 * look identical otherwise.
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

  const [candidates, reviewed, maybes] = await Promise.all([
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
    // Leads the collapse could not settle. SAME joins a seat on its own;
    // LIKELY was flagged for a person and had nowhere to go, which is a
    // dead end with a signpost on it.
    prisma.lead.findMany({
      where: { companyId, matchStrength: 'LIKELY', confirmedAt: null, seenAt: { gte: since } },
      orderBy: { seenAt: 'asc' },
      take: 20,
      include: {
        opening: { select: { id: true, title: true } },
        likeOpening: { select: { id: true, title: true, location: true } },
      },
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
      // Two things a person can settle in ten seconds each: was the
      // machine right, and are these two adverts the same seat.
      maybes: maybes.map((l) => ({
        id: l.id,
        title: l.title,
        postedBy: l.postedBy,
        rateCents: l.rateCents,
        seenAt: l.seenAt.toISOString(),
        because: l.matchBecause,
        opening: l.opening,
        likeOpening: l.likeOpening,
        asks: l.likeOpening
          ? `Is this the same seat as "${l.likeOpening.title}"?`
          : 'Is this a seat you are already working?',
      })),
      sample: sample.map((c) => ({
        id: c.id,
        code: c.code,
        verdict: c.verdict,
        at: c.at.toISOString(),
        ...question(c),
      })),
      waiting: candidates.length,
      // Which loops have anything here to sample at all. A loop made of
      // rules is not being neglected; it has nothing a person could
      // usefully second-guess.
      sampledSurfaces: [...new Set(candidates.map((c) => c.recordType))],
      agreement: agreement(reviewed),
      week: thisWeek(reviewed, now),
    },
  })
}

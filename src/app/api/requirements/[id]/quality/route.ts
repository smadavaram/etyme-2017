import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { runLoop, lastVerdict, mayProceed } from '@/lib/loop'
import { SPEC, score, grade, type Role } from '@/lib/requirement-quality'
import { WINDOW_DAYS, type Observation } from '@/lib/benchmark'
import { skillHits } from '@/lib/bench-filter'

/**
 * POST /api/requirements/:id/quality  — run the check
 * GET  /api/requirements/:id/quality  — what it said last time
 *
 * Can this role actually be filled?
 *
 * The second loop in this build, and the first written as a declaration
 * rather than by hand. Everything that makes it a loop — the ledger row,
 * the Check rows, the attempt cap, the fix list, the human sample it
 * feeds, the pattern detector that counts it — comes from the harness.
 * This file only says what to check and where to get the numbers.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Requirement quality')
  if (notStaff) return notStaff

  const { id } = await params
  const companyId = caller.company!.id

  const requirement = await prisma.requirement.findFirst({
    where: { id, companyId },
    select: {
      id: true, title: true, skills: true, location: true,
      billMin: true, billMax: true, startDate: true,
      qualityScore: true, qualityAttempt: true,
    },
  })

  if (!requirement) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No requirement by that id.' } },
      { status: 404 }
    )
  }

  const now = new Date()
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400000)

  const [history, bench] = await Promise.all([
    prisma.submission.findMany({
      where: { fromCompanyId: companyId, submittedAt: { gte: since } },
      select: {
        rate: true, rejectReason: true, submittedAt: true,
        requirement: { select: { skills: true, location: true } },
      },
      take: 2000,
    }),
    prisma.benchListing.findMany({
      where: { companyId, revokedAt: null },
      select: { consultant: { select: { skills: true } } },
    }),
  ])

  // How many on the bench come close at all. A count, not a score — zero
  // is a role for a bench that does not exist, and no amount of better
  // matching fixes that.
  const plausible = bench.filter(
    (b) => skillHits(requirement.skills, b.consultant.skills) > 0
  ).length

  const subject: Role = {
    title: requirement.title,
    skills: requirement.skills,
    location: requirement.location,
    billMin: requirement.billMin,
    billMax: requirement.billMax,
    startDate: requirement.startDate,
    plausibleOnBench: plausible,
    history: history.map((h): Observation => ({
      rateCents: h.rate,
      survived: h.rejectReason !== 'RATE',
      skills: h.requirement.skills,
      location: h.requirement.location,
      at: h.submittedAt,
    })),
    now,
  }

  const attempt = requirement.qualityAttempt + 1

  const outcome = await runLoop(SPEC, subject, {
    companyId,
    recordId: requirement.id,
    attempt,
  })

  const n = score([...outcome.toFix, ...outcome.passed, ...outcome.unverified])

  await prisma.requirement.update({
    where: { id: requirement.id },
    data: { qualityScore: n, qualityAttempt: attempt },
  })

  return NextResponse.json({
    data: {
      requirementId: requirement.id,
      score: n,
      grade: grade(n),
      ...outcome,
      // A quality score never blocks publishing on its own. It is shown
      // and it is recorded, and somebody who publishes anyway has said so
      // deliberately.
      mayPublish: mayProceed(outcome, false),
      plausibleOnBench: plausible,
    },
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Requirement quality')
  if (notStaff) return notStaff

  const { id } = await params

  const requirement = await prisma.requirement.findFirst({
    where: { id, companyId: caller.company!.id },
    select: { id: true, qualityScore: true, qualityAttempt: true },
  })

  if (!requirement) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No requirement by that id.' } },
      { status: 404 }
    )
  }

  const outcome = await lastVerdict(SPEC, requirement.id, requirement.qualityAttempt, caller.company!.id)

  return NextResponse.json({
    data: {
      requirementId: requirement.id,
      score: requirement.qualityScore,
      grade: requirement.qualityScore === null ? 'Not checked yet.' : grade(requirement.qualityScore),
      neverRun: requirement.qualityScore === null,
      ...outcome,
    },
  })
}

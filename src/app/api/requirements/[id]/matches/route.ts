import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { logBulkAccess } from '@/lib/access-log'
import { runMatchEngine } from '@/lib/match-engine'
import { raisedIt } from '@/lib/resolve-client-company'

/**
 * GET /api/requirements/:id/matches
 *
 * BUILD.md: "scores with factors, basis, confidence, unknowns"
 * CLAUDE.md: "Match scores always carry factors, basis, confidence and unknowns.
 *             A bare number is a bug."
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id: requirementId } = await params

  const requirement = await prisma.requirement.findUnique({
    where: { id: requirementId },
    select: { id: true, title: true, companyId: true },
  })

  // The raiser, and nobody else. Seeing a role is one thing — a supplier
  // invited to it should. The shortlist behind it is another: names,
  // headlines, skills and scores, which is somebody's bench with the prices
  // taken off. This route checked neither, so a competitor holding the id
  // read the lot.
  //
  // 404 rather than 403 on purpose. "You may not see this requirement's
  // matches" confirms the requirement exists.
  if (!requirement || !raisedIt(caller, requirement)) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Requirement not found' } },
      { status: 404 }
    )
  }

  const matches = await prisma.match.findMany({
    where: { requirementId },
    include: {
      consultant: {
        include: {
          person: {
            select: { id: true, name: true, primaryEmail: true },
          },
        },
      },
    },
    orderBy: { score: 'desc' },
  })

  // CLAUDE.md: "Every read of another person's data writes an AccessLog row"
  const matchPersonIds = matches.map((m) => m.consultant.personId)
  if (matchPersonIds.length > 0) {
    logBulkAccess(matchPersonIds, {
      action: 'MATCH_VIEW',
      reason: `Match scores for "${requirement.title}"`,
    })
  }

  return NextResponse.json({
    data: {
      requirementId,
      title: requirement.title,
      matches: matches.map((m) => ({
        id: m.id,
        score: m.score,
        confidence: m.confidence,
        factors: m.factors, // [{ label, value, weight }] — shown in the UI
        basis: m.basis, // "34 BRIM placements over 18 months"
        unknowns: m.unknowns, // what it could not account for
        consultant: {
          id: m.consultant.id,
          personId: m.consultant.personId,
          name: m.consultant.person.name,
          headline: m.consultant.headline,
          skills: m.consultant.skills,
          location: m.consultant.location,
          workAuth: m.consultant.workAuth,
          availability: m.consultant.availableFrom?.toISOString() ?? null,
        },
        computedAt: m.computedAt.toISOString(),
      })),
      total: matches.length,
    },
  })
}

/**
 * POST /api/requirements/:id/matches
 *
 * Trigger the AI match engine to compute matches for this requirement.
 * This is the core differentiator — Claude does semantic skill matching.
 *
 * Body (optional):
 *   { limit?: number, forceRefresh?: boolean }
 *
 * limit — max candidates to return (default 20)
 * forceRefresh — delete existing matches and recompute from scratch
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id: requirementId } = await params

  // Verify requirement exists and caller has access
  const requirement = await prisma.requirement.findUnique({
    where: { id: requirementId },
    select: { id: true, title: true, status: true, companyId: true, skills: true },
  })

  if (!requirement || !raisedIt(caller, requirement)) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Requirement not found' } },
      { status: 404 }
    )
  }

  if (requirement.status === 'CLOSED' || requirement.status === 'FILLED') {
    return NextResponse.json(
      { error: { code: 'NOT_OPEN', message: `Cannot run matching on a ${requirement.status} requirement` } },
      { status: 409 }
    )
  }

  if (requirement.skills.length === 0) {
    return NextResponse.json(
      { error: { code: 'NO_SKILLS', message: 'Requirement has no skills defined. Add skills before running the match engine.' } },
      { status: 422 }
    )
  }

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    // No body is fine — use defaults
  }

  const { limit, forceRefresh } = body

  try {
    const result = await runMatchEngine(requirementId, {
      limit: limit ?? 20,
      forceRefresh: forceRefresh ?? false,
    })

    // Write AutomationLog
    await prisma.automationLog.create({
      data: {
        companyId: requirement.companyId,
        action: 'MATCH_RUN',
        summary: `AI matching for "${requirement.title}": ${result.matches.length} candidate(s) scored`,
        reason: `Match engine triggered by ${caller.person.name}`,
        payload: {
          requirementId,
          matchCount: result.matches.length,
          topScore: result.matches[0]?.score ?? null,
          topConfidence: result.matches[0]?.confidence ?? null,
          basis: result.basis,
          forceRefresh: forceRefresh ?? false,
        },
        reversible: true,
      },
    })

    // Create notification if matches were found
    if (result.matches.length > 0) {
      const topMatch = result.matches[0]
      await prisma.notification.create({
        data: {
          personId: caller.person.id,
          companyId: requirement.companyId,
          type: 'SYSTEM',
          title: `${result.matches.length} matches found for "${requirement.title}"`,
          body: `Top match scored ${topMatch.score}/100 (${topMatch.confidence} confidence). Review and submit candidates.`,
          entityId: requirementId,
          data: {
            matchCount: result.matches.length,
            topScore: topMatch.score,
          },
        },
      })
    }

    return NextResponse.json({
      data: {
        requirementId,
        title: requirement.title,
        matchCount: result.matches.length,
        basis: result.basis,
        matches: result.matches.map((m) => ({
          consultantId: m.consultantId,
          personId: m.personId,
          score: m.score,
          confidence: m.confidence,
          factors: m.factors,
          basis: m.basis,
          unknowns: m.unknowns,
        })),
        message: result.matches.length > 0
          ? `Found ${result.matches.length} matching candidates. Top score: ${result.matches[0].score}/100.`
          : 'No matching candidates found. Try broadening skills or increasing the rate range.',
      },
    })
  } catch (err: any) {
    console.error('Match engine failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Match engine failed. Please try again.' } },
      { status: 500 }
    )
  }
}

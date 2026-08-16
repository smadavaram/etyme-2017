import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { logBulkAccess } from '@/lib/access-log'

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
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const { id: requirementId } = await params

  const requirement = await prisma.requirement.findUnique({
    where: { id: requirementId },
    select: { id: true, title: true },
  })

  if (!requirement) {
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

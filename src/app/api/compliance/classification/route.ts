import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { logAccess } from '@/lib/access-log'
import {
  testArrangement,
  checkCall,
  reviewSweep,
  testLabel,
  ARRANGEMENT_QUESTIONS,
  type Arrangement,
  type ClassificationTestName,
} from '@/lib/worker-classification'

/**
 * Classification calls — L3.7.1.2, "evidence kept for the position taken".
 *
 * A classification is a position, and a position is worth what the file
 * behind it is worth. Before this, the arrangement could be tested and
 * the answer went nowhere: it was recomputed at award, shown once, and
 * never written down. Three years later, when a tax authority asks how
 * the firm concluded this person was independent, the honest answer was
 * "a function returned it at the time".
 *
 * So a call records the answers it was made from, the position taken, the
 * factors that carried it, who took it and when, and the date it has to
 * be looked at again. That is a record of an event, not a badge — the
 * distinction the whole compliance surface turns on.
 */

const TESTS: ClassificationTestName[] = ['US_IRS', 'US_ABC', 'UK_IR35', 'DEFAULT']

/**
 * POST /api/compliance/classification
 *
 * { personId, arrangement, test?, position, note?, reviewBy? }
 *
 * Refuses a position that contradicts what the test concludes unless a
 * written reason comes with it. That refusal is not us declining to be
 * overruled — a firm's counsel may take a different view and is entitled
 * to. It is us declining to hold an unexplained override.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A classification call belongs to a company. Yours is not set.' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A JSON body is required' } },
      { status: 422 }
    )
  }

  const { personId, arrangement, position, note, reviewBy } = body as {
    personId?: string
    arrangement?: Arrangement
    position?: string
    note?: string
    reviewBy?: string
  }
  const test: ClassificationTestName = TESTS.includes(body.test) ? body.test : 'DEFAULT'

  if (!personId || typeof personId !== 'string') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'personId is required', field: 'personId' } },
      { status: 422 }
    )
  }

  if (!arrangement || typeof arrangement !== 'object') {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message:
            'The arrangement is required. A position with no answers behind it is the ' +
            'thing this record exists to stop.',
          field: 'arrangement',
        },
      },
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

  // Only the answers we asked for, and only where they are actually yes
  // or no. Anything else the caller sent is dropped rather than stored —
  // the record has to be re-derivable, and a free-form blob is not.
  const answers: Record<string, boolean> = {}
  for (const q of ARRANGEMENT_QUESTIONS) {
    const v = (arrangement as Record<string, unknown>)[q.key]
    if (typeof v === 'boolean') answers[q.key] = v
  }

  const decidedAt = new Date()
  const outcome = testArrangement(answers as Arrangement, test)
  const verdict = checkCall({
    position: position ?? '',
    test: outcome,
    note: note ?? null,
    reviewBy: reviewBy ? new Date(reviewBy) : null,
    decidedAt,
  })

  if (!verdict.ok) {
    // A refused write is still a read of somebody's data.
    logAccess({
      subjectId: personId,
      actorPersonId: realPersonId(caller) ?? undefined,
      actorCompanyId: caller.company.id,
      action: 'CLASSIFICATION_CALL',
      allowed: false,
      reason: verdict.says,
    })

    return NextResponse.json(
      {
        error: { code: verdict.code, message: verdict.says },
        data: { test: outcome },
      },
      { status: 422 }
    )
  }

  const call = await prisma.classificationCall.create({
    data: {
      companyId: caller.company.id,
      personId,
      // Everything the decision was made from, so the position can be
      // re-derived rather than taken on trust.
      arrangement: {
        answers,
        test,
        testLabel: testLabel(test),
        testConcluded: outcome.position,
        testSays: outcome.says,
        unknowns: outcome.unknowns,
        confidence: outcome.confidence,
      },
      position: position as string,
      reasons: verdict.reasons,
      decidedById: realPersonId(caller),
      decidedAt,
      reviewBy: verdict.reviewBy,
    },
  })

  logAccess({
    subjectId: personId,
    actorPersonId: realPersonId(caller) ?? undefined,
    actorCompanyId: caller.company.id,
    action: 'CLASSIFICATION_CALL',
    allowed: true,
    reason: `Classified as ${position} under the ${testLabel(test)} test`,
  })

  return NextResponse.json({
    data: {
      id: call.id,
      personId,
      personName: person.name,
      position: call.position,
      reasons: call.reasons,
      decidedAt: call.decidedAt.toISOString(),
      reviewBy: call.reviewBy?.toISOString() ?? null,
      test: outcome,
      says: verdict.says,
      departed: verdict.code === 'DEPARTS_WITH_REASON',
    },
  })
}

/**
 * GET /api/compliance/classification
 *
 * Every call this company has made, latest per person first, plus the
 * review sweep — the calls that have gone stale and the ones with no
 * review date at all. The second of those is the state that made a 2017
 * expiry column useless, and it is invisible unless something looks.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A classification call belongs to a company. Yours is not set.' } },
      { status: 403 }
    )
  }

  const rows = await prisma.classificationCall.findMany({
    where: { companyId: caller.company.id },
    include: {
      person: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
    },
    orderBy: { decidedAt: 'desc' },
  })

  // Only the latest per person speaks. A superseded call is history, and
  // reporting it as though it were live would make a remade determination
  // look like a contradiction.
  const latest = new Map<string, (typeof rows)[number]>()
  for (const r of rows) if (!latest.has(r.personId)) latest.set(r.personId, r)
  const current = [...latest.values()]

  const now = new Date()
  const stale = reviewSweep(
    current.map(r => ({
      id: r.id,
      personName: r.person.name,
      position: r.position,
      decidedAt: r.decidedAt,
      reviewBy: r.reviewBy,
    })),
    now
  )

  return NextResponse.json({
    data: {
      company: { id: caller.company.id, name: caller.company.name },
      questions: ARRANGEMENT_QUESTIONS,
      calls: current.map(r => {
        const a = (r.arrangement ?? {}) as Record<string, unknown>
        return {
          id: r.id,
          personId: r.personId,
          personName: r.person.name,
          position: r.position,
          reasons: r.reasons,
          decidedAt: r.decidedAt.toISOString(),
          decidedByName: r.decidedBy?.name ?? null,
          reviewBy: r.reviewBy?.toISOString() ?? null,
          testLabel: (a.testLabel as string) ?? null,
          testConcluded: (a.testConcluded as string) ?? null,
          // A call that departs from its own test is the one worth
          // reading. Flagged rather than buried in the reasons array.
          departed:
            typeof a.testConcluded === 'string' &&
            a.testConcluded !== r.position &&
            a.testConcluded !== 'UNCLEAR',
          unknownCount: Array.isArray(a.unknowns) ? a.unknowns.length : null,
        }
      }),
      review: {
        stale,
        overdue: stale.filter(s => s.freshness === 'OVERDUE').length,
        noReviewDate: stale.filter(s => s.freshness === 'NO_REVIEW_DATE').length,
        dueSoon: stale.filter(s => s.freshness === 'DUE_SOON').length,
      },
      superseded: rows.length - current.length,
    },
  })
}

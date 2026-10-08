import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { recordAccess } from '@/lib/access-log'
import { runMatchEngine } from '@/lib/match-engine'
import { poolFor, ranked, shownTo, actionFor, REACH_WORD, type Factor } from '@/lib/match-pool'
import { mayRecommend } from '@/lib/supplier-onboarding'
import { hasPermission } from '@/lib/permissions'
import { matchViewer, NOT_HERE } from './viewer'
import { askState } from './asked'
import { lastAsks } from './asked-read'
import { matchesFoundSays, matchesTitle } from './words'

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
    select: {
      id: true, title: true, companyId: true, payerCompanyId: true, endClientCompanyId: true, startDate: true,
      company: { select: { kind: true, name: true } },
    },
  })

  // The raiser, a program office in its seat, or a supplier it was sent
  // to — and nobody else. The shortlist behind a role is somebody's bench
  // with the prices taken off; this route once checked nothing, so a
  // competitor holding the id read the lot.
  //
  // 404 rather than 403 on purpose. "You may not see this requirement's
  // matches" confirms the requirement exists.
  const viewer = requirement ? await matchViewer(caller, requirement) : null
  if (!requirement || !viewer) {
    return NextResponse.json(NOT_HERE, { status: 404 })
  }

  const pool = await poolFor(requirement, viewer.companyId, { suggest: viewer.suggest })
  const byConsultant = new Map(pool.entries.map((e) => [e.consultantId, e]))

  const matches = byConsultant.size === 0 ? [] : await prisma.match.findMany({
    where: { requirementId, consultantId: { in: [...byConsultant.keys()] } },
    orderBy: { score: 'desc' },
  })

  // What each row lets this viewer do. Read once for the page.
  const suggestedFirms = [...new Set(pool.entries.filter((e) => e.reach === 'SUGGESTION').map((e) => e.firmId))]
  const panelFirms = [...new Set(pool.entries.filter((e) => e.reach === 'PANEL').map((e) => e.firmId))]
  const employees = pool.entries.filter((e) => e.employee).map((e) => e.personId)
  const [asked, under, billed] = await Promise.all([
    suggestedFirms.length === 0 ? [] : prisma.supplierRequest.findMany({
      where: { companyId: viewer.companyId, firmCompanyId: { in: suggestedFirms }, state: { in: ['RECOMMENDED', 'IN_REVIEW'] } },
      select: { firmCompanyId: true, stage: true, createdAt: true },
    }),
    // A firm approved to work under a prime is asked through the prime.
    !viewer.buyer || panelFirms.length === 0 ? [] : prisma.supplierRequest.findMany({
      where: { companyId: viewer.companyId, firmCompanyId: { in: panelFirms }, state: 'APPROVED', comesInAs: 'SUB_UNDER_PRIME', underCompanyId: { not: null } },
      select: { firmCompanyId: true, underCompanyId: true },
    }),
    // What this firm last billed its own employee at: a real number to
    // start from, never a placeholder.
    employees.length === 0 ? [] : prisma.sellContract.findMany({
      where: { companyId: viewer.companyId, personId: { in: employees } },
      select: { personId: true, billRate: true },
      orderBy: { startDate: 'desc' },
    }),
  ])
  // When this client last asked for each person, so a row it already
  // asked for says so instead of offering the button again (`./asked`).
  const asks = viewer.buyer ? await lastAsks(viewer.companyId, requirementId) : new Map<string, Date>()
  const now = new Date()
  const underIds = [...new Set(under.map((u) => u.underCompanyId!))]
  const underNames = new Map(
    (underIds.length === 0 ? [] : await prisma.company.findMany({ where: { id: { in: underIds } }, select: { id: true, name: true } }))
      .map((c) => [c.id, c.name])
  )
  const underOf = new Map(under.map((u) => [u.firmCompanyId!, { companyId: u.underCompanyId!, name: underNames.get(u.underCompanyId!) ?? 'the prime' }]))
  const askedOf = new Map(asked.map((a) => [a.firmCompanyId!, a]))
  const lastBill = new Map<string, number>()
  for (const b of billed) if (!lastBill.has(b.personId)) lastBill.set(b.personId, b.billRate)

  const rows = ranked(
    matches.flatMap((m) => {
      const entry = byConsultant.get(m.consultantId)
      if (!entry) return []
      return [{ m, entry, reach: entry.reach, score: m.score }]
    })
  )

  // CLAUDE.md: "Every read of another person's data writes an AccessLog
  // row" — one per person shown, suggestions included, written before the
  // answer leaves so the trail cannot miss a read that happened.
  // One write per reason, since the reason names how each was reached.
  const byReason = new Map<string, string[]>()
  for (const r of rows) {
    const reason =
      r.reach === 'SUGGESTION'
        ? `Suggested without their name for "${requirement.title}" (they agreed to be shown in matches)`
        : `Match scores for "${requirement.title}" — ${REACH_WORD[r.reach].toLowerCase()}`
    byReason.set(reason, [...(byReason.get(reason) ?? []), r.entry.personId])
  }
  for (const [reason, subjectIds] of byReason) {
    await recordAccess(subjectIds, {
      actorPersonId: caller.person.id,
      actorCompanyId: viewer.companyId,
      action: 'MATCH_VIEW',
      reason,
    })
  }

  return NextResponse.json({
    data: {
      requirementId,
      title: requirement.title,
      viewer: {
        companyId: viewer.companyId,
        buyer: viewer.buyer,
        raiser: viewer.raiser,
        suggests: viewer.suggest,
        mayAskToAdd: viewer.suggest && mayRecommend(viewer.permissions),
      },
      basis: pool.says,
      matches: rows.map(({ m, entry }) => {
        const shown = shownTo(
          entry,
          { factors: (m.factors as unknown as Factor[]) ?? [], basis: m.basis, unknowns: m.unknowns },
          { buyer: viewer.buyer }
        )
        const suggestion = entry.reach === 'SUGGESTION'
        const pending = suggestion ? askedOf.get(entry.firmId) : undefined
        const action = actionFor({
          entry,
          viewer: { companyId: viewer.companyId, buyer: viewer.buyer },
          lastBillRate: lastBill.get(entry.personId) ?? null,
          under: underOf.get(entry.firmId) ?? null,
        })
        return {
          id: m.id,
          score: m.score,
          confidence: m.confidence,
          factors: shown.factors, // [{ label, value, weight }] — shown in the UI
          basis: shown.basis,
          unknowns: shown.unknowns, // what it could not account for
          reach: entry.reach,
          reachWord: REACH_WORD[entry.reach],
          employee: entry.employee,
          standing: entry.standing,
          firm: shown.firm,
          rate: shown.rate,
          // A suggestion carries no person id: nothing on this page may
          // reach the person, and an id is a handle to reach them by.
          consultant: {
            id: suggestion ? null : m.consultantId,
            personId: suggestion ? null : entry.personId,
            name: shown.name,
            headline: shown.headline,
            skills: shown.skills,
            location: shown.location,
            workAuth: shown.workAuth,
            availability: shown.availability,
          },
          action,
          // Asked already: when, and whether "Ask again" is offered yet.
          askedFor: action.kind === 'ASK' ? askState(asks.get(entry.personId) ?? null, now) : null,
          asked: pending
            ? { stage: pending.stage, at: pending.createdAt.toISOString() }
            : null,
          computedAt: m.computedAt.toISOString(),
        }
      }),
      total: rows.length,
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
    select: {
      id: true, title: true, status: true, companyId: true, skills: true,
      payerCompanyId: true, endClientCompanyId: true,
      company: { select: { kind: true, name: true } },
    },
  })

  const viewer = requirement ? await matchViewer(caller, requirement) : null
  if (!requirement || !viewer) {
    return NextResponse.json(NOT_HERE, { status: 404 })
  }

  // A supplier the role was sent to matches its own pool against it —
  // the recruiting desk's job, the same desk that submits.
  if (!viewer.raiser && !hasPermission(viewer.permissions, 'submissions.create')) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_PERMISSION',
          message:
            `Matching your bench against a job is the recruiting desk's job at ${viewer.companyName} — ` +
            'a recruiter, a resource manager or the account manager.',
        },
      },
      { status: 403 }
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
    const startedAt = new Date()
    const result = await runMatchEngine(requirementId, {
      limit: limit ?? 20,
      forceRefresh: forceRefresh ?? false,
      viewerCompanyId: viewer.companyId,
    })

    // ── Was this a model or was it arithmetic ─────────────────────────
    //
    // The founder is asked by buyers how much of this product is AI, and
    // the only answer worth giving is a measured one. This row is one of
    // the few actions that genuinely could be either: the engine scores
    // with the model where there is a key and with rules where there is
    // not, and it falls back to rules when the call fails.
    //
    // So the fact is read from where the engine already wrote it. Every
    // scoring pass records an AgentRun, and a pass that called the model
    // carries the model's name and its token count; a pass scored with
    // arithmetic carries neither. That is a recorded fact rather than an
    // inference from the basis sentence, which is prose and would be a
    // guess dressed as an answer.
    //
    // `decidedBy` is the spelling `lib/autonomy` reads. Any other and
    // the row goes on saying it does not know.
    const byModel = await prisma.agentRun.count({
      where: {
        recordType: 'REQUIREMENT',
        recordId: requirementId,
        agent: 'match.score',
        verdict: 'PASS',
        model: { not: null },
        at: { gte: startedAt },
      },
    })
    const decidedBy: 'MODEL' | 'RULE' = byModel > 0 ? 'MODEL' : 'RULE'

    // Write AutomationLog
    await prisma.automationLog.create({
      data: {
        companyId: viewer.companyId,
        action: 'MATCH_RUN',
        summary: `AI matching for "${requirement.title}": ${result.matches.length} candidate(s) scored`,
        reason: `Match engine triggered by ${caller.person.name}`,
        payload: {
          requirementId,
          matchCount: result.matches.length,
          topScore: result.matches[0]?.score ?? null,
          topConfidence: result.matches[0]?.confidence ?? null,
          basis: result.basis,
          decidedBy,
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
          companyId: viewer.companyId,
          type: 'SYSTEM',
          title: matchesTitle(result.matches.length, requirement.title),
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
        // Said on the screen as well as in the log: a reader asking what
        // scored this should not have to open the automation page.
        decidedBy,
        matches: result.matches.map((m) => ({
          // A buyer reads who matched from GET, where a suggestion comes
          // without a handle to reach the person by. Nothing here names
          // or points at anybody for a buyer.
          consultantId: viewer.buyer ? null : m.consultantId,
          personId: viewer.buyer ? null : m.personId,
          score: m.score,
          confidence: m.confidence,
          factors: m.factors,
          basis: m.basis,
          unknowns: m.unknowns,
        })),
        message: matchesFoundSays(result.matches.length, result.matches[0]?.score ?? null),
      },
    })
  } catch (err: any) {
    reportError('Match engine failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Match engine failed. Please try again.' } },
      { status: 500 }
    )
  }
}

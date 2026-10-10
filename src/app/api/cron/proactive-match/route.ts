import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { cronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { runMatchEngine } from '@/lib/match-engine'

/**
 * GET /api/cron/proactive-match
 *
 * BUILD.md §5: proactive matching — automatically run the match engine
 * against open requirements that have no matches yet.
 *
 * Runs on a schedule (e.g. every 4 hours). For each OPEN requirement
 * with skills defined and zero matches, triggers the match engine.
 * Creates notifications for the requirement owner with results.
 *
 * This is the bench burn reducer: proactive matching surfaces candidates
 * before recruiters have to search, reducing time-to-submit and
 * bench idle days.
 *
 * CLAUDE.md: "Anything the system does unprompted writes an AutomationLog row"
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const startedAt = new Date()

    // Find OPEN requirements with skills but no matches
    const requirements = await prisma.requirement.findMany({
      where: {
        status: 'OPEN',
        skills: { isEmpty: false },
      },
      select: {
        id: true,
        title: true,
        companyId: true,
        _count: { select: { matches: true } },
      },
    })

    const unmatchedReqs = requirements.filter(r => r._count.matches === 0)

    if (unmatchedReqs.length === 0) {
      return NextResponse.json({
        data: {
          scanned: requirements.length,
          matched: 0,
          message: 'No unmatched requirements found',
        },
      })
    }

    const results: Array<{
      requirementId: string
      title: string
      matchesFound: number
    }> = []

    for (const req of unmatchedReqs) {
      try {
        const matchResult = await runMatchEngine(req.id, { limit: 10 })
        const matchCount = matchResult.matches.length

        if (matchCount > 0) {
          results.push({
            requirementId: req.id,
            title: req.title,
            matchesFound: matchCount,
          })

          // Notify company admins via automation log — Requirement has
          // no createdById so we cannot target a specific person.
          // The AutomationLog below captures it; company-level
          // notification is handled through the dashboard.
        }
      } catch (err) {
        reportError(`[Proactive match] Failed for requirement ${req.id}:`, err)
      }
    }

    // AutomationLog
    if (results.length > 0) {
      const firstReq = unmatchedReqs[0]

      // ── Was this a model or was it arithmetic ───────────────────────
      //
      // This is the row that actually carries the claim. Of everything
      // the system does unprompted, all but one is a date comparison or
      // a count, and this is the one. So a buyer asking how much of the
      // product is AI is really asking about this row, and it read "not
      // recorded" — which is the honest answer to a question nobody had
      // measured, and a poor one when the fact is already on file.
      //
      // Every scoring pass writes an AgentRun: a pass that called the
      // model carries the model's name, a pass scored with arithmetic
      // carries none. Counting the ones with a model inside this run's
      // window is a recorded fact. Reading the basis prose and looking
      // for the word would be a guess dressed as an answer, so it is
      // not done — the same eight lines as `MATCH_RUN`, deliberately
      // unchanged, because two spellings of this would drift.
      //
      // Across the whole scan rather than one requirement: a single run
      // may score twenty roles, and if the model did any of them the
      // model was involved. `decidedBy` is the spelling `lib/autonomy`
      // reads; any other and the row goes on saying it does not know.
      const byModel = await prisma.agentRun.count({
        where: {
          recordType: 'REQUIREMENT',
          recordId: { in: unmatchedReqs.map((r) => r.id) },
          agent: 'match.score',
          verdict: 'PASS',
          model: { not: null },
          at: { gte: startedAt },
        },
      })
      const decidedBy: 'MODEL' | 'RULE' = byModel > 0 ? 'MODEL' : 'RULE'

      await prisma.automationLog.create({
        data: {
          companyId: firstReq.companyId,
          action: 'PROACTIVE_MATCH',
          summary: `Proactive matching: scanned ${requirements.length} open requirements, ran matching on ${unmatchedReqs.length} unmatched, found candidates for ${results.length}`,
          reason: 'Scheduled proactive match scan',
          payload: {
            totalOpen: requirements.length,
            unmatched: unmatchedReqs.length,
            matched: results.length,
            decidedBy,
            results: results.slice(0, 10), // cap payload size
          },
          reversible: false,
        },
      })
    }

    return NextResponse.json({
      data: {
        scanned: requirements.length,
        unmatched: unmatchedReqs.length,
        matched: results.length,
        results,
        message: `Proactive matching: ${results.length} of ${unmatchedReqs.length} requirements matched`,
      },
    })
  } catch (err: any) {
    reportError('Proactive match failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Proactive match failed' } },
      { status: 500 }
    )
  }
}

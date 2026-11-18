import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { cronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { runMatchEngine } from '@/lib/match-engine'
import { modelOnFor, modelSetUpHere } from '@/lib/model-boundary'

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
      companyId: string
      title: string
      matchesFound: number
    }> = []
    // Per company: how many were matched with the model held back, and why.
    const heldBack = new Map<string, number>()

    for (const req of unmatchedReqs) {
      try {
        // Before any model call: this company's switch and allowance, read
        // fresh for each job because the allowance is a running total. Held
        // back, the job is still matched, by the rules alone. `rulesOnly`
        // is the match engine's to honor (supply owns it).
        const modelMay = modelSetUpHere() && (await modelOnFor(req.companyId))
        if (!modelMay) heldBack.set(req.companyId, (heldBack.get(req.companyId) ?? 0) + 1)
        const matchResult = await runMatchEngine(req.id, { limit: 10, ...(modelMay ? {} : { rulesOnly: true }) } as Parameters<typeof runMatchEngine>[1])
        const matchCount = matchResult.matches.length

        if (matchCount > 0) {
          results.push({
            requirementId: req.id,
            companyId: req.companyId,
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

    // AutomationLog: one row under each company the job acted for.
    const companyIds = Array.from(new Set(results.map((r) => r.companyId)))
    for (const companyId of companyIds) {
      const mine = unmatchedReqs.filter((r) => r.companyId === companyId)
      const found = results.filter((r) => r.companyId === companyId)
      const openMine = requirements.filter((r) => r.companyId === companyId).length

      // Was this a model or was it arithmetic: every scoring pass writes an
      // AgentRun, and one that called the model carries the model's name.
      // Counting those inside this run's window, for this company's jobs
      // only, is a recorded fact; reading prose for the word would be a guess.
      const byModel = await prisma.agentRun.count({
        where: {
          recordType: 'REQUIREMENT',
          recordId: { in: mine.map((r) => r.id) },
          agent: 'match.score',
          verdict: 'PASS',
          model: { not: null },
          at: { gte: startedAt },
        },
      })
      const decidedBy: 'MODEL' | 'RULE' = byModel > 0 ? 'MODEL' : 'RULE'
      const held = heldBack.get(companyId) ?? 0

      await prisma.automationLog.create({
        data: {
          companyId,
          action: 'PROACTIVE_MATCH',
          summary: `Proactive matching: scanned ${openMine} open requirements, ran matching on ${mine.length} unmatched, found candidates for ${found.length}`,
          reason: held > 0
            ? `Scheduled proactive match scan. For ${held} job${held === 1 ? '' : 's'} the model was not asked (no key, the company's switch is off, or its allowance is used), so the rules matched.`
            : 'Scheduled proactive match scan',
          payload: {
            totalOpen: openMine,
            unmatched: mine.length,
            matched: found.length,
            decidedBy,
            rulesOnlyJobs: held,
            results: found.slice(0, 10).map(({ requirementId, title, matchesFound }) => ({ requirementId, title, matchesFound })),
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

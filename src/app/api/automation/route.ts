import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { LADDER, RUNGS, readRow, KIND_SAYS, ACTIONS } from '@/lib/autonomy'

/**
 * GET /api/automation
 *
 * BUILD.md §3 — The machine: "what ran, with reasons"
 *
 * Returns the automation log — every action the system took on behalf
 * of the caller's company, with plain-English reasons and reversibility.
 *
 * CLAUDE.md invariant: "Anything the system does unprompted writes an
 * AutomationLog row with a plain-English reason and an honest reversible flag."
 *
 * Every row also carries the level it acted at, on the ladder every
 * enterprise buyer is currently being taught — L0 Observe through L5
 * Fully autonomous. The level is derived from the action, never stored:
 * it is a property of the kind of act, so two rows of the same action
 * must not be able to disagree. See `lib/autonomy`.
 *
 * A level is only given to what the system did unprompted. A refusal
 * aimed at somebody who asked for something is governance, and gets the
 * outcome instead — BLOCK, WARN or PERMIT.
 *
 * Query params:
 *   ?limit=N     — max rows (default 50, max 200)
 *   ?before=ISO  — cursor for pagination (createdAt before this)
 *   ?action=X    — filter by action type
 *   ?reversible  — only reversible entries (no value needed)
 *   ?reversed    — only reversed entries
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'The automation log')
  if (notStaff) return notStaff

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json({ data: { entries: [], hasMore: false } })
  }

  const url = request.nextUrl
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))
  const before = url.searchParams.get('before')
  const actionFilter = url.searchParams.get('action')
  const reversibleOnly = url.searchParams.has('reversible')
  const reversedOnly = url.searchParams.has('reversed')
  const levelFilter = url.searchParams.get('level')
  const kindFilter = url.searchParams.get('kind')

  const where: any = { companyId }

  if (before) {
    where.at = { lt: new Date(before) }
  }

  if (actionFilter) {
    where.action = actionFilter
  }

  if (reversibleOnly) {
    where.reversible = true
    where.reversedAt = null
  }

  if (reversedOnly) {
    where.reversedAt = { not: null }
  }

  const entries = await prisma.automationLog.findMany({
    where,
    orderBy: { at: 'desc' },
    take: limit,
  })

  // Collect distinct action types for filter tabs
  const actionCounts = await prisma.automationLog.groupBy({
    by: ['action'],
    where: { companyId },
    _count: true,
    orderBy: { _count: { action: 'desc' } },
  })

  const counts: Record<string, number> = {}
  for (const ac of actionCounts) {
    counts[ac.action] = ac._count
  }

  // Level and kind are derived, so they are counted here from the action
  // tallies rather than grouped in the database.
  const levelCounts: Record<string, number> = {}
  const kindCounts: Record<string, number> = {}
  for (const ac of actionCounts) {
    const act = ACTIONS[ac.action]
    if (!act) continue
    kindCounts[act.kind] = (kindCounts[act.kind] ?? 0) + ac._count
    if (act.kind === 'UNPROMPTED') {
      levelCounts[act.rung] = (levelCounts[act.rung] ?? 0) + ac._count
    }
  }

  // Filtering on a derived value happens here, not in the query.
  const shown = entries.filter((e) => {
    const act = ACTIONS[e.action]
    if (levelFilter && !(act && act.kind === 'UNPROMPTED' && act.rung === levelFilter)) return false
    if (kindFilter && act?.kind !== kindFilter) return false
    return true
  })

  return NextResponse.json({
    data: {
      entries: shown.map((e) => {
        const read = readRow(e)
        return {
          id: e.id,
          action: e.action,
          summary: e.summary,
          reason: e.reason,
          payload: e.payload,
          reversible: e.reversible,
          reversedAt: e.reversedAt?.toISOString() ?? null,
          at: e.at.toISOString(),
          // What kind of row this is, what level it acted at if any, and
          // whether a rule or a model decided it.
          kind: read.kind,
          kindSays: read.kind ? KIND_SAYS[read.kind] : null,
          level: read.rung,
          levelName: read.levelName,
          levelSays: read.levelSays,
          outcome: read.outcome,
          actSays: read.actSays,
          decidedBy: read.decided.by,
          decidedSays: read.decided.says,
          undo: read.undo,
        }
      }),
      counts,
      // How many of each level and kind are on this company's book, so a
      // reader can see the shape before reading a single row.
      levels: levelCounts,
      kinds: kindCounts,
      ladder: RUNGS.map((r) => ({ level: r, name: LADDER[r].name, says: LADDER[r].says })),
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      hasMore: entries.length === limit,
    },
  })
}

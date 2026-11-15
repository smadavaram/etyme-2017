import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { LADDER, RUNGS, readRow, KIND_SAYS, ACTIONS, UNDONE_BY_THE_LOG, UNDONE_ON_COMPANIES, UNDONE_ON_JOBS, undoneElsewhere, reversibleHere } from '@/lib/autonomy'
import { mayOpen } from '@/lib/nav-table'

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

  // What the system did on the company's behalf reads as the company's
  // own diary — rate changes approved, weeks signed by silence — so it is
  // read by the desks that read the rules it ran under, not by everybody
  // on staff. The menu link asks for the same permission (sidebar).
  if (!hasPermission(caller.permissions, 'governance.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Reading what the system did on the company\u2019s behalf',
            needs: 'governance.read',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

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
    // Only an act the log really undoes, whatever an old row's flag says
    // (UNDONE_BY_THE_LOG, 2026-11-15).
    where.AND = [{ action: { in: [...UNDONE_BY_THE_LOG] } }]
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

  // A mark the log's own Reverse made undid nothing, so it is not said.
  // A mark another route made, where it undid the thing, stands.
  const oldest = entries.length ? entries[entries.length - 1].at : null
  const markedByTheLog = new Set<string>()
  if (oldest && entries.some((e) => e.reversedAt)) {
    const reversals = await prisma.automationLog.findMany({
      where: { companyId, action: 'REVERSAL', at: { gte: oldest } },
      select: { payload: true },
    })
    for (const r of reversals) {
      const of = (r.payload as Record<string, unknown> | null)?.reversedEntryId
      if (typeof of === 'string') markedByTheLog.add(of)
    }
  }
  const markOf = (e: { id: string; action: string; reversedAt: Date | null }) =>
    undoneElsewhere(e.action) || (markedByTheLog.has(e.id) && !UNDONE_BY_THE_LOG.has(e.action)) ? null : e.reversedAt

  // Filtering on a derived value happens here, not in the query.
  const shown = entries.filter((e) => {
    if (reversedOnly && !markOf(e)) return false
    const act = ACTIONS[e.action]
    if (levelFilter && !(act && act.kind === 'UNPROMPTED' && act.rung === levelFilter)) return false
    if (kindFilter && act?.kind !== kindFilter) return false
    return true
  })

  return NextResponse.json({
    data: {
      entries: shown.map((e) => {
        const reversedAt = markOf(e)
        const read = readRow({ ...e, reversedAt })
        // An act the log does not undo is never offered or counted here, and
        // the log's own mark on an old row undid nothing, so it is not said.
        const elsewhere = undoneElsewhere(e.action)
        const other = (e.payload as Record<string, unknown> | null)?.otherCompanyId
        return {
          id: e.id,
          action: e.action,
          summary: e.summary,
          reason: e.reason,
          payload: e.payload,
          reversible: reversibleHere(e),
          reversedAt: reversedAt?.toISOString() ?? null,
          // Where the undo is, for a seat that may open Companies and change a position.
          undoHref: elsewhere && e.action in UNDONE_ON_COMPANIES && typeof other === 'string' && hasPermission(caller.permissions, 'vendors.manage') && mayOpen('/dashboard/companies', caller.permissions)
            ? `/dashboard/companies?open=${encodeURIComponent(other)}`
            // A job sent to suppliers is cancelled on Jobs, by a seat that may cancel it.
            : e.action in UNDONE_ON_JOBS && hasPermission(caller.permissions, 'requirements.write') && mayOpen('/dashboard/requisitions', caller.permissions)
              ? '/dashboard/requisitions'
              : null,
          undoLinkSays: e.action in UNDONE_ON_JOBS ? 'Open Jobs to cancel the job' : 'Open it on Companies',
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

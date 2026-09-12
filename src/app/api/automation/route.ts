import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'

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

  return NextResponse.json({
    data: {
      entries: entries.map((e) => ({
        id: e.id,
        action: e.action,
        summary: e.summary,
        reason: e.reason,
        payload: e.payload,
        reversible: e.reversible,
        reversedAt: e.reversedAt?.toISOString() ?? null,
        at: e.at.toISOString(),
      })),
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      hasMore: entries.length === limit,
    },
  })
}

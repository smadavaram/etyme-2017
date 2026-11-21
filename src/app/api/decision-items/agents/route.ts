import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { firmLedger, usageCount } from '@/lib/record-ledger'
import { BASELINE_LINES, agentRows, dayAround, recordViewHref } from '@/lib/decision-queue'
import { queueSeat } from '../door'

/**
 * GET /api/decision-items/agents?page=N — agent control and the firm's ledger (A5)
 *
 * Record 107, Flow A. Each of the six agents reads "Not enabled", its
 * acts today counted from the ledger (`usageCount`), its meter a count of
 * actions and its cap "Not set"; no switch is offered that would do
 * nothing. The margin line is said only to a seat that reads margin.
 * Under them the firm's whole ledger, newest first, a page at a time.
 */
export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const { from, to } = dayAround(new Date())
  const page = Number(request.nextUrl.searchParams.get('page') ?? '1')
  const [counts, ledger] = await Promise.all([usageCount(seat.companyId, from, to), firmLedger(seat.companyId, page)])
  const lines: string[] = [BASELINE_LINES.billing]
  if (hasPermission(seat.caller.permissions, 'margin.read')) lines.push(BASELINE_LINES.margin)
  return NextResponse.json({
    data: {
      lines,
      agents: agentRows(counts),
      ledger: {
        page: ledger.page, pages: ledger.pages, total: ledger.total,
        rows: ledger.rows.map((r) => ({
          id: r.id, at: r.createdAt, summary: r.summary, entityName: r.actingEntity?.name ?? null,
          by: r.agentKey ? `${r.agentKey} for ${r.person.name}` : r.person.name, heldAs: r.heldAs,
          href: recordViewHref(r.recordType, r.recordId),
        })),
      },
    },
  })
}

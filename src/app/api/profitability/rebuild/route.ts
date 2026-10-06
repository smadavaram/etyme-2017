import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { cronAuthorized } from '@/lib/cron-auth'
import { rebuildPostings } from '@/lib/order-postings'

/**
 * POST /api/profitability/rebuild — re-derive the postings behind every
 * signed week, and replace the ones that disagree.
 *
 * Until 2026-10-06 a week signed down a chain was booked to the firm at
 * the bottom at the client's rate, and the firm in the middle got nothing
 * (lib/money/hop-ledger). Postings are derived — hours a party accepted
 * times the rate on the line the posting lands on — so the repair needs no
 * migration: re-derive, compare, replace.
 *
 * Two doors:
 *
 *   · the scheduler, with the cron secret: every firm's books, once —
 *     the one call that corrects a posting sitting in the wrong firm's
 *     books, because it is the only caller allowed to touch both;
 *   · a controller signed in (`pnl.read`, the same desk that closes an
 *     order): their own firm's books only. A firm rebuilding its books
 *     never rewrites its supplier's.
 *
 * What has left the building is never restated: a posting on a settled
 * order, one already reversed, or one whose journal entry was exported is
 * named in the answer and left for a person to correct. Running it twice
 * changes nothing the second time.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get('authorization')) {
    if (!cronAuthorized(request)) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'That is not the scheduler’s key.' } },
        { status: 401 }
      )
    }
    const done = await rebuildPostings()
    return NextResponse.json({ data: { scope: 'every firm', ...done, says: saysOf(done) } })
  }

  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Rebuilding the books')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Books belong to a company, and you are not acting for one.' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'pnl.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Rebuilding the books is the controller’s decision. Ask whoever closes your orders.',
        },
      },
      { status: 403 }
    )
  }
  const done = await rebuildPostings({ companyIds: [caller.company.id] })
  return NextResponse.json({ data: { scope: caller.company.name, ...done, says: saysOf(done) } })
}

function saysOf(d: Awaited<ReturnType<typeof rebuildPostings>>): string {
  const head =
    d.rebuilt === 0
      ? `${d.checked} signed week${d.checked === 1 ? '' : 's'} read; every posting already matched.`
      : `${d.rebuilt} of ${d.checked} signed week${d.checked === 1 ? '' : 's'} rebuilt: ${d.removed} posting${d.removed === 1 ? '' : 's'} removed, ${d.written} written.`
  return d.leftAlone.length
    ? `${head} ${d.leftAlone.length} left as ${d.leftAlone.length === 1 ? 'it was' : 'they were'}, each with the reason.`
    : head
}

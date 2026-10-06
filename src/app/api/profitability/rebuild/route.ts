import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { cronAuthorized } from '@/lib/cron-auth'
import { rebuildPostings } from '@/lib/order-postings'
import { rebuildSays } from '@/lib/money/rebuild-answer'

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
 *
 * `{"dryRun": true}` in the body, on either door, reads and plans the
 * whole rebuild and writes nothing: the answer is what a run would do,
 * said as "would". Until 2026-10-06 the body was not read at all, so a
 * dry run was a real one.
 *
 * Where a signature's postings are removed and nothing is written in
 * their place, the answer says why (`postsNothing`) — a one-person
 * corporation's own acceptance posts no pay when no pay line names its
 * owner at a rate, and "3 removed, 0 written" alone reads like lost
 * revenue.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get('authorization')) {
    if (!cronAuthorized(request)) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'That is not the scheduler’s key.' } },
        { status: 401 }
      )
    }
    const asked = await dryRunOf(request)
    if ('error' in asked) return asked.error
    const done = await rebuildPostings({ dryRun: asked.dryRun })
    return NextResponse.json({ data: { scope: 'every firm', ...done, says: rebuildSays(done) } })
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
  const asked = await dryRunOf(request)
  if ('error' in asked) return asked.error
  const done = await rebuildPostings({ companyIds: [caller.company.id], dryRun: asked.dryRun })
  return NextResponse.json({ data: { scope: caller.company.name, ...done, says: rebuildSays(done) } })
}

/**
 * Whether the caller asked for a dry run. An empty body is a run; a body
 * that is not a JSON object, or a dryRun that is not true or false, is
 * refused rather than guessed at, because guessing "not a dry run"
 * rewrites the books.
 */
async function dryRunOf(request: NextRequest): Promise<{ dryRun: boolean } | { error: NextResponse }> {
  const bad = (message: string) => ({ error: NextResponse.json({ error: { code: 'BAD_BODY', message } }, { status: 400 }) })
  const text = await request.text()
  if (!text.trim()) return { dryRun: false }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return bad('Send nothing, or {"dryRun": true} to see what a rebuild would do. Nothing was rebuilt.')
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return bad('Send nothing, or {"dryRun": true} to see what a rebuild would do. Nothing was rebuilt.')
  }
  const d = (body as Record<string, unknown>).dryRun
  if (d !== undefined && typeof d !== 'boolean') return bad('dryRun is true or false. Nothing was rebuilt.')
  return { dryRun: d === true }
}

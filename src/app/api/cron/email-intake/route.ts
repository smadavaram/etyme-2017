import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { cronAuthorized } from '@/lib/cron-auth'
import { sweepForwardedEmail } from '@/lib/email-intake'

/**
 * GET /api/cron/email-intake
 *
 * Kept only what is used (founder, 2026-10-22). Every night a forwarded
 * email's text is deleted once its card is decided, and after thirty days
 * if nobody decided it; files not filed as evidence go with it. The row
 * saying it came in stays.
 *
 * It names no automation action itself: every row is written inside
 * lib/email-intake/retention under EMAIL_INTAKE_BODY_DELETED, which sits
 * on the ladder there. So its `writes` in lib/autonomy is empty, the same
 * way the retention job's is.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const out = await sweepForwardedEmail(new Date())
    const n = out.decided + out.undecided
    return NextResponse.json({
      ok: true,
      data: {
        ...out,
        says: n
          ? `${n} forwarded email${n === 1 ? '' : 's'} had their text deleted (${out.decided} decided, ${out.undecided} undecided for thirty days), with ${out.attachments} unfiled file${out.attachments === 1 ? '' : 's'}.`
          : 'No forwarded email was due to be deleted.',
      },
    })
  } catch (err) {
    void reportError('cron/email-intake', err)
    return NextResponse.json({ error: { code: 'FAILED', message: 'The forwarded email deletion failed; the failure has been recorded.' } }, { status: 500 })
  }
}

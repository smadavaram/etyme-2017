import { NextRequest, NextResponse } from 'next/server'
import { reapExpiredDemos, DEMO_DAYS } from '@/lib/demo-seed'

/**
 * GET /api/cron/reap-demos
 *
 * Throw away the demos nobody came back to.
 *
 * A demo that is still being used has been extended by its owner coming
 * back; one that has not been touched in a fortnight is clutter, and a
 * database filling with abandoned workspaces is a slow way to make every
 * query worse.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const reaped = await reapExpiredDemos(new Date())

  return NextResponse.json({
    data: {
      reaped,
      says: reaped === 0
        ? 'Nothing to clear.'
        : `Cleared ${reaped} demo workspace${reaped === 1 ? '' : 's'} nobody came back to.`,
      livesFor: `${DEMO_DAYS} days`,
    },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { expireSandboxes, SANDBOX_UNUSED_DAYS } from '@/lib/sandbox-expiry'

/**
 * GET /api/cron/reap-demos
 *
 * A visitor's demo sandbox is removed after thirty days nobody used it,
 * and a visitor who left an address is warned a week before
 * (lib/sandbox-expiry). It touches nothing else: never the seeded demo
 * world, never a real company, whatever either's flag says.
 *
 * The path is the old reaper's, which deleted on a fixed fourteen days
 * from creation, used or not, and wrote nothing down.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const outcome = await expireSandboxes(
    {
      removed: (tx, row) => tx.automationLog.create({ data: { ...row, action: 'DEMO_SANDBOX_REMOVED' } }),
      warned: (row) => prisma.automationLog.create({ data: { ...row, action: 'DEMO_SANDBOX_EXPIRY_WARNED' } }),
    },
    new Date()
  )

  return NextResponse.json({
    data: { ...outcome, livesFor: `${SANDBOX_UNUSED_DAYS} days unused` },
  })
}

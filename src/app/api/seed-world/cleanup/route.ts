import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { cronAuthorized } from '@/lib/cron-auth'
import { CLEANUP_PHRASE, CleanupDrifted, planCleanup, runCleanup } from '@/lib/seed-cleanup'

export const maxDuration = 60

/**
 * POST /api/seed-world/cleanup
 *
 * Deletes the rows earlier seeds wrote outside the demo world, and
 * nothing else. lib/seed-cleanup says exactly which rows, by which
 * marker, and which it keeps.
 *
 *   {"dryRun": true}
 *       the plan: per kind, the ids it would delete and the ids it keeps
 *       with the reason. Reads only.
 *
 *   {"confirm": "delete seed rows outside the demo world"}
 *       works the plan out again and deletes exactly it, in one
 *       transaction, and writes an AutomationLog row that is not
 *       reversible. Typed out, so it cannot be sent by a slip.
 *
 * Behind the deployment secret (`Authorization: Bearer <CRON_SECRET>`),
 * as every job that runs without a person signed in is.
 */
export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Cleaning up seed rows needs the CRON_SECRET, sent as a bearer token. Nothing was read or deleted.',
        },
      },
      { status: 401 }
    )
  }

  const body = (await request.json().catch(() => null)) as { dryRun?: unknown; confirm?: unknown } | null
  const dryRun = body?.dryRun === true
  const confirmed = body?.confirm === CLEANUP_PHRASE
  if (!dryRun && !confirmed) {
    return NextResponse.json(
      {
        error: {
          code: 'CONFIRM',
          message:
            `Send {"dryRun": true} to see what would be deleted, or {"confirm": "${CLEANUP_PHRASE}"} ` +
            'to delete it. Nothing was deleted.',
        },
      },
      { status: 422 }
    )
  }

  try {
    const plan = await planCleanup()
    if (dryRun) return NextResponse.json({ data: { dryRun: true, ...plan } })
    const done = await runCleanup(plan, { by: 'the deployment secret' })
    return NextResponse.json({ data: { dryRun: false, deleted: done.deleted, says: done.says, plan } })
  } catch (err) {
    if (err instanceof CleanupDrifted) {
      return NextResponse.json({ error: { code: 'DRIFTED', message: err.message } }, { status: 409 })
    }
    reportError('Cleaning up seed rows outside the demo world failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'The cleanup failed and was rolled back. Nothing was deleted.' } },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { cronAuthorized } from '@/lib/cron-auth'
import { runRetentionSweep } from '@/lib/data-request'

/**
 * GET /api/cron/retention
 *
 * The night side of the data-rights work. `runRetentionSweep` was
 * written, tested and called by nobody: every clock on every request
 * moved only when a person happened to open a screen. A deadline that
 * is read when somebody looks is not a deadline.
 *
 * Four things happen here, and each of them is somebody's legal
 * exposure rather than housekeeping:
 *
 *   — a request whose answer is falling due is warned about, once a day
 *     rather than once a run;
 *   — an erasure whose cooling period has passed with nothing in the
 *     way is finished;
 *   — evidence whose statutory period has run is deleted, and what a
 *     minimum obliges us to keep is held instead, with the reason;
 *   — a breach deadline that is close, or that has been missed, is said
 *     out loud to staff.
 *
 * It runs after `end-contracts` in the daily fan-out, on purpose: the
 * I-9 floor is counted from `employmentEndedAt`, so a contract ended
 * tonight moves the date this sweep measures against. Reading the floor
 * before the contract ends would keep a record one day longer than the
 * schedule says, every night, for ever.
 *
 * It names no automation action itself — every row it writes is written
 * inside `lib/data-request`, under the names the autonomy ladder already
 * holds. That is why its `writes` in `lib/autonomy` is empty: the ladder
 * reads what a route file literally names, and this file names nothing.
 *
 * The response carries the sweep's own counts and a sentence, because
 * the daily run reads `data.says` and prints it in the morning report.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const outcome = await runRetentionSweep(new Date())

    const did: string[] = []
    if (outcome.warned) did.push(`${outcome.warned} request${outcome.warned === 1 ? '' : 's'} warned as falling due`)
    if (outcome.erased) did.push(`${outcome.erased} erasure${outcome.erased === 1 ? '' : 's'} finished`)
    if (outcome.held) did.push(`${outcome.held} record${outcome.held === 1 ? '' : 's'} held back by a statutory minimum`)
    if (outcome.deleted) did.push(`${outcome.deleted} record${outcome.deleted === 1 ? '' : 's'} deleted at the end of their period`)
    if (outcome.breachWarnings) did.push(`${outcome.breachWarnings} breach deadline${outcome.breachWarnings === 1 ? '' : 's'} close or missed`)
    if (outcome.breachesWithNoClock) did.push(`${outcome.breachesWithNoClock} open breach${outcome.breachesWithNoClock === 1 ? '' : 'es'} with no deadline decided`)

    return NextResponse.json({
      ok: true,
      data: {
        ...outcome,
        says: did.length
          ? `${did.join(', ')}.`
          : 'No clock ran out and no record reached the end of its period.',
      },
    })
  } catch (err) {
    void reportError('cron/retention', err)
    return NextResponse.json(
      { error: { code: 'FAILED', message: 'The retention sweep failed; the failure has been recorded.' } },
      { status: 500 }
    )
  }
}

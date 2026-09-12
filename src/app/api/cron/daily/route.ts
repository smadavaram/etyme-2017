import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/cron/daily — every overnight job, in one run.
 *
 * Not an aesthetic choice. Vercel's Hobby plan allows two scheduled jobs
 * and this product has nine, so declaring them one by one meant either
 * paying before there was anything to pay for, or quietly dropping seven
 * — and a job nobody declared is a job nobody notices has stopped.
 *
 * One entry in vercel.json, one fan-out here. It also survives the move
 * to Pro unchanged, and gives something the per-job schedules never did:
 * a single place that reports what ran, what it did, and what broke.
 *
 * ── Why one job failing does not stop the rest ───────────────────────
 *
 * These are independent. Cycle generation has nothing to do with expiring
 * an invitation, and letting a thrown error in the first skip the other
 * eight would turn one bug into a silent week. Each is caught, each is
 * reported, and the response says plainly which ones did not run.
 */

/**
 * In order of what hurts most if it is skipped.
 *
 * Money first: a billing cycle that does not generate is an invoice that
 * does not go out. Housekeeping last.
 */
const JOBS = [
  { path: 'auto-approve', does: 'approves the timesheets nobody responded to' },
  { path: 'due-cycles', does: 'generates the billing and pay cycles that fell due' },
  { path: 'rolloff-scan', does: 'finds assignments ending soon' },
  { path: 'visa-watch', does: 'finds permits expiring inside a contract' },
  { path: 'loose-ends', does: 'chases placements billed with no cost behind them' },
  { path: 'expire-invitations', does: 'closes invitations nobody answered' },
  { path: 'proactive-match', does: 'looks for people worth putting forward' },
  { path: 'freshness-ping', does: 'asks the bench whether they are still looking' },
  { path: 'deliver-webhooks', does: 'retries webhooks that did not land' },
  { path: 'watch', does: 'runs the saved watches' },
  { path: 'reap-demos', does: 'clears demo workspaces nobody came back to' },
]

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Each job is a real request to its own route, so a job keeps working
  // when somebody calls it by hand and nothing here needs to know how any
  // of them are built.
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const ran: any[] = []
  const broke: any[] = []

  for (const job of JOBS) {
    const started = Date.now()
    try {
      const res = await fetch(`${base}/api/cron/${job.path}`, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        cache: 'no-store',
      })

      const body = await res.json().catch(() => null)

      if (!res.ok) {
        broke.push({
          job: job.path,
          does: job.does,
          why: body?.error?.message ?? body?.error ?? `HTTP ${res.status}`,
          ms: Date.now() - started,
        })
        continue
      }

      ran.push({
        job: job.path,
        does: job.does,
        says: body?.data?.says ?? null,
        ms: Date.now() - started,
      })
    } catch (err: any) {
      broke.push({
        job: job.path,
        does: job.does,
        why: String(err?.message ?? err).slice(0, 200),
        ms: Date.now() - started,
      })
    }
  }

  return NextResponse.json({
    data: {
      ran,
      broke,
      // Leads with the failures, because the successes are the ordinary
      // case and nobody reads a list of nine green ticks.
      says: broke.length
        ? `${broke.length} of ${JOBS.length} overnight jobs did not run: ${broke.map((b) => b.job).join(', ')}.`
        : `All ${JOBS.length} overnight jobs ran.`,
    },
  })
}

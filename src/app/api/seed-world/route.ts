import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { seedWorld } from '@/lib/seed-world'

/**
 * POST /api/seed-world
 *
 * Builds the twenty-firm world described in lib/seed-world, on whichever
 * database this deployment is pointed at.
 *
 * It exists so the world can be seeded without a production database URL
 * leaving the deployment it belongs to. The alternative was pasting that
 * credential into a shell somewhere, and a credential that never moves
 * cannot be mislaid.
 *
 * ── The guard ────────────────────────────────────────────────────────
 *
 * `Authorization: Bearer <CRON_SECRET>`, compared in constant time.
 *
 * Deliberately not the comparison the cron routes use. They test
 * `header !== ` + "`Bearer ${process.env.CRON_SECRET}`" + `, which on a deployment
 * with no CRON_SECRET set interpolates to the literal string "Bearer
 * undefined" — and anybody who sends exactly that is let in. Here a
 * missing secret refuses everything outside development instead, which
 * is the direction to fail in for a route that writes.
 *
 * ── Safe to call twice ───────────────────────────────────────────────
 *
 * The seed is idempotent by slug, so a second call adds nothing. That
 * also makes it safe to retry after a serverless timeout: it resumes
 * rather than duplicating, and the roster it returns is the same either
 * way.
 */

/** Constant time, and false when either side is missing. */
function sameSecret(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on a length mismatch, which would itself leak
  // the length. Compare a fixed-width digest of each instead — here, pad
  // to the longer of the two.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const offered = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null

  if (!secret) {
    // No secret configured. In development that is ordinary and the route
    // is a convenience; anywhere else it means the guard cannot be
    // enforced, and a writing route with no guard should not answer.
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json(
        {
          error: {
            code: 'NO_SECRET',
            message: 'CRON_SECRET is not set on this deployment, so this route refuses to run.',
          },
        },
        { status: 503 }
      )
    }
  } else if (!sameSecret(offered, secret)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Bearer CRON_SECRET required.' } },
      { status: 401 }
    )
  }

  try {
    const result = await seedWorld()
    return NextResponse.json({
      data: {
        ...result,
        says:
          `${result.firms} firms, ${result.placements} placements, ` +
          `${result.consultants} consultants. Enter one with ` +
          `POST /api/demo {"as":"world-cloudepa"}, or sit at a client desk at /demo — ` +
          `POST /api/demo {"as":"world-nike","desk":"ap"}.`,
      },
    })
  } catch (err: any) {
    // Loud and specific. A half-built world is worse than none, and the
    // seed is idempotent, so the honest advice is to run it again.
    console.error('seed-world: could not build the world', err)
    return NextResponse.json(
      {
        error: {
          code: 'SEED_FAILED',
          message: String(err?.message ?? err),
          hint: 'The seed is idempotent — running it again resumes where it stopped.',
        },
      },
      { status: 500 }
    )
  }
}

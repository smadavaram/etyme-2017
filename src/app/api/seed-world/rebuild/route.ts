import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { reportError } from '@/lib/alerts'
import { seedWorldInSteps } from '@/lib/seed-world'
import { seedBudgetMs } from '@/lib/seed-steps'
import { CONFIRM_PHRASE, deleteDemoWorld } from '@/lib/seed-rebuild'

/**
 * The same minute the seed route has, and it is spent in two steps.
 *
 * Measured locally on 2026-09-29: working out what to delete takes half
 * a second, deleting ten thousand rows in one transaction about two, and
 * seeding the world again about twenty-five — on a database in the same
 * machine. Production's database is in another building, so the seed
 * can run past the minute there. That is survivable by design: the
 * delete is one transaction and either happened or did not, and the seed
 * is idempotent, so a rebuild cut off while seeding is finished by
 * `POST /api/seed-world`, which resumes where it stopped.
 * `docs/deploying.md` says so beside the command.
 */
export const maxDuration = 60

/**
 * POST /api/seed-world/rebuild
 *
 * Deletes the demo world — the seed's roster of companies, every company
 * seated entirely at reserved addresses, the people at those addresses,
 * and every row that points at them — and seeds it again, so its dates
 * count from today and it carries whatever the seed learned since.
 * lib/seed-rebuild says exactly what is in scope and why.
 *
 * ── The guard ────────────────────────────────────────────────────────
 *
 * Stricter than the seed route on purpose, because this one deletes:
 *
 * - `Authorization: Bearer <CRON_SECRET>` and nothing else. No signed-in
 *   staff shortcut and no development bypass — a deployment with no
 *   secret refuses, in development too.
 * - A body of `{"confirm":"delete the demo world"}`, typed out, so the
 *   request cannot be the seed route's by a slip of the path.
 * - Nothing tied to a real company or person is ever deleted: if the
 *   demo world has a thread to the real world, nothing is deleted at all
 *   and the answer names each thread.
 */

function sameSecret(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

const refuse = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: { code, message, ...extra } }, { status })

export async function POST(request: NextRequest) {
  const began = Date.now()
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return refuse(
      503,
      'NO_SECRET',
      'CRON_SECRET is not set on this deployment, so the demo world cannot be rebuilt from here. Nothing was deleted.'
    )
  }
  const header = request.headers.get('authorization')
  const offered = header?.replace(/^Bearer\s+/i, '') ?? null
  if (!sameSecret(offered, secret)) {
    return refuse(
      401,
      'UNAUTHORIZED',
      offered === null
        ? 'Rebuilding the demo world needs the CRON_SECRET, sent as a bearer token. Nothing was deleted.'
        : 'That is not the CRON_SECRET for this deployment. Nothing was deleted.'
    )
  }

  const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null
  if (body?.confirm !== CONFIRM_PHRASE) {
    return refuse(
      400,
      'NOT_CONFIRMED',
      `This deletes the demo world and seeds it again. To go ahead, send {"confirm":"${CONFIRM_PHRASE}"} ` +
        'as the body, word for word. Nothing was deleted.'
    )
  }

  let deleted
  try {
    deleted = await deleteDemoWorld()
  } catch (err: any) {
    reportError('seed-world/rebuild: could not delete the demo world', err)
    return refuse(
      500,
      'DELETE_FAILED',
      'The demo world could not be deleted, and because the delete is one transaction nothing was. ' +
        `Run it again; if it fails the same way, the reason is: ${String(err?.message ?? err)}`
    )
  }
  if (!deleted.ok) {
    return refuse(409, 'TIED_TO_REAL_DATA', deleted.says, { threads: deleted.threads })
  }

  // What is left of this call's budget after the delete. The seed runs
  // in steps (lib/seed-steps) and says what is left; POST /api/seed-world
  // carries on from there, because a whole world does not fit in one call.
  const seeding = Date.now()
  try {
    const seeded = await seedWorldInSteps({ budgetMs: Math.max(0, seedBudgetMs(maxDuration) - (seeding - began)) })
    return NextResponse.json({
      data: {
        deleted: deleted.deleted,
        deletedRows: deleted.total,
        deletedCompanies: deleted.companies,
        deletedPeople: deleted.people,
        sparedPeople: deleted.spared,
        deleteMs: deleted.ms,
        seedMs: Date.now() - seeding,
        seeded,
        says:
          `Deleted the demo world — ${deleted.companies} companies, ${deleted.people} people, ` +
          `${deleted.total} rows. Nothing outside the demo world was touched. ` +
          (seeded.done
            ? 'It is seeded again, counting from today.'
            : `Seeding it again has begun: ${seeded.ran.length} steps done, ${seeded.remaining} left. ` +
              'POST /api/seed-world with the same secret until it says complete.'),
      },
    })
  } catch (err: any) {
    reportError('seed-world/rebuild: deleted, and the seed stopped part way', err)
    return refuse(
      500,
      'SEED_FAILED',
      `The demo world was deleted (${deleted.total} rows) and seeding it again stopped part way: ` +
        String(err?.message ?? err),
      { hint: 'POST /api/seed-world with the same secret — the seed is idempotent and resumes where it stopped.' }
    )
  }
}

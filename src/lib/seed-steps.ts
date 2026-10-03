/**
 * Seeding the demo world in steps that each fit inside one function call.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * On 2026-09-29 the world was rebuilt on production: the delete
 * committed, and then `POST /api/seed-world` ended in a function timeout
 * at sixty seconds eight times running. Each call walked every idempotent
 * step from the top, spent its minute confirming what was already there,
 * and was cut off before it reached what was not. The world was idempotent
 * and still did not converge, because idempotent is not the same as
 * resumable: a call that always starts at the beginning never reaches the
 * end of a job longer than the call.
 *
 * So `seedWorld` is a list of named steps, and each finished step leaves
 * a marker. A call skips every step with a marker, runs the next ones in
 * order until its time is up, and says what is left. Repeating the call
 * converges, and once every step is marked a call costs two queries.
 *
 * ── Where the marker lives, and what it is keyed on ──────────────────
 *
 * An `AutomationLog` row with no company — an act of the platform, like
 * `DEMO_WORLD_REBUILT` — with the step, the world and the code version in
 * its payload. Not a `JobRun`: that table is the nightly job's receipt,
 * and a seed that wrote one would be inventing a night the cron did not
 * run (`__integration__/seed-covers-the-matrix.test.ts`).
 *
 * Keyed on two things, so a marker never skips work it did not do:
 *
 *   the world    the id of the company the world was born with. A rebuild
 *                deletes it and the next seed writes a new one, so every
 *                marker from the old world stops matching without anything
 *                having to delete an audit row.
 *   the version  the deployment's commit. A new deploy may seed more than
 *                the last one did — a world seeded before a story existed
 *                gets it "on its next seeding" — so a new version walks
 *                every step again, in the same bounded calls.
 */

import { prisma as db } from '@/lib/db'

export const SEED_STEP_ACTION = 'DEMO_SEED_STEP'

/**
 * How long a call may keep starting steps, given the seconds the function
 * is allowed. Thirty seconds are held back for the step already running
 * when the budget runs out.
 *
 * So every step has to finish inside those thirty seconds on its own. A
 * step costs its query count times what one query takes production, and
 * production answers from another building: on 2026-09-29 a step of 1,307
 * queries finished inside one sixty-second call, and the books, at 1,728
 * queries for the world plus every posting outside it, timed out six
 * calls running. So a query there takes at most about 46 ms, counted the
 * way `__integration__/seed-step-size.test.ts` counts them — and this
 * file's first version, which assumed 17 ms and a heaviest step of 1,700
 * queries, was wrong on both.
 *
 * That test holds every step, fresh and walked again after a deploy,
 * under 350 queries: sixteen seconds at 46 ms. Timed through a local proxy
 * that adds 40 ms to every round trip — a query then costs more than
 * production has ever shown — the slowest step took seventeen seconds. A
 * step that grows past the line is cut into shares (`shareOf` below) on
 * the commit that grew it, rather than found by a timeout on production.
 * A step the platform cuts off anyway is not marked, and runs again first
 * on the next call.
 */
export function seedBudgetMs(maxDurationSeconds: number): number {
  return Math.max(10, maxDurationSeconds - 30) * 1000
}

/**
 * A contiguous piece of a list: the `index`th of `of`. A step too heavy for
 * one call is cut into shares of what it walks — signed weeks, entries, a
 * program's placements — one step each, run in order, so the shares do in
 * several calls exactly what one pass would do in one.
 */
export type Share = { index: number; of: number }

/** The rows in one share, in their order; all of them where no share is asked for. Every row lands in exactly one share. */
export function shareOf<T>(rows: readonly T[], share?: Share): T[] {
  if (!share) return [...rows]
  const from = Math.floor((rows.length * share.index) / share.of)
  const to = Math.floor((rows.length * (share.index + 1)) / share.of)
  return rows.slice(from, to)
}

/** Whether this is the last share, or no share at all: where the work after a list happens, once. */
export function lastShare(share?: Share): boolean {
  return !share || share.index === share.of - 1
}

/** The code a marker was written by. A new deployment re-walks every step. */
export function seedVersion(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA || process.env.ETYME_SEED_VERSION || 'local'
}

/** The steps already finished for this world at this version. Empty for a world not yet born. */
export async function finishedSteps(worldId: string | null, version = seedVersion()): Promise<Set<string>> {
  if (!worldId) return new Set()
  const rows = await db.automationLog.findMany({
    where: {
      companyId: null,
      action: SEED_STEP_ACTION,
      AND: [
        { payload: { path: ['world'], equals: worldId } },
        { payload: { path: ['version'], equals: version } },
      ],
    },
    select: { payload: true },
  })
  return new Set(rows.map((r) => String((r.payload as { step?: unknown }).step)))
}

/** Mark one step finished. Once per step, world and version. */
export async function recordStep(step: string, worldId: string, version = seedVersion()): Promise<void> {
  await db.automationLog.create({
    data: {
      companyId: null,
      action: 'DEMO_SEED_STEP',
      summary: `Seeded the demo world's "${step}" step.`,
      reason:
        'The demo world is seeded in steps so each call fits the time a function is given; ' +
        'this step finished, so the next call starts after it.',
      payload: { step, world: worldId, version },
      // The rows the step wrote stay whatever happens to this one.
      reversible: false,
    },
  })
}

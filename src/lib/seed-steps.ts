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
 * Measured locally on 2026-09-29, the heaviest step on a fresh world is
 * about 1,700 queries (the books) and the next about 1,300; the whole
 * world is about 12,000, and walking a finished one again about 7,000.
 * Production answers each query from another building, so a step costs
 * its query count times that round trip: under thirty seconds for the
 * heaviest step up to roughly 17 ms a query. A step the platform cuts off
 * anyway is not marked, and runs again on the next call.
 */
export function seedBudgetMs(maxDurationSeconds: number): number {
  return Math.max(10, maxDurationSeconds - 30) * 1000
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

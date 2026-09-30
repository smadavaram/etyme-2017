/**
 * The integration harness.
 *
 * ── How to run ───────────────────────────────────────────────────────
 *
 *   Full suite:       npm run test:integration
 *                     (= npx vitest run -c vitest.integration.config.ts)
 *   One file:         npx vitest run -c vitest.integration.config.ts __integration__/whose-rate.test.ts
 *   Own databases:    ETYME_TEST_DB=etyme_test_<you> npm run test:integration
 *   Rebuild templates: ETYME_REBUILD_TEMPLATES=1 npm run test:integration
 *
 * ── How it is fast ───────────────────────────────────────────────────
 *
 * `global-setup.ts` builds two template databases once per run — the
 * empty schema, and the whole demo world seeded on top of it — and
 * caches them across runs under a name hashed from the schema, every
 * file the seed reaches, and the UTC day. An unchanged seed reuses
 * yesterday's run's empty template and today's world; a changed one
 * rebuilds, and the log says why in one line.
 *
 * Each file then starts with one call:
 *
 *   `freshWorld()`     the seeded world, a private copy (was
 *                      `resetDatabase()` + `seedWorld()`)
 *   `resetDatabase()`  an empty schema, a private copy
 *
 * Files run four at a time, one per worker, and each worker has its own
 * database (`database.ts`), so nothing one file writes is seen by
 * another. A file that tests seeding itself still calls `seedWorld()`
 * after `resetDatabase()`, and that is correct.
 *
 * ── Calling routes ───────────────────────────────────────────────────
 *
 * Call a route the way the app does, as a chosen person.
 *
 * `as(email)` flips the same DEV_BYPASS_AUTH switch the development
 * screenshots use, so every line of route code runs for real except the
 * NextAuth session lookup. `x-context-id` picks the seat, exactly as the
 * client does.
 */
import { NextRequest } from 'next/server'
import { inject } from 'vitest'
import { prisma } from '@/lib/db'
import { WORLD_SLUGS } from '@/lib/seed-world'
import { anchorSeed, forgetSeedAnchor } from '@/lib/seed-days'
import { primeCalendar } from '@/lib/seed-calendar'
import { TEST_DB } from './database'
import { copyDatabase, ensurePostgres } from './postgres'

export function as(email: string) {
  process.env.DEV_BYPASS_AUTH = email
}

export function req(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

export async function json(res: Response) {
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

/**
 * The template this run built, or a sentence saying why there is none.
 * Provided by global-setup.ts; a file run under another config has no
 * templates and is told so rather than failing on a missing database.
 */
function template(key: 'emptyTemplate' | 'worldTemplate'): string {
  const name = inject(key)
  if (!name) {
    throw new Error(
      `No ${key} was provided. Run integration files with -c vitest.integration.config.ts, ` +
        'whose global setup builds the templates.'
    )
  }
  return name
}

/** Drop this file's database and copy it from a template. */
async function copyFrom(tpl: string) {
  ensurePostgres()
  // Close the pool before the drop so the client reconnects to the copy
  // on its next query rather than holding a socket to the old one.
  await prisma.$disconnect()
  copyDatabase(tpl, TEST_DB)
}

/**
 * A clean, empty database with the schema on it, before the story
 * starts. A copy of the empty template global-setup.ts built.
 */
export async function resetDatabase() {
  await copyFrom(template('emptyTemplate'))
  forgetSeedAnchor()
}

/**
 * The seeded demo world, as a private copy for this file.
 *
 * Equivalent to `resetDatabase()` followed by `seedWorld()`, and the
 * reason the suite is fast: the world is seeded once per run into a
 * template and copied here in about a second. Anything this file writes
 * on top stays in its own copy.
 *
 * The two in-memory things `seedWorld()` sets before it writes — the
 * day the world was born and the primed holiday calendar — are set here
 * too, so a test reads the same "today" it would have after seeding.
 */
export async function freshWorld() {
  await copyFrom(template('worldTemplate'))
  const born = await prisma.company.findFirst({
    where: { slug: { in: [...WORLD_SLUGS] } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })
  anchorSeed(born?.createdAt)
  primeCalendar()
}

export { prisma }

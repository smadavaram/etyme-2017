/**
 * Which database the integration suite talks to.
 *
 * One definition, because there were three — `setup.ts` set
 * `DATABASE_URL` from a literal and `harness.ts` wrote the same literal
 * twice more, once inside a `psql` command line and once in the env it
 * handed to `prisma db push`. Three copies of one fact is three chances
 * to change two of them.
 *
 * ── Why this is configurable at all ──────────────────────────────────
 *
 * `resetDatabase()` DROPs and CREATEs. Within one run every worker has
 * its own database (below), so a single run is safe — but two runs at
 * once on the same base name are not, and two runs at once is the ordinary case here:
 * several agents work in one tree and each verifies its own change.
 * When they overlap, one run drops the database out from under the
 * other, and the victim fails with `database "etyme_test" is being
 * accessed by other users`, or `public.Company does not exist`, or a
 * bare data-loss warning — none of which says "you collided", and all
 * of which read exactly like a regression in the change under test.
 *
 * That cost six or seven wasted runs and three false failures in one
 * day, each chased down by hand before being dismissed. A signal that
 * has to be interpreted is not a signal.
 *
 * So: set `ETYME_TEST_DB` to give a run a database of its own.
 *
 *     ETYME_TEST_DB=etyme_test_b npx vitest run -c vitest.integration.config.ts
 *
 * ── Every run its own databases, by default (2026-11-09) ─────────────
 *
 * Setting a name by hand was the fix, and nobody set it: agents ran
 * integration files at the same time on the shared `etyme_test_w<n>`, so
 * one run's copy of the world (DROP, then CREATE from the template) cut
 * the other's connections (Postgres 57P01) and could leave it with an
 * empty database ("world-brightmoor not found"). So every run now names
 * its own: `vitest.integration.config.ts` gives the run an id
 * (`ETYME_TEST_RUN`, `p<pid>_<four letters>`), and each worker's database
 * is `etyme_test_p<pid>_<letters>_w<n>`. The templates stay shared and
 * are only ever read. The run's databases are dropped when it ends, and
 * the global setup drops any left by a run whose process is gone.
 *
 * `ETYME_TEST_DB` still wins, and keeps its old names, so a database a
 * person asked for by name is left where they can look at it.
 */

/**
 * The name a run starts from. Default matches what CI and every doc
 * already say.
 */
import { urlFor } from './postgres'

/** The prefix every run's own databases start with. */
export const RUN_DB_PREFIX = 'etyme_test_p'

/** This run's id, from the config (`p<pid>_<letters>`), unless a database was named by hand. */
const RUN = process.env.ETYME_TEST_DB ? null : process.env.ETYME_TEST_RUN || null

export const BASE_DB = process.env.ETYME_TEST_DB || (RUN ? `etyme_test_${RUN}` : 'etyme_test')

/**
 * The database this process owns.
 *
 * Files run in parallel now, one per worker, and each worker gets a
 * database of its own: the first worker uses the base name itself — so
 * running one file by hand with `ETYME_TEST_DB=x` leaves its data in
 * `x`, where you can look at it — and worker n uses `x_w<n>`. Two files
 * in one worker run one after the other, and each replaces the database
 * the one before it left.
 */
const pool = Number(process.env.VITEST_POOL_ID || '1')
export const TEST_DB = RUN ? `${BASE_DB}_w${pool}` : pool > 1 ? `${BASE_DB}_w${pool}` : BASE_DB

/** This run's own databases share this prefix; null where a name was given by hand. */
export const RUN_DATABASES = RUN ? `${BASE_DB}_` : null

/**
 * The process that made a run's database, read off its name, or null for
 * a name that is not a run's (a template, `etyme_test`, a name given by hand).
 */
export function runPidOf(name: string): number | null {
  const m = /^etyme_test_p(\d+)_[a-z0-9]+_w\d+$/.exec(name)
  return m ? Number(m[1]) : null
}

/**
 * The run databases whose process is gone: left by a run that was killed
 * before it could drop its own. Never this run's, and never a name that is
 * not a run's. Pure: `alive` says whether a process still runs.
 */
export function staleRunDatabases(names: readonly string[], alive: (pid: number) => boolean, ownPrefix: string | null): string[] {
  return names.filter((n) => {
    const pid = runPidOf(n)
    if (pid == null) return false
    if (ownPrefix && n.startsWith(ownPrefix)) return false
    return !alive(pid)
  })
}

/** Whether a process still runs. A process we may not signal is still running. */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * The connection string for it, from the one builder (`urlFor` in
 * ./postgres), which carries the server's password where it asks for one
 * (f9d505e0). Built here by hand it had no password, so on a server that
 * asks every file failed to connect before its first sentence ran.
 */
export const TEST_DATABASE_URL = urlFor(TEST_DB)

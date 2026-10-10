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
 * The default is unchanged, so nothing that worked before behaves
 * differently, and CI — which runs alone — needs to know nothing about
 * this.
 */

/**
 * The name a run starts from. Default matches what CI and every doc
 * already say.
 */
export const BASE_DB = process.env.ETYME_TEST_DB || 'etyme_test'

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
export const TEST_DB = pool > 1 ? `${BASE_DB}_w${pool}` : BASE_DB

/** The connection string for it. Nothing else builds one. */
export const TEST_DATABASE_URL = `postgresql://postgres@localhost:5432/${TEST_DB}`

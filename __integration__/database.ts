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
 * `resetDatabase()` DROPs and CREATEs. `vitest.integration.config.ts`
 * already runs files one at a time, so a single run is safe — but two
 * runs at once are not, and two runs at once is the ordinary case here:
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

/** The database this process owns. Default matches what CI and every doc already say. */
export const TEST_DB = process.env.ETYME_TEST_DB || 'etyme_test'

/** The connection string for it. Nothing else builds one. */
export const TEST_DATABASE_URL = `postgresql://postgres@localhost:5432/${TEST_DB}`

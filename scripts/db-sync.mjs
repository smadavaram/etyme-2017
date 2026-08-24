/**
 * Bring the deployed database up to the schema, when asked to.
 *
 * This machine cannot reach Postgres — outbound traffic is HTTPS-only —
 * so the schema cannot be pushed from where the code is written. The
 * build machine can, and this is the one place in the pipeline that
 * runs there and knows about Prisma.
 *
 * ── Why it is behind a flag ──────────────────────────────────────────
 *
 * `db push` reconciles the database to the schema, and reconciling can
 * mean dropping a column that no longer exists. On an empty database
 * that is a no-op. On one with a month of real timesheets in it, it is
 * a very bad afternoon.
 *
 * So it does nothing unless DB_PUSH_ON_BUILD is set. Turn it on for the
 * deploy that needs it, turn it off again after. A destructive step that
 * runs on every build is one that eventually runs on the wrong build.
 */

import { execSync } from 'node:child_process'

const asked = process.env.DB_PUSH_ON_BUILD === '1'

if (!asked) {
  console.log('db-sync: DB_PUSH_ON_BUILD is not set — leaving the database alone.')
  process.exit(0)
}

if (!process.env.DATABASE_URL) {
  console.error('db-sync: asked to sync, but there is no DATABASE_URL. Refusing to guess.')
  process.exit(1)
}

console.log('db-sync: DB_PUSH_ON_BUILD=1 — reconciling the database to the schema.')

try {
  execSync('npx prisma db push --skip-generate --accept-data-loss', { stdio: 'inherit' })
  console.log('db-sync: done. Unset DB_PUSH_ON_BUILD before the next deploy.')
} catch (err) {
  // Loud, and fatal. A build that ships code against a schema the
  // database does not have is a site that returns 500 on every page,
  // and it is better to fail here where somebody is watching.
  console.error('db-sync: could not reconcile the database.')
  process.exit(1)
}

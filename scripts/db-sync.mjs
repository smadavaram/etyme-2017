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
 * So a push that could lose data runs only when DB_PUSH_ON_BUILD is set;
 * additive changes apply on every build (see below). Turn it on for the
 * deploy that needs it, turn it off again after. A destructive step that
 * runs on every build is one that eventually runs on the wrong build.
 */

import { execSync } from 'node:child_process'

// Any of the ordinary ways somebody says yes.
//
// This was `=== '1'` exactly. Setting it to `true` in a dashboard — which
// is what most people type — meant the sync silently did not run, the
// build succeeded, and the new code went live against the old schema.
// Every contract, invoice and payroll screen then returns 500: a failed
// deploy wearing the face of a successful one.
//
// The gate is unchanged in substance. Nothing here runs unless somebody
// deliberately set the variable; this only stops the deliberate act
// being defeated by a spelling.
const said = String(process.env.DB_PUSH_ON_BUILD ?? '').trim().toLowerCase()
const asked = ['1', 'true', 'yes', 'on'].includes(said)

if (!asked) {
  // Additive changes apply on every build (2026-11-26). The deploy of that
  // day shipped new columns with the flag off: the build succeeded, and
  // every storefront and signed-in page returned 500. A push WITHOUT
  // --accept-data-loss only ever adds: Prisma refuses any change that
  // would drop or narrow data. So new tables and columns land by
  // themselves, and anything destructive still needs the flag, said on
  // purpose. A refused push fails the build here, where somebody is
  // watching, instead of shipping code against a schema it lacks.
  console.log(
    said === ''
      ? 'db-sync: DB_PUSH_ON_BUILD is not set — applying additive changes only.'
      : `db-sync: DB_PUSH_ON_BUILD is "${said}", which is not a yes — applying additive changes only.`
  )
  if (!process.env.DATABASE_URL) {
    console.log('db-sync: no DATABASE_URL — leaving the database alone.')
    process.exit(0)
  }
  try {
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit' })
  } catch (err) {
    console.error('db-sync: the schema has a change that would lose data. Set DB_PUSH_ON_BUILD=1 for this deploy if that is intended.')
    process.exit(1)
  }
  try {
    execSync('npx prisma db execute --file prisma/sql/append-only.sql --schema prisma/schema.prisma', { stdio: 'inherit' })
  } catch (err) {
    console.error('db-sync: the security log guard could not be applied (prisma/sql/append-only.sql).')
    process.exit(1)
  }
  console.log('db-sync: additive changes applied.')
  process.exit(0)
}

if (!process.env.DATABASE_URL) {
  console.error('db-sync: asked to sync, but there is no DATABASE_URL. Refusing to guess.')
  process.exit(1)
}

console.log(`db-sync: DB_PUSH_ON_BUILD=${said} — reconciling the database to the schema.`)

try {
  execSync('npx prisma db push --skip-generate --accept-data-loss', { stdio: 'inherit' })
} catch (err) {
  // Loud, and fatal. A build that ships code against a schema the
  // database does not have is a site that returns 500 on every page,
  // and it is better to fail here where somebody is watching.
  console.error('db-sync: could not reconcile the database.')
  process.exit(1)
}

// The security log's guard (Layer 7, record 86). `db push` runs no SQL
// and cannot declare a trigger, so the triggers that refuse to change,
// delete or empty a SecurityEvent row are applied here, right after every
// push. The file is safe to run any number of times. Fatal on failure: a
// security log the database does not guard is one /ready says is missing,
// and the build is where somebody is watching.
try {
  execSync('npx prisma db execute --file prisma/sql/append-only.sql --schema prisma/schema.prisma', { stdio: 'inherit' })
  console.log('db-sync: the security log is guarded (prisma/sql/append-only.sql).')
} catch (err) {
  console.error('db-sync: the schema is pushed, but the security log guard could not be applied (prisma/sql/append-only.sql).')
  process.exit(1)
}

console.log('db-sync: done. Unset DB_PUSH_ON_BUILD before the next deploy.')

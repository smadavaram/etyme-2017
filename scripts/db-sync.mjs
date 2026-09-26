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
  // Said exactly, because this line is the one somebody reads in a build
  // log to decide whether the deploy is safe. "Not set" when it is in
  // fact set to something unrecognised sends them to look in the wrong
  // place.
  console.log(
    said === ''
      ? 'db-sync: DB_PUSH_ON_BUILD is not set — leaving the database alone.'
      : `db-sync: DB_PUSH_ON_BUILD is "${said}", which is not a yes — leaving the database alone.`
  )
  process.exit(0)
}

if (!process.env.DATABASE_URL) {
  console.error('db-sync: asked to sync, but there is no DATABASE_URL. Refusing to guess.')
  process.exit(1)
}

console.log(`db-sync: DB_PUSH_ON_BUILD=${said} — reconciling the database to the schema.`)

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

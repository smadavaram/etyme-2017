/**
 * The Postgres server the integration suite runs against, and the few
 * statements the harness sends it outside Prisma: make sure it is up,
 * drop a database, copy one from a template.
 *
 * Shared by `global-setup.ts` (which builds the templates once per run)
 * and `harness.ts` (which copies one for each test file).
 */
import { execSync } from 'node:child_process'

export const PG_HOST = 'localhost'
export const PG_PORT = 5432
export const PG_USER = 'postgres'

export function urlFor(db: string): string {
  return `postgresql://${PG_USER}@${PG_HOST}:${PG_PORT}/${db}`
}

/** One or more statements against the maintenance database. */
export function psql(sql: string | string[], db = 'postgres'): string {
  const statements = Array.isArray(sql) ? sql : [sql]
  const args = statements.map((s) => `-c ${JSON.stringify(s)}`).join(' ')
  return execSync(`psql -X -v ON_ERROR_STOP=1 -h ${PG_HOST} -p ${PG_PORT} -U ${PG_USER} -d ${db} -Atq ${args}`, {
    stdio: 'pipe',
    encoding: 'utf8',
  })
}

/** Every database whose name starts with this prefix. */
export function databasesLike(prefix: string): string[] {
  return psql(`SELECT datname FROM pg_database WHERE datname LIKE '${prefix.replace(/_/g, '\\_')}%'`)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function databaseExists(name: string): boolean {
  return psql(`SELECT 1 FROM pg_database WHERE datname = '${name}'`).trim() === '1'
}

/** Drop it even if a stale connection from an earlier file is still open. */
export function dropDatabase(name: string): void {
  // A database marked as a template refuses DROP until it is unmarked.
  if (databaseExists(name)) psql(`ALTER DATABASE "${name}" WITH IS_TEMPLATE false`)
  psql(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
}

/**
 * A copy of a template. The default WAL_LOG strategy, measured against
 * FILE_COPY on the seeded world (23 MB): 0.28s against 0.60s a copy,
 * because FILE_COPY forces two checkpoints and four workers copying at
 * once would queue behind each other's.
 */
export function copyDatabase(template: string, name: string): void {
  dropDatabase(name)
  psql([`CREATE DATABASE "${name}" TEMPLATE "${template}"`])
}

/**
 * Postgres dies with the container.
 *
 * Every time this session goes idle long enough to be paused, the
 * database server is gone when it comes back — "removed stale pid
 * file" on restart, "database system was not properly shut down" in
 * the log — and the next agent to run this suite gets ECONNREFUSED
 * dressed up as a failing test. On 2026-09-18 it had been down for
 * twenty-two hours before anybody noticed, and three agents were
 * launched into it. A red suite that means "the server is off" is the
 * exact class of signal the database-name fix was for.
 *
 * So: check, start, wait, and if it still refuses say so in a sentence
 * that names the command, rather than letting a connection error stand
 * in for a verdict on somebody's change.
 */
export function ensurePostgres(): void {
  const up = () => {
    try {
      execSync(`pg_isready -h ${PG_HOST} -p ${PG_PORT}`, { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }
  if (up()) return
  // A server that is still replaying its log after a restart says "not
  // ready" for a few seconds; wait for it before trying to start another.
  for (let i = 0; i < 30 && !up(); i++) execSync('sleep 1')
  if (up()) return
  for (const cmd of ['pg_ctlcluster 16 main start', 'service postgresql start', 'sudo service postgresql start']) {
    try { execSync(cmd, { stdio: 'pipe' }) } catch { /* try the next form */ }
    for (let i = 0; i < 20 && !up(); i++) execSync('sleep 1')
    if (up()) return
  }
  throw new Error(
    'Postgres is not running on localhost:5432, and could not be started. ' +
      'This is the server, not the change under test — start it with ' +
      '`pg_ctlcluster 16 main start` (or `service postgresql start`) and run again.'
  )
}

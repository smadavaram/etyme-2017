/**
 * Call a route the way the app does, as a chosen person.
 *
 * `as(email)` flips the same DEV_BYPASS_AUTH switch the development
 * screenshots use, so every line of route code runs for real except the
 * NextAuth session lookup. `x-context-id` picks the seat, exactly as the
 * client does.
 */
import { NextRequest } from 'next/server'
import { execSync } from 'node:child_process'
import { prisma } from '@/lib/db'
import { TEST_DB, TEST_DATABASE_URL } from './database'

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
 * Postgres dies with the container.
 *
 * Every time this session goes idle long enough to be paused, the
 * database server is gone when it comes back — "removed stale pid
 * file" on restart, "database system was not properly shut down" in
 * the log — and the next agent to run this suite gets ECONNREFUSED
 * dressed up as a failing test. On 2026-09-18 it had been down for
 * twenty-two hours before anybody noticed, and three agents were
 * launched into it. A red suite that means "the server is off" is the
 * exact class of signal the database-name fix above was for.
 *
 * So: check, start, wait, and if it still refuses say so in a sentence
 * that names the command, rather than letting a connection error stand
 * in for a verdict on somebody's change.
 */
function ensurePostgres() {
  const up = () => { try { execSync('pg_isready -h localhost -p 5432', { stdio: 'pipe' }); return true } catch { return false } }
  if (up()) return
  for (const cmd of ['pg_ctlcluster 16 main start', 'service postgresql start', 'sudo service postgresql start']) {
    try { execSync(cmd, { stdio: 'pipe' }) } catch { /* try the next form */ }
    for (let i = 0; i < 10 && !up(); i++) execSync('sleep 1')
    if (up()) return
  }
  throw new Error(
    'Postgres is not running on localhost:5432, and could not be started. ' +
      'This is the server, not the change under test — start it with ' +
      '`pg_ctlcluster 16 main start` (or `service postgresql start`) and run again.'
  )
}

/** A clean database, once, before the story starts. */
export async function resetDatabase() {
  ensurePostgres()
  execSync(
    `psql -h localhost -U postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};" ` +
      `-c "CREATE DATABASE ${TEST_DB};"`,
    { stdio: 'pipe' }
  )
  // Best-effort, and deliberately not fatal.
  //
  // CLAUDE.md names pgvector in the stack and the schema has not adopted
  // it yet — there is no vector column anywhere in schema.prisma. This
  // line was hard-failing every integration run on any machine without
  // the extension installed, which meant the suite could not be run at
  // all rather than running without embeddings. When a vector column
  // does arrive, this goes back to being required and the failure
  // becomes correct again.
  try {
    execSync(`psql -h localhost -U postgres -d ${TEST_DB} -c "CREATE EXTENSION IF NOT EXISTS vector;"`, {
      stdio: 'pipe',
    })
  } catch {
    // No pgvector here. Nothing in the schema needs it.
  }
  // --accept-data-loss: the database was dropped and recreated two lines
  // above, so there is no data to lose. Without it, a push onto a
  // database another run has just touched dies on a warning rather than
  // on a fault, which reads as a failure of the change under test.
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  })
}

export { prisma }

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

/** A clean database, once, before the story starts. */
export async function resetDatabase() {
  execSync(
    'psql -h localhost -U postgres -c "DROP DATABASE IF EXISTS etyme_test;" ' +
      '-c "CREATE DATABASE etyme_test;"',
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
    execSync('psql -h localhost -U postgres -d etyme_test -c "CREATE EXTENSION IF NOT EXISTS vector;"', {
      stdio: 'pipe',
    })
  } catch {
    // No pgvector here. Nothing in the schema needs it.
  }
  execSync('npx prisma db push --skip-generate', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: 'postgresql://postgres@localhost:5432/etyme_test' },
  })
}

export { prisma }

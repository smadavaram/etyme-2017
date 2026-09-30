/**
 * The two template databases every test file is copied from.
 *
 * - **empty**: the schema pushed, nothing written. `resetDatabase()`
 *   copies it.
 * - **world**: the empty template with the whole demo world seeded on
 *   top. `freshWorld()` copies it.
 *
 * Each name carries a hash of what decides its contents, so an unchanged
 * schema and seed reuse the template an earlier run built, and a change
 * to either builds a new one. The world's name also carries the UTC day,
 * because a seeded world counts every date from the day it was born
 * (`lib/seed-days`) and the tests read those dates against today: a
 * world born yesterday is a different world.
 */
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { copyDatabase, databaseExists, databasesLike, dropDatabase, psql, urlFor } from './postgres'

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')

export const TEMPLATE_PREFIX = 'etyme_tpl_'

/** Resolve one import specifier to a file under src/, or null for a package. */
function resolveImport(spec: string, from: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec)
  else return null
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (existsSync(candidate) && !candidate.endsWith('/') && /\.(ts|tsx|json)$/.test(candidate)) return candidate
  }
  return null
}

const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g

/**
 * Every source file the seed can reach, followed through imports.
 *
 * Conservative on purpose: anything the seed imports can decide what it
 * writes (a role list, a cycle pack, a default document set), so all of
 * it is hashed rather than a hand-kept list of "seed files" that would
 * miss the one that mattered.
 */
function closure(entries: string[]): string[] {
  const seen = new Set<string>()
  const queue = [...entries]
  while (queue.length) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(IMPORT)) {
      const hit = resolveImport(m[1] ?? m[2] ?? m[3], file)
      if (hit && !seen.has(hit)) queue.push(hit)
    }
  }
  return [...seen].sort()
}

function hashFiles(files: string[]): string {
  const h = createHash('sha256')
  for (const f of files) {
    h.update(path.relative(ROOT, f))
    h.update('\0')
    h.update(readFileSync(f))
    h.update('\0')
  }
  return h.digest('hex')
}

/** The UTC day a world seeded now would be born on. */
export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '')
}

export interface TemplatePlan {
  empty: string
  world: string
  /** What the world's hash was computed over, for the log line. */
  worldFiles: number
}

export function planTemplates(now = new Date()): TemplatePlan {
  const schema = path.join(ROOT, 'prisma', 'schema.prisma')
  const harness = [path.join(__dirname, 'templates.ts'), path.join(__dirname, 'postgres.ts')]
  const emptyHash = hashFiles([schema, ...harness]).slice(0, 12)

  const libDir = path.join(SRC, 'lib')
  const seedEntries = readdirSync(libDir)
    .filter((f) => /^(seed-.*|demo-seed.*|seed-world|seed-days)\.ts$/.test(f))
    .map((f) => path.join(libDir, f))
  const files = closure(seedEntries)
  const worldHash = createHash('sha256').update(emptyHash).update(hashFiles(files)).digest('hex').slice(0, 12)

  return {
    empty: `${TEMPLATE_PREFIX}empty_${emptyHash}`,
    world: `${TEMPLATE_PREFIX}world_${utcDay(now)}_${worldHash}`,
    worldFiles: files.length,
  }
}

/** A template may not be connected to while it is copied; this makes a stray connection impossible. */
function seal(name: string): void {
  psql(`ALTER DATABASE "${name}" WITH IS_TEMPLATE true ALLOW_CONNECTIONS false`)
}

/** Move a finished build into place. False if another run got there first. */
function promote(building: string, final: string): boolean {
  try {
    psql(`ALTER DATABASE "${building}" RENAME TO "${final}"`)
    seal(final)
    return true
  } catch (e) {
    if (!databaseExists(final)) throw e
    dropDatabase(building)
    return false
  }
}

function buildName(final: string): string {
  // Postgres names stop at 63 bytes; the pid keeps two runs' builds apart.
  return `${final.slice(0, 50)}_b${process.pid}`
}

export function buildEmptyTemplate(name: string): void {
  if (databaseExists(name)) return
  const building = buildName(name)
  dropDatabase(building)
  psql(`CREATE DATABASE "${building}"`)
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
    psql('CREATE EXTENSION IF NOT EXISTS vector', building)
  } catch {
    // No pgvector here. Nothing in the schema needs it.
  }
  // --accept-data-loss: the database was created a line above, so there
  // is no data to lose.
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    stdio: 'pipe',
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: urlFor(building) },
  })
  promote(building, name)
}

/**
 * Seed the world into a copy of the empty template and seal it.
 *
 * `seed` runs with DATABASE_URL pointing at the build and must leave no
 * connection open behind it — a database with a session attached cannot
 * be renamed or copied.
 */
export async function buildWorldTemplate(name: string, empty: string, seed: (url: string) => Promise<void>): Promise<void> {
  if (databaseExists(name)) return
  const building = buildName(name)
  copyDatabase(empty, building)
  await seed(urlFor(building))
  // Any session the seed left behind would block the rename.
  psql(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${building}' AND pid <> pg_backend_pid()`)
  promote(building, name)
}

/**
 * Templates nobody will copy again: a world born on an earlier day, a
 * schema that has since changed, and builds whose run died half way.
 * Best-effort — a drop that fails because somebody is still copying is
 * left for the next run.
 */
export function sweepTemplates(keep: TemplatePlan): string[] {
  const dropped: string[] = []
  const today = utcDay()
  for (const db of databasesLike(TEMPLATE_PREFIX)) {
    if (db === keep.empty || db === keep.world) continue
    const build = /_b(\d+)$/.exec(db)
    let stale = false
    if (build) {
      const pid = Number(build[1])
      try { process.kill(pid, 0) } catch { stale = true }
    } else if (db.startsWith(`${TEMPLATE_PREFIX}world_`)) {
      // Same-day worlds from a different seed may belong to a run still
      // going in another tree; only yesterday's are certainly dead.
      stale = !db.startsWith(`${TEMPLATE_PREFIX}world_${today}_`)
    } else if (db.startsWith(`${TEMPLATE_PREFIX}empty_`)) {
      stale = true
    }
    if (!stale) continue
    try {
      dropDatabase(db)
      dropped.push(db)
    } catch {
      // In use; the next run will try again.
    }
  }
  return dropped
}

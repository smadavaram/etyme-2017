/**
 * Once per run, before any test file: make sure both templates exist.
 *
 * The world is seeded here, once, instead of once per file. Each file
 * then gets a private file-level copy (`freshWorld()` in harness.ts),
 * which takes about a second where seeding took most of a minute.
 *
 * Set ETYME_REBUILD_TEMPLATES=1 to throw the cached templates away and
 * build both again.
 */
import type { GlobalSetupContext } from 'vitest/node'
import { ensurePostgres, dropDatabase, databaseExists, databasesLike } from './postgres'
import { RUN_DB_PREFIX, RUN_DATABASES, staleRunDatabases, processAlive } from './database'
import { buildEmptyTemplate, buildWorldTemplate, planTemplates, sweepTemplates } from './templates'

declare module 'vitest' {
  export interface ProvidedContext {
    emptyTemplate: string
    worldTemplate: string
  }
}

const log = (line: string) => console.log(`[integration] ${line}`)

export default async function setup({ provide }: GlobalSetupContext) {
  ensurePostgres()
  const plan = planTemplates()

  if (process.env.ETYME_REBUILD_TEMPLATES) {
    for (const db of [plan.world, plan.empty]) if (databaseExists(db)) dropDatabase(db)
  }

  const dropped = sweepTemplates(plan)
  if (dropped.length) log(`dropped ${dropped.length} stale template(s): ${dropped.join(', ')}`)

  // Databases left by a run whose process is gone (killed before its own
  // teardown). A run still going is never touched: its pid is alive.
  const leftOver = staleRunDatabases(databasesLike(RUN_DB_PREFIX), processAlive, RUN_DATABASES)
  for (const db of leftOver) {
    try { dropDatabase(db) } catch { /* another run's sweep got there first */ }
  }
  if (leftOver.length) log(`dropped ${leftOver.length} database(s) left by runs that ended: ${leftOver.join(', ')}`)
  if (RUN_DATABASES) log(`this run's databases: ${RUN_DATABASES}w<n>`)

  const t0 = Date.now()
  if (databaseExists(plan.empty)) {
    log(`empty template ${plan.empty} reused`)
  } else {
    log(
      `building empty template ${plan.empty} — ` +
        (process.env.ETYME_REBUILD_TEMPLATES ? 'a rebuild was asked for' : 'prisma/schema.prisma changed or none was built yet')
    )
    buildEmptyTemplate(plan.empty)
  }

  if (databaseExists(plan.world)) {
    log(`world template ${plan.world} reused`)
  } else {
    log(
      `building world template ${plan.world} — ` +
        (process.env.ETYME_REBUILD_TEMPLATES
          ? 'a rebuild was asked for'
          : `the day, the schema or one of the ${plan.worldFiles} files the seed reaches changed since the last build`)
    )
    await buildWorldTemplate(plan.world, plan.empty, async (url) => {
      // The same environment every test file runs under (setup.ts), so
      // the seed sees what it would have seen when each file seeded.
      process.env.DATABASE_URL = url
      ;(process.env as Record<string, string>).NODE_ENV = 'development'
      process.env.NEXTAUTH_SECRET = 'integration-test-secret'
      process.env.NEXTAUTH_URL = 'http://localhost:3000'
      process.env.PRISMA_QUIET = '1'
      const { prisma } = await import('@/lib/db')
      const { seedWorld } = await import('@/lib/seed-world')
      try {
        await seedWorld()
      } finally {
        await prisma.$disconnect()
      }
    })
  }
  log(`templates ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  provide('emptyTemplate', plan.empty)
  provide('worldTemplate', plan.world)

  // The run's own databases go with it.
  return () => {
    if (!RUN_DATABASES) return
    for (const db of databasesLike(RUN_DATABASES)) {
      try { dropDatabase(db) } catch { /* left for the next run's sweep */ }
    }
  }
}

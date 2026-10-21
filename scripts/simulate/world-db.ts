/**
 * A fresh copy of the seeded world for one run.
 *
 * The integration suite's own templates (`__integration__/templates.ts`):
 * today's world template for this tree is copied to `etyme_sim_<stamp>`
 * in about a second. Where today's template has not been built yet, it is
 * built here exactly as the suite builds it — the empty schema, then the
 * whole world seeded on top — so a run and a test file start from the
 * same world.
 *
 * And a reader. Stages may read the world to know what a person at a
 * seat would know; they may never write a row. So the run's reads go
 * through a database role that can select and nothing else, with every
 * transaction read-only, and the database refuses a write rather than a
 * comment asking nobody to make one.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { copyDatabase, databaseExists, dropDatabase, ensurePostgres, psql, urlFor, PG_HOST, PG_PORT } from '../../__integration__/postgres'
import { buildEmptyTemplate, buildScaleTemplate, buildWorldTemplate, planScaleTemplate, planTemplates } from '../../__integration__/templates'

export const SIM_PREFIX = 'etyme_sim_'
export const READER_ROLE = 'etyme_sim_reader'

export interface SimDatabase {
  name: string
  url: string
  /** The same database as the read-only role. */
  readerUrl: string
  template: string
  /** True where the template was built by this run rather than reused. */
  builtTemplate: boolean
}

async function seedInto(url: string): Promise<void> {
  // The environment the suite seeds under (global-setup.ts), restored after.
  const saved = { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: process.env.NODE_ENV, PRISMA_QUIET: process.env.PRISMA_QUIET }
  process.env.DATABASE_URL = url
  ;(process.env as Record<string, string>).NODE_ENV = 'development'
  process.env.PRISMA_QUIET = '1'
  const { prisma } = await import('@/lib/db')
  const { seedWorld } = await import('@/lib/seed-world')
  try {
    await seedWorld()
  } finally {
    await prisma.$disconnect()
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete (process.env as Record<string, string | undefined>)[k]
      else (process.env as Record<string, string>)[k] = v
    }
  }
}

/**
 * The generated world on top of a copy of the base world (lib/seed-scale),
 * in a process of its own: the database client is made once per process
 * with the first URL it is given, and this run may already have seeded
 * the base world through it.
 */
async function seedScaleInto(url: string): Promise<void> {
  execFileSync('npx', ['vite-node', '--config', 'vitest.config.ts', 'scripts/simulate/seed-scale-into.ts'], {
    cwd: path.resolve(__dirname, '..', '..'),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'development', PRISMA_QUIET: '1' },
  })
}

function ensureReader(db: string): void {
  if (psql(`SELECT 1 FROM pg_roles WHERE rolname = '${READER_ROLE}'`).trim() !== '1') {
    try {
      psql(`CREATE ROLE ${READER_ROLE} LOGIN`)
    } catch {
      // Another run made it a moment ago.
    }
  }
  psql([
    `GRANT pg_read_all_data TO ${READER_ROLE}`,
    `ALTER ROLE ${READER_ROLE} IN DATABASE "${db}" SET default_transaction_read_only = on`,
  ])
}

export async function prepareWorld(
  stamp: string,
  log: (line: string) => void,
  template?: string,
  opts: { scale?: boolean } = {},
): Promise<SimDatabase> {
  ensurePostgres()
  let world = template
  let builtTemplate = false
  if (!world) {
    const plan = planTemplates()
    world = plan.world
    if (!databaseExists(plan.world)) {
      builtTemplate = true
      if (!databaseExists(plan.empty)) {
        log(`building the empty schema template ${plan.empty}`)
        buildEmptyTemplate(plan.empty)
      }
      log(`seeding today's world template ${plan.world} (about a minute; reused by every later run today)`)
      await buildWorldTemplate(plan.world, plan.empty, seedInto)
    }
    // The generated world, built in the same call and on the same day as
    // the base world it copies (CLAUDE.md, "Nine decisions for the
    // generated world"), and copied instead of it.
    if (opts.scale) {
      const scale = planScaleTemplate(plan)
      if (!databaseExists(scale.name)) {
        builtTemplate = true
        log(`seeding the generated world at the founder's scale into ${scale.name} (reused by every later --scale run today)`)
        await buildScaleTemplate(scale.name, plan.world, seedScaleInto)
      }
      world = scale.name
    }
  } else if (!databaseExists(world)) {
    throw new Error(`There is no template database called ${world}.`)
  }
  const name = `${SIM_PREFIX}${stamp}`
  copyDatabase(world, name)
  ensureReader(name)
  return {
    name,
    url: urlFor(name),
    readerUrl: `postgresql://${READER_ROLE}@${PG_HOST}:${PG_PORT}/${name}`,
    template: world,
    builtTemplate,
  }
}

export function dropWorld(name: string): void {
  if (!name.startsWith(SIM_PREFIX)) throw new Error(`${name} is not a simulation database, so it is not dropped.`)
  dropDatabase(name)
}

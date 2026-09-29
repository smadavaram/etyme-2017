import { describe, it, expect, afterAll } from 'vitest'
import { resetDatabase, prisma } from './harness'
import { seedWorld, seedWorldInSteps, worldStepNames } from '@/lib/seed-world'

/**
 * The demo world seeds in steps, so a deployment with a time limit can
 * finish it.
 *
 * On 2026-09-29 production timed out at sixty seconds on every call of
 * `POST /api/seed-world` after a rebuild: each call walked the whole
 * world from the top and was cut off before reaching what was missing.
 * The seed is now a list of named steps (lib/seed-steps); each call runs
 * the ones not yet finished until its budget is spent and says what is
 * left, so repeating the call converges.
 */

/** The tables a world is made of. Not every table: see rebuild-demo on why the books can differ by an entry. */
const SHAPE = [
  'Company', 'Person', 'Context', 'Role', 'SellContract', 'BuyContract', 'WorkOrder', 'Requirement',
  'Submission', 'Interview', 'Timesheet', 'WorkAssertion', 'Invoice', 'VendorBill', 'Payment',
  'ConsultantProfile', 'BenchListing', 'Verification', 'Holiday', 'DocumentRequirement', 'RateHistory',
  'HeadcountPlan', 'CostCenter', 'Counterparty', 'Cycle',
]

async function shape(): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const m of SHAPE) {
    const [r] = (await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${m}"`)) as { n: number }[]
    out[m] = r.n
  }
  return out
}

/**
 * Every row's current version, summed per table. Postgres gives a row a
 * new `xmin` whenever it is written, even with the same values, so an
 * unchanged sum means nothing in the table was rewritten.
 */
async function versions(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const m of [...SHAPE, 'AutomationLog']) {
    const [r] = (await prisma.$queryRawUnsafe(
      `SELECT coalesce(sum(xmin::text::bigint), 0)::text AS v, count(*)::int AS n FROM "${m}"`
    )) as { v: string; n: number }[]
    out[m] = `${r.n}:${r.v}`
  }
  return out
}

/** Call the stepped seed until it says done, with a budget so small each call runs one step. */
async function inSteps(budgetMs = 1): Promise<{ calls: number; ran: string[][] }> {
  const ran: string[][] = []
  for (let calls = 1; calls <= 200; calls++) {
    const r = await seedWorldInSteps({ budgetMs })
    ran.push(r.ran)
    if (r.done) return { calls, ran }
    expect(r.ran.length, 'every call makes progress').toBeGreaterThan(0)
  }
  throw new Error('The stepped seed did not finish in two hundred calls.')
}

/**
 * An empty database, without dropping it: the harness's reset drops the
 * database, which cannot happen while this file's connection is open.
 */
async function empty(): Promise<void> {
  const tables = (await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  )) as { tablename: string }[]
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`)
}

afterAll(() => {
  delete process.env.ETYME_SEED_VERSION
})

describe('seeding the demo world in steps', () => {
  let whole: Record<string, number>

  it('the full seed runs every step, in the order the step list names them', async () => {
    await resetDatabase()
    const r = await seedWorld()
    expect(r.steps.ran).toEqual(worldStepNames())
    expect(r.steps.pending).toEqual([])
    whole = await shape()
  }, 900_000)

  it('seeding in steps from empty ends with the same world as seeding in one call', async () => {
    await empty()
    const { calls, ran } = await inSteps()
    // One step a call, and every step exactly once.
    expect(ran.flat()).toEqual(worldStepNames())
    expect(calls).toBe(worldStepNames().length)
    expect(await shape()).toEqual(whole)
  }, 900_000)

  it('a step that already finished is skipped without rewriting anything', async () => {
    const before = await versions()
    const r = await seedWorldInSteps({ budgetMs: 60_000 })
    expect(r).toMatchObject({ done: true, ran: [], skipped: worldStepNames().length, next: null, remaining: 0 })
    expect(await versions()).toEqual(before)
  }, 900_000)

  it('finishes a world left part-seeded with no markers, the way production was left, and ends with the same world', async () => {
    await empty()
    // Part of the world, seeded as the old route did: some steps done and
    // nothing to say which.
    for (let i = 0; i < 12; i++) await seedWorldInSteps({ budgetMs: 1 })
    await prisma.automationLog.deleteMany({ where: { action: 'DEMO_SEED_STEP' } })

    const { ran } = await inSteps(60_000)
    expect(ran.flat()).toEqual(worldStepNames())
    expect(await shape()).toEqual(whole)
  }, 900_000)

  it('resumes after the steps already finished, and never runs one twice', async () => {
    await empty()
    const first = await seedWorldInSteps({ budgetMs: 1 })
    const second = await seedWorldInSteps({ budgetMs: 1 })
    expect(first.ran).toEqual([worldStepNames()[0]])
    expect(second.ran).toEqual([worldStepNames()[1]])
    expect(second.skipped).toBe(1)
    expect(second.next).toBe(worldStepNames()[2])
  }, 900_000)

  it('a new deployment walks every step again, because it may seed more than the last one did', async () => {
    await inSteps(60_000)
    process.env.ETYME_SEED_VERSION = 'next-deploy'
    const r = await seedWorldInSteps({ budgetMs: 1 })
    expect(r.done).toBe(false)
    expect(r.skipped).toBe(0)
    expect(r.ran).toEqual([worldStepNames()[0]])
  }, 900_000)
})

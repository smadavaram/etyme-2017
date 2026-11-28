import { describe, it, expect, vi, afterAll } from 'vitest'

/**
 * Every step of the demo world fits one function call against a distant
 * database.
 *
 * A call on production keeps starting steps for thirty seconds and holds
 * the other thirty back for the step still running (`seedBudgetMs` in
 * lib/seed-steps), so every step has to finish inside thirty seconds on
 * its own. What a step costs there is its query count times what one
 * query takes a database in another building, and on 2026-09-29
 * production showed that at up to about 46 ms, counted the way this file
 * counts: a step of 1,307 queries finished inside one sixty-second call,
 * and the books, at 1,728 queries for the world plus every posting
 * outside it, timed out six calls running. Three hundred and fifty
 * queries is sixteen seconds at that rate — well inside the thirty, with
 * a cold start to spare. Timed through a local proxy adding 40 ms to
 * every round trip, which makes a query slower than production has ever
 * shown, the slowest step took seventeen seconds.
 *
 * Counted here, per call, the way production pays for it — the markers,
 * the calendar and the firm maps every call reads first included. A step
 * that grows past the line is cut into shares on the commit that grew it.
 */

const counter = vi.hoisted(() => ({ asked: 0 }))

vi.mock('@/lib/db', async () => {
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] })
  prisma.$on('query', () => {
    counter.asked++
  })
  return { prisma }
})

import { resetDatabase } from './harness'
import { seedWorldInSteps, worldStepNames } from '@/lib/seed-world'

/** The most queries one step may make: about sixteen seconds at the slowest production has shown. */
const LINE = 350

/** Seed one step per call until done, and what each call asked the database. */
async function stepSizes(): Promise<{ step: string; asked: number }[]> {
  const sizes: { step: string; asked: number }[] = []
  for (let call = 0; call < 200; call++) {
    const before = counter.asked
    const r = await seedWorldInSteps({ budgetMs: 1 })
    sizes.push({ step: r.ran.join(', ') || '(nothing left)', asked: counter.asked - before })
    if (r.done) return sizes
  }
  throw new Error('The stepped seed did not finish in two hundred calls.')
}

const over = (sizes: { step: string; asked: number }[]) =>
  sizes.filter((s) => s.asked > LINE).map((s) => `${s.step}: ${s.asked} queries`)

afterAll(() => {
  delete process.env.ETYME_SEED_VERSION
})

describe('every step of the demo world fits one function call', () => {
  it('counts something: the counter sees the queries the seed makes', async () => {
    await resetDatabase()
    const before = counter.asked
    await seedWorldInSteps({ budgetMs: 1 })
    expect(counter.asked - before).toBeGreaterThan(0)
  }, 900_000)

  it('no step of a fresh world asks the database more than three hundred and fifty questions', async () => {
    const sizes = await stepSizes()
    // Every step after the first ran here, one per call.
    expect(sizes.length).toBe(worldStepNames().length - 1)
    expect(
      over(sizes),
      `These steps would not finish in thirty seconds against production's database. Cut them into shares.`
    ).toEqual([])
  }, 900_000)

  it('walking the world again after a new deployment keeps every step under the same line', async () => {
    process.env.ETYME_SEED_VERSION = 'the-next-deploy'
    const sizes = await stepSizes()
    expect(sizes.length).toBe(worldStepNames().length)
    expect(
      over(sizes),
      `These steps would not finish in thirty seconds against production's database. Cut them into shares.`
    ).toEqual([])
  }, 900_000)
})

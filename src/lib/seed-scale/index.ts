/**
 * The generated world at the founder's scale, as steps.
 *
 * The same machinery as the base world (`lib/seed-steps`): every step
 * leaves a marker keyed on this world and the code's version, a call runs
 * the steps not yet marked until its time is up, and repeating the call
 * converges. Each step reads what exists once per table and writes only
 * what is missing, so a step re-walked after a deploy is a cheap no-op.
 *
 * It runs after the base world, in the same database, and counts its
 * dates from the base world's birthday (`worldAnchor`). It is built into a
 * sealed template of its own (`planScaleTemplate` in
 * __integration__/templates.ts), never into the base template that every
 * integration file copies.
 *
 * The frame's steps first, then the people (supply), the papers
 * (regulatory), the jobs (demand), the rates (money), and the papers'
 * asks on the orders the rates wrote (regulatory).
 *
 * This is the one file `planScaleTemplate` hashes; everything it imports
 * is in that hash.
 */

import { anchorSeed } from '@/lib/seed-days'
import { primeCalendar } from '@/lib/seed-calendar'
import { finishedSteps, recordStep, seedVersion } from '@/lib/seed-steps'
import { worldAnchor } from '@/lib/seed-world'
import { buildFrame, frameSteps, type FrameStep } from './frame'
import { buildPeople, peopleAfterJobsSteps, peopleSteps } from './people'
import { jobSteps } from './jobs'
import { paperAfterRatesSteps, paperSteps } from './papers'
import { seedRates } from './rates/rows'
import { SCALE_VERSION, type PersonFacts, type ScaleFrame } from './types'

/**
 * Money's rows in shares: its first full run is about 215 queries, so four
 * keep every step well under the 350 a step may ask.
 */
export const RATE_SHARES = 4

/**
 * Every step of the generated world, in order: the frame; the people
 * (supply); the papers (regulatory): each person's and each supplier's;
 * the jobs (demand), which put the people forward; the lines pointed at
 * the jobs they filled (supply); the rates (money), which price the lines
 * the people's careers wrote and write the orders; and what each order
 * asks for on paper (regulatory), which needs those orders.
 */
function allSteps(frame: ScaleFrame): FrameStep[] {
  let people: PersonFacts[] | null = null
  const theirs = () => (people ??= buildPeople(frame))
  return [
    ...frameSteps(),
    ...peopleSteps(frame),
    ...paperSteps(frame, theirs),
    ...jobSteps(theirs),
    // Every career line points at the filled job it came from (supply):
    // after the jobs exist, before the rates price the lines.
    ...peopleAfterJobsSteps(),
    ...Array.from({ length: RATE_SHARES }, (_, index): FrameStep => ({
      name: `scale:rates:${index + 1}-of-${RATE_SHARES}`, run: (f) => seedRates(f, { index, of: RATE_SHARES }),
    })),
    ...paperAfterRatesSteps(theirs),
  ]
}

/** The names of every step, in the order they run. Reads the base world's birthday, as the steps do. */
export async function scaleStepNames(): Promise<string[]> {
  return allSteps(await frameNow()).map((s) => s.name)
}

/** The version a generated step's marker carries: the deploy's, and this world's own. */
export function scaleVersion(): string {
  return `${seedVersion()}/scale-${SCALE_VERSION}`
}

/** The frame, with the clock set from the base world's birthday. */
async function frameNow(): Promise<ScaleFrame> {
  const born = await worldAnchor()
  if (!born) throw new Error('The generated world is built on the base world, and there is no base world here yet. Seed it first.')
  anchorSeed(born.createdAt)
  primeCalendar()
  return buildFrame()
}

export interface ScaleRun {
  done: boolean
  ran: string[]
  skipped: number
  next: string | null
  remaining: number
  version: string
}

/**
 * Run the steps not yet marked, until `deadline` (ms since the epoch).
 * A step the deadline cuts off is not marked and runs first next time.
 */
export async function seedScaleInSteps(opts: { budgetMs?: number } = {}): Promise<ScaleRun> {
  const started = Date.now()
  const deadline = opts.budgetMs != null ? started + opts.budgetMs : Number.POSITIVE_INFINITY
  const frame = await frameNow()
  const world = frame.firms[0].id
  const version = scaleVersion()
  const skip = await finishedSteps(world, version)
  const steps = allSteps(frame)
  const ran: string[] = []
  let skipped = 0
  for (const s of steps) {
    if (skip.has(s.name)) { skipped++; continue }
    if (Date.now() >= deadline) break
    await s.run(frame)
    await recordStep(s.name, world, version)
    ran.push(s.name)
  }
  const pending = steps.filter((s) => !skip.has(s.name) && !ran.includes(s.name))
  return { done: pending.length === 0, ran, skipped, next: pending[0]?.name ?? null, remaining: pending.length, version }
}

/** The whole generated world in one call: what the template build and the test run. */
export async function seedScaleWorld(): Promise<ScaleRun> {
  return seedScaleInSteps()
}

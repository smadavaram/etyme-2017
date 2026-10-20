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
 * The frame's steps are here today. The four domains' steps join after
 * them as each folder lands: people (supply), papers (regulatory), jobs
 * (demand) and rates (money), in that order, because papers read the
 * people and the jobs read the rates' bands.
 *
 * This is the one file `planScaleTemplate` hashes; everything it imports
 * is in that hash.
 */

import { anchorSeed } from '@/lib/seed-days'
import { primeCalendar } from '@/lib/seed-calendar'
import { finishedSteps, recordStep, seedVersion } from '@/lib/seed-steps'
import { worldAnchor } from '@/lib/seed-world'
import { buildFrame, frameSteps, type FrameStep } from './frame'
import { SCALE_VERSION, type ScaleFrame } from './types'

/** Every step of the generated world, in order. */
function allSteps(): FrameStep[] {
  return [...frameSteps()]
}

/** The names of every step, in the order they run. */
export function scaleStepNames(): string[] {
  return allSteps().map((s) => s.name)
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
  const steps = allSteps()
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

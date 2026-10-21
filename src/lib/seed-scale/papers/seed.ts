/**
 * The generated world's papers, written in steps.
 *
 * Every row's id is decided by `planPapers` before anything is written,
 * so each step reads what exists once per table and writes only what is
 * missing, in batches of at most `BATCH_ROWS` (kit `writeMissing`). A
 * second seeding finds every row and writes nothing.
 *
 * The steps, and where each runs:
 *
 *   after the people (supply), before the jobs (`paperSteps`):
 *     scale:papers:people     each person's I-9 and the document behind it, right-to-work,
 *                             the screening companies' verdicts, licenses
 *     scale:papers:visas      each H-1B person's petition, its trail and its papers
 *     scale:papers:overtime   the employer's position on overtime, per live W2 line
 *     scale:papers:cover      every supplier's cover and good standing
 *
 *   after the rates (money), which write the orders (`paperAfterRatesSteps`):
 *     scale:papers:asks       what each generated order asks for on paper, and the
 *                             few lines where the client waived the background check
 */

import { prisma as db } from '@/lib/db'
import { writeMissing } from '../kit'
import { SCALE_SLUG_PREFIX, type PersonFacts, type ScaleFrame, type Share } from '../types'
import type { FrameStep } from '../frame'
import { asksFor, planPapers, waiversFor } from './plan'

type People = () => readonly PersonFacts[]

/** The papers' steps that run after the people and before the jobs. */
export function paperSteps(_frame?: ScaleFrame, people?: People): FrameStep[] {
  const facts = (f: ScaleFrame) => planPapers(f, people?.())
  return [
    { name: 'scale:papers:people', run: (f) => seedPersonPapers(f, facts(f)) },
    { name: 'scale:papers:visas', run: (f) => seedVisas(facts(f)) },
    { name: 'scale:papers:overtime', run: (f) => seedOvertime(facts(f)) },
    { name: 'scale:papers:cover', run: (f) => seedCover(facts(f)) },
  ]
}

/** The papers' step that runs after the rates: the orders it asks on are money's, written there. */
export function paperAfterRatesSteps(people?: People): FrameStep[] {
  return [{ name: 'scale:papers:asks', run: (f) => seedAsks(f, planPapers(f, people?.())) }]
}

/** The names of every papers step, in the order they run. */
export function paperStepNames(): string[] {
  return [...paperSteps(), ...paperAfterRatesSteps()].map((s) => s.name)
}

/** Every paper, in one call, or one share of the steps. Idempotent. Run after the rates, so the asks have their orders. */
export async function seedPapers(frame: ScaleFrame, people: PersonFacts[], share?: Share): Promise<void> {
  const steps = [...paperSteps(frame, () => people), ...paperAfterRatesSteps(() => people)]
  const mine = share ? steps.filter((_, i) => i % share.of === share.index) : steps
  for (const s of mine) await s.run(frame)
}

type Plan = ReturnType<typeof planPapers>

async function seedPersonPapers(_frame: ScaleFrame, plan: Plan): Promise<void> {
  // The documents an I-9 was completed from first, then the forms, then the backing between them.
  await writeMissing(db.verification, [...plan.evidence, ...plan.person])
  await writeMissing(db.documentBacking, plan.backings)
}

async function seedVisas(plan: Plan): Promise<void> {
  await writeMissing(db.visaPetition, plan.petitions)
  await writeMissing(db.visaEvent, plan.visaEvents)
  await writeMissing(db.visaDocument, plan.visaDocuments)
}

async function seedOvertime(plan: Plan): Promise<void> {
  await writeMissing(db.exemptAssertion, plan.exempt)
}

async function seedCover(plan: Plan): Promise<void> {
  await writeMissing(db.verification, plan.cover)
}

/**
 * What each generated order asks for, read off the orders money wrote:
 * one read for the orders, one for the lines that waive, then only the
 * rows that are missing.
 */
async function seedAsks(frame: ScaleFrame, plan: Plan): Promise<void> {
  const orders = await db.workOrder.findMany({
    where: { issuedBy: { slug: { startsWith: SCALE_SLUG_PREFIX } } },
    select: { id: true, issuedById: true, startDate: true },
    orderBy: { id: 'asc' },
  })
  await writeMissing(db.documentRequirement, asksFor(orders, frame))
  const lines = await db.sellContract.findMany({
    where: { id: { in: plan.waived.map((w) => w.sellId) } },
    select: { id: true, workOrderId: true },
  })
  await writeMissing(
    db.documentRequirement,
    waiversFor(plan, new Set(orders.map((o) => o.id)), new Map(lines.map((l) => [l.id, l.workOrderId]))),
  )
}

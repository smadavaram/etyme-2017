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
 *                             the screening companies' verdicts and the firm's steps after
 *                             a flagged one, licenses
 *     scale:papers:visas      each H-1B person's petition, its trail and its papers
 *     scale:papers:overtime   the employer's position on overtime, per live W2 line
 *     scale:papers:cover      every supplier's cover and good standing
 *
 *   after the rates (money), which write the orders (`paperAfterRatesSteps`):
 *     scale:papers:asks       what each generated order asks for on paper, and the
 *                             few lines where the client waived the background check
 *
 * The world takes a size (2026-11-02), and each step grows with it: at
 * two thousand people each is one step under the name above; past that it
 * is cut into `sharesFor(PAPER_SHARES, size)` shares, named
 * `scale:papers:people:3-of-9`, so every step stays under the queries a
 * step may ask whatever the number of people. A share is a set of people
 * (a set of firms for the cover, of orders for the asks), so a form, the
 * document behind it and the backing between them, or a petition and its
 * trail, are always written in the same step, and nothing is written
 * before the row it points at.
 */

import { prisma as db } from '@/lib/db'
import { shareOf } from '@/lib/seed-steps'
import { writeMissing } from '../kit'
import { sharesFor } from '../index'
import { SCALE_SLUG_PREFIX, scaleSize, type PersonFacts, type ScaleFrame, type ScaleSize, type Share } from '../types'
import type { FrameStep } from '../frame'
import { asksFor, planPapers, waiversFor } from './plan'

type People = () => readonly PersonFacts[]

/**
 * Each papers step is one step at two thousand people (about fourteen
 * queries fresh, the most of the five); `sharesFor` cuts it into more as
 * the world grows, so a share holds about two thousand people's papers
 * whatever the size.
 */
export const PAPER_SHARES = 1

/** One step, or its shares: the bare name where there is one share, so the world everybody has tested keeps its markers. */
function inShares(name: string, of: number, run: (f: ScaleFrame, share: Share) => Promise<void>): FrameStep[] {
  return Array.from({ length: of }, (_, index): FrameStep => ({
    name: of === 1 ? name : `${name}:${index + 1}-of-${of}`,
    run: (f) => run(f, { index, of }),
  }))
}

/** The papers' steps that run after the people and before the jobs, in shares as the world grows. */
export function paperSteps(_frame?: ScaleFrame, people?: People, size: ScaleSize = scaleSize()): FrameStep[] {
  const facts = (f: ScaleFrame) => planPapers(f, people?.())
  const of = sharesFor(PAPER_SHARES, size)
  return [
    ...inShares('scale:papers:people', of, (f, share) => seedPersonPapers(f, facts(f), share)),
    ...inShares('scale:papers:visas', of, (f, share) => seedVisas(facts(f), share)),
    ...inShares('scale:papers:overtime', of, (f, share) => seedOvertime(facts(f), share)),
    ...inShares('scale:papers:cover', of, (f, share) => seedCover(facts(f), share)),
  ]
}

/** The papers' step that runs after the rates: the orders it asks on are money's, written there. In shares as the world grows. */
export function paperAfterRatesSteps(people?: People, size: ScaleSize = scaleSize()): FrameStep[] {
  return inShares('scale:papers:asks', sharesFor(PAPER_SHARES, size), (f, share) => seedAsks(f, planPapers(f, people?.()), share))
}

/** The names of every papers step, in the order they run, at this size. */
export function paperStepNames(size: ScaleSize = scaleSize()): string[] {
  return [...paperSteps(undefined, undefined, size), ...paperAfterRatesSteps(undefined, size)].map((s) => s.name)
}

/** Every paper, in one call, or one share of the steps. Idempotent. Run after the rates, so the asks have their orders. */
export async function seedPapers(frame: ScaleFrame, people: PersonFacts[], share?: Share): Promise<void> {
  const steps = [...paperSteps(frame, () => people), ...paperAfterRatesSteps(() => people)]
  const mine = share ? steps.filter((_, i) => i % share.of === share.index) : steps
  for (const s of mine) await s.run(frame)
}

type Plan = ReturnType<typeof planPapers>

/**
 * Who is in each share: every person the plan writes a paper for, in a
 * fixed order, cut into contiguous shares; and every firm whose cover it
 * records. Read once per plan.
 */
const holders = new WeakMap<Plan, { people: string[]; firms: string[]; formOwner: Map<string, string>; petitionOwner: Map<string, string> }>()
function holdersOf(plan: Plan) {
  const have = holders.get(plan)
  if (have) return have
  const people = new Set<string>()
  for (const r of [...plan.evidence, ...plan.person]) if (r.personId) people.add(r.personId)
  for (const r of plan.petitions) people.add(r.personId)
  for (const r of plan.exempt) people.add(r.personId)
  const out = {
    people: [...people].sort(),
    firms: [...new Set(plan.cover.map((r) => r.companyId!).filter(Boolean))].sort(),
    formOwner: new Map(plan.person.map((r) => [r.id, r.personId!] as const)),
    petitionOwner: new Map(plan.petitions.map((r) => [r.id, r.personId] as const)),
  }
  holders.set(plan, out)
  return out
}

/** The people in this share, as a set; everybody where there is no share. */
function peopleIn(plan: Plan, share?: Share): Set<string> {
  return new Set(shareOf(holdersOf(plan).people, share))
}

async function seedPersonPapers(_frame: ScaleFrame, plan: Plan, share?: Share): Promise<void> {
  const mine = peopleIn(plan, share)
  const { formOwner } = holdersOf(plan)
  const ofMine = (personId: string | null | undefined) => !!personId && mine.has(personId)
  // The documents an I-9 was completed from first, then the forms, then the backing between them.
  await writeMissing(db.verification, [...plan.evidence, ...plan.person].filter((r) => ofMine(r.personId)))
  await writeMissing(db.documentBacking, plan.backings.filter((b) => ofMine(formOwner.get(b.formId))))
  await writeMissing(db.adverseAction, plan.adverse.filter((a) => ofMine(formOwner.get(a.verificationId))))
}

async function seedVisas(plan: Plan, share?: Share): Promise<void> {
  const mine = peopleIn(plan, share)
  const { petitionOwner } = holdersOf(plan)
  const ofMine = (petitionId: string) => mine.has(petitionOwner.get(petitionId) ?? '')
  await writeMissing(db.visaPetition, plan.petitions.filter((p) => mine.has(p.personId)))
  await writeMissing(db.visaEvent, plan.visaEvents.filter((e) => ofMine(e.petitionId)))
  await writeMissing(db.visaDocument, plan.visaDocuments.filter((d) => ofMine(d.petitionId)))
}

async function seedOvertime(plan: Plan, share?: Share): Promise<void> {
  const mine = peopleIn(plan, share)
  await writeMissing(db.exemptAssertion, plan.exempt.filter((e) => mine.has(e.personId)))
}

async function seedCover(plan: Plan, share?: Share): Promise<void> {
  const mine = new Set(shareOf(holdersOf(plan).firms, share))
  await writeMissing(db.verification, plan.cover.filter((r) => mine.has(r.companyId!)))
}

/**
 * What each generated order asks for, read off the orders money wrote:
 * one read for the orders, one for the lines that waive, then only the
 * rows that are missing. A share is a run of the orders; a waiver is
 * written in the share of the order whose row it overrides, so the row it
 * points at is always there first.
 */
async function seedAsks(frame: ScaleFrame, plan: Plan, share?: Share): Promise<void> {
  const all = await db.workOrder.findMany({
    where: { issuedBy: { slug: { startsWith: SCALE_SLUG_PREFIX } } },
    select: { id: true, issuedById: true, startDate: true },
    orderBy: { id: 'asc' },
  })
  const orders = shareOf(all, share)
  await writeMissing(db.documentRequirement, asksFor(orders, frame))
  const lines = plan.waived.length
    ? await db.sellContract.findMany({
        where: { id: { in: plan.waived.map((w) => w.sellId) } },
        select: { id: true, workOrderId: true },
      })
    : []
  await writeMissing(
    db.documentRequirement,
    waiversFor(plan, new Set(orders.map((o) => o.id)), new Map(lines.map((l) => [l.id, l.workOrderId]))),
  )
}

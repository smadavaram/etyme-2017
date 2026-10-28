/**
 * The doors' maps' live figures: the ones the seed computes from the
 * database at seeding, so no seed code can say them.
 *
 * CLAUDE.md, 2026-10-27, on the four doors' maps: "Two figures in them
 * are computed at seeding (Rosa Delgado's weeks to bill, the bill from
 * Nimbus) and the build reads them live, never as literals." So:
 *
 *   - what a selling firm has signed and not billed, and what it bills
 *     this month, read by `firmTuesday` in lib/money/firm-today — the same
 *     read its own Today page and Ask Etyme use, so the door and the demo
 *     behind it can never say two numbers;
 *   - one invoice a bench vendor sent the firm above it, read off the
 *     record by its number (`billFromBelow` in lib/seed-doors wrote it from
 *     the weeks the payer had accepted and nobody had billed).
 *
 * Bounded like the home page's one read (`./corvane-seeded`): a database
 * slower than the wait, an unseeded world, or any failure reads as null,
 * and the map says the figure is on the demo rather than guessing one. A
 * plausible wrong number is worse than a blank.
 *
 * Server only: it reaches the database. Reads only; writes nothing. It
 * reads the seeded demo world by its reserved slugs and nothing else.
 */

import { prisma } from '@/lib/db'
import { firmTuesday, type FirmTuesday } from '@/lib/money/firm-today'
import { BILLS_FROM_BELOW } from './door-map-seed'

/** One week a firm's client signed and the firm has not billed. */
export interface LiveWeek {
  person: string
  client: string
  hours: number
  /** What it bills, cents; null where the generator would leave it off. */
  amountMinor: number | null
}

/** A selling firm's two money figures, in dollars only: null where any row is in another currency or unpriced. */
export interface FirmLive {
  billing: {
    people: number
    totalMinor: number | null
    /** Who bills this month, where, at what rate an hour (cents; null where unpriced or not dollars). */
    lines: { person: string; client: string; rateMinor: number | null }[]
  }
  signed: { count: number; totalMinor: number | null; onDrafts: number; weeks: LiveWeek[] }
}

/** One invoice received from below. */
export interface LiveReceipt {
  number: string
  from: string
  totalMinor: number
  /** Days from today to its due day; negative once it is past. */
  dueInDays: number
}

export interface DoorFacts {
  firm: FirmLive | null
  receipt: LiveReceipt | null
}

/** No live figure: what a door reads where the world is not there, or was late. */
export const NO_FACTS: DoorFacts = { firm: null, receipt: null }

/** The doors with live figures, and whose book and which invoice each reads. */
export const LIVE_READS = {
  integrators: { firm: 'world-teleworld', receipt: BILLS_FROM_BELOW.nimbus },
  suppliers: { firm: 'world-brightmoor', receipt: BILLS_FROM_BELOW.techpeple },
} as const
export type LiveDoor = keyof typeof LIVE_READS

/**
 * The longest a door waits on these. Longer than the home page's
 * 800 ms, because `firmTuesday` dry-runs the bill generator per period;
 * short enough that a stalled database costs a door under two seconds,
 * and the figure reads as "on the demo" rather than holding the page.
 */
export const FACTS_WAIT_MS = 1_500

/** The reads, so a test can hand in its own. */
export interface FactsReader {
  firmBySlug(slug: string): Promise<FirmTuesday | null>
  receipt(payerSlug: string, number: string): Promise<{ totalCents: number; dueAt: Date; vendorName: string } | null>
}

const DAY = 86_400_000

export const DATABASE: FactsReader = {
  async firmBySlug(slug) {
    const c = await prisma.company.findUnique({ where: { slug }, select: { id: true } })
    return c ? firmTuesday(c.id) : null
  },
  async receipt(payerSlug, number) {
    const b = await prisma.vendorBill.findFirst({
      where: { number, company: { slug: payerSlug } },
      select: { totalCents: true, dueAt: true, vendorCompany: { select: { name: true } } },
    })
    return b ? { totalCents: b.totalCents, dueAt: b.dueAt, vendorName: b.vendorCompany.name } : null
  },
}

/** One dollar figure, or null where the total is in another currency, in two, or has an unpriced row. */
function dollarsOf(totals: readonly { currency: string; amountMinor: number | null }[]): number | null {
  if (totals.length === 0) return 0
  if (totals.length > 1 || totals[0].currency !== 'USD') return null
  return totals[0].amountMinor
}

/** The firm's figures in the shape the map draws. Pure, so a test can read it. */
export function firmLive(t: FirmTuesday): FirmLive {
  return {
    billing: {
      people: t.billingThisMonth.people.length,
      totalMinor: dollarsOf(t.billingThisMonth.totals),
      lines: t.billingThisMonth.people.map((x) => ({
        person: x.personName, client: x.atName, rateMinor: x.currency === 'USD' ? x.rateMinor : null,
      })),
    },
    signed: {
      count: t.signedNotBilled.count,
      totalMinor: dollarsOf(t.signedNotBilled.totals),
      onDrafts: t.signedNotBilled.onDrafts,
      weeks: t.signedNotBilled.weeks.map((w) => ({
        person: w.personName, client: w.atName, hours: w.billedHours ?? w.signedHours,
        amountMinor: w.currency === 'USD' ? w.amountMinor : null,
      })),
    },
  }
}

/** A door's live figures, each null where it could not be read in time. */
export async function doorFacts(
  door: LiveDoor,
  read: FactsReader = DATABASE,
  waitMs: number = FACTS_WAIT_MS,
  today: Date = new Date(),
): Promise<DoorFacts> {
  const w = LIVE_READS[door]
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<DoorFacts>((resolve) => { timer = setTimeout(() => resolve(NO_FACTS), waitMs) })
  const settle = <T,>(p: Promise<T>): Promise<T | null> => p.then((x) => x, () => null)
  const both = Promise.all([
    settle(read.firmBySlug(w.firm)),
    settle(read.receipt(`world-${w.receipt.payer}`, w.receipt.number)),
  ]).then(([firm, receipt]): DoorFacts => ({
    firm: firm ? firmLive(firm) : null,
    receipt: receipt
      ? {
          number: w.receipt.number, from: receipt.vendorName, totalMinor: receipt.totalCents,
          dueInDays: Math.round((Date.UTC(receipt.dueAt.getUTCFullYear(), receipt.dueAt.getUTCMonth(), receipt.dueAt.getUTCDate()) -
            Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / DAY),
        }
      : null,
  }), () => NO_FACTS)
  try {
    return await Promise.race([both, late])
  } finally {
    clearTimeout(timer)
  }
}

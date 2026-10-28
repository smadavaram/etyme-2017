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
 *     the weeks the payer had accepted and nobody had billed);
 *   - the invoice receipts in a client's program, for the MSPs' door: the
 *     seed groups each person's signed weeks into one bill per billing
 *     period, so which bills exist and what each totals turns on the day
 *     the world was born. Read off the record with the one three-way check
 *     the AP clerk's own page and the payment route read
 *     (`matchInvoices` and `payGate` in lib/invoice-match), so the door
 *     can never call a receipt clean that the demo would hold.
 *
 * Bounded like the home page's one read (`./corvane-seeded`): a database
 * slower than the wait, an unseeded world, or any failure reads as null,
 * and the map says the figure is on the demo rather than guessing one. A
 * plausible wrong number is worse than a blank.
 *
 * Server only: it reaches the database. Reads only; writes nothing. It
 * reads the seeded demo world by its own slugs, and refuses any company
 * that is not the seed's (`mayReadLive`).
 */

import { prisma } from '@/lib/db'
import { firmTuesday, type FirmTuesday } from '@/lib/money/firm-today'
import { reservedDomain } from '@/lib/demo-company'
import { reservedAddress } from '@/lib/demo-session'
import { matchInvoices, payGate, type MatchWithLines } from '@/lib/invoice-match'
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

/** One invoice receipt in a client's program, as its AP clerk checks it. */
export interface LiveProgramReceipt {
  number: string
  /** The supplier that sent it: the firm whose line it bills. */
  from: string
  /** Everybody it bills for, by name. */
  people: string[]
  hoursBilled: number
  /** What the client signed; null where any line has no signature behind it. */
  hoursSigned: number | null
  /** The rate on every hours line, cents; null where they differ. */
  rateMinor: number | null
  totalMinor: number
  /** Paid; passes the three-way check; or held by it, with the check's own sentence. */
  state: 'PAID' | 'PASSES' | 'HELD'
  why: string | null
}

/** A client's program, read from an MSP's seat in it: its invoice receipts, in dollars. */
export interface ProgramLive {
  receipts: LiveProgramReceipt[]
}

export interface DoorFacts {
  firm: FirmLive | null
  receipt: LiveReceipt | null
  /** The MSPs' door only: the client program its map reads. */
  program?: ProgramLive | null
}

/** No live figure: what a door reads where the world is not there, or was late. */
export const NO_FACTS: DoorFacts = { firm: null, receipt: null }

/** The doors with live figures, and whose book and which invoice each reads. */
export const LIVE_READS = {
  integrators: { firm: 'world-teleworld', receipt: BILLS_FROM_BELOW.nimbus },
  suppliers: { firm: 'world-brightmoor', receipt: BILLS_FROM_BELOW.techpeple },
} as const

/**
 * The MSPs' door reads the program it sits in, never the MSP's own book:
 * Cavanaugh Glassworks', from the seat it granted Aptiva Workforce
 * (`program-office-seat` in lib/seed-world).
 */
export const PROGRAM_READS = {
  'program-offices': { client: 'world-corning' },
} as const

export type LiveDoor = keyof typeof LIVE_READS | keyof typeof PROGRAM_READS

/**
 * The longest a door waits on these. Longer than the home page's
 * 800 ms, because `firmTuesday` dry-runs the bill generator per period;
 * short enough that a stalled database costs a door under two seconds,
 * and the figure reads as "on the demo" rather than holding the page.
 */
export const FACTS_WAIT_MS = 1_500

/** A company as the guard reads it: its slug, its domain, and the address of every seat on it. */
export interface CompanySeen { id: string; slug: string; domain: string | null; seatEmails: string[] }

/** The reads, so a test can hand in its own. */
export interface FactsReader {
  company(slug: string): Promise<CompanySeen | null>
  firm(companyId: string): Promise<FirmTuesday | null>
  receipt(payerId: string, number: string): Promise<{ totalCents: number; dueAt: Date; vendorName: string } | null>
  /** The invoice receipts a client pays, each with the three-way check's answer. */
  program?(clientId: string): Promise<ProgramInvoice[] | null>
}

/** One invoice a client pays, as read for the program map, before it is shaped. */
export interface ProgramInvoice {
  number: string
  status: string
  currency: string
  totalCents: number
  supplier: string
  match: Pick<MatchWithLines, 'matched' | 'summary' | 'voidedWaiver' | 'lines'> | null
}

const DAY = 86_400_000

/** Every slug a door may read live: the seed's own firms, and nothing an address can name. */
export const SEEDED_SLUGS: readonly string[] = [
  ...Object.values(LIVE_READS).map((w) => w.firm),
  ...Object.values(LIVE_READS).map((w) => `world-${w.receipt.payer}`),
  ...Object.values(PROGRAM_READS).map((w) => w.client),
]

/** The statuses a receipt has once its supplier submitted it: what the AP clerk's list holds. */
const IN_THE_CHECK = ['SUBMITTED', 'APPROVED', 'HELD', 'PARTIALLY_PAID', 'PAID']
/** The most receipts the map reads: its table shows four. */
const MOST_RECEIPTS = 8

/**
 * Whether a public page may read this company's book: the coordinator's
 * call of 2026-10-28, reversible by the founder in a sentence. Only the
 * seed's own firm, by the slug the door asked for, with no domain anybody
 * could register (the seed writes none; a reserved one also passes,
 * `.example`, `.invalid`, `.local`), and every seat on it held at a
 * reserved address. A real tenant fails at least one, so a stranger can
 * never make a door read a real firm's book, whatever address is passed.
 */
export function mayReadLive(c: CompanySeen | null, slug: string): c is CompanySeen {
  if (!c || c.slug !== slug || !SEEDED_SLUGS.includes(slug)) return false
  if (c.domain && !reservedDomain(c.domain)) return false
  return c.seatEmails.every((e) => reservedAddress(e))
}

export const DATABASE: FactsReader = {
  async company(slug) {
    const c = await prisma.company.findUnique({
      where: { slug },
      select: { id: true, slug: true, domain: true, contexts: { select: { person: { select: { primaryEmail: true } } } } },
    })
    return c ? { id: c.id, slug: c.slug, domain: c.domain, seatEmails: c.contexts.map((x) => x.person.primaryEmail ?? '') } : null
  },
  firm: (companyId) => firmTuesday(companyId),
  async receipt(payerId, number) {
    const b = await prisma.vendorBill.findFirst({
      where: { number, companyId: payerId },
      select: { totalCents: true, dueAt: true, vendorCompany: { select: { name: true } } },
    })
    return b ? { totalCents: b.totalCents, dueAt: b.dueAt, vendorName: b.vendorCompany.name } : null
  },
  async program(clientId) {
    const invs = await prisma.invoice.findMany({
      where: { payerId: clientId, status: { in: IN_THE_CHECK } },
      select: {
        id: true, number: true, status: true, currency: true, total: true,
        invoiceLines: { take: 1, select: { sellContract: { select: { company: { select: { name: true } } } } } },
      },
      orderBy: [{ issuedAt: 'desc' }, { number: 'asc' }],
      take: MOST_RECEIPTS,
    })
    // Paid ones too: the check is what names who and how many hours a receipt billed.
    const matches = await matchInvoices(invs.map((i) => i.id))
    return invs.map((i) => ({
      number: i.number,
      status: i.status,
      currency: i.currency,
      totalCents: Math.round(Number(i.total) * 100),
      supplier: i.invoiceLines[0]?.sellContract?.company.name ?? '',
      match: matches.get(i.id) ?? null,
    }))
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

/**
 * A client's receipts in the shape the map draws. Pure, so a test can read
 * it. Dollars only, as every other live figure: a receipt in another
 * currency, or one with no supplier on it, is left off rather than summed
 * with dollars. A paid receipt is paid; any other is what `payGate` says,
 * the same gate the payment route reads, so "passes" here is "the check
 * would let it be paid" there.
 */
export function programLive(invs: readonly ProgramInvoice[]): ProgramLive {
  const receipts: LiveProgramReceipt[] = []
  for (const i of invs) {
    if (i.currency !== 'USD' || !i.supplier) continue
    const hours = (i.match?.lines ?? []).filter((l) => l.kind === 'HOURS')
    const rates = [...new Set(hours.map((l) => l.rateCents))]
    const gate = i.status === 'PAID' ? null : payGate({ number: i.number, status: i.status }, i.match)
    receipts.push({
      number: i.number,
      from: i.supplier,
      people: [...new Set(hours.map((l) => l.personName))],
      hoursBilled: hours.reduce((a, l) => a + l.hoursBilled, 0),
      hoursSigned: hours.length && hours.every((l) => l.hoursSigned !== null)
        ? hours.reduce((a, l) => a + (l.hoursSigned as number), 0)
        : null,
      rateMinor: rates.length === 1 ? rates[0] : null,
      totalMinor: i.totalCents,
      state: i.status === 'PAID' ? 'PAID' : gate!.ok ? 'PASSES' : 'HELD',
      why: gate && !gate.ok ? gate.says : null,
    })
  }
  return { receipts }
}

/** A door's live figures, each null where it could not be read in time. */
export async function doorFacts(
  door: LiveDoor,
  read: FactsReader = DATABASE,
  waitMs: number = FACTS_WAIT_MS,
  today: Date = new Date(),
): Promise<DoorFacts> {
  if (door === 'program-offices') return programFacts(PROGRAM_READS[door].client, read, waitMs)
  const w = LIVE_READS[door]
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<DoorFacts>((resolve) => { timer = setTimeout(() => resolve(NO_FACTS), waitMs) })
  const settle = <T,>(p: Promise<T>): Promise<T | null> => p.then((x) => x, () => null)
  /** The seed's own firm by its slug, or null: never a firm that is not the seed's. */
  const seeded = async (slug: string) => {
    const c = await read.company(slug)
    return mayReadLive(c, slug) ? c : null
  }
  const both = Promise.all([
    settle(seeded(w.firm).then((c) => (c ? read.firm(c.id) : null))),
    settle(seeded(`world-${w.receipt.payer}`).then((c) => (c ? read.receipt(c.id, w.receipt.number) : null))),
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

/** The program a door's map reads, bounded the same way; NO_FACTS where it is not the seed's or is late. */
async function programFacts(slug: string, read: FactsReader, waitMs: number): Promise<DoorFacts> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<DoorFacts>((resolve) => { timer = setTimeout(() => resolve(NO_FACTS), waitMs) })
  const reading = (async (): Promise<DoorFacts> => {
    const c = await read.company(slug)
    if (!mayReadLive(c, slug) || !read.program) return NO_FACTS
    const invs = await read.program(c.id)
    return invs ? { ...NO_FACTS, program: programLive(invs) } : NO_FACTS
  })().catch(() => NO_FACTS)
  try {
    return await Promise.race([reading, late])
  } finally {
    clearTimeout(timer)
  }
}

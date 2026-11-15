import type { SellContractState } from '@prisma/client'
import { prisma } from '@/lib/db'
import { LIVE_STATES } from '@/lib/bench-filter'
import { releasing, type RollingOff } from '@/lib/releasing-soon'
import { benchSpell } from '@/lib/bench-profit'
import { loadBook } from '@/app/api/ar/book'
import { isSent } from '@/lib/money/bill-state'

/**
 * The three reads behind a selling firm's Today page that are not money's
 * `firmTuesday`: who rolls off within thirty days, who is on the bench
 * and since when, and the bills the firm sent that are still unpaid.
 *
 * Not a route file — Next routes only `route.ts` — so an ordinary module
 * beside the one route that reads it. Each read asks the database for
 * the facts and hands them to the rule that already decides them; none
 * of them decides anything of its own.
 */

const A_DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Somebody of this firm's whose placement ends within the window. */
export interface RollingOffRow {
  contractId: string
  personId: string
  name: string
  /** The client whose site they are at: the end client, else the firm billed. */
  client: string | null
  /** Days until their last day, counted the way Ending soon counts them. */
  days: number
  /** Their last day, YYYY-MM-DD. */
  lastDay: string
  /** A roll-off has been started or settled for this placement. */
  started: boolean
}

/**
 * The firm's own people whose placement ends within `days` days, nearest
 * first, through supply's `releasing` — the rule Ending soon and Rolloff
 * read. Every one is this firm's own placement, so each is shown to it
 * whether or not the person agreed to be listed as coming free: that
 * consent is about being shown to other firms, and the releasing-soon
 * route shows a firm its own people on the same terms.
 */
export async function rollingOffAt(companyId: string, now: Date, days = 30): Promise<RollingOffRow[]> {
  const lines = await prisma.sellContract.findMany({
    where: {
      companyId,
      state: { in: ['IN_PROGRESS', 'PAUSED'] },
      endDate: { not: null, gte: now, lte: new Date(now.getTime() + days * A_DAY) },
    },
    select: {
      id: true, endDate: true,
      company: { select: { id: true, name: true } },
      clientCompany: { select: { name: true } },
      endClientCompany: { select: { name: true } },
      person: { select: { id: true, name: true } },
      rolloff: { select: { id: true } },
    },
  })
  const byId = new Map(lines.map((l) => [l.id, l]))
  const rows: RollingOff[] = lines.map((l) => ({
    contractId: l.id,
    personId: l.person.id,
    personName: l.person.name,
    vendorCompanyId: l.company.id,
    vendorName: l.company.name,
    endClientName: l.endClientCompany?.name ?? l.clientCompany?.name ?? null,
    endDate: l.endDate!,
    consented: true,
    headline: null,
    skills: [],
    location: null,
    rateFloorCents: null,
    extensionLikely: false,
  }))
  return releasing(rows, now, days).map((r) => {
    const line = byId.get(r.contractId)!
    return {
      contractId: r.contractId,
      personId: r.personId,
      name: r.personName,
      client: line.endClientCompany?.name ?? line.clientCompany?.name ?? null,
      days: r.daysUntilFree,
      lastDay: r.freeOn,
      started: line.rolloff != null,
    }
  })
}

/** Somebody on the firm's own bench today, and the day they joined it. */
export interface BenchRow {
  personId: string
  name: string
  /** YYYY-MM-DD. */
  since: string
}

/**
 * The sell-line states a spell on the bench is read against: the states
 * that place somebody (`LIVE_STATES`, Bench's `whenFree`), and ENDED.
 * ENDED is read for one fact only, the day she left, which dates her
 * spell on the bench: a firm's own employee with no listing is on the
 * bench from the end of her last placement here, and without the ended
 * line she would have no spell at all. That is why ENDED stays in this
 * read and is kept out of the placing states.
 */
const LIVE_OR_PAPERED = [...LIVE_STATES, 'ENDED'] as SellContractState[]

/** One of this firm's own lines, as the read below selects it. */
export interface OwnLine {
  id: string
  state: SellContractState | string
  startDate: Date
  endDate: Date | null
}

/**
 * The span a line is read as on the bench, or null where it says nothing.
 *
 * A papered or running line is read whole: it places the person over its
 * dates. An ended line places nobody: it says only her last day, the way
 * Bench's `whenFree` reads an ended line (`lastEnded`, the latest end
 * date). So an ended line with no last day on record says nothing and is
 * dropped (fix list, layer five, reader's item 1: it was read as a
 * placement with no end, so Today and Candidates called her placed while
 * Bench called her free now). An ended line with a last day is kept with
 * its dates, so a last day today or later keeps her off the bench until
 * the day after, as Bench's "Free from" says, and a last day gone dates
 * her spell.
 */
export function benchSpan(l: OwnLine): { id: string; startsOn: Date; endsOn: Date | null } | null {
  if (l.state === 'ENDED' && l.endDate == null) return null
  return { id: l.id, startsOn: l.startDate, endsOn: l.endDate }
}

/**
 * Who is on this firm's bench today, by either consent — a listing the
 * person granted, or employment here — longest first. On the bench means
 * supply's `benchSpell` says NOW: not placed today, with a day on the
 * record they joined it (the later of the listing and the end of their
 * last placement here). Staff with no placement and no listing have no
 * spell and are not on it.
 *
 * Placed today means placed anywhere (fix list, layer 5, item e). This
 * read used to ask only this firm's own lines, while Bench's `whenFree`
 * asks every firm's, so somebody placed at a client through another firm
 * counted on the bench on Today and Candidates and read "On a placement
 * until" on Bench. Now a line at any other firm that is live today takes
 * the person off this bench. Of that line the database is asked only
 * whose person it is, filtered to today at the query: never its firm,
 * its client, its dates or its rate, so nothing of another firm's deal
 * reaches this answer beyond the person's absence from it.
 */
export async function benchAt(companyId: string, now: Date): Promise<BenchRow[]> {
  const [listings, employees] = await Promise.all([
    prisma.benchListing.findMany({
      where: { companyId, revokedAt: null, state: 'GRANTED' },
      select: { grantedAt: true, consultant: { select: { personId: true, person: { select: { name: true } } } } },
    }),
    prisma.context.findMany({
      where: {
        companyId, type: 'EMPLOYEE', revokedAt: null, suspendedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { personId: true, person: { select: { name: true } } },
    }),
  ])
  const names = new Map<string, string>()
  const joined = new Map<string, Date>()
  for (const l of listings) {
    names.set(l.consultant.personId, l.consultant.person.name)
    const had = joined.get(l.consultant.personId)
    if (!had || l.grantedAt < had) joined.set(l.consultant.personId, l.grantedAt)
  }
  for (const e of employees) names.set(e.personId, e.person.name)
  if (names.size === 0) return []

  const people = [...names.keys()]
  const [lines, elsewhere] = await Promise.all([
    prisma.sellContract.findMany({
      where: { companyId, personId: { in: people }, state: { in: LIVE_OR_PAPERED } },
      select: { id: true, personId: true, state: true, startDate: true, endDate: true },
    }),
    placedElsewhereToday(companyId, people, now),
  ])

  const out: BenchRow[] = []
  for (const [personId, name] of names) {
    if (elsewhere.has(personId)) continue
    const spell = benchSpell({
      joinedBench: joined.get(personId) ?? null,
      lines: lines.filter((l) => l.personId === personId).flatMap((l) => benchSpan(l) ?? []),
      now,
    })
    if (spell.kind === 'NOW') out.push({ personId, name, since: iso(spell.from) })
  }
  return out.sort((a, b) => a.since.localeCompare(b.since) || a.name.localeCompare(b.name))
}

/**
 * Which of these people hold a line at another firm that is live today:
 * started on or before today, and ending today or later, since a
 * contract's last day is a day on site; or an ended line whose last day
 * is today or later. Days are read the way Bench reads them (UTC days,
 * `whenFree`). Only the person's id is selected.
 */
export async function placedElsewhereToday(companyId: string, personIds: string[], now: Date): Promise<Set<string>> {
  if (personIds.length === 0) return new Set()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const tomorrow = new Date(today.getTime() + A_DAY)
  const rows = await prisma.sellContract.findMany({
    where: {
      companyId: { not: companyId },
      personId: { in: personIds },
      startDate: { lt: tomorrow },
      OR: [
        // The states that place a person, as Bench's `whenFree` reads them.
        { state: { in: [...LIVE_STATES] as SellContractState[] }, OR: [{ endDate: null }, { endDate: { gte: today } }] },
        // An ended line whose last day is today or later, which `whenFree`
        // reads as free only from the day after (`benchSpan` above, the
        // same reading for this firm's own lines). One with no last day
        // on record places nobody.
        { state: 'ENDED', endDate: { gte: today } },
      ],
    },
    select: { personId: true },
    distinct: ['personId'],
  })
  return new Set(rows.map((r) => r.personId))
}

/**
 * How many people this firm asked onto its bench who have not answered:
 * its INVITED listings not taken back, counted the way Candidates counts
 * them (`GET /api/consultants`, `bench.invited`), so the two pages say
 * one number. A count only; nobody is named.
 */
export async function askedAt(companyId: string): Promise<number> {
  return prisma.benchListing.count({ where: { companyId, revokedAt: null, state: 'INVITED' } })
}

/** A bill this firm sent that still carries a balance. */
export interface UnpaidBill {
  invoiceId: string
  number: string
  client: string
  currency: string
  outstandingMinor: number
  /** YYYY-MM-DD. */
  dueOn: string
  daysOverdue: number
}

/**
 * Every bill the firm sent with a balance still on it, earliest due
 * first, read from the receivable book Accounts receivable reads
 * (`loadBook`), so the two pages cannot disagree about what is open.
 *
 * Sent, by money's one reader (`isSent` in lib/money/bill-state): the
 * book holds a bill raised and not yet sent (ISSUED) as receivable, and
 * Today listed it under "Sent, not yet paid" (found by money, 2026-11-01).
 */
export async function unpaidBills(companyId: string, now: Date): Promise<UnpaidBill[]> {
  const { book } = await loadBook(companyId, now)
  return book.byCurrency
    .flatMap((cb) => cb.invoices)
    // A bill with no status on the record is never called sent.
    .filter((i) => i.outstandingMinor > 0 && !!i.status && isSent(i.status))
    .map((i) => ({
      invoiceId: i.id,
      number: i.number,
      client: i.customerName,
      currency: i.currency.toUpperCase(),
      outstandingMinor: i.outstandingMinor,
      dueOn: iso(i.dueAt),
      daysOverdue: Math.max(0, i.daysOverdue),
    }))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.number.localeCompare(b.number))
}

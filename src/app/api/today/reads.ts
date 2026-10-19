import { prisma } from '@/lib/db'
import { releasing, type RollingOff } from '@/lib/releasing-soon'
import { benchSpell } from '@/lib/bench-profit'
import { loadBook } from '@/app/api/ar/book'

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

/** The sell-line states a spell on the bench is read against, as bench profit reads them. */
const LIVE_OR_PAPERED = ['PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'PAUSED', 'ENDED'] as const

/**
 * Who is on this firm's bench today, by either consent — a listing the
 * person granted, or employment here — longest first. On the bench means
 * supply's `benchSpell` says NOW: not placed today, with a day on the
 * record they joined it (the later of the listing and the end of their
 * last placement here). Staff with no placement and no listing have no
 * spell and are not on it.
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

  const lines = await prisma.sellContract.findMany({
    where: { companyId, personId: { in: [...names.keys()] }, state: { in: [...LIVE_OR_PAPERED] } },
    select: { id: true, personId: true, startDate: true, endDate: true },
  })

  const out: BenchRow[] = []
  for (const [personId, name] of names) {
    const spell = benchSpell({
      joinedBench: joined.get(personId) ?? null,
      lines: lines.filter((l) => l.personId === personId).map((l) => ({ id: l.id, startsOn: l.startDate, endsOn: l.endDate })),
      now,
    })
    if (spell.kind === 'NOW') out.push({ personId, name, since: iso(spell.from) })
  }
  return out.sort((a, b) => a.since.localeCompare(b.since) || a.name.localeCompare(b.name))
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
 */
export async function unpaidBills(companyId: string, now: Date): Promise<UnpaidBill[]> {
  const { book } = await loadBook(companyId, now)
  return book.byCurrency
    .flatMap((cb) => cb.invoices)
    .filter((i) => i.outstandingMinor > 0)
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

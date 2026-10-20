/**
 * What a firm that sells asks on a Tuesday: what it bills a month, and
 * what is signed and not yet billed — each with the names.
 *
 * ── The founder, 2026-10-19 ──────────────────────────────────────────
 *
 * "Nine links, no flip, and every first screen names a person": *A
 * firm's Today page reads what a firm asks on a Tuesday: billing this
 * month, signed and not yet billed, rolling off in 30 days, on the bench,
 * each with the names.* This file answers the first two. Rolling off and
 * the bench are supply's (`lib/releasing-soon` and the bench libraries).
 *
 * ── Billing this month ───────────────────────────────────────────────
 *
 * An estimate, and it says so. For each sell line live today — running,
 * started, not past its last day — the rate in force today (the line's
 * rate, moved by an approved rate change, `lib/contract-rate`) times the
 * hours a month its job states (four weeks of the job's hours a week),
 * else 160 (`lib/program-spend`, the convention the client's program page
 * uses). It is not signed time and never reads as if it were.
 *
 * Under it, one line where it is true: the weeks this firm billed its
 * clients overtime on that its own workers were paid straight time for,
 * because nobody recorded whether they are exempt — with the amount
 * (lib/money/overtime-not-paid). The pay rule is the founder's and does
 * not move here; the gap is said.
 *
 * ── Signed and not yet billed ────────────────────────────────────────
 *
 * Every week the client at the top signed (a live CLIENT_APPROVAL on the
 * week, through the rung this firm bills, `lib/work-chain`) that is on no
 * bill this firm sent. A week on a draft bill is still not billed, and
 * says which draft holds it. Each week is priced by the Bills page's own
 * generator (`generateBill`, a dry run per billing period), so the amount
 * on Today is the amount the bill will carry: the firm's own rate to the
 * firm that pays it, the payer's accepted hours, the overtime decided at
 * the top. Where the generator would leave the week off — the firm above
 * has not accepted it, overtime nobody decided, no rate, the order's
 * ceiling — the week is counted and its amount is null, with the reason
 * in a word and the generator's sentence beside it. Never a guess.
 *
 * ── What is never read ───────────────────────────────────────────────
 *
 * Only this firm's own sell lines. No other firm's rate reaches a field
 * here: the hours of a line below are read to find the weeks, and every
 * amount is priced at this firm's rate. A client's spend is not this
 * firm's book. Two currencies are never added: each has its own total,
 * and one unpriced person or week blanks its currency's total rather
 * than being left out of it.
 *
 * Integer minor units throughout. Nothing is rounded up.
 */

import { prisma } from '@/lib/db'
import { formatRange } from '@/lib/format-date'
import { rateInForce, ratePeriods } from '@/lib/contract-rate'
import { monthlyHours, HOURS_PER_MONTH, WEEKS_PER_MONTH, FULL_TIME_WEEK } from '@/lib/program-spend'
import { ORDER_HEADER_SELECT, SELL_LINE_TERMS_SELECT, periodTermsFor, termsFor } from '@/lib/money/order-terms'
import { generateBill, BILLABLE_LINE_STATES, type BillCaller, type BillOutcome } from '@/lib/money/bill-generate'
import { whereHoursLive } from '@/lib/work-chain'
import { ladderFor } from '@/lib/work-chain-read'
import { weekStart, weekEnd } from '@/lib/overtime'
import { billingStraddle, periodFor, workedSpan, iso, type Period } from '@/lib/periods'
import { overtimeNotPaidFor, type OvertimeNotPaid } from '@/lib/money/overtime-not-paid'

/** The kinds of firm that sell people, and so have a Tuesday of this shape. A client only buys. */
export const SELLING_KINDS = ['VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP'] as const

/** A total in one currency. Never the sum of two currencies. */
export interface CurrencyTotal {
  currency: string
  /** The whole of it, in minor units; null where any row in this currency has no amount. */
  amountMinor: number | null
  /** What the rows that do have an amount add up to. Never shown as the whole. */
  pricedMinor: number
  /** Rows counted in this currency. */
  count: number
  /** Rows with no amount. */
  unpriced: number
}

/** Why a person on site has no monthly figure. */
export type SeatUnpriced =
  /** No rate on the line, or a zero one. */
  | 'no rate'
  /** The line's rate is in one currency and its agreement bills in another. */
  | 'currency'

/** One person on site today, and what they bill a month at today's rate. */
export interface OnSite {
  sellContractId: string
  personId: string
  personName: string
  /** The firm this firm bills for them. */
  billedToName: string
  /** The client whose site they work at: the end client, else the firm billed. */
  atName: string
  currency: string
  /** Minor units an hour, in force today; null where there is none. */
  rateMinor: number | null
  /** Hours a month the estimate uses. */
  hoursPerMonth: number
  /** True where the job stated its hours; false where 160 is assumed. */
  hoursStated: boolean
  /** Rate × hours a month, in minor units; null where unpriced. */
  monthlyMinor: number | null
  unpriced: SeatUnpriced | null
  /** Why, in a sentence, where unpriced. */
  says: string | null
}

/** Feeds the Today figure "Billing this month". */
export interface BillingThisMonth {
  people: OnSite[]
  totals: CurrencyTotal[]
  /** What the figure rests on, to print beside it. */
  basis: string
  /**
   * Overtime this firm billed its clients on weeks of workers it pays by
   * payroll and has not classified as exempt or not, so the workers were
   * paid straight time (lib/money/overtime-not-paid). `says` is the line
   * printed under the figure; null where there is nothing to say.
   */
  overtimeNotPaid: OvertimeNotPaid
}

/** Why a signed week has no amount, in a word. */
export type WeekUnpriced =
  /** No rate on the line this firm bills from. */
  | 'no rate'
  /** Hours over the line nobody has decided are on no bill. */
  | 'overtime'
  /** The firm this firm bills has not accepted the week. */
  | 'not accepted'
  /** Accepted, and the arithmetic is not decided, so the bill leaves it off. */
  | 'held'
  /** Some of its days are already on an invoice the payer recorded from this firm, and a receipt has no lines to say which. */
  | 'partly billed'
  /** The bill for its period would go over the order's ceiling. */
  | 'ceiling'
  /**
   * The placement is paused, cancelled or not yet started, and a bill is
   * raised only on a running or ended one (`BILLABLE_LINE_STATES`). An
   * ended placement is billed for the weeks signed before its last day.
   */
  | 'not running'
  /** The placement is on no engagement, so no bill can be made for it. */
  | 'no engagement'
  /** The Bills page would refuse the bill for another reason, said in `says`. */
  | 'refused'

/** One week the client signed that this firm has not billed. */
export interface SignedWeek {
  timesheetId: string
  sellContractId: string
  personId: string
  personName: string
  billedToName: string
  atName: string
  /** The Sunday-to-Saturday week the sheet falls in. */
  week: { start: string; end: string; says: string }
  /** The hours the client signed. */
  signedHours: number
  /** The hours the bill carries; null where it would leave the week off. */
  billedHours: number | null
  currency: string
  /** What the week bills, in minor units, at this firm's rate; null where it cannot be priced. */
  amountMinor: number | null
  unpriced: WeekUnpriced | null
  /** The generator's own sentence, where the week has no amount. */
  says: string | null
  /** A draft bill already holding the week, not yet sent. */
  draft: { invoiceId: string; number: string } | null
}

/** Feeds the Today figure "Signed and not yet billed". */
export interface SignedNotBilled {
  weeks: SignedWeek[]
  /** Weeks counted, priced or not. */
  count: number
  /** Of them, weeks a draft bill already holds. */
  onDrafts: number
  totals: CurrencyTotal[]
}

/** The two money figures on a selling firm's Today page. */
export interface FirmTuesday {
  companyId: string
  companyName: string
  /** The day read, YYYY-MM-DD, UTC. */
  asOf: string
  billingThisMonth: BillingThisMonth
  signedNotBilled: SignedNotBilled
}

// ── Pure arithmetic ───────────────────────────────────────────────────

/** What the monthly figure rests on, said once. */
export const BILLING_BASIS =
  `An estimate from current rates: each person’s rate today times ${WEEKS_PER_MONTH} weeks of their job’s ` +
  `hours, or ${HOURS_PER_MONTH} hours a month (${WEEKS_PER_MONTH} weeks of ${FULL_TIME_WEEK}) where the job states none. ` +
  'Not signed time.'

/**
 * One seat's month at a rate, in minor units. Null where there is no
 * rate: a zero is not a price. Rounded down, never up.
 */
export function seatMonth(rateMinor: number | null | undefined, hoursPerWeek?: number | null): {
  monthlyMinor: number | null
  hoursPerMonth: number
  hoursStated: boolean
} {
  const hoursPerMonth = monthlyHours(hoursPerWeek)
  const hoursStated = hoursPerWeek != null && hoursPerWeek > 0
  if (rateMinor == null || !Number.isFinite(rateMinor) || rateMinor <= 0) {
    return { monthlyMinor: null, hoursPerMonth, hoursStated }
  }
  return { monthlyMinor: Math.floor(rateMinor * hoursPerMonth), hoursPerMonth, hoursStated }
}

/**
 * Totals, one per currency, in the order each currency first appears.
 * A row with no amount blanks its currency's whole — it is counted in
 * `unpriced`, and `pricedMinor` says what the others add up to.
 */
export function totalsByCurrency(rows: readonly { currency: string; amountMinor: number | null }[]): CurrencyTotal[] {
  const by = new Map<string, CurrencyTotal>()
  for (const r of rows) {
    const key = r.currency.toUpperCase()
    const t = by.get(key) ?? { currency: key, amountMinor: 0, pricedMinor: 0, count: 0, unpriced: 0 }
    t.count++
    if (r.amountMinor == null) t.unpriced++
    else t.pricedMinor += r.amountMinor
    by.set(key, t)
  }
  return [...by.values()].map((t) => ({ ...t, amountMinor: t.unpriced > 0 ? null : t.pricedMinor }))
}

/** The Sunday-to-Saturday week a sheet falls in, read off its first day. */
export function weekOf(periodStart: Date): { start: string; end: string; says: string } {
  const start = weekStart(iso(periodStart))
  const end = weekEnd(start)
  return { start, end, says: formatRange(start, end) }
}

/**
 * The period a week bills in: its last worked day's, or its first under
 * START — one week bills once (`billingStraddle`). The same answer as
 * `periodOfWeek` in `lib/money/supplier-bills`, the twin's, and a test
 * holds the two together. Not imported from there, because that module
 * sits in a loop with the twin's performers that only loads in one order.
 */
export function billingPeriodOf(
  week: { periodStart: Date; periodEnd: Date; days: unknown },
  terms: ReturnType<typeof periodTermsFor>
): Period {
  const { straddle } = billingStraddle(terms.straddle)
  const span = workedSpan((week.days ?? {}) as Record<string, number>)
  const on = straddle === 'START' ? (span?.first ?? week.periodStart) : (span?.last ?? week.periodEnd)
  return periodFor(on, terms)
}

type LeftOffWeek = { timesheetId: string; kind: string; says: string; billedElsewhere?: 'WHOLE' | 'PART' }

/**
 * A week the bill leaves off, read: one already wholly on an invoice the
 * payer recorded from this firm is billed, and not this figure's; the
 * rest are counted with no amount.
 */
function leftOff(off: LeftOffWeek): { unpriced: WeekUnpriced; says: string } | { billed: true; says: string } {
  if (off.billedElsewhere === 'WHOLE') return { billed: true, says: off.says }
  if (off.billedElsewhere === 'PART') return { unpriced: 'partly billed', says: off.says }
  return { unpriced: off.kind === 'WAITING' ? 'not accepted' : 'held', says: off.says }
}

/** What one dry run of the generator says about one week, read as the Today figure needs it. */
export function readWeek(
  outcome: BillOutcome,
  timesheetId: string
): { billedHours: number; amountMinor: number } | { unpriced: WeekUnpriced; says: string | null } | { billed: true; says: string } {
  if (outcome.ok) {
    const p = outcome.planned
    const undecided = p.weeksUndecided.find((w) => w.timesheetId === timesheetId)
    if (undecided) {
      return {
        unpriced: 'overtime',
        says:
          `${undecided.pendingHours} hour${undecided.pendingHours === 1 ? '' : 's'} over the weekly limit ` +
          'are not on any bill, because nobody has decided how they are paid.',
      }
    }
    const priced = p.weeks.find((w) => w.timesheetId === timesheetId)
    if (priced) return { billedHours: priced.hours, amountMinor: priced.amountMinor }
    const off = p.weeksLeftOff.find((w) => w.timesheetId === timesheetId)
    if (off) return leftOff(off)
    return { unpriced: 'refused', says: 'The bill for its period would not carry this week, so no figure is given.' }
  }
  const err = outcome.body.error as { code?: unknown; message?: unknown; heldBack?: unknown }
  const message = typeof err.message === 'string' ? err.message : null
  if (err.code === 'NOT_ACCEPTED_ABOVE' && Array.isArray(err.heldBack)) {
    const off = (err.heldBack as LeftOffWeek[]).find((h) => h.timesheetId === timesheetId)
    if (off) return leftOff(off)
  }
  if (err.code === 'PO_CEILING') return { unpriced: 'ceiling', says: message }
  return { unpriced: 'refused', says: message }
}

// ── The read ──────────────────────────────────────────────────────────

const A_DAY = 86_400_000
const dayOf = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

/**
 * A selling firm's two money figures for its Today page, with the names
 * behind them. Null where the company is not on the record or is not a
 * firm that sells (a client only buys, and its spend is its program
 * page's). Reads only; writes nothing.
 *
 * - `billingThisMonth` feeds "Billing this month".
 * - `signedNotBilled` feeds "Signed and not yet billed".
 */
export async function firmTuesday(companyId: string, today: Date = new Date()): Promise<FirmTuesday | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, kind: true } })
  if (!company || !(SELLING_KINDS as readonly string[]).includes(company.kind)) return null
  const day = dayOf(today)

  const [billing, signedNotBilled, overtimeNotPaid] = await Promise.all([
    billingAt(company.id, day),
    signedAt(company),
    overtimeNotPaidFor(company.id),
  ])
  const billingThisMonth: BillingThisMonth = { ...billing, overtimeNotPaid }
  return { companyId: company.id, companyName: company.name, asOf: iso(day), billingThisMonth, signedNotBilled }
}

/** "Billing this month": every line of this firm that is live today, at today's rate. */
async function billingAt(companyId: string, day: Date): Promise<Omit<BillingThisMonth, 'overtimeNotPaid'>> {
  const lines = await prisma.sellContract.findMany({
    where: {
      companyId,
      state: 'IN_PROGRESS',
      startDate: { lte: new Date(day.getTime() + A_DAY - 1) },
      OR: [{ endDate: null }, { endDate: { gte: day } }],
    },
    select: {
      id: true, billRate: true, billCurrency: true, startDate: true, endDate: true,
      person: { select: { id: true, name: true } },
      clientCompany: { select: { name: true } },
      endClientCompany: { select: { name: true } },
      requirement: { select: { hoursPerWeek: true } },
      workOrder: { select: ORDER_HEADER_SELECT },
      ...SELL_LINE_TERMS_SELECT,
    },
    orderBy: { id: 'asc' },
  })

  const changes = lines.length === 0
    ? []
    : await prisma.rateHistory.findMany({
        where: { contractType: 'SELL', contractId: { in: lines.map((l) => l.id) }, approvalState: 'APPROVED' },
        select: { id: true, contractId: true, rate: true, fromDate: true, toDate: true, approvalState: true },
      })

  const people: OnSite[] = lines.map((l) => {
    const rate = rateInForce(l.billRate, ratePeriods(changes.filter((c) => c.contractId === l.id)), day).rateCents
    const said = termsFor('SELL', l).currency
    const lineCurrency = (l.billCurrency || 'USD').toUpperCase()
    const base = {
      sellContractId: l.id,
      personId: l.person.id,
      personName: l.person.name,
      billedToName: l.clientCompany.name,
      atName: l.endClientCompany?.name ?? l.clientCompany.name,
      currency: lineCurrency,
    }
    const m = seatMonth(rate, l.requirement?.hoursPerWeek ?? null)
    if (said && said.toUpperCase() !== lineCurrency) {
      return {
        ...base, rateMinor: rate > 0 ? rate : null, hoursPerMonth: m.hoursPerMonth, hoursStated: m.hoursStated,
        monthlyMinor: null, unpriced: 'currency' as const,
        says: `${l.person.name}’s rate is in ${lineCurrency} and the agreement bills in ${said.toUpperCase()}, so no figure is given.`,
      }
    }
    if (m.monthlyMinor == null) {
      return {
        ...base, rateMinor: null, hoursPerMonth: m.hoursPerMonth, hoursStated: m.hoursStated,
        monthlyMinor: null, unpriced: 'no rate' as const,
        says: `${l.person.name}’s placement has no bill rate, so no figure is given.`,
      }
    }
    return { ...base, rateMinor: rate, ...m, unpriced: null, says: null }
  })
  people.sort((a, b) => a.atName.localeCompare(b.atName) || a.personName.localeCompare(b.personName))

  return {
    people,
    totals: totalsByCurrency(people.map((p) => ({ currency: p.currency, amountMinor: p.monthlyMinor }))),
    basis: BILLING_BASIS,
  }
}

/** "Signed and not yet billed": every week signed at the top that no bill of ours has sent. */
async function signedAt(company: { id: string; name: string; kind: string }): Promise<SignedNotBilled> {
  const lines = await prisma.sellContract.findMany({
    where: { companyId: company.id },
    select: {
      id: true, engagementId: true, billRate: true, billCurrency: true, startDate: true, state: true,
      clientCompany: { select: { name: true } },
      endClientCompany: { select: { name: true } },
      billFrequency: true, billAnchor: true, billStraddle: true,
      workOrder: { select: ORDER_HEADER_SELECT },
      ...SELL_LINE_TERMS_SELECT,
    },
  })
  if (lines.length === 0) return { weeks: [], count: 0, onDrafts: 0, totals: [] }

  // Where each line's hours are filed: its own contract on a direct
  // placement, the bottom rung's where the firm sells somebody it buys.
  const ownIds = lines.map((l) => l.id)
  const rungs = await ladderFor(ownIds)
  const billedBy = new Map<string, (typeof lines)[number]>()
  for (const l of lines) billedBy.set(whereHoursLive(l.id, rungs), l)

  const sheets = await prisma.timesheet.findMany({
    where: {
      sellContractId: { in: [...billedBy.keys()] },
      assertions: { some: { role: 'CLIENT_APPROVAL', state: 'LIVE' } },
    },
    select: {
      id: true, sellContractId: true, periodStart: true, periodEnd: true, days: true,
      person: { select: { id: true, name: true } },
      assertions: { where: { role: 'CLIENT_APPROVAL', state: 'LIVE' }, select: { hours: true }, take: 1 },
      invoiceLines: {
        where: { sellContractId: { in: ownIds } },
        select: { sellContractId: true, hours: true, amountCents: true, invoice: { select: { id: true, number: true, status: true, currency: true } } },
      },
    },
    orderBy: [{ periodStart: 'asc' }, { id: 'asc' }],
  })

  const caller: BillCaller = { company: { id: company.id, name: company.name, kind: company.kind }, person: { id: null, name: 'Today' } }
  // One dry run per engagement and billing period, started together and
  // read once each. A failure is kept and thrown when it is read, never
  // swallowed into a figure.
  type Settled = { outcome: BillOutcome } | { failed: unknown }
  const runs = new Map<string, Promise<Settled>>()
  const dryRun = (engagementId: string, start: Date, end: Date): Promise<Settled> => {
    const key = `${engagementId}:${iso(start)}:${iso(end)}`
    let run = runs.get(key)
    if (!run) {
      run = generateBill(caller, { engagementId, periodStart: iso(start), periodEnd: iso(end) }, { dryRun: true })
        .then((outcome) => ({ outcome }), (failed) => ({ failed }))
      runs.set(key, run)
    }
    return run
  }
  const toPrice: { base: Omit<SignedWeek, 'billedHours' | 'amountMinor' | 'unpriced' | 'says' | 'draft'>; run: Promise<Settled> }[] = []

  const weeks: SignedWeek[] = []
  for (const ts of sheets) {
    const line = billedBy.get(ts.sellContractId)
    if (!line) continue
    const ours = ts.invoiceLines.filter((x) => x.sellContractId === line.id)
    // On a bill this firm sent: billed, and not this figure's.
    if (ours.some((x) => x.invoice.status !== 'DRAFT')) continue

    const base = {
      timesheetId: ts.id,
      sellContractId: line.id,
      personId: ts.person.id,
      personName: ts.person.name,
      billedToName: line.clientCompany.name,
      atName: line.endClientCompany?.name ?? line.clientCompany.name,
      week: weekOf(ts.periodStart),
      signedHours: Number(ts.assertions[0]?.hours ?? 0),
      currency: (line.billCurrency || 'USD').toUpperCase(),
    }

    // On a draft nobody has sent: the draft priced it, and holds it.
    if (ours.length > 0) {
      const inv = ours[0].invoice
      weeks.push({
        ...base,
        currency: inv.currency.toUpperCase(),
        billedHours: Math.round(ours.reduce((n, x) => n + Number(x.hours), 0) * 100) / 100,
        amountMinor: ours.reduce((n, x) => n + x.amountCents, 0),
        unpriced: null, says: null,
        draft: { invoiceId: inv.id, number: inv.number },
      })
      continue
    }

    const off = (unpriced: WeekUnpriced, says: string | null): SignedWeek =>
      ({ ...base, billedHours: null, amountMinor: null, unpriced, says, draft: null })

    if (line.billRate <= 0) {
      weeks.push(off('no rate', `${ts.person.name}’s placement has no bill rate, so the week cannot be priced.`))
      continue
    }
    if (!line.engagementId) {
      weeks.push(off('no engagement', `${ts.person.name}’s placement is on no engagement, so no bill can be made for it yet.`))
      continue
    }
    // The same states the Bills page bills (lib/money/bill-generate): a
    // running placement, and one that has ended, for the weeks signed
    // before its last day. This read used to refuse an ended one after the
    // generator had stopped refusing it (5ee828da0), so the figure said
    // Karthik Menon's fourteen signed weeks could not be billed while the
    // Bills page billed them.
    if (!(BILLABLE_LINE_STATES as readonly string[]).includes(line.state)) {
      weeks.push(off('not running',
        `${ts.person.name}’s placement is not running, and a bill is made only for a running or ended placement, ` +
        'so this week cannot be billed yet.'))
      continue
    }

    // The period this week bills in, under the agreement first, and the
    // generator's own pricing of that period.
    const period = billingPeriodOf(ts, periodTermsFor('SELL', line))
    toPrice.push({ base, run: dryRun(line.engagementId, period.start, period.end) })
  }

  for (const { base, run } of toPrice) {
    const settled = await run
    if ('failed' in settled) throw settled.failed
    const read = readWeek(settled.outcome, base.timesheetId)
    // Already on an invoice the payer recorded from us: billed off the platform.
    if ('billed' in read) continue
    if ('unpriced' in read) weeks.push({ ...base, billedHours: null, amountMinor: null, unpriced: read.unpriced, says: read.says, draft: null })
    else weeks.push({ ...base, billedHours: read.billedHours, amountMinor: read.amountMinor, unpriced: null, says: null, draft: null })
  }

  weeks.sort((a, b) => a.week.start.localeCompare(b.week.start) || a.personName.localeCompare(b.personName))
  return {
    weeks,
    count: weeks.length,
    onDrafts: weeks.filter((w) => w.draft).length,
    totals: totalsByCurrency(weeks),
  }
}

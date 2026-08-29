/**
 * What we are owed, how old it is, and who to ask.
 *
 * ── The failure this exists for ──────────────────────────────────────
 *
 * Margin is theoretical. Payroll on Friday is not. A staffing firm can
 * run a twenty-two per cent book and still fail, because the money is at
 * the client and the wages are due on the 15th either way. The number
 * that decides whether a vendor survives is not what a placement earns,
 * it is how long the cash takes to arrive.
 *
 * So this file is about age, not about totals. A hundred thousand at
 * thirty days is working capital. The same hundred thousand at ninety is
 * a problem somebody should already have made a phone call about, and
 * the whole point of an ageing report is that nobody has to notice — the
 * number moves buckets on its own.
 *
 * ── Why the buckets are where they are ───────────────────────────────
 *
 * Current · 1–30 · 31–60 · 61–90 · 90+, measured from the DUE DATE and
 * never from the invoice date.
 *
 * Thirty days because that is the modal payment term in this schema
 * (`MasterAgreement.paymentTerms` defaults to 30) and in this industry.
 * Each bucket is therefore one whole payment cycle missed. An invoice in
 * 31–60 has been through one full cycle of the client's AP run without
 * being paid, which is a different fact from "it is a bit late" — it
 * means it was seen, or was not seen, and either way somebody skipped it.
 *
 * Ageing from the invoice date instead is the commonest mistake in this
 * report, and it punishes the client who negotiated sixty-day terms in
 * good faith: their invoice reads "45 days" and looks delinquent on the
 * day it is not yet payable. The due date already carries the terms, so
 * the terms never have to be re-applied here.
 *
 * Ninety is the last bucket because it is where the conversation stops
 * being about process. Below ninety, an unpaid invoice is usually a
 * missing PO, a wrong bill-to, or an approver on holiday. Above ninety it
 * is a decision, and a decision is answered by a person and not by a
 * fourth reminder email.
 *
 * ── The three things most AR reports get wrong ───────────────────────
 *
 * **Part payments.** `paid` is a Decimal that is very often neither zero
 * nor the total. Treating an invoice as unpaid because it is not fully
 * paid chases a client for money they have already sent.
 *
 * **Short payments.** £9,400 against £9,600 is not a debt, it is a query
 * — a disputed expense line, a rate they think was wrong, a timesheet
 * hour they did not approve. Chasing it as arrears over four automated
 * emails is how a good account is lost over two hundred pounds. Short
 * payments leave the automated ladder and go to a person.
 *
 * **Unapplied cash.** Money that arrived and cannot be matched to what it
 * was for. It is on the bank statement and on no invoice, so it is money
 * you have and cannot count, and it is invisible in most systems because
 * every screen is built around the invoice rather than around the
 * receipt.
 *
 * ── Units ────────────────────────────────────────────────────────────
 *
 * Everything here is MINOR UNITS — cents, pence, paise. `Invoice.total`
 * and `Invoice.paid` are Prisma Decimals in whole currency, so whoever
 * loads them converts at the edge with `fromPrismaDecimal` in
 * `src/lib/money.ts`. Nothing in this file divides or multiplies by a
 * hundred, because a hundred is not always the right number.
 *
 * No database import. This is arithmetic and it is tested as arithmetic.
 */

// ── Constants, each with a reason ────────────────────────────────────

/**
 * Below this, a remainder is rounding rather than a debt.
 *
 * One whole currency unit — a pound, a dollar. Cross-border payments lose
 * a few pence to intermediary bank charges and FX rounding on almost
 * every wire, and an AR report that lists a 40p residual as an unpaid
 * invoice is a report people stop reading.
 *
 * Deliberately expressed in minor units and applied without reference to
 * the currency's exponent, because the cost being compared against is a
 * person's attention, which does not vary by currency.
 */
export const ROUNDING_TOLERANCE_MINOR = 100

/**
 * A shortfall at or under this share of the invoice is a query, not arrears.
 *
 * Five per cent. £200 against £9,600 is 2.1%; a disputed day's rate on a
 * monthly invoice lands around 4–5%. Below the line somebody has decided
 * not to pay part of it; above the line they have not paid it.
 */
export const SHORT_PAY_MAX_FRACTION = 0.05

/**
 * Not worth a letter.
 *
 * Twenty-five whole units. An automated chase costs almost nothing to
 * send and a great deal in goodwill when the amount is trivial, and an AR
 * clerk who receives a demand for £8 concludes the sender is a machine
 * and files the next one with it.
 */
export const CHASE_FLOOR_MINOR = 2_500

/**
 * The last day anything automated goes out.
 *
 * Past sixty days overdue the reason is a decision rather than an
 * oversight, and a decision is not changed by a fifth email. This
 * codebase learned the same lesson in `src/app/api/cron/loose-ends`:
 * telling somebody about the same thing every morning for four months is
 * how a digest gets filtered into a folder.
 */
export const ESCALATE_AFTER_DAYS = 60

const DAY = 86_400_000

// ── Which way the money runs ─────────────────────────────────────────

/**
 * Whose money this invoice is.
 *
 * ── Why this is a function and not an assumption ─────────────────────
 *
 * `/api/invoices` scoped its ageing summary to
 * `msa: { OR: [{ vendorId }, { clientId }] }` and then added every row
 * into one `totalOutstanding`. For a firm that only sells, that is
 * correct. For a prime that both sells to a client and buys from a
 * sub — which is most of this industry — it silently summed its own
 * supplier bills into the "money owed to us" figure on the dashboard.
 *
 * The bar went up when the firm owed MORE, and it read as good news.
 *
 * Receivable and payable are opposite signs of the same table, and there
 * is no arrangement of them that makes one total meaningful. So the
 * direction is decided per invoice, here, and the two are never added.
 */
export type Direction = 'RECEIVABLE' | 'PAYABLE' | 'NEITHER'

/**
 * Where we are the vendor on the agreement, the invoice is ours to
 * collect. Where we are the client, it is ours to pay. Where we are
 * neither, it belongs to two other companies and is not ours at all —
 * which is a scoping bug upstream rather than a number to be shown, so
 * it is named rather than being quietly bucketed into one side.
 */
export function directionOf(
  agreement: { vendorId: string; clientId: string },
  companyId: string
): Direction {
  if (agreement.vendorId === companyId) return 'RECEIVABLE'
  if (agreement.clientId === companyId) return 'PAYABLE'
  return 'NEITHER'
}

// ── Shapes ───────────────────────────────────────────────────────────

export const BUCKETS = ['CURRENT', 'D1_30', 'D31_60', 'D61_90', 'D90_PLUS'] as const
export type Bucket = (typeof BUCKETS)[number]

export const BUCKET_LABEL: Record<Bucket, string> = {
  CURRENT: 'Not yet due',
  D1_30: '1–30 days',
  D31_60: '31–60 days',
  D61_90: '61–90 days',
  D90_PLUS: '90+ days',
}

/**
 * How an invoice actually stands, which is not the same as its status.
 *
 * `Invoice.status` is what somebody typed. These are what the money says.
 */
export type Settlement =
  /** Nothing outstanding, or only a rounding residual. */
  | 'SETTLED'
  /** Nothing has arrived. */
  | 'OUTSTANDING'
  /** Some has arrived and a real balance remains. Chase the balance. */
  | 'PART_PAID'
  /** They paid nearly all of it and stopped. A query for a person. */
  | 'SHORT_PAID'
  /** More arrived than was asked for. The excess is unapplied cash. */
  | 'OVERPAID'

export interface ArInvoice {
  id: string
  number: string
  /** ISO 4217. Books never mix. */
  currency: string
  /** Minor units. Converted from the Decimal at the edge. */
  totalMinor: number
  /** Minor units. What the invoice header says has been paid. */
  paidMinor: number
  dueAt: Date
  /** Who owes it — the bill-to where one is set, else the client on the MSA. */
  customerId: string
  customerName: string
  /** DRAFT · ISSUED · SUBMITTED · PAID · CANCELLED. Read, not trusted. */
  status?: string | null
  /**
   * Sum of the receipt rows, in minor units, where they were read.
   *
   * Null means nobody looked — which is different from zero, and the two
   * must not be conflated. A null suppresses the reconciliation finding
   * rather than raising a false one.
   */
  receiptsMinor?: number | null
  /** When the last receipt landed, where receipts were read. */
  lastPaymentAt?: Date | null
}

export interface AgedInvoice extends ArInvoice {
  /** Positive is past due. Zero or negative is not yet payable. */
  daysOverdue: number
  bucket: Bucket
  settlement: Settlement
  /** What is still owed. Never negative — an overpayment is not a debt. */
  outstandingMinor: number
  /** Money received beyond what was asked for. */
  unappliedMinor: number
  /** True for a short payment: a query for a person, not a rung on the ladder. */
  disputed: boolean
  /** True when the header and the receipts disagree and both were read. */
  receiptsDisagree: boolean
  says: string
}

// ── Per invoice ──────────────────────────────────────────────────────

/** Days past the due date. Zero on the due date itself. */
export function daysOverdue(dueAt: Date, now: Date): number {
  return Math.floor((now.getTime() - dueAt.getTime()) / DAY)
}

export function bucketOf(days: number): Bucket {
  if (days <= 0) return 'CURRENT'
  if (days <= 30) return 'D1_30'
  if (days <= 60) return 'D31_60'
  if (days <= 90) return 'D61_90'
  return 'D90_PLUS'
}

/**
 * What the money says about one invoice.
 *
 * The order of these branches is the whole judgement. Overpayment first,
 * because an excess must never be netted into a balance; then rounding,
 * because a residual is not a debt; then the size of what is left, which
 * is what separates a query from arrears.
 */
export function settlementOf(inv: ArInvoice): {
  settlement: Settlement
  outstandingMinor: number
  unappliedMinor: number
  disputed: boolean
} {
  const remainder = inv.totalMinor - inv.paidMinor

  if (remainder < 0) {
    return {
      settlement: 'OVERPAID',
      outstandingMinor: 0,
      unappliedMinor: -remainder,
      disputed: false,
    }
  }

  if (remainder <= ROUNDING_TOLERANCE_MINOR) {
    return { settlement: 'SETTLED', outstandingMinor: 0, unappliedMinor: 0, disputed: false }
  }

  if (inv.paidMinor <= 0) {
    return {
      settlement: 'OUTSTANDING',
      outstandingMinor: remainder,
      unappliedMinor: 0,
      disputed: false,
    }
  }

  // Something arrived and they stopped. Whether that is an instalment or
  // an argument is decided by how much they held back.
  const heldBack = inv.totalMinor > 0 ? remainder / inv.totalMinor : 1
  const short = heldBack <= SHORT_PAY_MAX_FRACTION

  return {
    settlement: short ? 'SHORT_PAID' : 'PART_PAID',
    outstandingMinor: remainder,
    unappliedMinor: 0,
    disputed: short,
  }
}

export function ageInvoice(inv: ArInvoice, now: Date): AgedInvoice {
  const days = daysOverdue(inv.dueAt, now)
  const s = settlementOf(inv)

  // Only a finding where both numbers were actually read. Null receipts
  // mean nobody looked, and a report that cannot tell "no receipts" from
  // "receipts not loaded" invents a reconciliation problem every time
  // somebody opens a cheaper query.
  const receiptsDisagree =
    inv.receiptsMinor != null &&
    Math.abs(inv.receiptsMinor - inv.paidMinor) > ROUNDING_TOLERANCE_MINOR

  return {
    ...inv,
    daysOverdue: days,
    bucket: bucketOf(days),
    settlement: s.settlement,
    outstandingMinor: s.outstandingMinor,
    unappliedMinor: s.unappliedMinor,
    disputed: s.disputed,
    receiptsDisagree,
    says: saysOf(inv, days, s),
  }
}

function saysOf(
  inv: ArInvoice,
  days: number,
  s: ReturnType<typeof settlementOf>
): string {
  switch (s.settlement) {
    case 'SETTLED':
      return inv.totalMinor - inv.paidMinor > 0
        ? `Settled. The few units left are rounding on the wire, not a debt.`
        : `Settled.`
    case 'OVERPAID':
      return (
        `More arrived than ${inv.number} asked for. The excess is cash we hold ` +
        `and cannot count until somebody says what it was for.`
      )
    case 'SHORT_PAID':
      return (
        `${inv.customerName} paid and stopped short. That is a query about ` +
        `something on the invoice, not arrears — it goes to a person, not to a reminder.`
      )
    case 'PART_PAID':
      return days > 0
        ? `Part paid and ${days} day${days === 1 ? '' : 's'} past due. Only the balance is owed.`
        : `Part paid and not yet due. Only the balance will be owed.`
    default:
      return days > 0
        ? `${days} day${days === 1 ? '' : 's'} past due and nothing has arrived.`
        : `Not due for ${-days} more day${days === -1 ? '' : 's'}.`
  }
}

// ── Per customer ─────────────────────────────────────────────────────

export type Concentration = 'ONE_BIG_INVOICE' | 'SPREAD_THIN' | 'MIXED' | 'NOTHING_OVERDUE'

export interface CustomerAgeing {
  customerId: string
  customerName: string
  currency: string
  /** Everything still owed, due and not yet due. */
  outstandingMinor: number
  /** The part that is past its due date. */
  overdueMinor: number
  buckets: Record<Bucket, { count: number; minor: number }>
  invoiceCount: number
  overdueCount: number
  /** Days on the oldest overdue invoice. Null when nothing is overdue. */
  oldestDaysOverdue: number | null
  /** The single largest overdue invoice, which the roll-up must not hide. */
  largestOverdueMinor: number
  largestOverdueNumber: string | null
  /** That invoice's share of the overdue balance, in basis points. */
  largestShareBps: number | null
  concentration: Concentration
  /** Short payments — queries a person owns. Never chased automatically. */
  disputedMinor: number
  disputedCount: number
  /** Cash received here that is not against anything owed. */
  unappliedMinor: number
  says: string
}

function emptyBuckets(): Record<Bucket, { count: number; minor: number }> {
  return {
    CURRENT: { count: 0, minor: 0 },
    D1_30: { count: 0, minor: 0 },
    D31_60: { count: 0, minor: 0 },
    D61_90: { count: 0, minor: 0 },
    D90_PLUS: { count: 0, minor: 0 },
  }
}

/**
 * One customer's position.
 *
 * The roll-up exists to be read at a glance and that is exactly what
 * makes it dangerous: £400,000 spread across three hundred small
 * invoices and £400,000 sitting in one ninety-day invoice are the same
 * number and completely different problems. The first is a process
 * failure — a wrong bill-to, a portal nobody submits to — and it is
 * fixed by one conversation with AP. The second is a decision somebody
 * at the client has taken, and it is fixed by a director.
 *
 * So the largest single invoice and its share of the balance travel with
 * the total, always, and the sentence says which of the two this is.
 */
export function forCustomer(aged: AgedInvoice[]): CustomerAgeing {
  if (aged.length === 0) throw new Error('forCustomer needs at least one invoice')

  const currencies = new Set(aged.map((a) => a.currency))
  if (currencies.size > 1) {
    // Adding dollars to rupees has no right answer, so there is nothing
    // sensible to return. Callers split by currency before they get here.
    throw new Error(
      `Cannot age ${[...currencies].join(' and ')} together. Split the book by currency first.`
    )
  }

  const buckets = emptyBuckets()
  let outstanding = 0
  let overdue = 0
  let overdueCount = 0
  let disputedMinor = 0
  let disputedCount = 0
  let unapplied = 0
  let oldest: number | null = null
  let largest = 0
  let largestNumber: string | null = null

  for (const a of aged) {
    unapplied += a.unappliedMinor
    if (a.outstandingMinor <= 0) continue

    outstanding += a.outstandingMinor
    buckets[a.bucket].count += 1
    buckets[a.bucket].minor += a.outstandingMinor

    if (a.disputed) {
      disputedMinor += a.outstandingMinor
      disputedCount += 1
    }

    if (a.daysOverdue > 0) {
      overdue += a.outstandingMinor
      overdueCount += 1
      if (oldest == null || a.daysOverdue > oldest) oldest = a.daysOverdue
      if (a.outstandingMinor > largest) {
        largest = a.outstandingMinor
        largestNumber = a.number
      }
    }
  }

  const shareBps = overdue > 0 ? Math.round((largest / overdue) * 10_000) : null

  let concentration: Concentration = 'NOTHING_OVERDUE'
  if (overdueCount > 0 && shareBps != null) {
    if (shareBps >= 6_000) concentration = 'ONE_BIG_INVOICE'
    else if (overdueCount >= 5 && shareBps <= 2_500) concentration = 'SPREAD_THIN'
    else concentration = 'MIXED'
  }

  return {
    customerId: aged[0].customerId,
    customerName: aged[0].customerName,
    currency: aged[0].currency,
    outstandingMinor: outstanding,
    overdueMinor: overdue,
    buckets,
    invoiceCount: aged.filter((a) => a.outstandingMinor > 0).length,
    overdueCount,
    oldestDaysOverdue: oldest,
    largestOverdueMinor: largest,
    largestOverdueNumber: largestNumber,
    largestShareBps: shareBps,
    concentration,
    disputedMinor,
    disputedCount,
    unappliedMinor: unapplied,
    says: concentrationSays(concentration, overdueCount, shareBps, largestNumber, oldest),
  }
}

function concentrationSays(
  c: Concentration,
  overdueCount: number,
  shareBps: number | null,
  largestNumber: string | null,
  oldest: number | null
): string {
  const pct = shareBps == null ? '' : `${Math.round(shareBps / 100)}%`
  switch (c) {
    case 'ONE_BIG_INVOICE':
      return (
        `Almost all of it is ${largestNumber ?? 'one invoice'} — ${pct} of the overdue ` +
        `balance, ${oldest} days out. One conversation about one invoice, not a chase.`
      )
    case 'SPREAD_THIN':
      return (
        `${overdueCount} invoices and none of them dominant, the largest ${pct} of the ` +
        `balance. That pattern is usually a process fault at their end — a wrong ` +
        `bill-to, a portal nobody submits to — rather than a decision not to pay.`
      )
    case 'MIXED':
      return `${overdueCount} overdue invoice${overdueCount === 1 ? '' : 's'}, the largest ${pct} of the balance.`
    default:
      return 'Nothing overdue.'
  }
}

// ── The book ─────────────────────────────────────────────────────────

export interface CurrencyBook {
  currency: string
  invoices: AgedInvoice[]
  customers: CustomerAgeing[]
  buckets: Record<Bucket, { count: number; minor: number }>
  outstandingMinor: number
  overdueMinor: number
  /** Short payments, across every customer. A person's queue. */
  disputes: AgedInvoice[]
  /** Cash we hold and cannot count. */
  unapplied: AgedInvoice[]
  unappliedMinor: number
  /** Header and receipts disagree. A reconciliation queue, not a chase. */
  unreconciled: AgedInvoice[]
}

export interface Book {
  /** One book per currency. Dollars and rupees are never added. */
  byCurrency: CurrencyBook[]
  currencies: string[]
}

/**
 * The whole ledger, split by currency because it has to be.
 *
 * Cancelled and draft invoices are excluded by the caller, not here — what
 * counts as issued is a question about `Invoice.status`, which is a
 * database question, and this file does not have one.
 */
export function ageBook(invoices: ArInvoice[], now: Date): Book {
  const byCurrency = new Map<string, ArInvoice[]>()
  for (const inv of invoices) {
    const key = inv.currency.toUpperCase()
    byCurrency.set(key, [...(byCurrency.get(key) ?? []), inv])
  }

  const books: CurrencyBook[] = [...byCurrency.entries()]
    .map(([currency, theirs]) => {
      const aged = theirs.map((i) => ageInvoice(i, now))

      const byCustomer = new Map<string, AgedInvoice[]>()
      for (const a of aged) {
        byCustomer.set(a.customerId, [...(byCustomer.get(a.customerId) ?? []), a])
      }

      const buckets = emptyBuckets()
      let outstanding = 0
      let overdue = 0
      for (const a of aged) {
        if (a.outstandingMinor <= 0) continue
        outstanding += a.outstandingMinor
        buckets[a.bucket].count += 1
        buckets[a.bucket].minor += a.outstandingMinor
        if (a.daysOverdue > 0) overdue += a.outstandingMinor
      }

      const unapplied = aged.filter((a) => a.unappliedMinor > 0)

      return {
        currency,
        invoices: aged,
        customers: [...byCustomer.values()]
          .map(forCustomer)
          .sort((a, b) => b.overdueMinor - a.overdueMinor),
        buckets,
        outstandingMinor: outstanding,
        overdueMinor: overdue,
        disputes: aged.filter((a) => a.disputed),
        unapplied,
        unappliedMinor: unapplied.reduce((n, a) => n + a.unappliedMinor, 0),
        unreconciled: aged.filter((a) => a.receiptsDisagree),
      }
    })
    .sort((a, b) => b.outstandingMinor - a.outstandingMinor)

  return { byCurrency: books, currencies: books.map((b) => b.currency) }
}

// ── Days sales outstanding ───────────────────────────────────────────

export interface BillingPeriod {
  /** A label a person recognises — "2026-07". */
  label: string
  /** Days the period covers. */
  days: number
  /** What was billed in it, minor units. Credit notes may make it zero. */
  revenueMinor: number
}

export interface Dso {
  days: number | null
  method: 'COUNTBACK'
  /** The textbook formula, for comparison only. Shown, never relied on. */
  naiveDays: number | null
  /** How many periods the countback had to consume. */
  periodsUsed: number
  says: string
}

/**
 * How long the money actually takes to arrive.
 *
 * ── Why not the formula everybody uses ───────────────────────────────
 *
 *     DSO = receivables ÷ revenue over a period × days in the period
 *
 * It is in every textbook and it lies whenever billing is not flat,
 * because the two halves of it come from different weeks. The receivable
 * on the books was created by the most recent billing. The denominator
 * is an average across the whole period, earlier and smaller months
 * included.
 *
 * On a growing book that average is dragged down by the quiet months at
 * the start, so the ratio reports a longer collection period than is
 * real — a firm that doubles headcount in a quarter watches its DSO
 * climb and goes looking for a collections problem it does not have. On
 * a shrinking book it lies the other way and flatters itself, because
 * the receivable is small while the denominator is still fat with
 * earlier months. The DSO improves on the exact quarter collections got
 * worse.
 *
 * Either way the number moves when nothing about collections has
 * changed, which makes it useless as the thing you are meant to manage
 * by.
 *
 * ── What is used instead ─────────────────────────────────────────────
 *
 * The **countback**. Take the receivable and exhaust it against actual
 * billing, most recent period first, counting the days as you go. When a
 * period's billing more than covers what is left, take the proportional
 * part of that period's days and stop.
 *
 * It answers the honest question — "how far back do I have to go before
 * the invoices I am still owed run out?" — and because the numerator and
 * the denominator come from the same weeks, growth does not move it.
 *
 * A period with no billing still consumes its days and settles nothing,
 * which is correct: a quiet month genuinely makes the receivable older.
 *
 * ── When it returns null ─────────────────────────────────────────────
 *
 * When the receivable is larger than every period of billing on record.
 * That happens on a new tenant with three months of history and on one
 * whose data import brought invoices without the billing behind them,
 * and in both cases there is no honest answer — so it returns null and
 * says why rather than showing a floor that looks like a fact.
 */
export function dso(
  receivableMinor: number,
  /** Newest period first. */
  periods: BillingPeriod[]
): Dso {
  const totalRevenue = periods.reduce((n, p) => n + Math.max(0, p.revenueMinor), 0)
  const totalDays = periods.reduce((n, p) => n + p.days, 0)
  const naiveDays =
    totalRevenue > 0 ? Math.round((receivableMinor / totalRevenue) * totalDays) : null

  if (receivableMinor <= 0) {
    return {
      days: 0,
      method: 'COUNTBACK',
      naiveDays,
      periodsUsed: 0,
      says: 'Nothing is outstanding, so nothing is taking any time to arrive.',
    }
  }

  let remaining = receivableMinor
  let days = 0
  let used = 0

  for (const p of periods) {
    if (remaining <= 0) break
    used += 1
    const revenue = Math.max(0, p.revenueMinor)

    if (revenue >= remaining) {
      days += (remaining / revenue) * p.days
      remaining = 0
      break
    }

    days += p.days
    remaining -= revenue
  }

  if (remaining > 0) {
    return {
      days: null,
      method: 'COUNTBACK',
      naiveDays,
      periodsUsed: used,
      says:
        `More is outstanding than there is billing on record to count back through — ` +
        `${periods.length} period${periods.length === 1 ? '' : 's'} does not exhaust it. ` +
        `That is a history problem, not a collections figure, so no number is shown.`,
    }
  }

  return {
    days: Math.round(days),
    method: 'COUNTBACK',
    naiveDays,
    periodsUsed: used,
    says:
      `Counted back through ${used} period${used === 1 ? '' : 's'} of real billing rather ` +
      `than divided by an average, so growth does not move it.`,
  }
}

// ── The dunning ladder ───────────────────────────────────────────────

export type DunningStep = 'COURTESY' | 'FIRST' | 'SECOND' | 'FINAL' | 'ESCALATED'

export interface Rung {
  step: DunningStep
  /** Days relative to the due date. Negative is before it falls due. */
  atDays: number
  /** False on the last rung: a person sends it, not the system. */
  automated: boolean
  to: 'AP_CONTACT' | 'AP_AND_MANAGER' | 'OUR_ACCOUNT_MANAGER'
  channel: 'EMAIL' | 'PERSON'
  /** Why this rung exists, in one sentence. */
  why: string
}

/**
 * Four letters and then a person. Never a fifth letter.
 *
 * The shape matters more than the wording. A ladder that keeps climbing
 * has one guaranteed outcome: the AP clerk writes a rule and every
 * invoice you ever send lands in a folder nobody opens, including the
 * ones they would have paid. `src/app/api/cron/loose-ends` reached the
 * same conclusion about internal digests and stops after two.
 *
 * The courtesy rung is the one that actually collects money. Most late
 * invoices in staffing are late because they were never entered, never
 * approved, or went to the wrong address — all of which are fixable in
 * the week BEFORE the due date and none of which are fixable by a demand
 * afterwards.
 */
export const LADDER: Rung[] = [
  {
    step: 'COURTESY',
    atDays: -7,
    automated: true,
    to: 'AP_CONTACT',
    channel: 'EMAIL',
    why: 'Most late invoices were never entered. A week before is when that is still cheap to fix.',
  },
  {
    step: 'FIRST',
    atDays: 7,
    automated: true,
    to: 'AP_CONTACT',
    channel: 'EMAIL',
    why: 'One AP run has passed. Usually an approver on holiday.',
  },
  {
    step: 'SECOND',
    atDays: 21,
    automated: true,
    to: 'AP_AND_MANAGER',
    channel: 'EMAIL',
    why: 'Two runs missed. The hiring manager who signed the timesheet is copied, because AP will not chase their own approver.',
  },
  {
    step: 'FINAL',
    atDays: 45,
    automated: true,
    to: 'AP_AND_MANAGER',
    channel: 'EMAIL',
    why: 'The last automated message. It says so, which is the only reason a final notice works.',
  },
  {
    step: 'ESCALATED',
    atDays: ESCALATE_AFTER_DAYS,
    automated: false,
    to: 'OUR_ACCOUNT_MANAGER',
    channel: 'PERSON',
    why: 'Past sixty days this is a decision at their end, and a decision is answered by a person.',
  },
]

export type SilenceReason =
  | 'ALL_SETTLED'
  | 'NOTHING_DUE_YET'
  | 'ALREADY_SAID'
  | 'WITH_A_PERSON'
  | 'NOT_WORTH_A_LETTER'
  | 'IN_DISPUTE'

export interface DunningSilence {
  kind: 'SILENT'
  customerId: string
  customerName: string
  reason: SilenceReason
  says: string
}

export interface DunningAction {
  kind: 'SEND'
  customerId: string
  customerName: string
  currency: string
  step: DunningStep
  automated: boolean
  to: Rung['to']
  channel: Rung['channel']
  /** Every chaseable invoice, in one message. Not one message each. */
  invoiceIds: string[]
  invoiceNumbers: string[]
  amountMinor: number
  maxDaysOverdue: number
  subject: string
  says: string
  why: string
}

/**
 * What to send this customer today, or why to say nothing.
 *
 * One message per customer, listing every invoice. Eight separate emails
 * on the same morning is not eight times the pressure; it is one filter
 * rule.
 *
 * `alreadySent` is the steps that have gone out to this customer for this
 * run of arrears. Without it the ladder repeats its top rung every day,
 * which is the failure mode this whole file is written against.
 */
export function dunningForCustomer(
  aged: AgedInvoice[],
  alreadySent: readonly DunningStep[]
): DunningAction | DunningSilence {
  const who = {
    customerId: aged[0]?.customerId ?? 'unknown',
    customerName: aged[0]?.customerName ?? 'Unknown customer',
  }

  const open = aged.filter((a) => a.outstandingMinor > 0)
  if (open.length === 0) {
    return {
      kind: 'SILENT',
      ...who,
      reason: 'ALL_SETTLED',
      says: 'Nothing outstanding. Nothing to say.',
    }
  }

  // A short payment is a question about the invoice, and a reminder
  // answers a question nobody asked. It leaves the ladder here.
  const chaseable = open.filter((a) => !a.disputed)
  if (chaseable.length === 0) {
    return {
      kind: 'SILENT',
      ...who,
      reason: 'IN_DISPUTE',
      says:
        `Everything open here is short paid. They have decided not to pay part of it, ` +
        `which is a conversation and not a reminder — it belongs to a person.`,
    }
  }

  const worth = chaseable.filter((a) => a.outstandingMinor >= CHASE_FLOOR_MINOR)
  if (worth.length === 0) {
    return {
      kind: 'SILENT',
      ...who,
      reason: 'NOT_WORTH_A_LETTER',
      says:
        `The balance is below what a chase costs in goodwill. Let it ride to the next ` +
        `invoice rather than spend a relationship on it.`,
    }
  }

  const maxDays = Math.max(...worth.map((a) => a.daysOverdue))

  // The furthest rung this customer has reached. Not one per invoice —
  // the oldest invoice sets the tone for the whole conversation.
  const due = [...LADDER].reverse().find((r) => maxDays >= r.atDays)

  if (!due) {
    return {
      kind: 'SILENT',
      ...who,
      reason: 'NOTHING_DUE_YET',
      says: `Nothing is close enough to its due date to be worth a word yet.`,
    }
  }

  if (alreadySent.includes('ESCALATED')) {
    return {
      kind: 'SILENT',
      ...who,
      reason: 'WITH_A_PERSON',
      says:
        `This is with an account manager. Nothing automated goes out once a person ` +
        `owns it — two voices on the same debt is how a client learns to answer neither.`,
    }
  }

  if (alreadySent.includes(due.step)) {
    return {
      kind: 'SILENT',
      ...who,
      reason: 'ALREADY_SAID',
      says: `The ${label(due.step)} has gone. The next one is not due yet, and repeating it teaches them to filter us.`,
    }
  }

  const amount = worth.reduce((n, a) => n + a.outstandingMinor, 0)

  return {
    kind: 'SEND',
    ...who,
    currency: worth[0].currency,
    step: due.step,
    automated: due.automated,
    to: due.to,
    channel: due.channel,
    invoiceIds: worth.map((a) => a.id),
    invoiceNumbers: worth.map((a) => a.number),
    amountMinor: amount,
    maxDaysOverdue: maxDays,
    subject: subjectOf(due.step, who.customerName, worth.length),
    says: actionSays(due.step, worth.length, maxDays),
    why: due.why,
  }
}

function label(step: DunningStep): string {
  return {
    COURTESY: 'courtesy note',
    FIRST: 'first reminder',
    SECOND: 'second reminder',
    FINAL: 'final notice',
    ESCALATED: 'escalation',
  }[step]
}

function subjectOf(step: DunningStep, customer: string, count: number): string {
  const n = `${count} invoice${count === 1 ? '' : 's'}`
  switch (step) {
    case 'COURTESY':
      return `${n} falling due next week`
    case 'FIRST':
      return `${n} now past due`
    case 'SECOND':
      return `${n} unpaid after two payment runs`
    case 'FINAL':
      return `Final notice — ${n} unpaid`
    default:
      return `${customer}: ${n} to be taken up in person`
  }
}

function actionSays(step: DunningStep, count: number, maxDays: number): string {
  if (step === 'ESCALATED') {
    return (
      `${maxDays} days out. Automated chasing stops here and an account manager picks ` +
      `it up — past sixty days somebody at their end has decided, and a fifth email ` +
      `does not change a decision.`
    )
  }
  if (step === 'COURTESY') {
    return (
      `Due in a few days. Sent early on purpose: an invoice that was never entered ` +
      `into their system can still be fixed this week and cannot be fixed afterwards.`
    )
  }
  const name = label(step)
  return (
    `${name.charAt(0).toUpperCase()}${name.slice(1)} — ${count} invoice` +
    `${count === 1 ? '' : 's'}, oldest ${maxDays} days past due.`
  )
}


// ── What has already been said ───────────────────────────────────────

/** One recorded send, as the `DunningSend` table holds it. */
export interface SentLetter {
  clientCompanyId: string
  /** COURTESY · FIRST · SECOND · FINAL · ESCALATED. Read, not trusted. */
  step: string
  sentAt: Date
  /** The invoices that letter named. */
  invoiceIds: readonly string[]
}

const STEP_SET = new Set<string>(LADDER.map((r) => r.step))

/**
 * Which rungs this customer has already been sent, for the arrears they
 * are in NOW.
 *
 * ── Why the invoices decide, and not a date window ───────────────────
 *
 * The ladder has to reset. A client chased to a final notice in March,
 * who then paid everything and fell behind again in September, is a
 * client at the start of a new conversation — resuming at "final notice"
 * because a row exists from six months ago is worse than saying nothing.
 *
 * The tempting fix is a rolling window: ignore sends older than ninety
 * days. It is wrong in both directions. A slow-paying client chased in
 * January and still unpaid in May gets the whole ladder again, which is
 * exactly the filter-rule failure. And a client who cleared and relapsed
 * inside the window never gets a first reminder at all.
 *
 * So the run of arrears is defined by the debt rather than by the
 * calendar: **a letter suppresses a rung only while at least one invoice
 * it named is still open.** When the last of them settles, that run is
 * over and the ladder starts from the bottom on whatever comes next.
 * That is also the only rule here that a person would recognise as the
 * one they follow themselves.
 *
 * A letter naming no invoices belongs to no run and suppresses nothing.
 * An unrecognised step is ignored rather than guessed at — a row saying
 * `REMINDER_3` from some future import must not silently stand in for a
 * final notice.
 */
export function stepsAlreadySent(
  sends: readonly SentLetter[],
  stillOpenInvoiceIds: ReadonlySet<string>
): Record<string, DunningStep[]> {
  const out: Record<string, DunningStep[]> = {}

  for (const s of sends) {
    if (!STEP_SET.has(s.step)) continue
    if (s.invoiceIds.length === 0) continue
    if (!s.invoiceIds.some((id) => stillOpenInvoiceIds.has(id))) continue

    const steps = out[s.clientCompanyId] ?? []
    if (!steps.includes(s.step as DunningStep)) steps.push(s.step as DunningStep)
    out[s.clientCompanyId] = steps
  }

  return out
}

/**
 * Every invoice still carrying a balance, as a set of ids.
 *
 * The companion to `stepsAlreadySent` — what "this run of arrears" means
 * in practice.
 */
export function openInvoiceIds(book: CurrencyBook): Set<string> {
  return new Set(book.invoices.filter((a) => a.outstandingMinor > 0).map((a) => a.id))
}

/**
 * A dunning run over a whole book: one decision per customer.
 *
 * `sentByCustomer` is what has already gone out, built by
 * `stepsAlreadySent` from the recorded sends. Passing an empty map means
 * "nothing has ever been said", and the ladder will climb its top rung
 * again every morning — which is the failure this whole file is written
 * against, so do it only where there genuinely is no history to read.
 */
export function dunningRun(
  book: CurrencyBook,
  sentByCustomer: Record<string, readonly DunningStep[]> = {}
): { send: DunningAction[]; silent: DunningSilence[] } {
  const byCustomer = new Map<string, AgedInvoice[]>()
  for (const a of book.invoices) {
    byCustomer.set(a.customerId, [...(byCustomer.get(a.customerId) ?? []), a])
  }

  const send: DunningAction[] = []
  const silent: DunningSilence[] = []

  for (const [customerId, theirs] of byCustomer) {
    const out = dunningForCustomer(theirs, sentByCustomer[customerId] ?? [])
    if (out.kind === 'SEND') send.push(out)
    else silent.push(out)
  }

  return {
    send: send.sort((a, b) => b.maxDaysOverdue - a.maxDaysOverdue),
    silent,
  }
}

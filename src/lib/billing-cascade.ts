/**
 * Where a billing term actually came from.
 *
 * The schema said payment terms "cascade from the MSA, overridable". That
 * was a comment and not code — nothing read the agreement, so every
 * contract got net 30 until somebody retyped it, and a client with net 45
 * in their signed agreement was silently invoiced on net 30 forever.
 *
 * Four levels, most general to most specific:
 *
 *   PLATFORM   what the system assumes when nobody has said
 *   COMPANY    what this company does by default
 *   AGREEMENT  what the signed master agreement says
 *   CONTRACT   what was agreed for this one placement
 *
 * The important part is not the precedence — that is obvious. It is that
 * every resolved value carries where it came from. When an invoice is
 * wrong, the question is which level to fix, and a bare number cannot
 * answer it. Somebody patches the invoice instead, and next month it is
 * wrong again.
 */

export type Source = 'PLATFORM' | 'COMPANY' | 'AGREEMENT' | 'CONTRACT'

export interface Resolved<T> {
  value: T
  /** Which level decided it. */
  source: Source
  /** In words, for the screen: "from your agreement with Terumo BCT". */
  because: string
  /** What the level below would have given, when something overrode it. */
  overrode: { value: T; source: Source } | null
}

/**
 * What the net days are counted from.
 *
 * All four are real arrangements, which is why this is a term and not a
 * constant. `PERIOD_END` is the default because it is what every invoice
 * raised before the column existed was counted from, so adding the term
 * moved nothing.
 */
export type TermsAnchor = 'RECEIPT_DATE' | 'INVOICE_DATE' | 'PERIOD_END' | 'APPROVAL_DATE'

export const ANCHORS: TermsAnchor[] = ['RECEIPT_DATE', 'INVOICE_DATE', 'PERIOD_END', 'APPROVAL_DATE']

export function isAnchor(x: unknown): x is TermsAnchor {
  return typeof x === 'string' && (ANCHORS as string[]).includes(x)
}

/** The system's own assumptions, used only when nobody has said otherwise. */
export const PLATFORM_DEFAULTS = {
  paymentTermsDays: 30,
  currency: 'USD',
  /**
   * Where the clock starts when nobody has said. The end of the work
   * period, because that is what the arithmetic did before anybody could
   * choose — so an agreement written before the term existed keeps the
   * due dates it already had.
   */
  paymentTermsFrom: 'PERIOD_END' as TermsAnchor,
  /** Whether an invoice must quote a purchase order to be payable. */
  poRequired: false,
} as const

export interface Level<T> {
  source: Source
  value: T | null | undefined
  /** How to describe this level when it wins. */
  label: string
}

/**
 * Pick the most specific level that actually said something.
 *
 * Null and undefined both mean "did not say". Zero does not — a zero-day
 * payment term is due on receipt, which is a real arrangement, and
 * treating it as absent would silently push it to net 30.
 */
export function resolve<T>(levels: Level<T>[], platform: T, platformLabel: string): Resolved<T> {
  const order: Source[] = ['CONTRACT', 'AGREEMENT', 'COMPANY', 'PLATFORM']
  const said = levels.filter((l) => l.value !== null && l.value !== undefined)

  const sorted = said
    .slice()
    .sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source))

  if (sorted.length === 0) {
    return {
      value: platform,
      source: 'PLATFORM',
      because: platformLabel,
      overrode: null,
    }
  }

  const winner = sorted[0]
  const next = sorted[1]

  return {
    value: winner.value as T,
    source: winner.source,
    because: winner.label,
    // Only counts as an override when the value below actually differs.
    // Reporting "overrode net 30 with net 30" is noise that trains people
    // to ignore the field.
    overrode:
      next && next.value !== winner.value
        ? { value: next.value as T, source: next.source }
        : next === undefined && winner.source !== 'PLATFORM' && winner.value !== platform
          ? { value: platform, source: 'PLATFORM' }
          : null,
  }
}

// ── The three that matter ─────────────────────────────────────────────

export interface CascadeInputs {
  company: { paymentTermsDays?: number | null; currency?: string | null; name: string }
  agreement: {
    paymentTermsDays?: number | null
    currency?: string | null
    /**
     * Where the days are counted from. Two levels rather than three:
     * `Company` carries no anchor and is not going to. Payment terms are
     * negotiated in an agreement and varied on a placement, and a
     * company-wide "we always count from receipt" is a knob nobody has
     * asked for — the kind that took the 2017 cycle engine to four
     * thousand commits.
     */
    paymentTermsFrom?: string | null
    counterpartyName: string
  } | null
  contract: {
    paymentTermsDays?: number | null
    currency?: string | null
    paymentTermsFrom?: string | null
  } | null
}

export interface BillingTerms {
  paymentTermsDays: Resolved<number>
  currency: Resolved<string>
  paymentTermsFrom: Resolved<TermsAnchor>
}

export function resolveBillingTerms(input: CascadeInputs): BillingTerms {
  const agreementLabel = input.agreement
    ? `from your agreement with ${input.agreement.counterpartyName}`
    : ''

  return {
    paymentTermsDays: resolve<number>(
      [
        { source: 'CONTRACT', value: input.contract?.paymentTermsDays, label: 'set on this contract' },
        { source: 'AGREEMENT', value: input.agreement?.paymentTermsDays, label: agreementLabel },
        { source: 'COMPANY', value: input.company.paymentTermsDays, label: `${input.company.name}'s default` },
      ],
      PLATFORM_DEFAULTS.paymentTermsDays,
      'nobody has set payment terms, so net 30 is assumed'
    ),
    currency: resolve<string>(
      [
        { source: 'CONTRACT', value: input.contract?.currency, label: 'set on this contract' },
        { source: 'AGREEMENT', value: input.agreement?.currency, label: agreementLabel },
        { source: 'COMPANY', value: input.company.currency, label: `${input.company.name}'s default` },
      ],
      PLATFORM_DEFAULTS.currency,
      'nobody has set a currency, so US dollars is assumed'
    ),
    paymentTermsFrom: resolve<TermsAnchor>(
      [
        {
          source: 'CONTRACT',
          value: isAnchor(input.contract?.paymentTermsFrom) ? input.contract!.paymentTermsFrom as TermsAnchor : null,
          label: 'set on this contract',
        },
        {
          source: 'AGREEMENT',
          value: isAnchor(input.agreement?.paymentTermsFrom) ? input.agreement!.paymentTermsFrom as TermsAnchor : null,
          label: agreementLabel,
        },
      ],
      PLATFORM_DEFAULTS.paymentTermsFrom,
      'nobody has said what the days run from, so the end of the work period is assumed'
    ),
  }
}

// ── When it is actually due ───────────────────────────────────────────
//
// `dueAt = period.end + paymentTerms` was what the invoice route did, and
// it is wrong against almost every agreement anybody signs. NET 30 runs
// from receipt of the invoice. A period ending the 31st is invoiced on
// the 6th, once the hours are in and approved, and counting from the 31st
// claims it due six days early — so we chase a client who is not late,
// and every days-sales-outstanding figure in the company is overstated by
// however long it takes us to raise the bill.
//
// ── Why a clock can fail to start ─────────────────────────────────────
//
// Two of the four anchors depend on something the client does. An
// invoice on RECEIPT_DATE terms has, at the moment it is raised,
// definitionally not been received; one on APPROVAL_DATE has not been
// approved. The due date is then not late, not early, and not thirty
// days from today — it is **unknown**, and the only honest thing to
// print is what it is waiting for.
//
// Defaulting to the invoice date "for now" is what a reasonable person
// does here, and it is exactly the flattering guess this refuses: the
// invoice would age, turn up in a dunning run, and a client would get a
// reminder for a bill whose payment clock our own contract says has not
// started.
//
// So `dueOn` returns the earliest the invoice could become due, together
// with `clockStarted: false` and a sentence. Every reader — the aging,
// the dunning ladder, the screen — asks whether the clock has started
// before it calls anything late.
//
// ── And why a weekend does not move it. Decided 2026-09-17 ────────────
//
// A company can now say which way its cycle dates move off a day nobody
// works (`lib/cycle-shift`), and this date is deliberately not one of
// them. It was never shifted; the difference is that the silence is now
// a decision with a reason rather than an omission nobody had noticed.
//
// Net 30 is thirty calendar days. It is a term of an agreement two firms
// signed, not an operating date either of them schedules, and the two
// belong to different owners: a cycle date says when we intend to do
// something, a due date says when the money was promised. Moving a
// Saturday due date to the Friday shortens a client's terms by two days
// against its own contract; moving it to the Monday lengthens ours. A
// firm that pays late on a weekend is late by the agreement's own
// arithmetic, and dressing that up as a calendar rule would make every
// aging bucket in the system disagree with the paper behind it.
//
// If an agreement ever says "the next working day" — some do — that is a
// term on the agreement and belongs beside `paymentTerms` and
// `paymentTermsFrom`, read from the contract, not from whichever party's
// company settings happen to be loaded. That is a schema request and not
// a silent reuse of the cycle setting.

export interface DueInput {
  anchor: TermsAnchor
  /** Net days. Zero is real: due on the anchor itself. */
  days: number
  /** The last day of the work period being billed. */
  periodEnd: Date
  /** The day we raised it. */
  issuedAt: Date
  /** The day the client confirmed it landed. Null until they say. */
  receivedAt?: Date | null
  /** The day the client approved it for payment. Null until they do. */
  approvedAt?: Date | null
}

export interface DueVerdict {
  /** The due date, or the earliest it could be where the clock has not started. */
  dueAt: Date
  /** The date the days were counted from, null where that date has not happened. */
  anchoredOn: Date | null
  /**
   * False where the anchor's own date has not happened yet. A false here
   * means `dueAt` is the earliest possible date and nothing may call the
   * invoice late.
   */
  clockStarted: boolean
  /** What the clock is waiting for, in words. Null where it is running. */
  waitingFor: string | null
  /** The whole thing as a person would say it. */
  says: string
}

const A_DAY = 86_400_000

const plus = (d: Date, days: number): Date => new Date(d.getTime() + days * A_DAY)
const said = (d: Date): string => d.toISOString().slice(0, 10)

/** What each anchor is called on a screen. */
export function anchorWords(anchor: TermsAnchor): string {
  switch (anchor) {
    case 'RECEIPT_DATE': return 'the day the client received it'
    case 'INVOICE_DATE': return 'the day it was issued'
    case 'PERIOD_END': return 'the end of the work period'
    case 'APPROVAL_DATE': return 'the day the client approved it'
  }
}

/**
 * When this invoice is due, and whether that is yet knowable.
 *
 * No database, no Prisma row, no rounding: four dates and a number of
 * days. Every place that needs a due date asks this one, so an invoice,
 * an aging bucket and a dunning letter cannot hold three opinions about
 * when the money was promised.
 */
export function dueOn(input: DueInput): DueVerdict {
  const { anchor, days } = input

  const from =
    anchor === 'PERIOD_END' ? input.periodEnd
    : anchor === 'INVOICE_DATE' ? input.issuedAt
    : anchor === 'RECEIPT_DATE' ? input.receivedAt ?? null
    : input.approvedAt ?? null

  if (from) {
    const dueAt = plus(from, days)
    return {
      dueAt,
      anchoredOn: from,
      clockStarted: true,
      waitingFor: null,
      says:
        days === 0
          ? `Due on ${said(dueAt)} — on ${anchorWords(anchor)}.`
          : `Due ${said(dueAt)} — net ${days} from ${anchorWords(anchor)}, ${said(from)}.`,
    }
  }

  // The clock has not started. The earliest it could start is today —
  // the day we raised the invoice — so that is the earliest this could
  // possibly fall due. It is a floor and never a due date, which is what
  // `clockStarted: false` says to everything downstream.
  const waitingFor =
    anchor === 'RECEIPT_DATE'
      ? 'the client to confirm they received it'
      : 'the client to approve it'

  const missing =
    anchor === 'RECEIPT_DATE' ? 'nobody has confirmed receipt' : 'nobody has approved it'

  return {
    dueAt: plus(input.issuedAt, days),
    anchoredOn: null,
    clockStarted: false,
    waitingFor,
    says:
      `Not payable yet: net ${days} runs from ${anchorWords(anchor)}, and ${missing}. ` +
      `The earliest this could fall due is ${said(plus(input.issuedAt, days))}.`,
  }
}

// ── Paying early, and what that is worth ──────────────────────────────
//
// "2/10 net 30" is the oldest discount in commerce: two per cent off if
// you settle within ten days, otherwise the whole thing in thirty. A
// staffing firm's working capital problem is the gap between paying
// consultants on Friday and being paid by the client in sixty days, so a
// rung that pulls cash in three weeks early is often worth more than the
// margin on the placement.
//
// ── Where the rungs live ──────────────────────────────────────────────
//
// The agreement carries the standing ladder — what we offer this client
// on everything. An order overrides it for its own spend, because a
// project negotiated at a different rate is an ordinary thing and
// retyping the agreement to express it would change every other invoice
// under it.
//
// Override, never merge. A ladder built half from the agreement and half
// from the order is a set of terms nobody signed: take 2/10 from the
// order and 1/20 from the agreement and you have offered a client a rung
// that appears in neither document.
//
// ── The days count from the same day the net terms do ─────────────────
//
// "Within ten days" of what? Of whatever `paymentTermsFrom` says. A
// discount for paying within ten days of an invoice we cannot confirm
// was received is not a term anybody agreed to, and holding a second
// anchor here is how the two come to disagree.
//
// ── Off the work, not off the tax ─────────────────────────────────────
//
// The discount comes off the net amount. Tax is a debt to an authority
// and not to us: reducing it because a client paid early understates a
// remittance, which surfaces two years later with interest. Where the
// regime is one that adjusts its base for a prompt-payment discount —
// VAT and GST do, US sales tax does not — this says so rather than
// adjusting a rate it has no business adjusting.

export type RungOwner = 'AGREEMENT' | 'WORK_ORDER'

// Two owners, not three. It was three while the same commercial document
// existed as two rows — a sell-side `SalesOrder` and a buy-side
// `PurchaseOrder` — and a rung could in principle claim both. The merge
// to `WorkOrder` made them one row, so the question a reader asks is now
// only "the standing terms, or this order's own?".

/** A discount row as stored: exactly one owner, a window and a rate. */
export interface DiscountRow {
  id: string
  msaId?: string | null
  workOrderId?: string | null
  /** Days from the anchor. Zero is real — settlement on the day. */
  withinDays: number
  /** Basis points off the net. 300 is three per cent. */
  discountBps: number
  note?: string | null
}

export interface OwnerVerdict {
  ok: boolean
  owner: RungOwner | null
  says: string
}

/**
 * Which document a rung belongs to.
 *
 * Exactly one of the two, and the database cannot say so: there are no
 * migration files here and therefore no CHECK constraint, so the rule
 * lives where the rows are read. It refuses both ways rather than
 * guessing — a rung on nothing would silently apply to everything, and a
 * rung on two documents would be counted twice by whoever asked second.
 */
export function ownerOf(row: DiscountRow): OwnerVerdict {
  const held: [RungOwner, string | null | undefined][] = [
    ['AGREEMENT', row.msaId],
    ['WORK_ORDER', row.workOrderId],
  ]
  const owners = held.filter(([, id]) => !!id).map(([o]) => o)

  if (owners.length === 1) {
    return { ok: true, owner: owners[0], says: `${owners[0].toLowerCase().replace('_', ' ')}` }
  }

  if (owners.length === 0) {
    return {
      ok: false,
      owner: null,
      says:
        'This early-payment rung is not attached to anything — no agreement and no order. ' +
        'Attach it to the document it was agreed in; a rung on nothing would apply to ' +
        'everything.',
    }
  }

  return {
    ok: false,
    owner: null,
    says:
      `This early-payment rung is attached to ${owners.length} documents at once ` +
      `(${owners.map((o) => o.toLowerCase().replace('_', ' ')).join(' and ')}). It was agreed ` +
      `in one of them. Which?`,
  }
}

export interface Rung {
  id: string
  withinDays: number
  discountBps: number
  note: string | null
  owner: RungOwner
}

export interface Ladder {
  /** Shortest window first, which is also best-rate-first in practice. */
  rungs: Rung[]
  source: 'AGREEMENT' | 'ORDER' | 'NONE'
  says: string
}

/** "2%" · "1.5%" · "0.75%" */
export function rateWords(bps: number): string {
  const pct = bps / 100
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0$/, '')}%`
}

const windowWords = (days: number): string =>
  days === 0 ? 'paid on the day' : `paid within ${days} day${days === 1 ? '' : 's'}`

/**
 * The ladder actually in force, and where it came from.
 *
 * Rows whose ownership is unclear are dropped rather than guessed at,
 * because a rung that cannot say which document it came from cannot be
 * defended when a client asks why they were charged what they were
 * charged.
 */
export function ladderFor(input: {
  agreement?: DiscountRow[]
  order?: DiscountRow[]
}): Ladder {
  const clean = (rows: DiscountRow[]): Rung[] =>
    rows
      .map((r) => ({ row: r, verdict: ownerOf(r) }))
      .filter(({ verdict }) => verdict.ok)
      .map(({ row, verdict }) => ({
        id: row.id,
        withinDays: row.withinDays,
        discountBps: row.discountBps,
        note: row.note ?? null,
        owner: verdict.owner!,
      }))
      .sort((a, b) => a.withinDays - b.withinDays || b.discountBps - a.discountBps)

  const order = clean(input.order ?? [])
  const agreement = clean(input.agreement ?? [])

  if (order.length > 0) {
    return {
      rungs: order,
      source: 'ORDER',
      says:
        `${order.map((r) => `${rateWords(r.discountBps)} ${windowWords(r.withinDays)}`).join(', ')} — ` +
        'agreed on this order, which replaces the standing terms for its own spend.',
    }
  }

  if (agreement.length > 0) {
    return {
      rungs: agreement,
      source: 'AGREEMENT',
      says: `${agreement.map((r) => `${rateWords(r.discountBps)} ${windowWords(r.withinDays)}`).join(', ')} — from the agreement.`,
    }
  }

  return { rungs: [], source: 'NONE', says: 'No early-payment discount was agreed.' }
}

export interface DiscountOffer {
  /** The best rung this payment date qualifies for. Null where none does. */
  rung: Rung | null
  /** Days from the anchor to the day being paid. Null where the clock has not started. */
  daysTaken: number | null
  /** Off the net. Zero where no rung applies. */
  discountMinor: number
  /** What settles the invoice on that day: net, less the discount, plus the tax in full. */
  payMinor: number
  says: string
  /** True where the tax base may move with the discount and a person has to decide. */
  taxNeedsAThought: boolean
}

export interface DiscountInput {
  ladder: Ladder
  /** The day the terms count from. Null where the clock has not started. */
  anchoredOn: Date | null
  /** The day somebody is proposing to pay. */
  payingOn: Date
  /** The work, in minor units, before tax. */
  netMinor: number
  /** Tax determined on the invoice, in minor units. */
  taxMinor?: number
  /** US_SALES_TAX · EU_VAT · UK_VAT · IN_GST · NONE, where it was determined. */
  taxRegime?: string | null
}

const money = (minor: number): string => `${(minor / 100).toFixed(2)}`

/**
 * What settles this invoice on a given day.
 *
 * Every rung whose window still covers the day qualifies, and the best
 * rate of those wins — a client inside the ten-day window is also inside
 * the twenty-day one, and offering them the worse of the two because it
 * appeared later in a list is the sort of quiet short-changing nobody
 * ever queries and everybody remembers.
 */
export function discountOn(input: DiscountInput): DiscountOffer {
  const tax = input.taxMinor ?? 0
  const adjusts = ['EU_VAT', 'UK_VAT', 'IN_GST'].includes(input.taxRegime ?? '')
  const none = (says: string): DiscountOffer => ({
    rung: null,
    daysTaken: null,
    discountMinor: 0,
    payMinor: input.netMinor + tax,
    says,
    taxNeedsAThought: false,
  })

  if (input.ladder.rungs.length === 0) return none(input.ladder.says)

  if (!input.anchoredOn) {
    return none(
      'The discount window counts from the same day the payment terms do, and that day has ' +
      'not happened yet. Nothing can be offered until it has.'
    )
  }

  const days = Math.floor(
    (new Date(input.payingOn).setUTCHours(0, 0, 0, 0) -
      new Date(input.anchoredOn).setUTCHours(0, 0, 0, 0)) / A_DAY
  )

  if (days < 0) {
    return none('That day is before the discount window opens.')
  }

  const qualifying = input.ladder.rungs.filter((r) => days <= r.withinDays)
  if (qualifying.length === 0) {
    const last = input.ladder.rungs[input.ladder.rungs.length - 1]
    return {
      ...none(
        `Too late for a discount: the last rung was ${rateWords(last.discountBps)} for ` +
        `${windowWords(last.withinDays)} and this is day ${days}. The full amount is due.`
      ),
      daysTaken: days,
    }
  }

  const rung = qualifying.reduce((best, r) => (r.discountBps > best.discountBps ? r : best))
  const discountMinor = Math.round((input.netMinor * rung.discountBps) / 10_000)
  const payMinor = input.netMinor - discountMinor + tax

  const taxWords = tax === 0
    ? ''
    : adjusts
      ? ` The tax of ${money(tax)} is unchanged here — under this regime the taxable amount may ` +
        'follow what is actually paid, which is a call for whoever files the return.'
      : ` The tax of ${money(tax)} is unchanged: it is owed to an authority whatever we agree.`

  return {
    rung,
    daysTaken: days,
    discountMinor,
    payMinor,
    says:
      `${rateWords(rung.discountBps)} off for ${windowWords(rung.withinDays)} — ` +
      `${money(discountMinor)} off ${money(input.netMinor)} of work, so ${money(payMinor)} settles it.` +
      taxWords,
    taxNeedsAThought: adjusts && tax > 0 && discountMinor > 0,
  }
}

/**
 * The last day a discount is still available, and which one.
 *
 * What an AP clerk actually asks: not "what is the rate" but "by when".
 */
export function discountDeadline(
  ladder: Ladder,
  anchoredOn: Date | null
): { by: Date; rung: Rung } | null {
  if (!anchoredOn || ladder.rungs.length === 0) return null
  const best = ladder.rungs.reduce((a, b) => (b.discountBps > a.discountBps ? b : a))
  return { by: plus(anchoredOn, best.withinDays), rung: best }
}

/**
 * Said the way somebody would say it, for the screen.
 *
 * "Net 45, from your agreement with Terumo BCT" beats "45" every time an
 * invoice is queried, because it names the document to go and read.
 */
export function explain(r: Resolved<number>): string {
  return `Net ${r.value}, ${r.because}`
}

/**
 * When an override is worth mentioning.
 *
 * Only a contract departing from the signed agreement is a concern. That
 * is somebody having agreed something they may not have meant to, and it
 * is the commonest way money goes missing quietly.
 *
 * An agreement departing from a company default is not a concern at all —
 * the agreement is the thing that was actually signed, and overriding a
 * default is exactly its job. Flagging that would put a warning on every
 * negotiated contract a company has, which teaches people to ignore the
 * warning that matters.
 */
export function overrideConcern(r: Resolved<number>): { concern: boolean; note: string } | null {
  if (!r.overrode) return null

  // A default being superseded by something signed is ordinary.
  if (r.source !== 'CONTRACT') return null

  const worse = r.value > r.overrode.value
  return {
    concern: worse,
    note: worse
      ? `This contract is on net ${r.value} where ${sourceWords(r.overrode.source)} says net ${r.overrode.value}. You wait ${r.value - r.overrode.value} days longer to be paid than you agreed to.`
      : `This contract is on net ${r.value}, better than the net ${r.overrode.value} in ${sourceWords(r.overrode.source)}.`,
  }
}

function sourceWords(s: Source): string {
  switch (s) {
    case 'AGREEMENT': return 'the master agreement'
    case 'COMPANY': return 'your company default'
    case 'CONTRACT': return 'the contract'
    case 'PLATFORM': return 'the system default'
  }
}

// ═════════════════════════════════════════════════════════════════════
// PARTNER FUNCTIONS — who is who on an invoice
// ═════════════════════════════════════════════════════════════════════
//
// A large client signs in one entity, is billed through a shared services
// center in another country, has the work done at a third site, and pays
// from a fourth. Treating those as one party is how an invoice reaches
// the wrong address and ages ninety days before anybody notices.
//
// SAP calls these partner functions and there are four that matter here:
//
//   SOLD_TO   who signed the agreement this is issued under
//   BILL_TO   where the invoice is sent
//   SHIP_TO   where the work was actually done — which decides the tax
//   PAYER     who settles it, where that is not the bill-to
//
// All four default to the client on the agreement, which is the ordinary
// case and must not need four rows of setup. The point of resolving them
// explicitly is that every one carries where it came from, so when an
// invoice goes to the wrong place the question "which record to fix" has
// an answer.

export type PartnerFunction = 'SOLD_TO' | 'BILL_TO' | 'SHIP_TO' | 'PAYER'

/** Where a partner function was decided. Most specific first. */
export type PartnerSource = 'CONTRACT' | 'ENGAGEMENT' | 'AGREEMENT'

export interface Party {
  id: string
  name: string
}

/**
 * Where work is done. Carries the country and, in the US and India, the
 * state — because place of supply is a fact about a location and not
 * about a company.
 */
export interface Place extends Party {
  country: string
  /** ISO 3166-2 subdivision, where the country taxes by one. */
  state?: string | null
}

export interface ResolvedPartner<T extends Party> {
  function: PartnerFunction
  party: T
  source: PartnerSource
  because: string
  /** True where this is simply the agreement's client with no override. */
  isDefault: boolean
}

export interface PartnerInputs {
  /** The client on the master agreement. The default for all four. */
  agreementClient: Party
  /** Set on the engagement — a shared services center, usually. */
  engagement?: {
    soldTo?: Party | null
    billTo?: Party | null
    shipTo?: Place | null
    payer?: Party | null
  } | null
  /** Set on the individual contract, which beats the engagement. */
  contract?: {
    soldTo?: Party | null
    billTo?: Party | null
    shipTo?: Place | null
    payer?: Party | null
  } | null
  /**
   * Where the agreement itself names a place of performance. Used only
   * for the ship-to, and only when nothing more specific said.
   */
  agreementPlace?: Place | null
}

export interface PartnerFunctions {
  soldTo: ResolvedPartner<Party>
  billTo: ResolvedPartner<Party>
  /**
   * Null where nobody has said where the work was done. Not defaulted to
   * the client's registered address: an invoice taxed at the wrong place
   * of supply is a liability, and guessing the site is exactly how that
   * happens. `taxFor` refuses rather than inventing a rate.
   */
  shipTo: ResolvedPartner<Place> | null
  payer: ResolvedPartner<Party>
  /** True where any of the four departs from the agreement's client. */
  split: boolean
  says: string
}

function pick<T extends Party>(
  fn: PartnerFunction,
  contract: T | null | undefined,
  engagement: T | null | undefined,
  fallback: T | null,
  fallbackWords: string
): ResolvedPartner<T> | null {
  if (contract) {
    return {
      function: fn,
      party: contract,
      source: 'CONTRACT',
      because: `set on this contract`,
      isDefault: false,
    }
  }
  if (engagement) {
    return {
      function: fn,
      party: engagement,
      source: 'ENGAGEMENT',
      because: `set for this engagement`,
      isDefault: false,
    }
  }
  if (!fallback) return null
  return {
    function: fn,
    party: fallback,
    source: 'AGREEMENT',
    because: fallbackWords,
    isDefault: true,
  }
}

/**
 * Who is who on this invoice, and why.
 *
 * The contract beats the engagement beats the agreement, which is the
 * same shape as the payment-terms cascade above and for the same reason:
 * the most specific thing somebody actually said wins.
 */
export function partnerFunctions(i: PartnerInputs): PartnerFunctions {
  const client = i.agreementClient
  const words = `nobody named one, so it is ${client.name} from the agreement`

  const soldTo = pick('SOLD_TO', i.contract?.soldTo, i.engagement?.soldTo, client, words)!
  const billTo = pick('BILL_TO', i.contract?.billTo, i.engagement?.billTo, client, words)!
  const payer = pick('PAYER', i.contract?.payer, i.engagement?.payer, client, words)!

  // The ship-to has no default. A place of supply nobody stated is not
  // the client's head office, and inventing one decides a tax question
  // that has legal consequences.
  const shipTo = pick<Place>(
    'SHIP_TO',
    i.contract?.shipTo,
    i.engagement?.shipTo,
    i.agreementPlace ?? null,
    `the place of performance on the agreement`
  )

  const split =
    !soldTo.isDefault || !billTo.isDefault || !payer.isDefault

  return {
    soldTo,
    billTo,
    shipTo,
    payer,
    split,
    says: split
      ? `Sold to ${soldTo.party.name}, billed to ${billTo.party.name}, settled by ` +
        `${payer.party.name}. They are not all the same company, which is ordinary at ` +
        `this size and is the commonest reason an invoice ages without anybody chasing it.`
      : `${client.name} throughout — signs, is billed, and pays.`,
  }
}

/**
 * Whether several contracts may go on one invoice.
 *
 * Consolidated billing is the ordinary case: one sales order for a
 * five-person project produces five sell contracts and one invoice a
 * month. What it may never do is cross a bill-to, a currency or a payer —
 * an invoice addressed to two companies is a document neither of them
 * will post.
 */
export interface ConsolidationCandidate {
  sellContractId: string
  billToId: string
  billToName: string
  payerId: string
  currency: string
}

export interface ConsolidationVerdict {
  ok: boolean
  /** The contracts that may share one invoice. Empty where none may. */
  together: string[]
  /** Why not, in a sentence somebody can act on. */
  says: string
}

export function mayConsolidate(rows: ConsolidationCandidate[]): ConsolidationVerdict {
  if (rows.length === 0) {
    return { ok: false, together: [], says: 'Nothing to invoice.' }
  }

  const billTos = [...new Set(rows.map((r) => r.billToId))]
  const payers = [...new Set(rows.map((r) => r.payerId))]
  const currencies = [...new Set(rows.map((r) => r.currency.toUpperCase()))]

  if (billTos.length > 1) {
    const names = [...new Set(rows.map((r) => r.billToName))]
    return {
      ok: false,
      together: [],
      says:
        `These contracts are billed to ${names.join(' and ')}. One invoice can only be ` +
        `addressed to one company — raise one per bill-to rather than a document neither ` +
        `of them will accept.`,
    }
  }
  if (payers.length > 1) {
    return {
      ok: false,
      together: [],
      says:
        `These contracts are settled by different payers. Consolidating them produces an ` +
        `invoice that two AP departments each think belongs to the other.`,
    }
  }
  if (currencies.length > 1) {
    return {
      ok: false,
      together: [],
      says:
        `These contracts bill in ${currencies.join(' and ')}. A total across two currencies ` +
        `is a total of nothing.`,
    }
  }

  return {
    ok: true,
    together: rows.map((r) => r.sellContractId),
    says:
      `${rows.length} contract${rows.length === 1 ? '' : 's'} to ${rows[0].billToName} in ` +
      `${currencies[0]}, on one invoice.`,
  }
}

// ── Self-billing ──────────────────────────────────────────────────────
//
// Some clients — and every large VMS — issue the invoice themselves from
// the timesheets they approved, and send it to us. The document is real,
// the money is real, and the number on it is THEIRS.
//
// The failure this guards against: raising our own invoice alongside
// theirs. Two documents for one debt means the client posts one and
// ignores the other, we chase the one they ignored, and the receipt when
// it arrives matches neither number.

export interface SelfBillingInput {
  /** True where the client issues the document, not us. */
  selfBilled: boolean
  /** Their number for it, where they have sent one. */
  clientDocumentNumber?: string | null
}

export interface SelfBillingVerdict {
  selfBilled: boolean
  /** True where we may allocate a number from our own sequence. */
  mayNumberOurselves: boolean
  /** The number to carry on the record. Null where we do not have theirs yet. */
  number: string | null
  says: string
}

export function selfBilling(i: SelfBillingInput): SelfBillingVerdict {
  if (!i.selfBilled) {
    return {
      selfBilled: false,
      mayNumberOurselves: true,
      number: null,
      says: 'We raise this invoice, so it takes the next number in our own sequence.',
    }
  }

  if (!i.clientDocumentNumber || !i.clientDocumentNumber.trim()) {
    return {
      selfBilled: true,
      mayNumberOurselves: false,
      number: null,
      says:
        'This client self-bills — they raise the document from the hours they approved. ' +
        'We do not number it ourselves: two numbers for one debt means they post one, ' +
        'ignore the other, and the receipt matches neither. Record it when their ' +
        'number arrives.',
    }
  }

  return {
    selfBilled: true,
    mayNumberOurselves: false,
    number: i.clientDocumentNumber.trim(),
    says:
      `Self-billed by the client as ${i.clientDocumentNumber.trim()}. Their number, ` +
      `carried as ours, so the receipt and the chase both use the reference they hold.`,
  }
}

// ═════════════════════════════════════════════════════════════════════
// TAX DETERMINATION — place of supply, rate, and withholding
// ═════════════════════════════════════════════════════════════════════
//
// ── What this is, and firmly is not ──────────────────────────────────
//
// Not a tax engine and not advice. It is a rule table and some
// arithmetic: given where the supplier is, where the work was done, and
// what each side is registered as, decide which regime applies, which
// rate the table holds, and what the line comes to.
//
// The whole value is in the refusals. Where the place of supply is
// unknowable — no ship-to, no state on a US invoice — it returns no rate
// and says why. A plausible zero is the worst possible output here,
// because an under-taxed invoice is a liability that surfaces two years
// later with interest, and nobody audits a number that looked fine.
//
// ── The regimes ──────────────────────────────────────────────────────
//
// US        sales and use tax, by state, destination-based. Most states
//           do not tax professional or staffing services at all; a few
//           do, and they are listed. A state not in the table is not
//           assumed either way.
// EU        VAT. Cross-border B2B with both VAT numbers is reverse
//           charged to the customer. Same member state is that state's
//           own rate.
// UK        VAT, twenty per cent domestic, outside scope on export.
// IN        GST. Same state splits into CGST and SGST; different states
//           is IGST at the same total. Export of services is zero rated.
//
// Anything else returns UNKNOWN_JURISDICTION. Adding a country is adding
// a row to a table, which is a deliberate act by somebody who checked.

export type TaxRegime = 'US_SALES_TAX' | 'EU_VAT' | 'UK_VAT' | 'IN_GST' | 'NONE'

export type TaxOutcome =
  /** A rate applies and is on the line. */
  | 'TAXABLE'
  /** In scope, and the rate is genuinely zero — an export, usually. */
  | 'ZERO_RATED'
  /** The customer accounts for it, not us. */
  | 'REVERSE_CHARGE'
  /** The supply is outside the taxing country altogether. */
  | 'OUT_OF_SCOPE'
  /** Not enough is known to say. No rate, and the reason is named. */
  | 'UNKNOWN'

export interface TaxComponent {
  /** "VAT", "IGST", "CGST", "SGST", "State sales tax". */
  name: string
  /** Basis points. 2000 = 20%. */
  rateBps: number
  amountMinor: number
}

export interface TaxVerdict {
  regime: TaxRegime
  outcome: TaxOutcome
  /** Total rate in basis points across every component. Null when UNKNOWN. */
  rateBps: number | null
  /** Split out, because an Indian invoice must show CGST and SGST apart. */
  components: TaxComponent[]
  /** Tax on the taxable amount, minor units. Null when UNKNOWN. */
  taxMinor: number | null
  /** What the customer pays: net plus tax. Null when UNKNOWN. */
  grossMinor: number | null
  /** The state or country the supply is treated as made in. */
  placeOfSupply: string | null
  /** The rule that decided it, named so a person can go and read it. */
  basis: string
  says: string
}

export interface TaxParty {
  /** ISO 3166-1 alpha-2. */
  country: string
  /** ISO 3166-2 subdivision code without the country prefix — "CT", "MH". */
  state?: string | null
  /** VAT / GST registration, where they hold one. */
  taxId?: string | null
}

export interface TaxInput {
  /** Us. Where we are registered to charge. */
  supplier: TaxParty
  /**
   * Where the work was done. Null where nobody said, which is the
   * commonest reason this refuses.
   */
  placeOfPerformance: TaxParty | null
  /** Who is billed. Used for reverse charge and for export tests. */
  customer: TaxParty
  /** The net amount of the line, minor units. */
  netMinor: number
}

/**
 * EU member states and their standard VAT rate, in basis points.
 *
 * Standard rates only. Staffing and professional services take the
 * standard rate in every member state; the reduced rates are for goods
 * and a short list of services that this product does not sell.
 */
const EU_STANDARD_BPS: Record<string, number> = {
  AT: 2000, BE: 2100, BG: 2000, HR: 2500, CY: 1900, CZ: 2100,
  DK: 2500, EE: 2200, FI: 2550, FR: 2000, DE: 1900, GR: 2400,
  HU: 2700, IE: 2300, IT: 2200, LV: 2100, LT: 2100, LU: 1700,
  MT: 1800, NL: 2100, PL: 2300, PT: 2300, RO: 1900, SK: 2300,
  SI: 2200, ES: 2100, SE: 2500,
}

/**
 * US states that tax staffing or employment services, and at what rate.
 *
 * Most states do not tax professional services at all. These are the ones
 * that specifically reach staffing, help supply or employment services.
 * The rate is the state rate; local rates are added by the firm's own
 * table, which is why every result says the local part is not in it.
 *
 * A state absent from this map is NOT_TAXED with that stated as the
 * reason, rather than a silent zero — the difference matters when
 * somebody asks why an invoice carried no tax.
 */
const US_SERVICE_TAX_BPS: Record<string, { bps: number; basis: string }> = {
  CT: { bps: 100, basis: 'Connecticut taxes employment and personnel services at a special 1% rate' },
  OH: { bps: 575, basis: 'Ohio taxes employment services as an enumerated taxable service' },
  PA: { bps: 600, basis: 'Pennsylvania taxes help supply services' },
  WV: { bps: 600, basis: 'West Virginia taxes services generally unless exempted' },
  SD: { bps: 420, basis: 'South Dakota taxes services generally' },
  NM: { bps: 488, basis: 'New Mexico gross receipts tax reaches services' },
  HI: { bps: 400, basis: 'Hawaii general excise tax reaches services' },
}

/** Whether a country is inside the EU VAT area for these purposes. */
function isEu(country: string): boolean {
  return country.toUpperCase() in EU_STANDARD_BPS
}

function components(name: string, bps: number, netMinor: number): TaxComponent[] {
  return [{ name, rateBps: bps, amountMinor: Math.round((netMinor * bps) / 10_000) }]
}

function finish(
  regime: TaxRegime,
  outcome: TaxOutcome,
  comps: TaxComponent[],
  netMinor: number,
  placeOfSupply: string | null,
  basis: string,
  says: string
): TaxVerdict {
  const rateBps = comps.reduce((n, c) => n + c.rateBps, 0)
  const taxMinor = comps.reduce((n, c) => n + c.amountMinor, 0)
  return {
    regime,
    outcome,
    rateBps,
    components: comps,
    taxMinor,
    grossMinor: netMinor + taxMinor,
    placeOfSupply,
    basis,
    says,
  }
}

function unknown(regime: TaxRegime, basis: string, says: string): TaxVerdict {
  return {
    regime,
    outcome: 'UNKNOWN',
    rateBps: null,
    components: [],
    taxMinor: null,
    grossMinor: null,
    placeOfSupply: null,
    basis,
    says,
  }
}

/**
 * What tax lands on this line, or why no figure can be given.
 *
 * Returns UNKNOWN rather than zero wherever the answer depends on
 * something nobody has recorded. Zero is a claim; UNKNOWN is the truth.
 */
export function taxFor(i: TaxInput): TaxVerdict {
  const net = Math.max(0, Math.round(i.netMinor))
  const supplierCountry = i.supplier.country.toUpperCase()
  const customerCountry = i.customer.country.toUpperCase()

  if (!i.placeOfPerformance) {
    return unknown(
      'NONE',
      'No place of supply on the record',
      'Nobody has said where this work was done, and the place of supply is what decides ' +
        'the tax. No rate is shown rather than a plausible zero — an under-taxed invoice ' +
        'surfaces two years later with interest, and nobody audits a number that looked fine.'
    )
  }

  const place = i.placeOfPerformance
  const placeCountry = place.country.toUpperCase()

  // ── United States ───────────────────────────────────────────────────
  if (placeCountry === 'US') {
    if (supplierCountry !== 'US') {
      return finish(
        'US_SALES_TAX', 'OUT_OF_SCOPE', [], net, 'US',
        'Supplier outside the United States',
        'The supplier is not registered in the United States, so no US sales tax is ' +
          'charged here. Whether the customer owes use tax is their question, not ours.'
      )
    }
    if (!place.state) {
      return unknown(
        'US_SALES_TAX',
        'Sales tax is a state question and no state is on the ship-to',
        'Sales tax in the United States is decided state by state and this invoice does ' +
          'not say which state the work was done in. Set the ship-to before billing — ' +
          'guessing the state guesses the rate.'
      )
    }
    const st = place.state.toUpperCase()
    const rule = US_SERVICE_TAX_BPS[st]
    if (!rule) {
      return finish(
        'US_SALES_TAX', 'ZERO_RATED', [], net, st,
        `${st} does not enumerate staffing services as taxable`,
        `No sales tax in ${st}: it does not tax professional or staffing services. That is ` +
          `a rule about the state and not an absence of data — the states that do tax ` +
          `these services are listed and ${st} is not one of them.`
      )
    }
    return finish(
      'US_SALES_TAX', 'TAXABLE', components('State sales tax', rule.bps, net), net, st,
      rule.basis,
      `${(rule.bps / 100).toFixed(2)}% state tax in ${st}. ${rule.basis}. Local district ` +
        `rates are not in this figure — those come from your own rate table.`
    )
  }

  // ── United Kingdom ──────────────────────────────────────────────────
  if (placeCountry === 'GB') {
    if (supplierCountry !== 'GB') {
      return finish(
        'UK_VAT', 'OUT_OF_SCOPE', [], net, 'GB',
        'Supplier not registered in the United Kingdom',
        'The supplier is not UK-registered, so this is outside the scope of UK VAT.'
      )
    }
    if (customerCountry !== 'GB') {
      return finish(
        'UK_VAT', 'OUT_OF_SCOPE', [], net, 'GB',
        'Place of supply for B2B services is where the customer belongs',
        `The customer belongs in ${customerCountry}, so for a business-to-business service ` +
          `the place of supply is there and no UK VAT is charged.`
      )
    }
    return finish(
      'UK_VAT', 'TAXABLE', components('VAT', 2000, net), net, 'GB',
      'UK standard rate',
      'Twenty per cent VAT, the UK standard rate for services.'
    )
  }

  // ── European Union ──────────────────────────────────────────────────
  if (isEu(placeCountry)) {
    if (!isEu(supplierCountry)) {
      return finish(
        'EU_VAT', 'OUT_OF_SCOPE', [], net, placeCountry,
        'Supplier outside the EU VAT area',
        'The supplier is not established in the EU, so no member state VAT is charged here.'
      )
    }
    const sameState = supplierCountry === customerCountry
    if (!sameState && isEu(customerCountry) && i.customer.taxId) {
      return finish(
        'EU_VAT', 'REVERSE_CHARGE', [], net, customerCountry,
        'Article 196 — reverse charge on cross-border B2B services',
        `${i.customer.country.toUpperCase()} customer with a VAT number, supplier in ` +
          `${supplierCountry}. The customer accounts for the VAT, not us, and the invoice ` +
          `has to say "reverse charge" on its face.`
      )
    }
    if (!isEu(customerCountry)) {
      return finish(
        'EU_VAT', 'OUT_OF_SCOPE', [], net, customerCountry,
        'Customer outside the EU',
        'The customer belongs outside the EU, so the place of supply for the service is ' +
          'outside it too and no member state VAT applies.'
      )
    }
    if (!sameState && !i.customer.taxId) {
      // Cross-border without a VAT number is not B2B. The supplier's own
      // rate applies, and it is worth saying which fact decided it.
      const bps = EU_STANDARD_BPS[supplierCountry]
      return finish(
        'EU_VAT', 'TAXABLE', components('VAT', bps, net), net, supplierCountry,
        'No customer VAT number, so not treated as a business customer',
        `The customer has given no VAT number, so this is not a reverse-charged B2B supply ` +
          `and ${supplierCountry} VAT at ${(bps / 100).toFixed(0)}% applies. If they are a ` +
          `business, get the number — it moves the liability to them.`
      )
    }
    const bps = EU_STANDARD_BPS[supplierCountry]
    return finish(
      'EU_VAT', 'TAXABLE', components('VAT', bps, net), net, supplierCountry,
      `${supplierCountry} standard rate`,
      `Domestic supply in ${supplierCountry} — VAT at ${(bps / 100).toFixed(0)}%.`
    )
  }

  // ── India ───────────────────────────────────────────────────────────
  if (placeCountry === 'IN') {
    if (supplierCountry !== 'IN') {
      return finish(
        'IN_GST', 'OUT_OF_SCOPE', [], net, 'IN',
        'Supplier not registered in India',
        'The supplier is not registered in India, so Indian GST is not charged on this ' +
          'invoice. Reverse charge may fall on the recipient, which is their filing.'
      )
    }
    if (customerCountry !== 'IN') {
      return finish(
        'IN_GST', 'ZERO_RATED', [], net, 'IN',
        'Export of services — zero rated under a letter of undertaking',
        'Export of services from India is zero rated. Zero rated is not the same as exempt: ' +
          'it is in scope, input credit survives, and it needs the LUT on file.'
      )
    }
    if (!i.supplier.state || !place.state) {
      return unknown(
        'IN_GST',
        'GST splits on the state pair and one of them is missing',
        'Indian GST is IGST across states and CGST plus SGST within one, so both states ' +
          'have to be known. One of them is not on the record, and the split cannot be ' +
          'guessed — the two produce identical totals but different returns.'
      )
    }
    const intra = i.supplier.state.toUpperCase() === place.state.toUpperCase()
    if (intra) {
      // The total is the same 18%; the split is what the return needs.
      const half = 900
      const halfAmount = Math.round((net * half) / 10_000)
      return finish(
        'IN_GST', 'TAXABLE',
        [
          { name: 'CGST', rateBps: half, amountMinor: halfAmount },
          { name: 'SGST', rateBps: half, amountMinor: halfAmount },
        ],
        net, place.state.toUpperCase(),
        'Intra-state supply — CGST and SGST at 9% each',
        `Supplier and place of supply are both in ${place.state.toUpperCase()}, so the 18% ` +
          `splits into CGST and SGST at nine per cent each. Same money, two lines, because ` +
          `the return needs them apart.`
      )
    }
    return finish(
      'IN_GST', 'TAXABLE', components('IGST', 1800, net), net, place.state.toUpperCase(),
      'Inter-state supply — IGST at 18%',
      `Supplier in ${i.supplier.state.toUpperCase()}, work done in ` +
        `${place.state.toUpperCase()}. Different states, so it is IGST at eighteen per cent ` +
        `rather than a CGST and SGST split.`
    )
  }

  return unknown(
    'NONE',
    `No rule on file for ${placeCountry}`,
    `Nothing here knows how ${placeCountry} taxes this supply. No rate is shown rather ` +
      `than a zero somebody would take for an answer. Adding a country is adding a row to ` +
      `the table, and it should be added by somebody who has checked.`
  )
}

// ── Withholding ───────────────────────────────────────────────────────
//
// The opposite direction. Tax adds to what the customer pays; withholding
// is subtracted from what they remit, and paid to their revenue authority
// on the supplier's behalf. The supplier still EARNED the gross — the
// withheld part is a prepayment of their own tax, not a discount — which
// is why the two figures are kept apart and never netted into one.

export interface WithholdingInput {
  /** The country whose rules the payer is subject to. */
  payerCountry: string
  /** The country the supplier belongs to. */
  supplierCountry: string
  /** True where the supplier has given a tax identification number. */
  supplierHasTaxId: boolean
  /** The net amount, minor units, before any sales tax or VAT. */
  netMinor: number
}

export interface Withholding {
  applies: boolean
  rateBps: number
  withheldMinor: number
  /** What actually arrives in the bank. */
  netOfWithholdingMinor: number
  basis: string
  says: string
}

/**
 * What the payer holds back, and what that means.
 *
 * Two rules, both real and both narrow:
 *
 *   **India, section 194J.** Ten per cent on fees for professional or
 *   technical services, deducted by the payer, evidenced on a Form 16A.
 *   The supplier claims it against their own liability.
 *
 *   **United States backup withholding.** Twenty-four per cent, and only
 *   where the payee has not given a taxpayer identification number. It is
 *   not a tax on the transaction — it is a consequence of a missing W-9,
 *   and it stops the day the number arrives.
 */
export function withholdingFor(i: WithholdingInput): Withholding {
  const net = Math.max(0, Math.round(i.netMinor))
  const payer = i.payerCountry.toUpperCase()

  if (payer === 'IN' && i.supplierCountry.toUpperCase() === 'IN') {
    const bps = 1000
    const withheld = Math.round((net * bps) / 10_000)
    return {
      applies: true,
      rateBps: bps,
      withheldMinor: withheld,
      netOfWithholdingMinor: net - withheld,
      basis: 'Section 194J — fees for professional or technical services',
      says:
        'Ten per cent is deducted at source and paid to the revenue authority in the ' +
        'supplier’s name. The supplier still earned the whole amount — this is a ' +
        'prepayment of their tax, not a reduction of the invoice, and it must never be ' +
        'netted into revenue.',
    }
  }

  if (payer === 'US' && !i.supplierHasTaxId) {
    const bps = 2400
    const withheld = Math.round((net * bps) / 10_000)
    return {
      applies: true,
      rateBps: bps,
      withheldMinor: withheld,
      netOfWithholdingMinor: net - withheld,
      basis: 'Backup withholding — no taxpayer identification number on file',
      says:
        'Twenty-four per cent is held back because there is no TIN on file. This is not a ' +
        'tax on the work; it is the consequence of a missing W-9 and it stops the day the ' +
        'number arrives. Chase the form rather than absorbing the deduction.',
    }
  }

  return {
    applies: false,
    rateBps: 0,
    withheldMinor: 0,
    netOfWithholdingMinor: net,
    basis: 'No withholding rule reaches this pair',
    says: 'Nothing is held back — the payer remits the full invoice.',
  }
}

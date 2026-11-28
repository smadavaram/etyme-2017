/**
 * One door to the terms a placement is billed and paid on.
 *
 * ── The fact that lived in two places ────────────────────────────────
 *
 * A purchase order is a header and its lines (CLAUDE.md, 2026-09-18).
 * `WorkOrder` is the header; `SellContract` and `BuyContract` are its
 * lines. Six fields were carried on both rows and nothing reconciled
 * them:
 *
 *   billFrequency · billAnchor · billStraddle · paymentTerms · startDate · endDate
 *
 * with `payFrequency`, `payAnchor`, `payStraddle` and `paymentTermsFrom`
 * as the buy side's mirror against its own `workOrderId`. Those six
 * decide when hours fall due, when a bill is raised, when it is due and
 * when somebody is paid. Two places for one fact is one wrong number
 * waiting, and a wrong date on a bill is the kind nobody audits because
 * a date always looks like a date.
 *
 * So every reader in the money domain asks this file, and this file is
 * the only one that touches a line's own copy.
 *
 * ── Which copy wins, and why it is not the same answer for all six ───
 *
 * **Rhythm and terms are the document's.** How often a deal is billed,
 * where its period starts, what happens to a week that crosses a
 * boundary and how many days there are to pay are properties of the
 * paper two firms signed. One order billed two ways is incoherent. And
 * the line's copy of those four is indistinguishable from silence: the
 * columns are not nullable and carry schema defaults, so a line reading
 * MONTHLY may mean "monthly was agreed" or may mean "nobody ever said",
 * and there is no way to tell the two apart. A value that cannot say it
 * did not say cannot be allowed to beat one that was typed.
 *
 * **Dates are the line's, because a line is a person and an order is
 * not.** One header for a five-person project runs the length of the
 * project; the third person on it starts in March. Reading the header's
 * start onto that line would generate four months of cycles before
 * anybody worked and invoice a period that person was not on site for.
 * The seeded world already carries the shape — `demo-seed` raises an
 * order running 180 days back and places somebody on it 60 days back —
 * so this is not a hypothetical. A line's `startDate` is never a
 * default: somebody set it to the day this person starts. It wins.
 *
 * The header's own window is reported beside the answer rather than
 * applied, so a caller that cares — a line running past the order that
 * authorizes it is a real exception for AP — can see it without a date
 * being silently moved.
 *
 * ── Two words for one rhythm ─────────────────────────────────────────
 *
 * The header has one set of rhythm columns and they are named for the
 * selling side: `billFrequency`. A buy line's `payFrequency` is the same
 * fact read from the other end — the order this firm raised to its
 * sub-vendor is billed by the sub on the rhythm we pay it on. So the
 * buy side reads the header's `bill*` columns and calls them pay, which
 * is exactly the "one document, three names" rule the order layer is
 * built on.
 *
 * ── Where the header speaks a language the engine does not ───────────
 *
 * The two rows do not share a vocabulary, which is its own evidence
 * that nothing reconciled them:
 *
 *   header  CALENDAR · CONTRACT_START · CUSTOM      SPLIT · TO_EARLIER · TO_LATER
 *   line    CALENDAR · CONTRACT                     SPLIT · START · END
 *
 * Three of those translate exactly and are translated. `CUSTOM` — an
 * anchor or a frequency meaning "the dates are written out in
 * `customDates`" — does not, because no period engine here reads
 * `customDates`. A milestone order in the seeded world carries
 * `billFrequency: 'CUSTOM'` today. Rather than invent a rhythm, the
 * header is treated as having said nothing readable, the line answers,
 * and the value is named in `unreadable` so the gap is visible instead
 * of being a wrong Tuesday.
 *
 * ── The agreement first. Decided by the founder, 2026-10-18 ──────────
 *
 * "AR and AP is always based on the agreed MSA between client and
 * supplier and supplier and subvendor/candidate." Every term here — the
 * rhythm, the net days, what they run from and the currency — is the
 * agreement's where the two parties signed one and it says. The order,
 * then the line, may differ only where that document carries a recorded
 * reason (`termsDifferReason`); a different value with no reason is set
 * aside and the answer says so in a sentence. Where the agreement says
 * nothing about a term, or the two parties have no agreement, the order
 * and then the line answer exactly as they did before this — the order
 * is then their agreement. The rule is `agreementFirst` in
 * `lib/billing-cascade`; this file and that one cannot disagree.
 *
 * Which agreement: the sell side reads the agreement with the customer
 * (the line's own `msa`, else its order's); the buy side reads the
 * agreement with the sub-vendor, through the order raised to it. A W2 or
 * a 1099 line has no agreement above it: the worker's own contract is
 * the line, and it answers. A caller with the agreement loaded some
 * other way passes it as the third argument.
 *
 * `paymentTermsFrom` is now on the order (2026-10-18), so the whole of
 * the net-days term comes from one document. The agreement's billing
 * rhythm (`billFrequency`, `billAnchor`, `billStraddle`) is in the
 * lines' words already and is null where the agreement did not say.
 */

import type { Anchor, Frequency, Straddle } from '@/lib/periods'
import type { TermsAnchor, BillingTerms, CascadeInputs } from '@/lib/billing-cascade'
import { isAnchor, agreementFirst, setAsideSays, anchorWords, resolveBillingTerms } from '@/lib/billing-cascade'

/** Sell line or buy line. Named, never inferred — the two read different columns. */
export type OrderSide = 'SELL' | 'BUY'

/** Which copy answered. */
export type TermSource =
  /** The header — the purchase order, sales order, work order. */
  | 'ORDER'
  /** The line's own column. */
  | 'LINE'
  /** Neither said anything readable, so the shipped default stands. */
  | 'DEFAULT'

/**
 * Which level decided a term: the agreement between the two parties,
 * then the order, then the line, then the shipped default. What a screen
 * prints beside a term ("from your agreement with Northbend Athletic").
 */
export type TermLevelSource = 'AGREEMENT' | TermSource

/**
 * The header, as much of it as these six need.
 *
 * `ORDER_HEADER_SELECT` below selects exactly this, so a caller cannot
 * load half of it and get a quietly different answer.
 */
export interface OrderHeader {
  id?: string | null
  number?: string | null
  billFrequency?: string | null
  billAnchor?: string | null
  billStraddle?: string | null
  paymentTerms?: number | null
  /** What the net days run from. Null where the order did not say. */
  paymentTermsFrom?: string | null
  currency?: string | null
  startDate?: Date | null
  endDate?: Date | null
  /** Why this order differs from its agreement, where somebody said. */
  termsDifferReason?: string | null
  /** The agreement this order was raised under, where it names one. */
  msa?: AgreementTerms | null
}

/**
 * The agreement between the two parties on one side, as much of it as
 * the terms need. `AGREEMENT_TERMS_SELECT` selects exactly this.
 */
export interface AgreementTerms {
  id?: string | null
  billFrequency?: string | null
  billAnchor?: string | null
  billStraddle?: string | null
  paymentTerms?: number | null
  paymentTermsFrom?: string | null
  currency?: string | null
  vendor?: { name: string } | null
  client?: { name: string } | null
}

/** A line, either side, with its header where it has one. */
export interface OrderLine {
  startDate?: Date | null
  endDate?: Date | null
  /** Sell side. */
  billFrequency?: string | null
  billAnchor?: string | null
  billStraddle?: string | null
  paymentTerms?: number | null
  /** Buy side. */
  payFrequency?: string | null
  payAnchor?: string | null
  payStraddle?: string | null
  /** Both sides. */
  paymentTermsFrom?: string | null
  /** Sell side. */
  billCurrency?: string | null
  /** Buy side. */
  payCurrency?: string | null
  /** Why this line differs from its agreement, where somebody said. */
  termsDifferReason?: string | null
  /** Sell side: the agreement with the customer the line names. */
  msa?: AgreementTerms | null
  workOrder?: OrderHeader | null
}

export interface OrderTerms {
  frequency: Frequency
  anchor: Anchor
  straddle: Straddle
  /**
   * Net days, or null where neither the document nor the line says. Null
   * is not zero: zero days is due on the anchor, which is a real
   * arrangement, and the cascade in `lib/billing-cascade` answers a null
   * from the agreement, the company and then the platform.
   */
  paymentTermsDays: number | null
  /** What those days are counted from. Null where nobody has said. */
  paymentTermsFrom: TermsAnchor | null
  /** The currency, or null where no document says. */
  currency: string | null
  /** The line's own dates. Never the header's — see the note above. */
  startDate: Date | null
  endDate: Date | null
  /**
   * Which level decided each term — the agreement, the order, the line,
   * or the shipped default — and the words for the screen.
   */
  source: {
    frequency: TermLevelSource
    anchor: TermLevelSource
    straddle: TermLevelSource
    paymentTermsDays: TermLevelSource
    paymentTermsFrom: TermLevelSource
    currency: TermLevelSource
  }
  /** Per term, in words: "from your agreement with Northbend Athletic". */
  label: {
    frequency: string
    anchor: string
    straddle: string
    paymentTermsDays: string
    paymentTermsFrom: string
    currency: string
  }
  /**
   * Which copy on the documents carries each value: the order's, the
   * line's, or neither (DEFAULT). Where the agreement decided a term
   * (`source` says AGREEMENT), this names the document copy that says
   * the same thing, or DEFAULT where neither does. Read `source` for the
   * level that decided; this is for a writer copying a value onto a line.
   */
  from: {
    frequency: TermSource
    anchor: TermSource
    straddle: TermSource
    paymentTermsDays: TermSource
    paymentTermsFrom: TermSource
    currency: TermSource
    startDate: TermSource
    endDate: TermSource
  }
  orderId: string | null
  orderNumber: string | null
  /** The document's own window, where there is a document. */
  orderWindow: { start: Date | null; end: Date | null } | null
  /**
   * The line runs outside the window of the order that authorizes it —
   * it starts before the order does, or ends after the order does.
   * Reported, never applied: cutting a running placement short because
   * its paper expired is a decision for a person, not for a date helper.
   */
  outsideOrderWindow: boolean
  /** Header values the money engine cannot read, named rather than guessed at. */
  unreadable: string[]
  /** The agreement read, where there is one. */
  agreementId: string | null
  /** Who the agreement is with, for the sentence; null where there is none. */
  counterpartyName: string | null
  /**
   * Terms an order or a line said differently from the agreement with no
   * reason, so not applied — one sentence each, for the screen.
   */
  setAside: string[]
  /** The whole thing as somebody would say it. */
  says: string
}

/** What the terms read off an agreement. */
export const AGREEMENT_TERMS_SELECT = {
  id: true,
  billFrequency: true,
  billAnchor: true,
  billStraddle: true,
  paymentTerms: true,
  paymentTermsFrom: true,
  currency: true,
  vendor: { select: { name: true } },
  client: { select: { name: true } },
} as const

/**
 * What every caller must select off `workOrder` to ask this file anything.
 * It carries the order's own agreement, so a line on an order reads the
 * agreement first without its caller having to know to ask.
 */
export const ORDER_HEADER_SELECT = {
  id: true,
  number: true,
  billFrequency: true,
  billAnchor: true,
  billStraddle: true,
  paymentTerms: true,
  paymentTermsFrom: true,
  currency: true,
  startDate: true,
  endDate: true,
  termsDifferReason: true,
  msa: { select: AGREEMENT_TERMS_SELECT },
} as const

/**
 * What a sell line selects beside its order to be read agreement first:
 * its own agreement with the customer, and its reason for differing.
 */
export const SELL_LINE_TERMS_SELECT = {
  termsDifferReason: true,
  msa: { select: AGREEMENT_TERMS_SELECT },
} as const

/**
 * The same three selects without the two firms' names, for a reader that
 * decides a period and never says where a term came from (the three-way
 * check, `lib/invoice-match`). Each name is a query of its own, and the
 * check reads four agreements per bill: eight round trips of the forty a
 * bill's check made, each one queued for a connection under load (the
 * 2,000-person simulation, 2026-10-21). The terms read are identical; a
 * set-aside sentence built from these says "your agreement" rather than
 * naming the firm, which is why a screen keeps the full selects.
 */
export const AGREEMENT_PERIOD_SELECT = {
  id: true,
  billFrequency: true,
  billAnchor: true,
  billStraddle: true,
  paymentTerms: true,
  paymentTermsFrom: true,
  currency: true,
} as const

export const ORDER_HEADER_PERIOD_SELECT = {
  ...ORDER_HEADER_SELECT,
  msa: { select: AGREEMENT_PERIOD_SELECT },
} as const

export const SELL_LINE_PERIOD_TERMS_SELECT = {
  termsDifferReason: true,
  msa: { select: AGREEMENT_PERIOD_SELECT },
} as const

/** The shipped answers, which are the schema defaults, so nothing moves. */
export const SHIPPED = {
  frequency: 'MONTHLY' as Frequency,
  anchor: 'CALENDAR' as Anchor,
  straddle: 'SPLIT' as Straddle,
}

// ── Translation ───────────────────────────────────────────────────────

const FREQUENCIES: Record<string, Frequency> = {
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY',
  SEMIMONTHLY: 'SEMIMONTHLY',
  MONTHLY: 'MONTHLY',
}

const ANCHORS: Record<string, Anchor> = {
  CALENDAR: 'CALENDAR',
  CONTRACT: 'CONTRACT',
  /** The header's word for the same thing. */
  CONTRACT_START: 'CONTRACT',
}

const STRADDLES: Record<string, Straddle> = {
  SPLIT: 'SPLIT',
  START: 'START',
  END: 'END',
  /** The whole week to the earlier period — the one its first day is in. */
  TO_EARLIER: 'START',
  /** The whole week to the later period — the one its last day is in. */
  TO_LATER: 'END',
}

const read = <T>(table: Record<string, T>, raw: unknown): T | null =>
  typeof raw === 'string' && raw.toUpperCase() in table ? table[raw.toUpperCase()] : null

/** A header value that exists and cannot be translated. Named, not guessed. */
function unreadableValue<T>(table: Record<string, T>, raw: unknown): boolean {
  return typeof raw === 'string' && raw.trim() !== '' && !(raw.toUpperCase() in table)
}

// ── The one door ──────────────────────────────────────────────────────

/**
 * The terms this line is billed or paid on, header first, line second.
 *
 * Pure: it reads the row it is handed and touches no database. The
 * caller loads `workOrder` with `ORDER_HEADER_SELECT`; a caller that
 * does not gets the line's own answer, which is what every row written
 * before today has and is the behavior that was already shipping.
 */
export function termsFor(side: OrderSide, line: OrderLine, agreementGiven?: AgreementTerms | null): OrderTerms {
  const header = line.workOrder ?? null
  // Which agreement: the one handed in; else the line's own (a sell line
  // names its customer's); else the one its order was raised under. A W2
  // line has neither, and its own contract is the agreement.
  const agreement: AgreementTerms | null =
    agreementGiven !== undefined ? agreementGiven : (line.msa ?? header?.msa ?? null)
  const counterpartyName =
    (side === 'SELL' ? agreement?.client?.name : agreement?.vendor?.name) ?? null

  const lineFrequency = side === 'SELL' ? line.billFrequency : line.payFrequency
  const lineAnchor = side === 'SELL' ? line.billAnchor : line.payAnchor
  const lineStraddle = side === 'SELL' ? line.billStraddle : line.payStraddle
  const lineCurrency = side === 'SELL' ? line.billCurrency : line.payCurrency

  const unreadable: string[] = []
  if (header) {
    // The header is asked in its own vocabulary; the buy side reads the
    // same columns and calls the answer pay.
    if (unreadableValue(FREQUENCIES, header.billFrequency)) {
      unreadable.push(`frequency "${header.billFrequency}"`)
    }
    if (unreadableValue(ANCHORS, header.billAnchor)) {
      unreadable.push(`period start "${header.billAnchor}"`)
    }
    if (unreadableValue(STRADDLES, header.billStraddle)) {
      unreadable.push(`straddle "${header.billStraddle}"`)
    }
  }

  const setAside: string[] = []
  const orderReason = header?.termsDifferReason ?? null
  const lineReason = line.termsDifferReason ?? null

  /** One term, agreement first, then the shipped default. */
  const pick = <T>(
    words: { agreement: T | null; order: T | null; line: T | null },
    shipped: T | null,
    describe: (v: T) => string
  ): { value: T | null; from: TermLevelSource; copy: TermSource } => {
    const p = agreementFirst<T>({
      agreement: agreement ? words.agreement : null,
      order: header ? { value: words.order, reason: orderReason } : null,
      line: { value: words.line, reason: lineReason },
    })
    for (const x of p.setAside) {
      setAside.push(setAsideSays({ from: x.from, said: describe(x.value), agreed: describe(words.agreement as T), counterpartyName }))
    }
    if (p.from === null) return { value: shipped, from: 'DEFAULT', copy: 'DEFAULT' }
    if (p.from !== 'AGREEMENT') return { value: p.value, from: p.from, copy: p.from }
    // The agreement decided; name the document copy that agrees, if any.
    const copy: TermSource =
      header && words.order !== null && words.order === p.value ? 'ORDER'
      : words.line !== null && words.line === p.value ? 'LINE'
      : 'DEFAULT'
    return { value: p.value, from: 'AGREEMENT', copy }
  }

  const frequency = pick<Frequency>(
    { agreement: read(FREQUENCIES, agreement?.billFrequency), order: read(FREQUENCIES, header?.billFrequency), line: read(FREQUENCIES, lineFrequency) },
    SHIPPED.frequency,
    (f) => `${f.toLowerCase()} ${side === 'SELL' ? 'billing' : 'pay'}`
  ) as { value: Frequency; from: TermLevelSource; copy: TermSource }
  const anchor = pick<Anchor>(
    { agreement: read(ANCHORS, agreement?.billAnchor), order: read(ANCHORS, header?.billAnchor), line: read(ANCHORS, lineAnchor) },
    SHIPPED.anchor,
    (a) => (a === 'CALENDAR' ? 'periods starting on the calendar' : 'periods starting on the contract\u2019s own start day')
  ) as { value: Anchor; from: TermLevelSource; copy: TermSource }
  const straddle = pick<Straddle>(
    { agreement: read(STRADDLES, agreement?.billStraddle), order: read(STRADDLES, header?.billStraddle), line: read(STRADDLES, lineStraddle) },
    SHIPPED.straddle,
    (x) => (x === 'SPLIT' ? 'a week crossing a period split by day' : x === 'START' ? 'a week crossing a period billed where it starts' : 'a week crossing a period billed where it ends')
  ) as { value: Straddle; from: TermLevelSource; copy: TermSource }

  // Net days. Zero is a real term — due on the anchor itself — so the
  // test is "did it say", never "is it truthy".
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)
  const days = pick<number>(
    { agreement: num(agreement?.paymentTerms), order: num(header?.paymentTerms), line: num(line.paymentTerms) },
    null,
    (n) => (n === 0 ? 'due on receipt' : `net ${n}`)
  )
  const anchorOf = (v: unknown): TermsAnchor | null => (isAnchor(v) ? v : null)
  const termsFrom = pick<TermsAnchor>(
    { agreement: anchorOf(agreement?.paymentTermsFrom), order: anchorOf(header?.paymentTermsFrom), line: anchorOf(line.paymentTermsFrom) },
    null,
    (a) => `the days counted from ${anchorWords(a)}`
  )
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
  const currency = pick<string>(
    { agreement: str(agreement?.currency), order: str(header?.currency), line: str(lineCurrency) },
    null,
    (c) => c
  )

  const startDate = line.startDate ?? null
  const endDate = line.endDate ?? null

  const orderWindow = header ? { start: header.startDate ?? null, end: header.endDate ?? null } : null
  const outsideOrderWindow = Boolean(
    orderWindow &&
      ((orderWindow.start && startDate && startDate.getTime() < orderWindow.start.getTime()) ||
        (orderWindow.end && endDate && endDate.getTime() > orderWindow.end.getTime()))
  )

  return {
    frequency: frequency.value,
    anchor: anchor.value,
    straddle: straddle.value,
    paymentTermsDays: days.value,
    paymentTermsFrom: termsFrom.value,
    currency: currency.value,
    startDate,
    endDate,
    source: {
      frequency: frequency.from,
      anchor: anchor.from,
      straddle: straddle.from,
      paymentTermsDays: days.from,
      paymentTermsFrom: termsFrom.from,
      currency: currency.from,
    },
    label: {
      frequency: levelWords(frequency.from, counterpartyName, header?.number ?? null),
      anchor: levelWords(anchor.from, counterpartyName, header?.number ?? null),
      straddle: levelWords(straddle.from, counterpartyName, header?.number ?? null),
      paymentTermsDays: levelWords(days.from, counterpartyName, header?.number ?? null),
      paymentTermsFrom: levelWords(termsFrom.from, counterpartyName, header?.number ?? null),
      currency: levelWords(currency.from, counterpartyName, header?.number ?? null),
    },
    from: {
      frequency: frequency.copy,
      anchor: anchor.copy,
      straddle: straddle.copy,
      paymentTermsDays: days.copy,
      paymentTermsFrom: termsFrom.copy,
      currency: currency.copy,
      // Always the line's: a line is a person and an order is not.
      startDate: startDate ? 'LINE' : 'DEFAULT',
      endDate: endDate ? 'LINE' : 'DEFAULT',
    },
    orderId: header?.id ?? null,
    orderNumber: header?.number ?? null,
    orderWindow,
    outsideOrderWindow,
    unreadable,
    agreementId: agreement?.id ?? null,
    counterpartyName,
    setAside,
    says: sentence(side, frequency.value, days.value, header?.number ?? null, unreadable, frequency.from === 'AGREEMENT' || days.from === 'AGREEMENT' ? (counterpartyName ?? 'the other party') : null, setAside),
  }
}

/**
 * The money terms of one line, agreement first, with the company and the
 * platform behind them: what an invoice, a due date, the three-way check
 * and the twin all ask. One answer, from `termsFor` and the cascade
 * together, so the rhythm and the net days cannot come from two rules.
 */
export function moneyTermsFor(
  side: OrderSide,
  line: OrderLine,
  company: CascadeInputs['company'],
  agreementGiven?: AgreementTerms | null
): { terms: OrderTerms; billing: BillingTerms } {
  const terms = termsFor(side, line, agreementGiven)
  const agreement = agreementGiven !== undefined ? agreementGiven : (line.msa ?? line.workOrder?.msa ?? null)
  const header = line.workOrder ?? null
  const billing = resolveBillingTerms({
    company,
    agreement: agreement
      ? {
          paymentTermsDays: agreement.paymentTerms ?? null,
          paymentTermsFrom: agreement.paymentTermsFrom ?? null,
          currency: agreement.currency ?? null,
          counterpartyName: terms.counterpartyName ?? 'the other party',
        }
      : null,
    contract: {
      paymentTermsDays: typeof line.paymentTerms === 'number' ? line.paymentTerms : null,
      paymentTermsFrom: line.paymentTermsFrom ?? null,
      currency: (side === 'SELL' ? line.billCurrency : line.payCurrency) ?? null,
      differReason: line.termsDifferReason ?? null,
    },
    order: header
      ? {
          paymentTermsDays: typeof header.paymentTerms === 'number' ? header.paymentTerms : null,
          paymentTermsFrom: header.paymentTermsFrom ?? null,
          currency: header.currency ?? null,
          number: header.number ?? null,
          differReason: header.termsDifferReason ?? null,
        }
      : null,
  })
  return { terms, billing }
}

/**
 * What the period engine needs, and nothing else.
 *
 * `periodFor` takes exactly these four, and handing it the whole verdict
 * would let a caller pass a header's window as `startedOn` by accident.
 */
export function periodTermsFor(
  side: OrderSide,
  line: OrderLine
): { frequency: Frequency; anchor: Anchor; straddle: Straddle; startedOn: Date } {
  const t = termsFor(side, line)
  return {
    frequency: t.frequency,
    anchor: t.anchor,
    straddle: t.straddle,
    // Only read when the anchor is CONTRACT, and then it is the day this
    // person started — never the day the order was raised.
    startedOn: t.startDate ?? new Date(0),
  }
}

/** Where a term came from, as the screen says it. */
function levelWords(level: TermLevelSource, counterpartyName: string | null, number: string | null): string {
  switch (level) {
    case 'AGREEMENT': return counterpartyName ? `from your agreement with ${counterpartyName}` : 'from your agreement'
    case 'ORDER': return number ? `on order ${number}` : 'set on the order'
    case 'LINE': return 'set on this placement'
    case 'DEFAULT': return 'nobody has said, so the usual answer is assumed'
  }
}

function sentence(
  side: OrderSide,
  frequency: Frequency,
  days: number | null,
  number: string | null,
  unreadable: string[],
  agreementWith: string | null,
  setAside: string[]
): string {
  const how = frequency.toLowerCase()
  const verb = side === 'SELL' ? 'Billed' : 'Paid'
  const net = days === null ? '' : `, net ${days}`
  const paper = agreementWith ? ` under your agreement with ${agreementWith}` : number ? ` on order ${number}` : ''
  const caveat = unreadable.length
    ? ` The order says ${unreadable.join(' and ')}, which nothing here can read, so the placement's own answer stands.`
    : ''
  const aside = setAside.length ? ` ${setAside.join(' ')}` : ''
  return `${verb} ${how}${net}${paper}.${caveat}${aside}`
}

// ── Writing an order or a line: a difference needs its reason ─────────
//
// The founder, 2026-10-18: "The agreement sets the terms; an order or a
// placement may differ only with a reason recorded." So wherever an order
// or a line's terms are written, what it says is compared with the
// agreement between the two parties, and a difference with no reason is
// refused in a sentence. The readers above set an unreasoned difference
// aside anyway; refusing it at the door is what keeps the paper and the
// answer from disagreeing in the first place.

/** What a writer is about to put on an order or a line, in either vocabulary. */
export interface TermsSaid {
  billFrequency?: string | null
  billAnchor?: string | null
  billStraddle?: string | null
  paymentTerms?: number | null
  paymentTermsFrom?: string | null
  currency?: string | null
}

export interface TermDifference {
  term: 'frequency' | 'anchor' | 'straddle' | 'paymentTerms' | 'paymentTermsFrom' | 'currency'
  /** In words: "net 15". */
  said: string
  agreed: string
}

const DAYS = (n: number) => (n === 0 ? 'due on receipt' : `net ${n}`)

/**
 * Where what a document says differs from the agreement, term by term.
 * A term the agreement does not say, or the document does not say, is
 * not a difference. Pure.
 */
export function differencesFrom(agreement: AgreementTerms | null | undefined, said: TermsSaid): TermDifference[] {
  if (!agreement) return []
  const out: TermDifference[] = []
  const rhythm = <T>(term: TermDifference['term'], table: Record<string, T>, a: unknown, d: unknown, words: (v: T) => string) => {
    const av = read(table, a)
    const dv = read(table, d)
    if (av !== null && dv !== null && av !== dv) out.push({ term, said: words(dv), agreed: words(av) })
  }
  rhythm('frequency', FREQUENCIES, agreement.billFrequency, said.billFrequency, (f) => `${String(f).toLowerCase()} billing`)
  rhythm('anchor', ANCHORS, agreement.billAnchor, said.billAnchor, (a) => (a === 'CALENDAR' ? 'periods on the calendar' : 'periods from the start day'))
  rhythm('straddle', STRADDLES, agreement.billStraddle, said.billStraddle, (s) => `a crossing week billed ${s === 'SPLIT' ? 'by day' : s === 'START' ? 'where it starts' : 'where it ends'}`)
  if (typeof agreement.paymentTerms === 'number' && typeof said.paymentTerms === 'number' && agreement.paymentTerms !== said.paymentTerms) {
    out.push({ term: 'paymentTerms', said: DAYS(said.paymentTerms), agreed: DAYS(agreement.paymentTerms) })
  }
  if (isAnchor(agreement.paymentTermsFrom) && isAnchor(said.paymentTermsFrom) && agreement.paymentTermsFrom !== said.paymentTermsFrom) {
    out.push({
      term: 'paymentTermsFrom',
      said: `the days counted from ${anchorWords(said.paymentTermsFrom)}`,
      agreed: `the days counted from ${anchorWords(agreement.paymentTermsFrom)}`,
    })
  }
  const ac = typeof agreement.currency === 'string' && agreement.currency.trim() ? agreement.currency.toUpperCase() : null
  const dc = typeof said.currency === 'string' && said.currency.trim() ? said.currency.toUpperCase() : null
  if (ac && dc && ac !== dc) out.push({ term: 'currency', said: dc, agreed: ac })
  return out
}

/**
 * The refusal for a difference with no reason, in one sentence, naming
 * every term that differs and the agreement it differs from.
 */
export function differenceRefusal(doc: 'order' | 'placement', diffs: TermDifference[], counterpartyName: string | null): string {
  const join = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
  const whose = counterpartyName ? `your agreement with ${counterpartyName}` : 'your agreement'
  return (
    `This ${doc} says ${join(diffs.map((d) => d.said))} where ${whose} says ${join(diffs.map((d) => d.agreed))}. ` +
    `Give the reason it differs, or leave those terms to the agreement.`
  )
}

/** A recorded reason, or null where none was given. */
export function reasonFrom(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim().slice(0, 1000) : null
}

/**
 * The agreement's rhythm in the order header's own vocabulary, for a
 * writer filling the terms an order did not state. Null where the
 * agreement did not say.
 */
export function headerRhythmFrom(agreement: AgreementTerms | null | undefined): { billFrequency?: string; billAnchor?: string; billStraddle?: string } {
  if (!agreement) return {}
  const f = read(FREQUENCIES, agreement.billFrequency)
  const a = read(ANCHORS, agreement.billAnchor)
  const s = read(STRADDLES, agreement.billStraddle)
  return {
    ...(f ? { billFrequency: f } : {}),
    ...(a ? { billAnchor: a === 'CONTRACT' ? 'CONTRACT_START' : 'CALENDAR' } : {}),
    ...(s ? { billStraddle: s === 'START' ? 'TO_EARLIER' : s === 'END' ? 'TO_LATER' : 'SPLIT' } : {}),
  }
}

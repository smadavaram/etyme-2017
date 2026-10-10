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
 * ── What is not here, and is a schema request ────────────────────────
 *
 * `paymentTermsFrom` — what the net days are counted from — is on
 * `SellContract`, on `BuyContract` and on `MasterAgreement`, and not on
 * `WorkOrder`. So half of one term comes from the document and half from
 * the line. That is the same split this file exists to end, and closing
 * it needs a column the architect adds. Until then the anchor falls back
 * to the line and says `LINE` in `from`, so nobody reads it as settled.
 */

import type { Anchor, Frequency, Straddle } from '@/lib/periods'
import type { TermsAnchor } from '@/lib/billing-cascade'
import { isAnchor } from '@/lib/billing-cascade'

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
  startDate?: Date | null
  endDate?: Date | null
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
  /** Both sides. No header column for it; see the note above. */
  paymentTermsFrom?: string | null
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
  /** What those days are counted from. Null where the line has not said. */
  paymentTermsFrom: TermsAnchor | null
  /** The line's own dates. Never the header's — see the note above. */
  startDate: Date | null
  endDate: Date | null
  /** Which copy answered, per field. */
  from: {
    frequency: TermSource
    anchor: TermSource
    straddle: TermSource
    paymentTermsDays: TermSource
    paymentTermsFrom: TermSource
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
  /** The whole thing as somebody would say it. */
  says: string
}

/** What every caller must select off `workOrder` to ask this file anything. */
export const ORDER_HEADER_SELECT = {
  id: true,
  number: true,
  billFrequency: true,
  billAnchor: true,
  billStraddle: true,
  paymentTerms: true,
  startDate: true,
  endDate: true,
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
export function termsFor(side: OrderSide, line: OrderLine): OrderTerms {
  const header = line.workOrder ?? null

  const lineFrequency = side === 'SELL' ? line.billFrequency : line.payFrequency
  const lineAnchor = side === 'SELL' ? line.billAnchor : line.payAnchor
  const lineStraddle = side === 'SELL' ? line.billStraddle : line.payStraddle

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

  const pick = <T>(table: Record<string, T>, headerRaw: unknown, lineRaw: unknown, shipped: T):
    { value: T; from: TermSource } => {
    const fromHeader = header ? read(table, headerRaw) : null
    if (fromHeader !== null) return { value: fromHeader, from: 'ORDER' }
    const fromLine = read(table, lineRaw)
    if (fromLine !== null) return { value: fromLine, from: 'LINE' }
    return { value: shipped, from: 'DEFAULT' }
  }

  const frequency = pick(FREQUENCIES, header?.billFrequency, lineFrequency, SHIPPED.frequency)
  const anchor = pick(ANCHORS, header?.billAnchor, lineAnchor, SHIPPED.anchor)
  const straddle = pick(STRADDLES, header?.billStraddle, lineStraddle, SHIPPED.straddle)

  // Net days. Zero is a real term — due on the anchor itself — so the
  // test is "did it say", never "is it truthy".
  const headerDays = header && typeof header.paymentTerms === 'number' ? header.paymentTerms : null
  const lineDays = typeof line.paymentTerms === 'number' ? line.paymentTerms : null
  const paymentTermsDays = headerDays ?? lineDays
  const daysFrom: TermSource = headerDays !== null ? 'ORDER' : lineDays !== null ? 'LINE' : 'DEFAULT'

  // The anchor for those days has no column on the header. Always the
  // line's, and it says so rather than implying the document settled it.
  const termsFrom = isAnchor(line.paymentTermsFrom) ? line.paymentTermsFrom : null

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
    paymentTermsDays,
    paymentTermsFrom: termsFrom,
    startDate,
    endDate,
    from: {
      frequency: frequency.from,
      anchor: anchor.from,
      straddle: straddle.from,
      paymentTermsDays: daysFrom,
      paymentTermsFrom: termsFrom === null ? 'DEFAULT' : 'LINE',
      // Always the line's, and the sentence above says why.
      startDate: startDate ? 'LINE' : 'DEFAULT',
      endDate: endDate ? 'LINE' : 'DEFAULT',
    },
    orderId: header?.id ?? null,
    orderNumber: header?.number ?? null,
    orderWindow,
    outsideOrderWindow,
    unreadable,
    says: sentence(side, frequency.value, paymentTermsDays, header?.number ?? null, unreadable),
  }
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

function sentence(
  side: OrderSide,
  frequency: Frequency,
  days: number | null,
  number: string | null,
  unreadable: string[]
): string {
  const how = frequency.toLowerCase()
  const verb = side === 'SELL' ? 'Billed' : 'Paid'
  const net = days === null ? '' : `, net ${days}`
  const paper = number ? ` on order ${number}` : ''
  const caveat = unreadable.length
    ? ` The order says ${unreadable.join(' and ')}, which nothing here can read, so the placement's own answer stands.`
    : ''
  return `${verb} ${how}${net}${paper}.${caveat}`
}

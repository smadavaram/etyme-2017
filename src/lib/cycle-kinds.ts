/**
 * What a cycle can be, which side of the trade it sits on, and which of
 * them a given contract actually needs.
 *
 * ── Why the list got shorter ─────────────────────────────────────────
 *
 * The 2017 engine had nineteen kinds. Some were money changing hands on a
 * schedule — hours due, invoice due, salary paid. Some were reminders —
 * a visa expiring, an insurance certificate lapsing, a GST return owed.
 * The two were kept in one table because both have a date, and that is
 * the only thing they share. A salary payment has to move off a weekend
 * to a working day against two companies' holiday calendars; a visa
 * expiry does not care what day of the week it is.
 *
 * The rebuild carried the confusion forward and added to it: the cycle
 * union grew to nineteen again with kinds the packs never used, packs
 * carried a GST return and an IR35 assessment as if they were billing
 * events, and a salary approval stage existed that nothing read.
 *
 * So this is only the money. Reminders already have a home — the watch
 * cron sweeps Verification.expiresAt and says so out loud — and an IR35
 * determination is a document the UK pack already asks for, not a date
 * to shift.
 *
 * ── Why it got shorter again ─────────────────────────────────────────
 *
 * Eight became six, and this time because a due date belongs to the
 * document rather than to the calendar.
 *
 * INVOICE_DUE and VENDOR_BILL_DUE were calendar guesses at a fact the
 * document already carries, and they carried it worse. `Invoice.dueAt`
 * is the truth: it counts from what the agreement says it counts from,
 * and where that is the day the client received it, `Invoice.receivedAt`
 * is what starts the clock — a due date computed from anything else was
 * a guess wearing a date. `VendorBill.dueAt` is the same fact on the buy
 * side, sitting beside `receivedAt` and `paidAt` because collapsing the
 * three is what makes a payment delay unmeasurable.
 *
 * Against that, the packs scheduled an invoice due date MONTHLY on the
 * 28th and a vendor bill due date MONTHLY on the 15th, months ahead of
 * any invoice or bill existing. The default pack raises invoices
 * SEMIMONTHLY on the 1st, so a NET-30 invoice raised on the 16th falls
 * due on the 15th of the next month while the cycle row said the 28th.
 * The two disagreed by construction, and the cycle row was the one the
 * placement timeline and the due-cycles scan put in front of a person.
 * Two dates for one obligation is not redundancy; it is one wrong
 * number with a schedule behind it.
 *
 * ── Why pay day is not in the same boat ──────────────────────────────
 *
 * SALARY_PAY looks like a due date and is not one. Nobody sends a
 * document that decides when payroll runs — the biweekly Friday was
 * agreed at hire and lives nowhere else, so if it is not a cycle it is
 * not anywhere. The same is true of the other five: the week decides
 * when hours are due and when they must be signed, and the day we
 * raise an invoice or a vendor bill is ours to schedule in advance.
 * The day either one falls due is not ours and never was.
 *
 * The rule the six pass and the two failed: a cycle is money that moves
 * on a schedule decided in advance. A payment term is not that. It is a
 * clock a document starts, and only the document knows when it started.
 *
 * ── What happens to the rows already written ─────────────────────────
 *
 * Seeded and production databases hold rows of both kinds, so both keep
 * their CATEGORY and LABEL entries below and an old row still reads as
 * "Invoice due" rather than as an enum. What they do not keep is the
 * ability to be created or completed.
 *
 * A row left uncompleted is the one that has to go: it is an obligation
 * against a date nobody can now stand behind, and the placement
 * timeline would go on calling it overdue for the life of the contract
 * while the invoice beside it says something else. `scripts/retire-due-
 * cycles.mjs` deletes the uncompleted ones, once, and counts them; it
 * leaves the completed ones alone, because those are a true record that
 * something happened on a day. Not a silent orphan and not a quiet
 * rewrite of history.
 *
 * ── Why a kind knows its side ────────────────────────────────────────
 *
 * Both generators wrote every cycle onto the sell contract, including
 * the salary and vendor-bill cycles that describe money going out. The
 * payroll screen reads those off the buy contract, where the 2017 system
 * put them and where they belong, so its cycle list was always empty
 * and nobody could tell. A kind that declares its side cannot be filed
 * on the wrong contract.
 *
 * ── Why a contract gets only what it needs ───────────────────────────
 *
 * A W-2 hire has no vendor to bill. A C2C sub-contract has no salary to
 * run. Nobody has a commission to calculate, because there is no
 * commission plan in the schema yet. Generating all of them for
 * everybody produced a contract whose list of obligations was as long
 * as the engine's vocabulary rather than as long as the contract, and a
 * due date for a figure nothing could compute.
 */

export type Side = 'SELL' | 'BUY'

/**
 * How a person reads the list. Hours, pay, bill — three words, not
 * nineteen states. Compliance is deliberately not a fourth bucket here:
 * it is not a cycle any more, and the placement thread already has a
 * station for it.
 */
export type Category = 'HOURS' | 'PAY' | 'BILL' | 'OTHER'

/**
 * The six that are generated. Every one is read by something, and every
 * one is a date the calendar decides rather than a date a document
 * carries.
 */
export const MONEY_KINDS = [
  'TIMESHEET_SUBMIT',
  'TIMESHEET_APPROVE',
  'INVOICE_GENERATE',
  'SALARY_CALCULATE',
  'SALARY_PAY',
  'VENDOR_BILL_GENERATE',
] as const

export type MoneyKind = (typeof MONEY_KINDS)[number]

/**
 * Recognized and categorized, never generated.
 *
 * A commission cycle is a due date for a calculation. Until a commission
 * plan exists to calculate against, that date is a promise nothing can
 * keep.
 *
 * An invoice due date and a vendor bill due date are here for the
 * opposite reason: not because nothing can compute them, but because
 * something already does, honestly, from the document itself. See the
 * header. The names are kept so an old row still reads sensibly.
 */
export const RESERVED_KINDS = [
  'COMMISSION_CALCULATE',
  'COMMISSION_PAY',
  'INVOICE_DUE',
  'VENDOR_BILL_DUE',
] as const

const SIDE: Record<MoneyKind, Side> = {
  TIMESHEET_SUBMIT: 'SELL',
  TIMESHEET_APPROVE: 'SELL',
  INVOICE_GENERATE: 'SELL',
  SALARY_CALCULATE: 'BUY',
  SALARY_PAY: 'BUY',
  VENDOR_BILL_GENERATE: 'BUY',
}

const CATEGORY: Record<string, Category> = {
  TIMESHEET_SUBMIT: 'HOURS',
  TIMESHEET_APPROVE: 'HOURS',
  SALARY_CALCULATE: 'PAY',
  SALARY_PAY: 'PAY',
  VENDOR_BILL_GENERATE: 'PAY',
  VENDOR_BILL_DUE: 'PAY',
  COMMISSION_CALCULATE: 'PAY',
  COMMISSION_PAY: 'PAY',
  INVOICE_GENERATE: 'BILL',
  INVOICE_DUE: 'BILL',
}

/** In the words a person would use, not the enum's. */
const LABEL: Record<string, string> = {
  TIMESHEET_SUBMIT: 'Hours due',
  TIMESHEET_APPROVE: 'Hours to approve',
  INVOICE_GENERATE: 'Invoice to raise',
  INVOICE_DUE: 'Invoice due',
  SALARY_CALCULATE: 'Pay to calculate',
  SALARY_PAY: 'Pay day',
  // Wrong twice over until 2026-09-17: we do not raise it — the supplier
  // issues its invoice and we receive it — and "bill" now belongs to the
  // customer direction. SAP calls this invoice receipt; an AP clerk calls
  // it recording the supplier's invoice, and CLAUDE.md says use theirs.
  VENDOR_BILL_GENERATE: 'Supplier invoice to record',
  // "Vendor bill due" until 2026-09-17, and wrong in the same two ways as
  // the line above: the supplier issues the invoice, and "bill" is now
  // the customer direction. Retired kinds are not exempt — an old row is
  // read by the same AP clerk as a new one, and a screen that says
  // "Vendor bill due" beside "Supplier invoice to record" teaches two
  // words for one thing. The enum is untouched, so no row in any
  // database moves; only what a person reads changes.
  VENDOR_BILL_DUE: 'Supplier invoice due',
  COMMISSION_CALCULATE: 'Commission to calculate',
  COMMISSION_PAY: 'Commission pay day',
}

export function isMoneyKind(kind: string): kind is MoneyKind {
  return (MONEY_KINDS as readonly string[]).includes(kind)
}

/** Null for anything that is not a money kind — it has no side to be on. */
export function sideOf(kind: string): Side | null {
  return isMoneyKind(kind) ? SIDE[kind] : null
}

/**
 * OTHER rather than a throw for an unknown kind. Rows written by an
 * earlier version of the engine still exist and still have to render.
 */
export function categoryOf(kind: string): Category {
  return CATEGORY[kind] ?? 'OTHER'
}

export function labelOf(kind: string): string {
  return LABEL[kind] ?? kind.replace(/_/g, ' ').toLowerCase()
}

/** The two facts about a buy contract that decide which cycles it needs. */
export interface ContractShape {
  contractType: string
  /** Set when there is a firm below us being paid. Null when we employ the person. */
  vendorCompanyId: string | null
}

export interface Split<T> {
  /** For the sell contract — hours and invoices. */
  sell: T[]
  /** For the buy contract — salary or vendor bill, never both. */
  buy: T[]
  /** Kinds the pack offered that are not money. Logged, never generated. */
  refused: string[]
}

/**
 * Which of a pack's cycle definitions this contract actually needs.
 *
 * The rule is the fact, not the label: a buy contract with a vendor
 * below it produces vendor-bill cycles, one without produces salary
 * cycles. `contractType` is carried for the reader; `vendorCompanyId`
 * decides. A W-2 contract that somehow named a vendor would be a data
 * error worth surfacing, and it would surface — as vendor-bill cycles
 * on a payroll run, which somebody would notice.
 *
 * No buy contract means no buy cycles. A sell contract standing alone
 * still gets its hours and invoices.
 */
export function cyclesFor<T extends { kind: string }>(
  buy: ContractShape | null,
  definitions: readonly T[]
): Split<T> {
  const sell: T[] = []
  const buyDefs: T[] = []
  const refused: string[] = []

  for (const d of definitions) {
    if (!isMoneyKind(d.kind)) {
      refused.push(d.kind)
      continue
    }
    if (SIDE[d.kind] === 'SELL') {
      sell.push(d)
      continue
    }
    if (!buy) continue
    const paysVendor = buy.vendorCompanyId !== null
    const isVendorBill = d.kind.startsWith('VENDOR_BILL_')
    if (paysVendor === isVendorBill) buyDefs.push(d)
  }

  return { sell, buy: buyDefs, refused }
}

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
 * to shift. What is left is eight kinds, and every one of them is read
 * by something.
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

/** The eight that are generated. Every one is read by something. */
export const MONEY_KINDS = [
  'TIMESHEET_SUBMIT',
  'TIMESHEET_APPROVE',
  'INVOICE_GENERATE',
  'INVOICE_DUE',
  'SALARY_CALCULATE',
  'SALARY_PAY',
  'VENDOR_BILL_GENERATE',
  'VENDOR_BILL_DUE',
] as const

export type MoneyKind = (typeof MONEY_KINDS)[number]

/**
 * Recognised and categorised, never generated.
 *
 * A commission cycle is a due date for a calculation. Until a commission
 * plan exists to calculate against, that date is a promise nothing can
 * keep. The names are kept so an old row still reads sensibly.
 */
export const RESERVED_KINDS = ['COMMISSION_CALCULATE', 'COMMISSION_PAY'] as const

const SIDE: Record<MoneyKind, Side> = {
  TIMESHEET_SUBMIT: 'SELL',
  TIMESHEET_APPROVE: 'SELL',
  INVOICE_GENERATE: 'SELL',
  INVOICE_DUE: 'SELL',
  SALARY_CALCULATE: 'BUY',
  SALARY_PAY: 'BUY',
  VENDOR_BILL_GENERATE: 'BUY',
  VENDOR_BILL_DUE: 'BUY',
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
  VENDOR_BILL_GENERATE: 'Vendor bill to raise',
  VENDOR_BILL_DUE: 'Vendor bill due',
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

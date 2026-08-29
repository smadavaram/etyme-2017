/**
 * The journal, and how a posting becomes one.
 *
 * ── What this is, and firmly is not ──────────────────────────────────
 *
 * Not a general ledger. We are not replacing anybody's ERP and should not
 * try: no trial balance, no period close, no statutory reporting, no
 * consolidation. A staffing platform that grows a finance system inside
 * it becomes a bad finance system attached to a good staffing platform.
 *
 * What it is: one canonical double-entry journal behind the postings, and
 * a mapping per accounting system.
 *
 * ── Why bother, rather than exporting the postings directly ──────────
 *
 * Because without it, every integration is its own transformation of our
 * posting shapes into somebody else's — SAP for a client, Oracle for
 * another, NetSuite for a vendor, QuickBooks for a smaller one, and a CSV
 * for the firm with no system at all. Five transformations, each able to
 * be wrong on its own, drifting apart as the posting kinds grow.
 *
 * With a journal there is one thing to get right and five mappings that
 * are only lookup tables. And a balanced journal is what an auditor asks
 * for anyway, so it earns its keep twice.
 *
 * ── The one rule ─────────────────────────────────────────────────────
 *
 * Debits equal credits. Every entry, no exceptions, checked before it is
 * written rather than reconciled afterwards.
 */

import type { PostingKind } from '@/lib/order'

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
export type Side = 'DEBIT' | 'CREDIT'

export interface Account {
  code: string
  name: string
  type: AccountType
  normalSide: Side
}

/**
 * A starting chart of accounts for a staffing firm.
 *
 * Deliberately small. A firm with its own chart maps ours onto theirs and
 * never sees these codes; a firm without one can work from this on day
 * one. Neither group is served by forty accounts they have to read.
 */
export const DEFAULT_ACCOUNTS: Account[] = [
  // Balance sheet
  { code: '1100', name: 'Accounts receivable', type: 'ASSET', normalSide: 'DEBIT' },
  { code: '1150', name: 'Unbilled revenue', type: 'ASSET', normalSide: 'DEBIT' },
  { code: '1200', name: 'Cash', type: 'ASSET', normalSide: 'DEBIT' },
  { code: '2100', name: 'Accounts payable', type: 'LIABILITY', normalSide: 'CREDIT' },
  { code: '2150', name: 'Accrued wages', type: 'LIABILITY', normalSide: 'CREDIT' },
  { code: '2200', name: 'Payroll taxes payable', type: 'LIABILITY', normalSide: 'CREDIT' },
  // Held back from a consultant's share. Somebody else's money on our
  // balance sheet, which is exactly why it is a liability and not revenue.
  { code: '2300', name: 'Consultant bench reserve', type: 'LIABILITY', normalSide: 'CREDIT' },

  // Trading
  { code: '4000', name: 'Placement revenue', type: 'REVENUE', normalSide: 'CREDIT' },
  { code: '4100', name: 'Expenses rebilled', type: 'REVENUE', normalSide: 'CREDIT' },
  { code: '5000', name: 'Consultant pay', type: 'EXPENSE', normalSide: 'DEBIT' },
  { code: '5010', name: 'Overtime and on-call', type: 'EXPENSE', normalSide: 'DEBIT' },
  { code: '5100', name: 'Employer burden', type: 'EXPENSE', normalSide: 'DEBIT' },
  { code: '5200', name: 'Reimbursed expenses', type: 'EXPENSE', normalSide: 'DEBIT' },
  { code: '5300', name: 'Commission', type: 'EXPENSE', normalSide: 'DEBIT' },
  { code: '5400', name: 'Immigration and legal', type: 'EXPENSE', normalSide: 'DEBIT' },
  { code: '6000', name: 'Back office and overhead', type: 'EXPENSE', normalSide: 'DEBIT' },
]

export interface Line {
  accountCode: string
  debitCents: number
  creditCents: number
  memo?: string
}

export interface Entry {
  postedAt: Date
  memo: string
  lines: Line[]
}

/**
 * The account each kind of posting hits, and its contra.
 *
 * Written as a table on purpose. Every argument about where a cost
 * belongs is settled here, once, in a place somebody who is not a
 * programmer can be walked through.
 */
const RULES: Record<PostingKind, { account: string; contra: string; what: string }> = {
  // Earned but not yet invoiced. Moves to receivable when the invoice is
  // raised; recognising it straight into AR would report a debt the client
  // has never been told about.
  // Written debit-first like the rest: debit unbilled revenue (an asset),
  // credit placement revenue. It reaches this table with a positive sign
  // and so is not swapped.
  REVENUE: { account: '1150', contra: '4000', what: 'Revenue earned' },
  PAY: { account: '5000', contra: '2150', what: 'Consultant pay' },
  PREMIUM: { account: '5010', contra: '2150', what: 'Overtime and on-call' },
  BURDEN: { account: '5100', contra: '2200', what: 'Employer burden' },
  EXPENSE: { account: '5200', contra: '2100', what: 'Expenses' },
  COMMISSION: { account: '5300', contra: '2100', what: 'Commission' },
  VISA: { account: '5400', contra: '2100', what: 'Immigration and legal' },
  OVERHEAD: { account: '6000', contra: '2100', what: 'Back office and overhead' },
  // Held back from a consultant's share. It stops being an expense and
  // becomes something we owe them, so it sits on the balance sheet rather
  // than in the month's cost.
  RESERVE: { account: '5000', contra: '2300', what: 'Held to bench reserve' },
  SETTLEMENT: { account: '6000', contra: '6000', what: 'Settlement' },
}

/**
 * One posting, as a balanced pair of lines.
 *
 * The posting's own sign decides the direction: money in credits revenue
 * and debits the asset, money out debits the expense and credits what is
 * owed. Reversals fall out of this for free, because a reversal is a
 * posting with the opposite sign.
 */
export function entryFor(p: {
  kind: PostingKind
  amountCents: number
  postedAt: Date
  says: string
}): Entry {
  const rule = RULES[p.kind]
  const magnitude = Math.abs(p.amountCents)

  // The table already puts the debit and the credit the right way round
  // for each kind — money in debits an asset and credits income, money
  // out debits an expense and credits a payable — so the sign only
  // decides which way to swap them. A reversal falls out for free,
  // because a reversal is a posting with the opposite sign.
  const [debitAccount, creditAccount] =
    p.amountCents >= 0 ? [rule.account, rule.contra] : [rule.contra, rule.account]

  const lines: Line[] = [
    { accountCode: debitAccount, debitCents: magnitude, creditCents: 0, memo: rule.what },
    { accountCode: creditAccount, debitCents: 0, creditCents: magnitude, memo: rule.what },
  ]

  return { postedAt: p.postedAt, memo: p.says, lines }
}

/**
 * Invoicing moves what was earned into what is owed.
 *
 * A separate entry rather than a change to the first, because the first
 * was true when it was written: work was done and revenue was earned. The
 * client simply had not been asked for it yet.
 */
export function onInvoice(amountCents: number, postedAt: Date, ref: string): Entry {
  const n = Math.abs(amountCents)
  return {
    postedAt,
    memo: `Invoiced ${ref}`,
    lines: [
      { accountCode: '1100', debitCents: n, creditCents: 0, memo: 'Receivable raised' },
      { accountCode: '1150', debitCents: 0, creditCents: n, memo: 'Unbilled revenue cleared' },
    ],
  }
}

/**
 * A credit note is the invoice entry, backwards, in the invoice's period.
 *
 * ── The two things this gets right that a manual credit does not ─────
 *
 * **It reverses revenue and not cash.** Crediting a client is not a
 * payment to them: no money moves. The receivable goes down and the
 * revenue that raised it goes down with it. Booking a credit against cash
 * would report a payment out that never happened.
 *
 * **It posts to the period the invoice belonged to.** March revenue
 * credited in June is a March correction. Posting it to June overstates
 * one quarter and understates the next, and the two errors never meet
 * because they are in different reports.
 *
 * The reason code travels in the memo rather than in the accounts. Which
 * account a credit hits is a question about revenue; WHY it was given is
 * a question about how we bill, and the second one is answered by
 * counting reason codes, not by reading a chart.
 */
export function onCreditNote(
  amountCents: number,
  /** The date the INVOICE belonged to, not today. */
  postedAt: Date,
  ref: string,
  reasonCode: string
): Entry {
  const n = Math.abs(amountCents)
  return {
    postedAt,
    memo: `Credit note against ${ref} — ${reasonCode}`,
    lines: [
      { accountCode: '4000', debitCents: n, creditCents: 0, memo: 'Revenue given up' },
      { accountCode: '1100', debitCents: 0, creditCents: n, memo: 'Receivable reduced' },
    ],
  }
}

/** Cash arriving clears the receivable. Nothing about margin changes. */
export function onReceipt(amountCents: number, postedAt: Date, ref: string): Entry {
  const n = Math.abs(amountCents)
  return {
    postedAt,
    memo: `Received against ${ref}`,
    lines: [
      { accountCode: '1200', debitCents: n, creditCents: 0, memo: 'Cash in' },
      { accountCode: '1100', debitCents: 0, creditCents: n, memo: 'Receivable cleared' },
    ],
  }
}

/** Paying a consultant or a supplier clears what was owed. */
export function onPayment(
  amountCents: number,
  postedAt: Date,
  ref: string,
  owedAccount: '2150' | '2100' | '2200' | '2300' = '2150'
): Entry {
  const n = Math.abs(amountCents)
  return {
    postedAt,
    memo: `Paid ${ref}`,
    lines: [
      { accountCode: owedAccount, debitCents: n, creditCents: 0, memo: 'Liability cleared' },
      { accountCode: '1200', debitCents: 0, creditCents: n, memo: 'Cash out' },
    ],
  }
}

// ── The one rule ──────────────────────────────────────────────────────

export interface Balance {
  balanced: boolean
  debitCents: number
  creditCents: number
  differenceCents: number
  says: string
}

/**
 * Debits equal credits, checked before writing.
 *
 * Reconciling afterwards means discovering in March that February was
 * wrong, by which time somebody has already filed something.
 */
export function balance(e: Entry): Balance {
  const debit = e.lines.reduce((n, l) => n + l.debitCents, 0)
  const credit = e.lines.reduce((n, l) => n + l.creditCents, 0)
  const diff = debit - credit

  return {
    balanced: diff === 0,
    debitCents: debit,
    creditCents: credit,
    differenceCents: diff,
    says:
      diff === 0
        ? `Balanced at ${money(debit)}.`
        : `Out by ${money(Math.abs(diff))} — ${money(debit)} debit against ${money(credit)} credit. ` +
          `This will not be written.`,
  }
}

/** A line with a debit and a credit on it is a mistake, not a shortcut. */
export function wellFormed(e: Entry): string[] {
  const problems: string[] = []
  if (e.lines.length < 2) problems.push('An entry needs at least two lines.')
  for (const [i, l] of e.lines.entries()) {
    if (l.debitCents < 0 || l.creditCents < 0) {
      problems.push(`Line ${i + 1} has a negative amount. Use the other side instead.`)
    }
    if (l.debitCents > 0 && l.creditCents > 0) {
      problems.push(`Line ${i + 1} has both a debit and a credit. It has to be one or the other.`)
    }
    if (l.debitCents === 0 && l.creditCents === 0) {
      problems.push(`Line ${i + 1} moves nothing.`)
    }
  }
  if (!balance(e).balanced) problems.push(balance(e).says)
  return problems
}

/** Reverses an entry by swapping every side. Nothing is deleted. */
export function reverse(e: Entry, why: string): Entry {
  return {
    // The period it belonged to, not the period somebody noticed.
    postedAt: e.postedAt,
    memo: `Reverses: ${e.memo} — ${why}`,
    lines: e.lines.map((l) => ({
      accountCode: l.accountCode,
      debitCents: l.creditCents,
      creditCents: l.debitCents,
      memo: l.memo,
    })),
  }
}

// ── Speaking their language ───────────────────────────────────────────

export type ErpSystem =
  | 'SAP' | 'ORACLE' | 'WORKDAY'
  | 'NETSUITE' | 'QUICKBOOKS' | 'XERO'
  | 'CSV'

/**
 * Which accounting systems each side of the market actually runs.
 *
 * Not a preference. A client running SAP will not adopt our chart of
 * accounts and a two-person vendor on QuickBooks has no chart to adopt.
 * The mapping goes to them.
 */
export const TYPICALLY: Record<ErpSystem, 'CLIENT' | 'VENDOR' | 'EITHER'> = {
  SAP: 'CLIENT',
  ORACLE: 'CLIENT',
  WORKDAY: 'CLIENT',
  NETSUITE: 'VENDOR',
  QUICKBOOKS: 'VENDOR',
  XERO: 'VENDOR',
  CSV: 'EITHER',
}

export interface ExportRow {
  /** Their account code, from the map. */
  account: string
  debit: string
  credit: string
  currency: string
  date: string
  memo: string
  /** Their cost object, where their system demands one on every line. */
  costObject?: string
  reference?: string
}

/**
 * Turns one entry into rows in a shape a given system will take.
 *
 * Refuses on an unmapped account rather than substituting a default. A
 * line landing in a suspense account is a line somebody has to chase in a
 * month, and they will chase it in our direction.
 */
export function toExport(
  e: Entry,
  system: ErpSystem,
  map: Record<string, { account: string; costObject?: string }>,
  currency: string,
  reference?: string
): { rows: ExportRow[]; unmapped: string[] } {
  const unmapped = [...new Set(e.lines.map((l) => l.accountCode).filter((c) => !map[c]))]
  if (unmapped.length > 0) return { rows: [], unmapped }

  const date = e.postedAt.toISOString().slice(0, 10)

  return {
    rows: e.lines.map((l) => ({
      account: map[l.accountCode].account,
      debit: l.debitCents === 0 ? '' : (l.debitCents / 100).toFixed(2),
      credit: l.creditCents === 0 ? '' : (l.creditCents / 100).toFixed(2),
      currency,
      date,
      memo: l.memo ?? e.memo,
      costObject: map[l.accountCode].costObject,
      reference,
    })),
    unmapped: [],
  }
}

function money(cents: number): string {
  const n = Math.abs(cents) / 100
  return `${cents < 0 ? '-' : ''}$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

import { decimalsFor } from '@/lib/money'

/**
 * An approved payment run, as a file the payer's own system reads.
 *
 * The founder, 2026-11-12: "Most clients don't want to pay here. They want
 * ERP systems to pay them." Etyme never moves money. A payment run is the
 * list of invoice receipts that passed the three-way check and were
 * approved to pay; this file is that list, in a shape the payer's system
 * takes in, and the confirmation that comes back names each line by the
 * reference written here.
 *
 * One generic CSV. No vendor's format: a named format is built only when a
 * paying client names one (CLAUDE.md, the same day).
 *
 * What a row carries, and what it never carries:
 *   · the supplier, its invoice number, Etyme's receipt id, the order;
 *   · the amount as a decimal in the currency's own places (a dong figure
 *     has none, a dinar three), never a float, never with a symbol;
 *   · the currency, on every row. A run is one currency, and still a
 *     total is one per currency and never across two;
 *   · the pay-to details on record as the bank name, the account name and
 *     the last four digits. Etyme does not store a full account or routing
 *     number, and the file cuts what it is handed to four digits anyway, so
 *     a bad row upstream can never put one in a file;
 *   · the due date as YYYY-MM-DD;
 *   · a stable Etyme payment reference, one per line of the run, which the
 *     confirmation carries back;
 *   · a blank paid date and payer reference, so the payer's system can fill
 *     them in and send the same file back as its confirmation.
 *
 * A line whose receipt does not pass the payment gate today is left out
 * and named in a sentence, never quietly dropped: the same gate the run's
 * release and the Pay button read (`mayPayKeyedReceipt`).
 *
 * Pure. No database.
 */

export const RUN_FILE_COLUMNS = [
  'etyme_payment_reference',
  'supplier',
  'supplier_invoice_number',
  'etyme_receipt_id',
  'order_number',
  'amount',
  'currency',
  'due_date',
  'bank_name',
  'account_name',
  'account_last4',
  // Left blank, for the payer's system to fill in: the file can come back
  // as its own confirmation (lib/money/run-confirm).
  'paid_date',
  'payer_reference',
] as const

/** The reference cell on a total row, which the confirmation import skips. */
export const TOTAL_REFERENCE = 'TOTAL'

const REF_PREFIX = 'ETY-'

/** The Etyme payment reference for one line of a run. Stable: the run item's own id. */
export function paymentReference(runItemId: string): string {
  return `${REF_PREFIX}${runItemId}`
}

/** The run item a reference names, or null where it is not one of ours. */
export function runItemOf(reference: string): string | null {
  const r = reference.trim()
  if (!r.toUpperCase().startsWith(REF_PREFIX)) return null
  const id = r.slice(REF_PREFIX.length)
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : null
}

/**
 * Integer minor units as a plain decimal in the currency's own places.
 * Built from the integer, never from a float: 123456789 USD reads 1234567.89.
 */
export function decimalAmount(minor: number, currency: string): string {
  if (!Number.isInteger(minor)) throw new Error(`An amount is whole minor units; ${minor} is not.`)
  const d = decimalsFor(currency)
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  if (d === 0) return `${sign}${abs}`
  const unit = 10 ** d
  const whole = Math.floor(abs / unit)
  const frac = String(abs % unit).padStart(d, '0')
  return `${sign}${whole}.${frac}`
}

/** The last four digits of whatever is on record, and nothing more. */
export function lastFour(stored: string | null | undefined): string {
  const digits = String(stored ?? '').replace(/\D/g, '')
  return digits.slice(-4)
}

export interface RunFileLine {
  runItemId: string
  billId: string
  /** The supplier's invoice number: theirs, not ours. */
  number: string
  vendorName: string
  orderNumber: string | null
  /** What the run will pay on this line, in minor units. */
  amountCents: number
  /** What is still owed on the receipt today, in minor units. */
  owedCents: number
  currency: string
  dueAt: Date
  bank: { bankName: string | null; accountName: string | null; accountLast4: string | null } | null
  /** The payment gate today: ok, or the gate's own sentence. */
  gate: { ok: true } | { ok: false; says: string }
}

export interface RunFileHeld {
  runItemId: string
  billId: string
  number: string
  vendorName: string
  says: string
}

export interface RunFile {
  csv: string
  filename: string
  /** Rows in the file, total rows not counted. */
  rows: number
  held: RunFileHeld[]
  /** One per currency in the file. Never a sum across two. */
  totals: { currency: string; minor: number; amount: string }[]
  /** One sentence: what is in the file, what was left out and why. */
  says: string
}

/** Why a line is left out of the file, or null where it goes in. */
export function heldReason(line: RunFileLine): string | null {
  if (!line.gate.ok) return line.gate.says
  if (line.owedCents !== line.amountCents) {
    return (
      `${line.vendorName}’s invoice ${line.number} is left out: the run was assembled to pay ` +
      `${decimalAmount(line.amountCents, line.currency)} ${line.currency.toUpperCase()} and ` +
      `${decimalAmount(Math.max(0, line.owedCents), line.currency)} is owed on it now. Cancel the run and assemble it again.`
    )
  }
  if (!line.bank || !lastFour(line.bank.accountLast4)) {
    return `${line.vendorName}’s invoice ${line.number} is left out: no pay-to account is on record for ${line.vendorName}.`
  }
  return null
}

/** One CSV cell: quoted where it must be, and never read as a formula by a spreadsheet. */
export function csvCell(value: string): string {
  let v = value
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/**
 * The file for one approved run.
 *
 * `run.status` must be APPROVED: a draft is a proposal nobody has signed
 * off, and the caller refuses it in its own sentence before this is asked.
 */
export function runFile(
  run: { id: string; currency: string; scheduledFor: Date },
  lines: RunFileLine[],
): RunFile {
  const held: RunFileHeld[] = []
  const going: RunFileLine[] = []
  for (const l of lines) {
    const why = heldReason(l)
    if (why) held.push({ runItemId: l.runItemId, billId: l.billId, number: l.number, vendorName: l.vendorName, says: why })
    else going.push(l)
  }

  const out: string[] = [RUN_FILE_COLUMNS.join(',')]
  for (const l of going) {
    const cur = l.currency.toUpperCase()
    out.push(
      [
        paymentReference(l.runItemId),
        l.vendorName,
        l.number,
        l.billId,
        l.orderNumber ?? '',
        decimalAmount(l.amountCents, cur),
        cur,
        l.dueAt.toISOString().slice(0, 10),
        l.bank?.bankName ?? '',
        l.bank?.accountName ?? '',
        lastFour(l.bank?.accountLast4),
        '',
        '',
      ].map(csvCell).join(',')
    )
  }

  // One total per currency, each in its own places. A run is one currency,
  // so this is one row; it is grouped anyway, so two can never be added.
  const byCurrency = new Map<string, number>()
  for (const l of going) {
    const cur = l.currency.toUpperCase()
    byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + l.amountCents)
  }
  const totals = [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, minor]) => ({ currency, minor, amount: decimalAmount(minor, currency) }))
  for (const t of totals) {
    out.push([TOTAL_REFERENCE, `Total ${t.currency}`, '', '', '', t.amount, t.currency, '', '', '', '', '', ''].map(csvCell).join(','))
  }

  const day = run.scheduledFor.toISOString().slice(0, 10)
  const n = going.length
  const left =
    held.length === 0
      ? ''
      : ` ${held.length === 1 ? 'One invoice receipt is' : `${held.length} invoice receipts are`} left out. ${held.map((h) => h.says).join(' ')}`
  return {
    csv: `${out.join('\r\n')}\r\n`,
    filename: `payment-run-${day}-${run.currency.toUpperCase()}-${run.id.slice(-6)}.csv`,
    rows: n,
    held,
    totals,
    says:
      (n === 0
        ? 'Nothing in this run can be paid today, so the file has no lines.'
        : `${n} invoice receipt${n === 1 ? '' : 's'} in the file, for your payment system to pay. Etyme sends no money.`) + left,
  }
}

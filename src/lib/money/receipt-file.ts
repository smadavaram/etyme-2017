import { allocateAmount, validateAllocation, formatShare } from '@/lib/cost-allocation'
import { decimalAmount, csvCell } from '@/lib/money/run-file'

/**
 * The invoice receipts a client received, as lines in the client's own
 * codes, for the client's own payment or accounting system.
 *
 * Layer 9, slice 1 (records 80, 86, 87). Clients very rarely pay in
 * Etyme: they take the lines into their own procurement or accounting
 * system. So the file is one row per receipt line, coded with the
 * client's cost object and GL account, one generic layout with a column
 * picker, no layout named after a product.
 *
 * What it never carries: a bank name, an account name, any digits of an
 * account. The client's own system holds the bank (record 87, defaults).
 *
 * What it never does:
 *   · put a receipt in that the payment gate (`mayPayKeyedReceipt`)
 *     refuses today: the caller hands the gate's answer in, and a
 *     refusal is a sentence in `held`, never a quiet omission;
 *   · put a line in that has no client code: it is held and named, and
 *     the sentence says the receipt's other lines are in the file;
 *   · let a split lose or gain a cent: a line split across cost centers
 *     is one row per share, by largest remainder (`lib/cost-allocation`),
 *     and the hours are split the same way;
 *   · let the picker change a row or a total: the columns are chosen
 *     after the rows and the totals are worked out.
 *
 * Pure. No database.
 */

export interface ColumnSpec {
  id: string
  /** What the picker calls it: a trade word, not a field name. */
  label: string
}

/** Every column the client may choose, in the default order. */
export const RECEIPT_COLUMNS: readonly ColumnSpec[] = [
  { id: 'etyme_row_id', label: 'Row id' },
  { id: 'etyme_line_id', label: 'Line id' },
  { id: 'etyme_receipt_id', label: 'Etyme receipt id' },
  { id: 'supplier_invoice_number', label: 'Supplier invoice number' },
  { id: 'supplier', label: 'Supplier' },
  { id: 'supplier_etyme_id', label: 'Supplier id at Etyme' },
  { id: 'order_number', label: 'Order number' },
  { id: 'order_line_id', label: 'Order line id' },
  { id: 'person', label: 'Person' },
  { id: 'period_start', label: 'Week starts' },
  { id: 'period_end', label: 'Week ends' },
  { id: 'signed_week', label: 'Signed week' },
  { id: 'approver', label: 'Approved by' },
  { id: 'approved_on', label: 'Approved on' },
  { id: 'hours', label: 'Hours' },
  { id: 'rate', label: 'Rate' },
  { id: 'amount', label: 'Amount' },
  { id: 'currency', label: 'Currency' },
  { id: 'share', label: 'Share of the line' },
  { id: 'cost_object_type', label: 'Cost object type' },
  { id: 'cost_object', label: 'Cost object' },
  { id: 'gl_account', label: 'GL account' },
  { id: 'due_date', label: 'Due date' },
]

export const DEFAULT_RECEIPT_COLUMNS: readonly string[] = RECEIPT_COLUMNS.map((c) => c.id)

/**
 * The columns the client asked for, in the order it asked, or a sentence.
 * Nothing asked for means every column. A repeat is read once.
 */
export function pickColumns(
  asked: readonly string[] | null | undefined,
): { ok: true; ids: string[] } | { ok: false; says: string } {
  const wanted = (asked ?? []).map((a) => a.trim()).filter(Boolean)
  if (wanted.length === 0) return { ok: true, ids: [...DEFAULT_RECEIPT_COLUMNS] }
  const known = new Set(DEFAULT_RECEIPT_COLUMNS)
  const unknown = wanted.filter((w) => !known.has(w))
  if (unknown.length > 0) {
    return {
      ok: false,
      says: `The file has no column called ${unknown.map((u) => `“${u}”`).join(', ')}. Choose from the columns the page lists.`,
    }
  }
  return { ok: true, ids: [...new Set(wanted)] }
}

/** One part of a line's split, in the client's own codes. */
export interface CodeShare {
  /** Unique within the line: the cost center the share belongs to. */
  key: string
  costObjectType: 'COST_CENTER' | 'INTERNAL_ORDER'
  costObject: string
  glAccount: string | null
  shareBps: number
}

export interface ReceiptLineIn {
  id: string
  personId: string | null
  person: string | null
  periodStart: Date | null
  periodEnd: Date | null
  /** The signed week this line bills, by the id Etyme keeps it under. */
  signedWeek: string | null
  approver: string | null
  approvedOn: Date | null
  /** Hours as the receipt names them; null on an expense or milestone line. */
  hours: number | null
  rateCents: number | null
  amountCents: number
  /** The client's coding for this line. Empty where the client has not coded it. */
  shares: CodeShare[]
}

export interface ReceiptIn {
  runItemId: string
  billId: string
  number: string
  vendorId: string
  vendorName: string
  orderNumber: string | null
  orderLineId: string | null
  /** What the run pays on this receipt, in minor units. */
  amountCents: number
  /** What is still owed on it today, in minor units. */
  owedCents: number
  currency: string
  dueAt: Date
  /** The payment gate today: ok, or the gate's own sentence. */
  gate: { ok: true } | { ok: false; says: string }
  lines: ReceiptLineIn[]
}

export interface HeldFromReceiptFile {
  billId: string
  number: string
  vendorName: string
  /** Set where one line is held and the rest of the receipt is in the file. */
  lineId: string | null
  person: string | null
  says: string
}

export interface ReceiptFileRow {
  rowId: string
  lineId: string
  billId: string
  currency: string
  amountCents: number
  cells: Record<string, string>
}

export interface ReceiptFile {
  csv: string
  filename: string
  columns: string[]
  /** Rows in the file; the header is not counted. */
  rows: number
  held: HeldFromReceiptFile[]
  /** One per currency in the file. Never a sum across two, never changed by the picker. */
  totals: { currency: string; minor: number; amount: string }[]
  /** The people on the lines in the file, once each: whom the read is logged against. */
  personIds: string[]
  says: string
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '')

/** Hours as a decimal to two places, from hundredths. */
const hundredths = (h: number) => {
  const sign = h < 0 ? '-' : ''
  const a = Math.abs(h)
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`
}

/** Why a whole receipt is left out, or null where its lines are looked at one by one. */
function receiptHeld(r: ReceiptIn): string | null {
  if (!r.gate.ok) return r.gate.says
  const who = `${r.vendorName}’s invoice ${r.number}`
  if (r.owedCents !== r.amountCents) {
    return (
      `${who} is left out: the run was assembled to pay ${decimalAmount(r.amountCents, r.currency)} ` +
      `${r.currency.toUpperCase()} and ${decimalAmount(Math.max(0, r.owedCents), r.currency)} is owed on it now. ` +
      `Cancel the run and assemble it again.`
    )
  }
  if (r.lines.length === 0) {
    return `${who} is left out: it was recorded as a total with no lines, so there is no line to code.`
  }
  const sum = r.lines.reduce((s, l) => s + l.amountCents, 0)
  if (sum !== r.amountCents) {
    return (
      `${who} is left out: its lines add up to ${decimalAmount(sum, r.currency)} ${r.currency.toUpperCase()} ` +
      `and the run pays ${decimalAmount(r.amountCents, r.currency)}.`
    )
  }
  return null
}

/** Why one line is left out, or null where it is coded and goes in. */
function lineHeld(r: ReceiptIn, l: ReceiptLineIn): string | null {
  const what = l.person ? `${l.person}’s line` : 'A line'
  if (l.shares.length === 0) {
    return (
      `${what} on ${r.vendorName}’s invoice ${r.number} is left out: it has no cost center or order of yours. ` +
      `Code the contract it bills, then download again.`
    )
  }
  const v = validateAllocation(l.shares.map((s) => ({ costCenterId: s.key, shareBps: s.shareBps })))
  if (!v.valid) {
    return `${what} on ${r.vendorName}’s invoice ${r.number} is left out: its cost split is not whole. ${v.errors[0]}.`
  }
  return null
}

export function receiptFile(
  run: { id: string; currency: string; scheduledFor: Date },
  receipts: ReceiptIn[],
  columnIds: readonly string[] = DEFAULT_RECEIPT_COLUMNS,
): ReceiptFile {
  const held: HeldFromReceiptFile[] = []
  const rows: ReceiptFileRow[] = []
  const personIds = new Set<string>()
  let partly = 0

  for (const r of receipts) {
    const why = receiptHeld(r)
    if (why) {
      held.push({ billId: r.billId, number: r.number, vendorName: r.vendorName, lineId: null, person: null, says: why })
      continue
    }
    const cur = r.currency.toUpperCase()
    let leftOut = 0
    for (const l of r.lines) {
      const lineWhy = lineHeld(r, l)
      if (lineWhy) {
        held.push({ billId: r.billId, number: r.number, vendorName: r.vendorName, lineId: l.id, person: l.person, says: lineWhy })
        leftOut++
        continue
      }
      const shares = l.shares.map((s) => ({ costCenterId: s.key, shareBps: s.shareBps }))
      const money = allocateAmount(l.amountCents, shares)
      const time = l.hours == null ? null : allocateAmount(Math.round(l.hours * 100), shares)
      for (const part of money) {
        const s = l.shares.find((x) => x.key === part.costCenterId)!
        const h = time?.find((x) => x.costCenterId === part.costCenterId)
        const rowId = `${l.id}:${s.key}`
        rows.push({
          rowId,
          lineId: l.id,
          billId: r.billId,
          currency: cur,
          amountCents: part.amountCents,
          cells: {
            etyme_row_id: rowId,
            etyme_line_id: l.id,
            etyme_receipt_id: r.billId,
            supplier_invoice_number: r.number,
            supplier: r.vendorName,
            supplier_etyme_id: r.vendorId,
            order_number: r.orderNumber ?? '',
            order_line_id: r.orderLineId ?? '',
            person: l.person ?? '',
            period_start: day(l.periodStart),
            period_end: day(l.periodEnd),
            signed_week: l.signedWeek ?? '',
            approver: l.approver ?? '',
            approved_on: day(l.approvedOn),
            hours: h ? hundredths(h.amountCents) : '',
            rate: l.rateCents == null ? '' : decimalAmount(l.rateCents, cur),
            amount: decimalAmount(part.amountCents, cur),
            currency: cur,
            share: formatShare(part.shareBps),
            cost_object_type: s.costObjectType,
            cost_object: s.costObject,
            gl_account: s.glAccount ?? '',
            due_date: day(r.dueAt),
          },
        })
      }
      if (l.personId) personIds.add(l.personId)
    }
    if (leftOut > 0 && leftOut < r.lines.length) partly++
  }

  // Totals are worked out from the rows, before the picker is looked at.
  const byCurrency = new Map<string, number>()
  for (const row of rows) byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + row.amountCents)
  const totals = [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, minor]) => ({ currency, minor, amount: decimalAmount(minor, currency) }))

  const header = columnIds.join(',')
  const body = rows.map((row) => columnIds.map((c) => csvCell(row.cells[c] ?? '')).join(','))
  const n = rows.length
  const left =
    held.length === 0
      ? ''
      : ` ${held.length === 1 ? 'One item is' : `${held.length} items are`} left out. ${held.map((h) => h.says).join(' ')}` +
        (partly > 0 ? ' Where only a line is left out, the rest of that invoice is in the file.' : '')

  return {
    csv: `${[header, ...body].join('\r\n')}\r\n`,
    filename: `invoice-lines-${run.scheduledFor.toISOString().slice(0, 10)}-${run.currency.toUpperCase()}-${run.id.slice(-6)}.csv`,
    columns: [...columnIds],
    rows: n,
    held,
    totals,
    personIds: [...personIds],
    says:
      (n === 0
        ? 'Nothing in this run can be put in the file today, so it has no lines.'
        : `${n} line${n === 1 ? '' : 's'} in the file, coded with your own cost centers, for your own system to pay from. Etyme sends no money and the file holds no bank details.`) +
      left,
  }
}

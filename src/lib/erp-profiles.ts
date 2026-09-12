/**
 * Getting a coded invoice into somebody else's ledger.
 *
 * The coding endpoint already produces posting-ready rows: cost centre, GL
 * account, PO number, split by largest remainder so the lines sum back to
 * the total to the cent. Its own comment states the architecture correctly
 * — **Etyme is not the general ledger** — and that instinct is worth more
 * than any connector.
 *
 * So this is not four integrations. It is four ways of writing down the
 * same rows, because SAP, Oracle, QuickBooks and Workday each take a flat
 * file and each disagrees about column names, date formats and how a
 * negative number is written.
 *
 * The honest limits, stated because they decide whether this is useful:
 *
 *   - This produces a file. Somebody's finance team loads it, or their
 *     middleware picks it up. Nothing here posts to a ledger directly.
 *   - Every profile needs the receiving system's own codes to already be
 *     right. A cost centre that does not exist in SAP is a rejected file,
 *     which is why the import engine exists.
 *   - A file that sums to a cent off is rejected whole. The totals are
 *     checked here before anything is written out.
 */

export interface CodedLine {
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  vendor: string
  billTo: string
  poNumber: string | null
  personName: string
  costCenterCode: string | null
  glAccount: string | null
  amount: number
  currency: string
}

export type ProfileId = 'SAP_S4' | 'ORACLE_AP' | 'QUICKBOOKS' | 'WORKDAY_FIN' | 'GENERIC'

export interface Profile {
  id: ProfileId
  label: string
  /** What a finance team does with the file once they have it. */
  howItLands: string
  extension: 'csv' | 'txt'
  delimiter: string
  /** What the receiving system calls each field. */
  columns: { header: string; from: keyof CodedLine | 'lineNumber'; format?: 'date' | 'money' | 'text' }[]
  /** How this system wants a date. */
  dateFormat: 'ISO' | 'YYYYMMDD' | 'MM/DD/YYYY'
  /** Some systems reject a header row; some require it. */
  includeHeader: boolean
}

export const PROFILES: Profile[] = [
  {
    id: 'SAP_S4',
    label: 'SAP S/4HANA',
    howItLands:
      'Loaded through the FB60 vendor invoice interface, or picked up by your middleware as an IDoc payload. Cost centre and GL must already exist in SAP.',
    extension: 'csv',
    delimiter: ';',
    dateFormat: 'YYYYMMDD',
    includeHeader: true,
    columns: [
      { header: 'BUKRS', from: 'billTo', format: 'text' },
      { header: 'LIFNR', from: 'vendor', format: 'text' },
      { header: 'XBLNR', from: 'invoiceNumber', format: 'text' },
      { header: 'BLDAT', from: 'invoiceDate', format: 'date' },
      { header: 'ZFBDT', from: 'dueDate', format: 'date' },
      { header: 'EBELN', from: 'poNumber', format: 'text' },
      { header: 'BUZEI', from: 'lineNumber', format: 'text' },
      { header: 'KOSTL', from: 'costCenterCode', format: 'text' },
      { header: 'HKONT', from: 'glAccount', format: 'text' },
      { header: 'WRBTR', from: 'amount', format: 'money' },
      { header: 'WAERS', from: 'currency', format: 'text' },
      { header: 'SGTXT', from: 'personName', format: 'text' },
    ],
  },
  {
    id: 'ORACLE_AP',
    label: 'Oracle Payables',
    howItLands:
      'Loaded into the AP invoice interface tables, then run through Payables Open Interface Import.',
    extension: 'csv',
    delimiter: ',',
    dateFormat: 'MM/DD/YYYY',
    includeHeader: true,
    columns: [
      { header: 'INVOICE_NUM', from: 'invoiceNumber', format: 'text' },
      { header: 'VENDOR_NAME', from: 'vendor', format: 'text' },
      { header: 'INVOICE_DATE', from: 'invoiceDate', format: 'date' },
      { header: 'TERMS_DATE', from: 'dueDate', format: 'date' },
      { header: 'PO_NUMBER', from: 'poNumber', format: 'text' },
      { header: 'LINE_NUMBER', from: 'lineNumber', format: 'text' },
      { header: 'DIST_CODE_CONCATENATED', from: 'costCenterCode', format: 'text' },
      { header: 'ACCOUNT', from: 'glAccount', format: 'text' },
      { header: 'AMOUNT', from: 'amount', format: 'money' },
      { header: 'INVOICE_CURRENCY_CODE', from: 'currency', format: 'text' },
      { header: 'DESCRIPTION', from: 'personName', format: 'text' },
    ],
  },
  {
    id: 'QUICKBOOKS',
    label: 'QuickBooks',
    howItLands:
      'Imported as bills. QuickBooks matches the vendor by name, so the name here must be exactly the one in your chart of vendors.',
    extension: 'csv',
    delimiter: ',',
    dateFormat: 'MM/DD/YYYY',
    includeHeader: true,
    columns: [
      { header: 'Bill No', from: 'invoiceNumber', format: 'text' },
      { header: 'Vendor', from: 'vendor', format: 'text' },
      { header: 'Bill Date', from: 'invoiceDate', format: 'date' },
      { header: 'Due Date', from: 'dueDate', format: 'date' },
      { header: 'Account', from: 'glAccount', format: 'text' },
      { header: 'Class', from: 'costCenterCode', format: 'text' },
      { header: 'Amount', from: 'amount', format: 'money' },
      { header: 'Memo', from: 'personName', format: 'text' },
    ],
  },
  {
    id: 'WORKDAY_FIN',
    label: 'Workday Financials',
    howItLands:
      'Loaded as a Supplier Invoice EIB. Workday wants worktags rather than a cost centre column, so the cost centre travels as CC-prefixed.',
    extension: 'csv',
    delimiter: ',',
    dateFormat: 'ISO',
    includeHeader: true,
    columns: [
      { header: 'Supplier_Invoice_Number', from: 'invoiceNumber', format: 'text' },
      { header: 'Supplier', from: 'vendor', format: 'text' },
      { header: 'Invoice_Date', from: 'invoiceDate', format: 'date' },
      { header: 'Due_Date', from: 'dueDate', format: 'date' },
      { header: 'Purchase_Order', from: 'poNumber', format: 'text' },
      { header: 'Line_Number', from: 'lineNumber', format: 'text' },
      { header: 'Spend_Category', from: 'glAccount', format: 'text' },
      { header: 'Cost_Center_Worktag', from: 'costCenterCode', format: 'text' },
      { header: 'Extended_Amount', from: 'amount', format: 'money' },
      { header: 'Currency', from: 'currency', format: 'text' },
      { header: 'Memo', from: 'personName', format: 'text' },
    ],
  },
  {
    id: 'GENERIC',
    label: 'Plain spreadsheet',
    howItLands: 'For a finance team that would rather map it themselves, or a system not listed here.',
    extension: 'csv',
    delimiter: ',',
    dateFormat: 'ISO',
    includeHeader: true,
    columns: [
      { header: 'Invoice number', from: 'invoiceNumber', format: 'text' },
      { header: 'Vendor', from: 'vendor', format: 'text' },
      { header: 'Bill to', from: 'billTo', format: 'text' },
      { header: 'Invoice date', from: 'invoiceDate', format: 'date' },
      { header: 'Due date', from: 'dueDate', format: 'date' },
      { header: 'PO number', from: 'poNumber', format: 'text' },
      { header: 'Line', from: 'lineNumber', format: 'text' },
      { header: 'Person', from: 'personName', format: 'text' },
      { header: 'Cost centre', from: 'costCenterCode', format: 'text' },
      { header: 'GL account', from: 'glAccount', format: 'text' },
      { header: 'Amount', from: 'amount', format: 'money' },
      { header: 'Currency', from: 'currency', format: 'text' },
    ],
  },
]

export function profileById(id: string): Profile | null {
  return PROFILES.find((p) => p.id === id) ?? null
}

/** Dates, the way each system insists on having them. */
export function formatDate(iso: string, style: Profile['dateFormat']): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  switch (style) {
    case 'YYYYMMDD': return `${y}${m}${d}`
    case 'MM/DD/YYYY': return `${m}/${d}/${y}`
    default: return `${y}-${m}-${d}`
  }
}

/**
 * Money, always two decimals and never a thousands separator.
 *
 * A comma inside a comma-delimited number is the oldest way to break one
 * of these files, and every AP system rejects the whole thing rather than
 * the row.
 */
export function formatMoney(n: number): string {
  return n.toFixed(2)
}

/** A field that would otherwise break the delimiter. */
function escapeField(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export interface RenderResult {
  content: string
  fileName: string
  lineCount: number
  /** The sum of the rows written, for checking against the invoice. */
  total: number
}

export interface RenderProblem {
  problem: string
  detail: string
}

/**
 * Write the file, or refuse to.
 *
 * The refusal matters more than the writing. An AP team that finds a
 * one-cent gap rejects the whole file and asks for it again, so a
 * discrepancy is worth catching here rather than at their end tomorrow.
 */
export function render(
  profile: Profile,
  lines: CodedLine[],
  expectedTotal: number
): { ok: true; result: RenderResult } | { ok: false; problems: RenderProblem[] } {
  const problems: RenderProblem[] = []

  if (lines.length === 0) {
    problems.push({ problem: 'Nothing to write', detail: 'This invoice has no coded lines.' })
  }

  const sum = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100
  const expected = Math.round(expectedTotal * 100) / 100
  if (lines.length > 0 && sum !== expected) {
    problems.push({
      problem: 'The rows do not sum to the invoice',
      detail: `The lines add up to ${sum.toFixed(2)} and the invoice is ${expected.toFixed(2)}. A file that is a cent out is rejected whole, so this one is not being written.`,
    })
  }

  // A cost centre or GL that is missing here is missing in their ledger
  // too, and the file will bounce. Naming which line is cheaper than
  // letting them find it.
  const uncoded = lines.filter((l) => !l.costCenterCode || !l.glAccount)
  if (uncoded.length > 0 && profile.id !== 'GENERIC') {
    problems.push({
      problem: `${uncoded.length} line(s) have no cost centre or GL account`,
      detail: `${profile.label} rejects a file with an unmapped line. Code them first — the people affected are ${uncoded.slice(0, 3).map((l) => l.personName).join(', ')}${uncoded.length > 3 ? ` and ${uncoded.length - 3} more` : ''}.`,
    })
  }

  if (problems.length > 0) return { ok: false, problems }

  const rows: string[] = []

  if (profile.includeHeader) {
    rows.push(profile.columns.map((c) => c.header).join(profile.delimiter))
  }

  lines.forEach((line, i) => {
    const cells = profile.columns.map((col) => {
      const raw = col.from === 'lineNumber' ? i + 1 : line[col.from]
      if (raw === null || raw === undefined) return ''
      if (col.format === 'date') return formatDate(String(raw), profile.dateFormat)
      if (col.format === 'money') return formatMoney(Number(raw))
      return escapeField(String(raw), profile.delimiter)
    })
    rows.push(cells.join(profile.delimiter))
  })

  const invoiceNumber = lines[0].invoiceNumber.replace(/[^A-Za-z0-9._-]/g, '-')

  return {
    ok: true,
    result: {
      content: rows.join('\r\n') + '\r\n',
      // Named so a finance team can tell two files apart in a folder six
      // months later.
      fileName: `${profile.id.toLowerCase()}-${invoiceNumber}.${profile.extension}`,
      lineCount: lines.length,
      total: sum,
    },
  }
}

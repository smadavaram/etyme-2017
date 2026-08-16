/**
 * Three-way match: purchase order ↔ receipt ↔ invoice.
 *
 * In a purchasing system nobody pays for goods that were never receipted.
 * The receipt is the independent witness that what is being billed actually
 * arrived. Contingent labour has the same shape and usually skips the
 * control: hours are billed, somebody eyeballs the total, it gets paid.
 *
 *   purchase order   what was authorised, and how much is left
 *   receipt          the APPROVED timesheet — hours a manager signed for
 *   invoice          what the vendor is asking for
 *
 * The whole point is that these are three independent records and the match
 * is what makes them trustworthy together. An invoice that fails cannot be
 * approved — not "is flagged for review", cannot.
 *
 * Money is in cents throughout, as everywhere else in the schema. The one
 * place that is not — Invoice.total, a Decimal in whole currency, shared
 * with Payment — is reconciled by the HEADER_TOTAL check rather than by
 * assumption. That assumption is exactly what produced a $1.10/hr
 * submission earlier in this codebase.
 */

export type MatchCode =
  | 'RECEIPT'       // every line is backed by an approved timesheet
  | 'QUANTITY'      // billed hours equal approved hours
  | 'PRICE'         // billed rate equals the contracted rate
  | 'EXTENSION'     // hours × rate equals the line amount
  | 'DUPLICATE'     // no timesheet billed more than once
  | 'HEADER_TOTAL'  // the invoice header equals the sum of its lines
  | 'PO_REQUIRED'   // an invoice against a PO-mandated contract has one
  | 'PO_STATUS'     // the PO is open and covers the period
  | 'PO_BALANCE'    // the PO has room for this invoice

export interface MatchCheck {
  code: MatchCode
  outcome: 'PASS' | 'FAIL'
  /** Plain English. An AP clerk reads this, not the code. */
  reason: string
  /** Lines involved, when a failure is line-specific. */
  lines?: string[]
}

export interface InvoiceLineFacts {
  id: string
  timesheetId: string | null
  personName: string
  hours: number
  rateCents: number
  amountCents: number
}

export interface TimesheetFacts {
  id: string
  status: string
  approvedHours: number
  /** The rate on the contract this timesheet belongs to. */
  contractRateCents: number
  /** True when some other invoice already has a line for this timesheet. */
  alreadyBilledOnInvoiceId?: string | null
}

export interface PurchaseOrderFacts {
  id: string
  number: string
  status: string
  amountCents: number
  /** Already consumed by other live invoices against this PO. */
  consumedCents: number
  startDate: Date
  endDate: Date | null
}

export interface MatchInput {
  invoice: {
    id: string
    /** Header total in cents, converted from the Decimal at the boundary. */
    totalCents: number
    periodStart: Date
    periodEnd: Date
  }
  lines: InvoiceLineFacts[]
  timesheets: Record<string, TimesheetFacts>
  po: PurchaseOrderFacts | null
  /** True when this client requires a PO before anything can be paid. */
  poRequired: boolean
}

export interface MatchResult {
  matched: boolean
  checks: MatchCheck[]
  /** One line for a list view or an approval screen. */
  summary: string
  /** What the PO looks like after this invoice, when there is one. */
  poAfter: { remainingCents: number; utilisationPercent: number } | null
}

/**
 * Extension rounding. hours × rate in cents rarely lands on a whole cent —
 * 7.33h at $133.33 is 977.3089 — so a single cent of drift per line is
 * arithmetic, not a discrepancy. Anything larger is a real difference and
 * is reported as one.
 */
const EXTENSION_TOLERANCE_CENTS = 1

/** Hours are recorded to two decimals; compare at that precision. */
function hoursEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function threeWayMatch(input: MatchInput): MatchResult {
  const { invoice, lines, timesheets, po, poRequired } = input
  const checks: MatchCheck[] = []

  // ── An invoice with no lines is not an invoice ──
  if (lines.length === 0) {
    return {
      matched: false,
      checks: [{
        code: 'RECEIPT',
        outcome: 'FAIL',
        reason: 'This invoice has no lines, so there is nothing to match against',
      }],
      summary: 'No lines to match',
      poAfter: null,
    }
  }

  // ── RECEIPT — is every line witnessed? ──
  const unreceipted = lines.filter(l => {
    if (!l.timesheetId) return true
    const ts = timesheets[l.timesheetId]
    return !ts || ts.status !== 'APPROVED'
  })
  checks.push(unreceipted.length === 0
    ? { code: 'RECEIPT', outcome: 'PASS', reason: `All ${lines.length} lines are backed by an approved timesheet` }
    : {
        code: 'RECEIPT',
        outcome: 'FAIL',
        reason: unreceipted.length === lines.length
          ? 'No line on this invoice is backed by an approved timesheet'
          : `${unreceipted.length} of ${lines.length} lines have no approved timesheet behind them`,
        lines: unreceipted.map(l => l.id),
      })

  // ── DUPLICATE — has any of this work been billed before? ──
  // Two ways it goes wrong: the same timesheet twice on this invoice, or a
  // timesheet already billed on another. The database blocks the second via
  // a unique constraint; this reports it in words rather than a 500.
  const seen = new Map<string, number>()
  for (const l of lines) {
    if (l.timesheetId) seen.set(l.timesheetId, (seen.get(l.timesheetId) ?? 0) + 1)
  }
  const repeatedHere = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id)
  const billedElsewhere = lines.filter(l => {
    const ts = l.timesheetId ? timesheets[l.timesheetId] : null
    return ts?.alreadyBilledOnInvoiceId && ts.alreadyBilledOnInvoiceId !== invoice.id
  })
  checks.push(repeatedHere.length === 0 && billedElsewhere.length === 0
    ? { code: 'DUPLICATE', outcome: 'PASS', reason: 'No timesheet is billed more than once' }
    : {
        code: 'DUPLICATE',
        outcome: 'FAIL',
        reason: repeatedHere.length > 0
          ? `${repeatedHere.length} timesheet(s) appear on more than one line of this invoice`
          : `${billedElsewhere.length} timesheet(s) were already billed on another invoice`,
        lines: billedElsewhere.map(l => l.id),
      })

  // ── QUANTITY — do billed hours equal approved hours? ──
  const wrongHours = lines.filter(l => {
    const ts = l.timesheetId ? timesheets[l.timesheetId] : null
    return ts && !hoursEqual(l.hours, ts.approvedHours)
  })
  checks.push(wrongHours.length === 0
    ? { code: 'QUANTITY', outcome: 'PASS', reason: 'Billed hours match the hours approved' }
    : {
        code: 'QUANTITY',
        outcome: 'FAIL',
        reason: wrongHours.map(l => {
          const ts = timesheets[l.timesheetId!]
          return `${l.personName}: billed ${l.hours}h, approved ${ts.approvedHours}h`
        }).join('; '),
        lines: wrongHours.map(l => l.id),
      })

  // ── PRICE — does the billed rate equal the contract? ──
  const wrongRate = lines.filter(l => {
    const ts = l.timesheetId ? timesheets[l.timesheetId] : null
    return ts && l.rateCents !== ts.contractRateCents
  })
  checks.push(wrongRate.length === 0
    ? { code: 'PRICE', outcome: 'PASS', reason: 'Billed rates match the contracted rates' }
    : {
        code: 'PRICE',
        outcome: 'FAIL',
        reason: wrongRate.map(l => {
          const ts = timesheets[l.timesheetId!]
          return `${l.personName}: billed ${money(l.rateCents)}/hr, contracted ${money(ts.contractRateCents)}/hr`
        }).join('; '),
        lines: wrongRate.map(l => l.id),
      })

  // ── EXTENSION — does hours × rate equal the line? ──
  const badMath = lines.filter(l =>
    Math.abs(Math.round(l.hours * l.rateCents) - l.amountCents) > EXTENSION_TOLERANCE_CENTS
  )
  checks.push(badMath.length === 0
    ? { code: 'EXTENSION', outcome: 'PASS', reason: 'Every line multiplies out correctly' }
    : {
        code: 'EXTENSION',
        outcome: 'FAIL',
        reason: badMath.map(l =>
          `${l.personName}: ${l.hours}h × ${money(l.rateCents)} is ${money(Math.round(l.hours * l.rateCents))}, billed ${money(l.amountCents)}`
        ).join('; '),
        lines: badMath.map(l => l.id),
      })

  // ── HEADER_TOTAL — does the invoice equal its own lines? ──
  // This is also where the cents/Decimal boundary is checked rather than
  // trusted.
  const lineSum = lines.reduce((s, l) => s + l.amountCents, 0)
  checks.push(lineSum === invoice.totalCents
    ? { code: 'HEADER_TOTAL', outcome: 'PASS', reason: `Header total ${money(invoice.totalCents)} equals the sum of lines` }
    : {
        code: 'HEADER_TOTAL',
        outcome: 'FAIL',
        reason: `Header says ${money(invoice.totalCents)} but the lines add to ${money(lineSum)}`,
      })

  // ── The purchase order ──
  let poAfter: MatchResult['poAfter'] = null

  if (!po) {
    checks.push(poRequired
      ? { code: 'PO_REQUIRED', outcome: 'FAIL', reason: 'This client requires a purchase order before an invoice can be paid' }
      : { code: 'PO_REQUIRED', outcome: 'PASS', reason: 'No purchase order required' })
  } else {
    checks.push({ code: 'PO_REQUIRED', outcome: 'PASS', reason: `Raised against PO ${po.number}` })

    // PO_STATUS — open, and covering the period being billed.
    const open = po.status === 'OPEN'
    const coversStart = invoice.periodStart >= po.startDate
    const coversEnd = po.endDate === null || invoice.periodEnd <= po.endDate
    checks.push(open && coversStart && coversEnd
      ? { code: 'PO_STATUS', outcome: 'PASS', reason: `PO ${po.number} is open and covers this period` }
      : {
          code: 'PO_STATUS',
          outcome: 'FAIL',
          reason: !open
            ? `PO ${po.number} is ${po.status.toLowerCase()}`
            : `PO ${po.number} does not cover ${invoice.periodStart.toISOString().slice(0, 10)} to ${invoice.periodEnd.toISOString().slice(0, 10)}`,
        })

    // PO_BALANCE — is there room left?
    const remainingBefore = po.amountCents - po.consumedCents
    const remainingAfter = remainingBefore - invoice.totalCents
    checks.push(remainingAfter >= 0
      ? {
          code: 'PO_BALANCE',
          outcome: 'PASS',
          reason: `${money(remainingAfter)} left on PO ${po.number} after this invoice`,
        }
      : {
          code: 'PO_BALANCE',
          outcome: 'FAIL',
          reason: `PO ${po.number} has ${money(remainingBefore)} left; this invoice is ${money(invoice.totalCents)}, over by ${money(-remainingAfter)}`,
        })

    poAfter = {
      remainingCents: remainingAfter,
      utilisationPercent: po.amountCents === 0
        ? 0
        : Math.round(((po.consumedCents + invoice.totalCents) / po.amountCents) * 100),
    }
  }

  const failures = checks.filter(c => c.outcome === 'FAIL')

  return {
    matched: failures.length === 0,
    checks,
    summary: failures.length === 0
      ? `Matched — ${lines.length} line(s), ${money(invoice.totalCents)}, every hour approved`
      : failures.length === 1
        ? failures[0].reason
        : `${failures.length} checks failed — ${failures[0].reason}`,
    poAfter,
  }
}

/**
 * Invoice.total is a Decimal in whole currency; lines are cents. Convert in
 * one marked place so the boundary is greppable, and round rather than
 * truncate — truncation loses a cent per invoice and finance notices.
 */
export function decimalToCents(d: { toString(): string }): number {
  return Math.round(parseFloat(d.toString()) * 100)
}

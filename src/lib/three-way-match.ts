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
  | 'PERIOD'        // the work was done in the period being billed
  | 'CONTRACT_PERIOD' // the invoice bills a period the contract recognises
  | 'HEADER_TOTAL'  // the invoice header equals the sum of its lines
  | 'PO_REQUIRED'   // an invoice against a PO-mandated contract has one
  | 'PO_STATUS'     // the PO is open and covers the period
  | 'PO_BALANCE'    // the PO has room for this invoice

/**
 * Which failures a human may wave through.
 *
 * Not all of them, and the split is not a matter of taste. Paying twice for
 * the same work, paying for hours nobody approved, and arithmetic that does
 * not add up are not judgment calls — no amount of seniority makes them
 * correct, so no signature unlocks them. Everything else is a commercial
 * variance that AP resolves every day: a rate amendment not yet keyed, a
 * timesheet approved after the cut-off, a purchase order being topped up.
 *
 * A control with no exception path is not stricter, it is bypassed. Finance
 * pays those invoices outside the system and the ledger stops being true.
 */
export const OVERRIDABLE: Record<MatchCode, boolean> = {
  RECEIPT: false,      // nobody witnessed the work
  DUPLICATE: false,    // paying twice is never an option
  EXTENSION: false,    // arithmetic is not an opinion
  HEADER_TOTAL: false, // nor is addition
  QUANTITY: true,      // hours under query
  // A timesheet approved after the cut-off is legitimately billed on the
  // next invoice, which is a commercial variance AP resolves daily rather
  // than an arithmetic fault. The reason says how far out it is, so
  // somebody can tell a late timesheet from a mistake.
  PERIOD: true,
  // A period the contract does not recognise is usually a one-off — a
  // final invoice on a mid-month termination, a first part-period. Real,
  // and worth somebody saying so once rather than the invoice being
  // impossible to raise.
  CONTRACT_PERIOD: true,
  // Not waivable. A rate that has genuinely changed is a contract
  // amendment, effective from the day it changed and approved by somebody
  // with authority (src/lib/contract-rate.ts). Waiving it here would record
  // the real price in a free-text note on one invoice, leave the contract
  // saying something else, and fail identically next month.
  PRICE: false,
  PO_REQUIRED: true,   // PO being raised retrospectively
  PO_STATUS: true,     // PO being reopened or extended
  PO_BALANCE: true,    // PO being topped up
}

export interface MatchOverride {
  code: MatchCode
  reason: string
  byName: string
  at: Date
}

export interface MatchCheck {
  code: MatchCode
  outcome: 'PASS' | 'FAIL' | 'OVERRIDDEN'
  /** Whether a human may wave this failure through at all. */
  overridable?: boolean
  /** Present when somebody has. Never silently permitted. */
  overriddenBy?: { name: string; reason: string; at: string }
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
  /**
   * When the work was actually done.
   *
   * The engine had every other fact about a timesheet and not this one, so
   * an August invoice could carry a July timesheet and pass every check.
   * The hours were approved, they matched, the rate was right, the
   * arithmetic added up and nothing was billed twice — and the work was
   * done in a month nobody was billing for.
   */
  periodStart: Date
  periodEnd: Date
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
    /**
     * The period the contract says it should be billing, where the terms
     * are known. Null on an invoice whose contract carries none.
     *
     * The invoice period used to be invented from whichever timesheets
     * were waiting — four weekly ones produced "28 July to 24 August",
     * which is in no contract and matches no purchase order window.
     */
    contractPeriod?: { start: Date; end: Date; label: string } | null
  }
  lines: InvoiceLineFacts[]
  timesheets: Record<string, TimesheetFacts>
  po: PurchaseOrderFacts | null
  /** True when this client requires a PO before anything can be paid. */
  poRequired: boolean
  /** Exceptions already recorded against this invoice. */
  overrides?: MatchOverride[]
}

export interface MatchResult {
  /** True when nothing is outstanding — including anything overridden. */
  matched: boolean
  /** True only when it matched on the facts, with no human waiver. */
  cleanMatch: boolean
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

function day(d: Date): string {
  return d.toISOString().slice(0, 10)
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
      cleanMatch: false,
      checks: [{
        code: 'RECEIPT',
        outcome: 'FAIL',
        overridable: false,
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

  // ── PERIOD — was the work done in the period being billed? ──
  //
  // Overlap, not containment. A weekly timesheet running Monday 27 July to
  // Sunday 2 August is ordinary and correct on an August invoice, and a
  // check that failed it would be switched off by the second month. What
  // is wrong is work that falls entirely outside the period — that is
  // revenue in the wrong month, and a purchase order paying for work it
  // never covered.
  const outsidePeriod = lines.filter(l => {
    const ts = l.timesheetId ? timesheets[l.timesheetId] : null
    if (!ts) return false // RECEIPT already said this line has no witness
    return ts.periodEnd < invoice.periodStart || ts.periodStart > invoice.periodEnd
  })

  const straddling = lines.filter(l => {
    const ts = l.timesheetId ? timesheets[l.timesheetId] : null
    if (!ts) return false
    if (ts.periodEnd < invoice.periodStart || ts.periodStart > invoice.periodEnd) return false
    return ts.periodStart < invoice.periodStart || ts.periodEnd > invoice.periodEnd
  })

  // Nothing to say where no line has a timesheet behind it. RECEIPT has
  // already failed and a second failure about the same absence is noise.
  if (lines.some(l => l.timesheetId && timesheets[l.timesheetId])) {
    checks.push(outsidePeriod.length === 0
      ? {
          code: 'PERIOD',
          outcome: 'PASS',
          reason: straddling.length > 0
            ? `Work falls in this period, with ${straddling.length} timesheet(s) that straddle the boundary`
            : 'All work was done in the period being billed',
        }
      : {
          code: 'PERIOD',
          outcome: 'FAIL',
          reason: outsidePeriod.map(l => {
            const ts = timesheets[l.timesheetId!]
            return `${l.personName}: worked ${day(ts.periodStart)} to ${day(ts.periodEnd)}, billed on a ${day(invoice.periodStart)}–${day(invoice.periodEnd)} invoice`
          }).join('; '),
          lines: outsidePeriod.map(l => l.id),
        })
  }

  // ── CONTRACT_PERIOD — is this a period the contract bills? ──
  //
  // A contract that bills monthly bills for the month. How the hours
  // arrived is the consultant's business and the approver's; it changes
  // nothing about what is billed or when.
  const cp = invoice.contractPeriod
  if (cp) {
    const right =
      day(cp.start) === day(invoice.periodStart) && day(cp.end) === day(invoice.periodEnd)

    checks.push(right
      ? {
          code: 'CONTRACT_PERIOD',
          outcome: 'PASS',
          reason: `Bills ${cp.label}, which is what the contract bills`,
        }
      : {
          code: 'CONTRACT_PERIOD',
          outcome: 'FAIL',
          reason: `Bills ${day(invoice.periodStart)} to ${day(invoice.periodEnd)}. The contract bills ${cp.label} — ${day(cp.start)} to ${day(cp.end)}.`,
        })
  }

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

    // PO_STATUS — open, and covering the work, not just the header.
    //
    // This compared the invoice's own period to the PO. An invoice headed
    // August against a PO starting in August passed, while the work being
    // billed was done in July and nobody had authorised it — the same hole
    // as PERIOD, from the other side.
    //
    // A purchase order authorises spend over a window. What matters is
    // when the work was done, so the window is tested against the earliest
    // and latest work on the invoice, and falls back to the header period
    // only where no line has a timesheet behind it to ask.
    const worked = lines
      .map(l => (l.timesheetId ? timesheets[l.timesheetId] : null))
      .filter((ts): ts is TimesheetFacts => ts != null)

    const firstDay = worked.length
      ? new Date(Math.min(...worked.map(ts => ts.periodStart.getTime())))
      : invoice.periodStart
    const lastDay = worked.length
      ? new Date(Math.max(...worked.map(ts => ts.periodEnd.getTime())))
      : invoice.periodEnd

    const open = po.status === 'OPEN'
    const coversStart = firstDay >= po.startDate
    const coversEnd = po.endDate === null || lastDay <= po.endDate

    checks.push(open && coversStart && coversEnd
      ? {
          code: 'PO_STATUS',
          outcome: 'PASS',
          reason: `PO ${po.number} is open and covers the work from ${day(firstDay)} to ${day(lastDay)}`,
        }
      : {
          code: 'PO_STATUS',
          outcome: 'FAIL',
          reason: !open
            ? `PO ${po.number} is ${po.status.toLowerCase()}`
            : !coversStart
              ? `Work starts ${day(firstDay)}, before PO ${po.number} opens on ${day(po.startDate)}`
              : `Work runs to ${day(lastDay)}, past PO ${po.number} ending ${day(po.endDate!)}`,
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

  // ── Apply exceptions ──
  // A recorded override resolves a failure but never erases it: the check
  // stays visible as OVERRIDDEN, with who and why. Addendum E's rule holds
  // here too — warn, capture a reason, proceed, but never silently permit.
  const overrides = input.overrides ?? []
  for (const check of checks) {
    check.overridable = OVERRIDABLE[check.code]
    if (check.outcome !== 'FAIL') continue
    const waiver = overrides.find(o => o.code === check.code)
    if (!waiver) continue
    if (!OVERRIDABLE[check.code]) continue // a waiver on this is not honoured
    check.outcome = 'OVERRIDDEN'
    check.overriddenBy = {
      name: waiver.byName,
      reason: waiver.reason,
      at: waiver.at.toISOString(),
    }
  }

  const failures = checks.filter(c => c.outcome === 'FAIL')
  const waived = checks.filter(c => c.outcome === 'OVERRIDDEN')

  return {
    matched: failures.length === 0,
    cleanMatch: failures.length === 0 && waived.length === 0,
    checks,
    summary: failures.length === 0
      ? waived.length === 0
        ? `Matched — ${lines.length} line(s), ${money(invoice.totalCents)}, every hour approved`
        : `Matched with ${waived.length} exception(s) — ${waived.map(w => w.code.toLowerCase().replace(/_/g, ' ')).join(', ')}`
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

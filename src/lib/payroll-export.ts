/**
 * What is owed, in a shape ADP or Paychex will take.
 *
 * Etyme does not run payroll and should not: withholding, filings and
 * year-end are somebody's whole business, they are regulated differently
 * in every state, and getting them wrong costs a client more than this
 * product is worth.
 *
 * What it does is know what is owed and to whom, which is the part the
 * payroll provider cannot work out — the hours, whose signature stands
 * behind them, at what rate, against which order.
 *
 * ── The one thing this must never do ─────────────────────────────────
 *
 * Export an hour nobody accepted. A payroll file is acted on: it becomes
 * a bank transfer, usually the same week, and nobody reads it first. So
 * the only hours in it are ones the employer has accepted for pay, and
 * an unaccepted sheet is left out and reported rather than included with
 * a flag somebody was supposed to notice.
 */

export type Provider = 'ADP' | 'PAYCHEX' | 'GENERIC'

export interface Line {
  /** The provider's own id for this person, where the client has set one. */
  payrollId: string | null
  personName: string
  /** W2 · C2C · IND_1099 — the provider needs to know which. */
  contractType: string
  periodStart: Date
  periodEnd: Date
  /** Only ever hours the employer accepted. */
  hours: number
  rateCents: number
  currency: string
  /** Where the cost lands in the client's books. */
  costCode: string | null
  /** The order this bills under, for reconciliation. */
  orderNumber: string | null
}

export interface Skipped {
  personName: string
  periodEnd: Date
  why: string
}

export interface Export {
  provider: Provider
  lines: Line[]
  skipped: Skipped[]
  totalHours: number
  totalCents: number
  says: string
}

/**
 * Build the run.
 *
 * Sheets with no employer acceptance are skipped and named. A payroll
 * file that quietly omits somebody is how a contractor goes unpaid for a
 * fortnight and nobody can say why.
 */
export function buildExport(
  provider: Provider,
  sheets: {
    personName: string
    payrollId: string | null
    contractType: string
    periodStart: Date
    periodEnd: Date
    submittedHours: number
    acceptedHours: number | null
    employerAcceptedAt: Date | null
    rateCents: number
    currency: string
    costCode: string | null
    orderNumber: string | null
  }[]
): Export {
  const lines: Line[] = []
  const skipped: Skipped[] = []

  for (const s of sheets) {
    if (!s.employerAcceptedAt) {
      skipped.push({
        personName: s.personName,
        periodEnd: s.periodEnd,
        why: 'Nobody has accepted these hours for pay yet.',
      })
      continue
    }

    const hours = s.acceptedHours ?? s.submittedHours
    if (hours <= 0) {
      skipped.push({
        personName: s.personName,
        periodEnd: s.periodEnd,
        why: 'Accepted at zero hours.',
      })
      continue
    }

    lines.push({
      payrollId: s.payrollId,
      personName: s.personName,
      contractType: s.contractType,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      hours,
      rateCents: s.rateCents,
      currency: s.currency,
      costCode: s.costCode,
      orderNumber: s.orderNumber,
    })
  }

  const totalHours = lines.reduce((n, l) => n + l.hours, 0)
  const totalCents = lines.reduce((n, l) => n + Math.round(l.hours * l.rateCents), 0)

  return {
    provider,
    lines,
    skipped,
    totalHours,
    totalCents,
    says: exportSays(lines.length, skipped.length, totalHours, totalCents, provider),
  }
}

function exportSays(
  n: number,
  skippedCount: number,
  hours: number,
  cents: number,
  provider: Provider
): string {
  if (n === 0) {
    return skippedCount > 0
      ? `Nothing to send. ${skippedCount} ${skippedCount === 1 ? 'person is' : 'people are'} waiting on somebody to accept their hours.`
      : 'Nothing to send. No accepted hours in this period.'
  }

  const money = `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const tail = skippedCount
    ? ` ${skippedCount} left out — nobody has accepted their hours.`
    : ''

  return `${n} ${n === 1 ? 'person' : 'people'}, ${hours} hours, ${money} for ${provider}.${tail}`
}

/**
 * The file itself.
 *
 * CSV, because every provider takes it and because a human can open it
 * and check before it becomes a bank transfer. Column names follow each
 * provider's own import template rather than ours — a file the provider
 * rejects is a file somebody has to rekey.
 */
export function toCsv(e: Export): string {
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const money = (c: number) => (c / 100).toFixed(2)

  const rows: string[][] =
    e.provider === 'ADP'
      ? [
          ['Co Code', 'File #', 'Name', 'Reg Hours', 'Rate', 'Period Start', 'Period End', 'Dept'],
          ...e.lines.map((l) => [
            '', l.payrollId ?? '', l.personName, String(l.hours),
            money(l.rateCents), iso(l.periodStart), iso(l.periodEnd), l.costCode ?? '',
          ]),
        ]
      : e.provider === 'PAYCHEX'
        ? [
            ['Employee ID', 'Employee Name', 'Earnings Code', 'Hours', 'Rate', 'Pay Period End', 'Cost Center'],
            ...e.lines.map((l) => [
              l.payrollId ?? '', l.personName, 'REG', String(l.hours),
              money(l.rateCents), iso(l.periodEnd), l.costCode ?? '',
            ]),
          ]
        : [
            ['payroll_id', 'name', 'contract_type', 'period_start', 'period_end', 'hours', 'rate', 'currency', 'cost_code', 'order'],
            ...e.lines.map((l) => [
              l.payrollId ?? '', l.personName, l.contractType, iso(l.periodStart), iso(l.periodEnd),
              String(l.hours), money(l.rateCents), l.currency, l.costCode ?? '', l.orderNumber ?? '',
            ]),
          ]

  return rows.map((r) => r.map(cell).join(',')).join('\n')
}

/** A field that will survive somebody's name containing a comma. */
function cell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/**
 * Who has no payroll id yet.
 *
 * Reported before the file is built rather than after it is rejected.
 * ADP matches on their file number, and a row without one is a row their
 * import drops silently.
 */
export function missingIds(e: Export): string[] {
  return e.lines.filter((l) => !l.payrollId).map((l) => l.personName)
}

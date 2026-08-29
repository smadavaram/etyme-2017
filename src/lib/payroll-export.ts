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

// ═════════════════════════════════════════════════════════════════════
// STATUTORY — what the bureau needs, prepared by us and filed by them
// ═════════════════════════════════════════════════════════════════════
//
// ── The boundary, said once and repeated on every artefact ───────────
//
// **Etyme never files anything.** Not a 941, not a state deposit, not a
// W-2, not a 1099. Withholding, deposits and year-end are somebody's
// whole business, they are regulated differently in every state, and a
// staffing platform that grows a filing engine inside it becomes a bad
// filing engine attached to a good staffing platform. Getting it wrong
// costs a client more than this product is worth.
//
// What we have, and the bureau does not, is what was actually earned and
// by whom: hours somebody accepted, at a rate somebody agreed, posted to
// a period. That is the input to every return, and it is the part that is
// wrong in most bureaus' files because it arrives by email as a
// spreadsheet.
//
// So "done" here is not "we file". It is: the handoff is real, the
// numbers come from postings rather than from a rate card, and every
// screen and file says plainly who files it.
//
// ── Why the summaries come from PAY postings ─────────────────────────
//
// A rate card says what somebody should have earned. A posting says what
// they did. Those differ every time a timesheet is reversed, a rate
// amendment lands late, or an off-cycle payment is made — which is to
// say, on most real assignments. A wage figure built from a rate card is
// wrong in exactly the cases somebody will look closely at.

/** The sentence that goes on every statutory screen and every file. */
export const BUREAU_NOTICE =
  'Prepared for your payroll bureau. Nothing here is filed by Etyme — we hold what was ' +
  'earned and by whom; the bureau holds the withholding, the deposits and the returns.'

export type WorkerTaxTreatment =
  /** An employee. The bureau issues a W-2. */
  | 'W2'
  /** An individual engaged directly. Reportable on a 1099-NEC. */
  | 'IND_1099'
  /** A company. Not reportable on a 1099-NEC for services. */
  | 'C2C'
  /** Something we do not have a rule for. Named rather than guessed. */
  | 'UNKNOWN'

export function treatmentOf(contractType: string): WorkerTaxTreatment {
  const t = String(contractType).toUpperCase()
  if (t === 'W2' || t === 'W2_HOURLY' || t === 'W2_SALARY') return 'W2'
  if (t === 'C1099' || t === '1099' || t === 'IND_1099') return 'IND_1099'
  if (t === 'C2C' || t === 'CORP_TO_CORP') return 'C2C'
  return 'UNKNOWN'
}

/**
 * The 1099-NEC reporting floor, in cents.
 *
 * Six hundred dollars. A payee under it is not reportable — and is listed
 * separately rather than dropped, because "not on the file" and "not in
 * the data" look identical to whoever is reconciling, and one of them is
 * a missing person.
 */
export const NEC_THRESHOLD_CENTS = 60_000

export interface PayPosting {
  personId: string
  personName: string
  /** The person's own tax identification, where it is held. Never printed. */
  hasTaxId: boolean
  contractType: string
  /** Signed cents as the ledger holds them — pay is negative. */
  amountCents: number
  currency: string
  /** The date the money belongs to, which is what decides the tax year. */
  postedAt: Date
}

export type StatutoryForm = 'W2' | '1099_NEC' | 'NONE'

export interface WageSummary {
  personId: string
  personName: string
  year: number
  treatment: WorkerTaxTreatment
  /** What the bureau puts on the form. Null where no honest figure exists. */
  grossCents: number | null
  currency: string | null
  /** The form the bureau issues, if any. */
  form: StatutoryForm
  /** The box on that form, where it has one. */
  box: string | null
  /** True where the amount is real but below the reporting floor. */
  belowThreshold: boolean
  /** True where the bureau will need a tax id we do not hold. */
  missingTaxId: boolean
  postings: number
  /** Why the figure is what it is, or why there is none. */
  says: string
}

/**
 * One person, one year, from the postings alone.
 *
 * ── The corp-to-corp rule, which surprises people ────────────────────
 *
 * A corporation is not reportable on a 1099-NEC for services. The
 * instructions exempt payments to corporations from the general
 * information-reporting requirement, which is why a C2C sub-vendor gets
 * an invoice, gets paid, and gets no form. Issuing one anyway is not
 * harmless: it asserts a relationship with an individual that the
 * arrangement does not have, and that assertion is the shape of a
 * misclassification finding.
 *
 * So C2C returns NONE, with the reason said out loud rather than an empty
 * row somebody reads as an oversight.
 */
export function wageSummary(
  personId: string,
  postings: PayPosting[],
  year: number
): WageSummary {
  const theirs = postings.filter(
    (p) => p.personId === personId && p.postedAt.getUTCFullYear() === year
  )

  const name = theirs[0]?.personName ?? postings.find((p) => p.personId === personId)?.personName ?? 'Unknown'
  const treatment = treatmentOf(theirs[0]?.contractType ?? 'UNKNOWN')

  if (theirs.length === 0) {
    return {
      personId, personName: name, year, treatment,
      grossCents: null, currency: null, form: 'NONE', box: null,
      belowThreshold: false, missingTaxId: false, postings: 0,
      says: `Nothing was posted for ${name} in ${year}, so there is nothing to report.`,
    }
  }

  const currencies = [...new Set(theirs.map((p) => p.currency.toUpperCase()))]
  if (currencies.length > 1) {
    return {
      personId, personName: name, year, treatment,
      grossCents: null, currency: null, form: 'NONE', box: null,
      belowThreshold: false, missingTaxId: false, postings: theirs.length,
      says:
        `${name} was paid in ${currencies.join(' and ')} during ${year}. A single wage ` +
        `figure across two currencies is a figure of nothing, and which return each part ` +
        `belongs on is a question about where they were employed — so no total is given. ` +
        `Split the year by the paying entity.`,
    }
  }

  // Pay postings are negative in the ledger. The gross is their magnitude.
  const gross = theirs.reduce((n, p) => n + Math.abs(p.amountCents), 0)
  const missingTaxId = theirs.some((p) => !p.hasTaxId)

  if (treatment === 'C2C') {
    return {
      personId, personName: name, year, treatment,
      grossCents: gross, currency: currencies[0], form: 'NONE', box: null,
      belowThreshold: false, missingTaxId: false, postings: theirs.length,
      says:
        `${name} is engaged corp-to-corp, so no 1099-NEC is issued. Payments to a ` +
        `corporation for services are outside the information-reporting requirement, and ` +
        `issuing a form anyway asserts a relationship with an individual that this ` +
        `arrangement does not have — which is the shape of a misclassification finding. ` +
        `The amount is shown because somebody will ask.`,
    }
  }

  if (treatment === 'UNKNOWN') {
    return {
      personId, personName: name, year, treatment,
      grossCents: gross, currency: currencies[0], form: 'NONE', box: null,
      belowThreshold: false, missingTaxId, postings: theirs.length,
      says:
        `Nothing here knows how a "${theirs[0].contractType}" engagement is reported. The ` +
        `amount is real; the form is not guessed. Somebody has to say what this ` +
        `arrangement is before the bureau can file anything for it.`,
    }
  }

  if (treatment === 'W2') {
    return {
      personId, personName: name, year, treatment,
      grossCents: gross, currency: currencies[0], form: 'W2', box: 'Box 1 — wages, tips, other compensation',
      belowThreshold: false, missingTaxId, postings: theirs.length,
      says:
        `${cents(gross)} of ${currencies[0]} wages across ${theirs.length} posting` +
        `${theirs.length === 1 ? '' : 's'}. This is gross earnings only — withholding, ` +
        `pre-tax deductions and the employer's own taxes are the bureau's figures and are ` +
        `deliberately not here.`,
    }
  }

  const below = gross < NEC_THRESHOLD_CENTS
  return {
    personId, personName: name, year, treatment,
    grossCents: gross, currency: currencies[0],
    form: below ? 'NONE' : '1099_NEC',
    box: below ? null : 'Box 1 — nonemployee compensation',
    belowThreshold: below,
    missingTaxId, postings: theirs.length,
    says: below
      ? `${cents(gross)} — under the ${cents(NEC_THRESHOLD_CENTS)} reporting floor, so no ` +
        `1099-NEC. Listed rather than dropped: "not on the file" and "not in the data" look ` +
        `identical to whoever reconciles, and one of them is a missing person.`
      : `${cents(gross)} of nonemployee compensation.` +
        (missingTaxId
          ? ` No taxpayer identification number is held, which the bureau needs before it ` +
            `can file and which triggers backup withholding until it arrives.`
          : ''),
  }
}

export interface YearEndPack {
  year: number
  summaries: WageSummary[]
  w2Count: number
  necCount: number
  /** People with a real amount and no form, and why. */
  noForm: WageSummary[]
  /** People the bureau cannot file for without something we do not hold. */
  blocked: WageSummary[]
  totalReportableCents: number
  currency: string | null
  notice: string
  says: string
}

/** Everybody, one year, ready to hand over. */
export function yearEndPack(postings: PayPosting[], year: number): YearEndPack {
  const ids = [...new Set(postings.map((p) => p.personId))]
  const summaries = ids
    .map((id) => wageSummary(id, postings, year))
    .filter((s) => s.postings > 0)
    .sort((a, b) => (b.grossCents ?? 0) - (a.grossCents ?? 0))

  const w2 = summaries.filter((s) => s.form === 'W2')
  const nec = summaries.filter((s) => s.form === '1099_NEC')
  const noForm = summaries.filter((s) => s.form === 'NONE')
  const blocked = summaries.filter((s) => s.form !== 'NONE' && s.missingTaxId)

  const currencies = [...new Set(summaries.map((s) => s.currency).filter(Boolean))] as string[]
  const single = currencies.length === 1 ? currencies[0] : null
  const total = single
    ? [...w2, ...nec].reduce((n, s) => n + (s.grossCents ?? 0), 0)
    : 0

  return {
    year,
    summaries,
    w2Count: w2.length,
    necCount: nec.length,
    noForm,
    blocked,
    totalReportableCents: total,
    currency: single,
    notice: BUREAU_NOTICE,
    says:
      summaries.length === 0
        ? `Nothing was posted in ${year}.`
        : `${year}: ${w2.length} W-2${w2.length === 1 ? '' : 's'} and ${nec.length} ` +
          `1099-NEC${nec.length === 1 ? '' : 's'} for your bureau to issue` +
          (single ? `, ${cents(total)} ${single} reportable in total` : '') +
          `. ${noForm.length} ${noForm.length === 1 ? 'person needs' : 'people need'} no ` +
          `form, each for a stated reason.` +
          (blocked.length > 0
            ? ` ${blocked.length} cannot be filed until a taxpayer identification number is held.`
            : '') +
          ` ${BUREAU_NOTICE}`,
  }
}

/** The file the bureau ingests. One row per person, one year. */
export function yearEndCsv(pack: YearEndPack): string {
  const rows: string[][] = [
    ['# ' + BUREAU_NOTICE],
    ['person_id', 'name', 'tax_year', 'treatment', 'form', 'box', 'gross', 'currency', 'has_tax_id', 'note'],
    ...pack.summaries.map((s) => [
      s.personId,
      s.personName,
      String(s.year),
      s.treatment,
      s.form,
      s.box ?? '',
      s.grossCents == null ? '' : (s.grossCents / 100).toFixed(2),
      s.currency ?? '',
      s.missingTaxId ? 'no' : 'yes',
      s.says,
    ]),
  ]
  return rows.map((r) => r.map(cell).join(',')).join('\n')
}

// ── The deposit calendar ──────────────────────────────────────────────
//
// Also the bureau's job. We hold it because a firm that does not know
// when its own deposits fall due cannot tell whether the bureau is doing
// what it is paid for — and because the schedule follows from the wages
// we already have.
//
// Two schedules, chosen by a lookback at total tax liability. Monthly
// deposits by the 15th of the following month; semiweekly deposits on the
// Wednesday or Friday after the payday, depending which half of the week
// it fell in. Weekends and holidays push to the next business day.

export type DepositSchedule = 'MONTHLY' | 'SEMIWEEKLY'

/**
 * The lookback threshold, in cents.
 *
 * Fifty thousand dollars of employment tax liability in the lookback
 * period. At or below it, monthly; above it, semiweekly. It is a rule
 * with a number in it and the number is stated here rather than buried,
 * because it changes and somebody will have to find it.
 */
export const SEMIWEEKLY_THRESHOLD_CENTS = 5_000_000

export function depositSchedule(lookbackLiabilityCents: number): {
  schedule: DepositSchedule
  says: string
} {
  return lookbackLiabilityCents > SEMIWEEKLY_THRESHOLD_CENTS
    ? {
        schedule: 'SEMIWEEKLY',
        says:
          `${cents(lookbackLiabilityCents)} of employment tax in the lookback period, above ` +
          `the ${cents(SEMIWEEKLY_THRESHOLD_CENTS)} line, so deposits are semiweekly — ` +
          `Wednesday for a Wednesday-to-Friday payday, Friday for a Saturday-to-Tuesday one.`,
      }
    : {
        schedule: 'MONTHLY',
        says:
          `${cents(lookbackLiabilityCents)} of employment tax in the lookback period, at or ` +
          `under the ${cents(SEMIWEEKLY_THRESHOLD_CENTS)} line, so deposits are monthly — ` +
          `the 15th of the month after the wages were paid.`,
      }
}

export interface DepositDeadline {
  payDay: Date
  schedule: DepositSchedule
  /** The statutory date before any business-day shift. */
  statutoryDue: Date
  /** The date the money actually has to be there. */
  dueOn: Date
  /** True where the statutory date fell on a weekend or a holiday. */
  shifted: boolean
  says: string
}

/**
 * When a deposit for a given payday falls due.
 *
 * Holidays are passed in rather than assumed. A federal holiday calendar
 * baked in here would be wrong for a firm operating anywhere else, and
 * this codebase already keeps holidays per company.
 */
export function depositDeadline(
  payDay: Date,
  schedule: DepositSchedule,
  holidays: readonly Date[] = []
): DepositDeadline {
  const statutory =
    schedule === 'MONTHLY'
      ? new Date(Date.UTC(payDay.getUTCFullYear(), payDay.getUTCMonth() + 1, 15))
      : semiweeklyDue(payDay)

  const dueOn = nextBusinessDay(statutory, holidays)
  const shifted = dueOn.getTime() !== statutory.getTime()

  return {
    payDay,
    schedule,
    statutoryDue: statutory,
    dueOn,
    shifted,
    says:
      `Wages paid ${isoDay(payDay)} deposit by ${isoDay(dueOn)}` +
      (shifted
        ? ` — the statutory date of ${isoDay(statutory)} is not a business day, so it moves forward.`
        : '.') +
      ` ${BUREAU_NOTICE}`,
  }
}

/**
 * Semiweekly: Wednesday-to-Friday paydays deposit the following
 * Wednesday; Saturday-to-Tuesday paydays deposit the following Friday.
 */
function semiweeklyDue(payDay: Date): Date {
  const dow = payDay.getUTCDay() // 0 Sunday … 6 Saturday
  const wedToFri = dow >= 3 && dow <= 5
  const target = wedToFri ? 3 : 5 // Wednesday or Friday
  const d = new Date(payDay.getTime())
  do {
    d.setUTCDate(d.getUTCDate() + 1)
  } while (d.getUTCDay() !== target)
  return d
}

function nextBusinessDay(d: Date, holidays: readonly Date[]): Date {
  const stamps = new Set(holidays.map((h) => isoDay(h)))
  const out = new Date(d.getTime())
  while (out.getUTCDay() === 0 || out.getUTCDay() === 6 || stamps.has(isoDay(out))) {
    out.setUTCDate(out.getUTCDate() + 1)
  }
  return out
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function cents(n: number): string {
  return `$${(n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

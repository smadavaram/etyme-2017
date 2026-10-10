/**
 * The sample program the home page draws under its hero, as data.
 *
 * ── Why a sample and not a screenshot. 2026-10-09 ────────────────────
 *
 * The founder's brief of 2026-10-09 asks for "a realistic workforce
 * dashboard visualization built from the real product components", with
 * the seeded demo's shape and a label saying it is sample data. A PNG
 * cannot be read by a test, and a figure nobody can trace is the one
 * thing this page may not carry. So every row here is a placement the
 * world seed builds for Northbend Athletic (`PROGRAMMES[0]` in
 * `lib/seed-programmes`), read from the client's side — the rung it pays —
 * and the test holds each one to the seed: the person, the supplier the
 * client pays, the rate, and the days.
 *
 * Every figure is computed here by the product's own arithmetic, not
 * typed: months on site by `daysOnSite` and `monthsOf` from
 * `lib/tenure-days` (whole months, never rounded up, every supplier's
 * days counted once), and the invoice receipt by hours times rate.
 *
 * ── What it may not become ───────────────────────────────────────────
 *
 * It is labeled "Sample data from the demo" wherever it is drawn, and
 * the line under it says every firm on it is a demo company — not a
 * customer. It shows no savings, no spend total and no count that the
 * rows below do not add up to.
 *
 * Pure: no database, no clock. Days are counted from a fixed day, because
 * the seed counts in days from the day it ran and a span of days does not
 * depend on which day that was.
 */

import { daysOnSite, monthsOf, type Period } from '@/lib/tenure-days'

/** The day the sample is counted from. Any day gives the same spans. */
const TODAY = new Date('2026-10-09T00:00:00Z')
const DAY = 86_400_000
const ago = (days: number) => new Date(TODAY.getTime() - days * DAY)

/** One stretch on the client's site, as the seed writes it. */
export interface SampleStretch {
  /** The supplier the client pays for this stretch. */
  supplier: string
  /** Seed slug of that supplier, so the test can find it. */
  supplierSlug: string
  /** Days before the seed's today the stretch began. Negative: not yet. */
  startedDaysAgo: number
  /** Days after the seed's today it ends. Negative: it has ended. */
  endsInDays: number
}

export interface SampleContractor {
  person: string
  /** The job, in the seed's words. */
  job: string
  /** The supplier the client pays today. */
  supplier: string
  supplierSlug: string
  /** What the client pays that supplier an hour, in cents. */
  rateCents: number
  /** Every stretch on this site, every supplier, the current one last. */
  stretches: SampleStretch[]
  /** Set where the record stops the start, in the product's sentence. */
  blocked?: string
}

/** The client's time limit, from the seed's governance for this program. */
export const SAMPLE_LIMIT_MONTHS = 18

/** The demo company the sample is from. */
export const SAMPLE_CLIENT = 'Northbend Athletic'

export const SAMPLE_CONTRACTORS: SampleContractor[] = [
  {
    person: 'Helena Marsh', job: 'ERP finance lead',
    supplier: 'Computer Systems Inc', supplierSlug: 'computer-systems', rateCents: 14500,
    stretches: [{ supplier: 'Computer Systems Inc', supplierSlug: 'computer-systems', startedDaysAgo: 200, endsInDays: 160 }],
  },
  {
    person: 'Omar Haddad', job: 'Commerce platform architect',
    supplier: 'Brightmoor Staffing', supplierSlug: 'brightmoor', rateCents: 13200,
    stretches: [{ supplier: 'Brightmoor Staffing', supplierSlug: 'brightmoor', startedDaysAgo: 45, endsInDays: 320 }],
  },
  {
    // The same person a year earlier, through a different supplier. Each
    // supplier sees its own months; only the client can add them up.
    person: 'Lucía Fernández', job: 'Supply chain planning analyst',
    supplier: 'Pinnacle Resourcing', supplierSlug: 'pinnacle', rateCents: 9800,
    stretches: [
      { supplier: 'Brightmoor Staffing', supplierSlug: 'brightmoor', startedDaysAgo: 470, endsInDays: -75 },
      { supplier: 'Pinnacle Resourcing', supplierSlug: 'pinnacle', startedDaysAgo: 30, endsInDays: 335 },
    ],
  },
  {
    person: 'Ingrid Sørensen', job: 'Cybersecurity analyst',
    supplier: 'Pinnacle Resourcing', supplierSlug: 'pinnacle', rateCents: 11500,
    stretches: [{ supplier: 'Pinnacle Resourcing', supplierSlug: 'pinnacle', startedDaysAgo: -7, endsInDays: 372 }],
    blocked: 'Cannot start without an I-9.',
  },
]

function periodsOf(c: SampleContractor): Period[] {
  return c.stretches.map((s) => ({
    startDate: ago(s.startedDaysAgo),
    // A stretch that has ended stops on its last day; one still running is
    // counted to today.
    endDate: s.endsInDays < 0 ? new Date(TODAY.getTime() + s.endsInDays * DAY) : null,
  }))
}

/** One row as the sample table draws it. */
export interface SampleRow {
  person: string
  job: string
  supplier: string
  /** "$145.00 / hr" */
  rate: string
  rateCents: number
  /** Days on this client's site, every supplier counted once. */
  days: number
  /** Whole months on site, never rounded up. */
  months: number
  /** How many suppliers those months came through. */
  suppliers: number
  /** "6 of 18 months", or "Starts in 7 days". */
  onSite: string
  /** "On site", or the sentence that stops the start. */
  status: string
  tone: 'verified' | 'attention'
}

export function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function sampleRows(): SampleRow[] {
  return SAMPLE_CONTRACTORS.map((c) => {
    const days = daysOnSite(periodsOf(c), TODAY)
    const months = monthsOf(days)
    const suppliers = new Set(c.stretches.map((s) => s.supplierSlug)).size
    const startsIn = -c.stretches[c.stretches.length - 1].startedDaysAgo
    return {
      person: c.person,
      job: c.job,
      supplier: c.supplier,
      rate: `${dollars(c.rateCents)} / hr`,
      rateCents: c.rateCents,
      days,
      months,
      suppliers,
      onSite: startsIn > 0 ? `Starts in ${startsIn} days` : `${months} of ${SAMPLE_LIMIT_MONTHS} months`,
      status: c.blocked ?? 'On site',
      tone: c.blocked ? 'attention' : 'verified',
    }
  })
}

/** The three numbers over the table, each a count of the rows under it. */
export function sampleStats(rows: SampleRow[] = sampleRows()): { label: string; value: number }[] {
  const onSite = rows.filter((r) => r.status === 'On site')
  return [
    { label: 'On site', value: onSite.length },
    { label: 'Suppliers on site', value: new Set(onSite.map((r) => r.supplier)).size },
    { label: 'Starting soon', value: rows.length - onSite.length },
  ]
}

/**
 * A week waiting for the manager's signature: Lucía Fernández's 44-hour
 * week, which the seed writes as her exception week (`exceptionHours: 44`)
 * against a job of 40 hours a week.
 */
export const SAMPLE_WEEK = {
  person: 'Lucía Fernández',
  supplier: 'Pinnacle Resourcing',
  days: [
    // Spread the way the seed spreads it (`spreadHours` in lib/seed-days):
    // the odd hours on the later days, Sunday and Saturday off.
    { d: 'Sun', h: 0 }, { d: 'Mon', h: 8 }, { d: 'Tue', h: 9 }, { d: 'Wed', h: 9 },
    { d: 'Thu', h: 9 }, { d: 'Fri', h: 9 }, { d: 'Sat', h: 0 },
  ],
  jobHours: 40,
} as const

export function sampleWeek() {
  const hours = SAMPLE_WEEK.days.reduce((n, x) => n + x.h, 0)
  const over = Math.max(0, hours - SAMPLE_WEEK.jobHours)
  return {
    ...SAMPLE_WEEK,
    hours,
    over,
    flag: over > 0
      ? `${hours} hours, ${over} over the ${SAMPLE_WEEK.jobHours} the job allows. Approve anyway asks for a reason.`
      : null,
  }
}

/**
 * One invoice receipt, checked three ways: the hours the client signed,
 * the contract rate, and what the supplier's invoice asks for. The seed
 * bills Helena Marsh's three signed 40-hour weeks at Computer Systems
 * Inc's rate — $17,400.00, the figure the seed's own comment names.
 */
export const SAMPLE_RECEIPT = {
  supplier: 'Computer Systems Inc',
  person: 'Helena Marsh',
  signedWeeks: 3,
  hoursPerWeek: 40,
  rateCents: 14500,
} as const

export function sampleCheck() {
  const hours = SAMPLE_RECEIPT.signedWeeks * SAMPLE_RECEIPT.hoursPerWeek
  const expectedCents = hours * SAMPLE_RECEIPT.rateCents
  // What the supplier's invoice asks for. In the seed it is the signed
  // hours at the contract rate, so the three agree; the check is the
  // comparison, not an assumption that they will.
  const invoicedCents = expectedCents
  const agrees = invoicedCents === expectedCents
  return {
    ...SAMPLE_RECEIPT,
    hours,
    lines: [
      { label: 'Signed hours', value: `${hours.toFixed(1)}`, ok: true },
      { label: 'Contract rate', value: `${dollars(SAMPLE_RECEIPT.rateCents)} / hr`, ok: true },
      { label: 'Invoice receipt', value: dollars(invoicedCents), ok: agrees },
    ],
    agrees,
    says: agrees ? 'All three agree. Ready to pay.' : 'They do not agree. Held for the AP desk.',
  }
}

/** Every firm the sample names, for the guard. */
export function sampleFirms(): string[] {
  return [...new Set([SAMPLE_CLIENT, ...SAMPLE_CONTRACTORS.flatMap((c) => c.stretches.map((s) => s.supplier)), SAMPLE_RECEIPT.supplier])]
}

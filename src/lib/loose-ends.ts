/**
 * The links nobody meant to leave broken.
 *
 * ── The failure this exists for ──────────────────────────────────────
 *
 * A recruiter's job is closing. Accounting is somebody else's problem and
 * often somebody part-time. So a placement gets made, the sell side gets
 * raised because it is how the client gets billed, and the buy side —
 * which nobody outside finance ever looks at — does not.
 *
 * Nothing breaks that day. It breaks at month end, when the margin report
 * says a hundred per cent on a book that is really at eighteen, and by
 * then the person who could have said what the pay rate was agreed at has
 * moved on to the next requisition and does not remember.
 *
 * The 2019 spreadsheet had the same hole and filled it with a blank cell,
 * which reads as zero, which reads as perfect margin.
 *
 * ── The three rules this follows ─────────────────────────────────────
 *
 * **Never rely on somebody remembering.** The project order is opened by
 * the award, not by a person, and both contracts are attached to it in
 * the same transaction. This file exists for everything that got in
 * another way: an import, a contract raised by hand, a record from before
 * any of it was written.
 *
 * **Say which record, and what to do.** "Some contracts are missing
 * links" is useless. A name, an id, an amount and one action is not.
 *
 * **Age is the finding.** A gap found this week is a phone call. The same
 * gap found in April is an archaeology exercise, and the older it gets
 * the less likely anybody can still answer it. So every loose end carries
 * how long it has been one, and that is what sorts the list.
 */

export type EndKind =
  | 'NO_PROJECT_ORDER'
  | 'NO_BUY_CONTRACT'
  | 'NO_PAY_RATE'
  | 'ORDER_WITHOUT_COST'
  | 'APPROVED_NEVER_ACCEPTED'
  | 'AWARDED_NO_CONTRACT'
  | 'BUY_WITHOUT_ORDER'

export type Severity = 'BREAKS_REPORTING' | 'MISSTATES_MARGIN' | 'WORTH_TIDYING'

export interface Subject {
  id: string
  /** Whatever a human would call it: a person, a contract, an order. */
  label: string
  /** The client, where there is one. Gaps cluster by customer. */
  client?: string | null
  /** Revenue or cost sitting behind the gap, in cents. */
  amountCents?: number
  /** When the thing that should have been linked happened. */
  since: Date
  /**
   * The placement the gap sits on — a sell contract id.
   *
   * Not the same as `id`. A missing pay rate is a fact about a BUY
   * contract and that is the record named in the sentence, but there is
   * no page in this product that opens a buy contract on its own: a
   * placement is a sell contract with its buy leg beside it
   * (`/dashboard/placements/[id]`), and that is the screen somebody
   * actually wants. So the subject carries both — the record it is
   * about, and the door onto it.
   */
  placementId?: string
  /**
   * The role a submission was for. The submissions list filters on it,
   * which is the nearest thing to landing on the row for a record with
   * no page of its own.
   */
  requirementId?: string
}

export interface LooseEnd {
  kind: EndKind
  severity: Severity
  subject: Subject
  /** Days it has been loose. The number that decides whether it is fixable. */
  ageDays: number
  /** What is broken, in one sentence, with the record named. */
  says: string
  /** The one thing to do about it. */
  fix: string
  /** Where to go. */
  href: string
  /** True where nobody is likely to remember the answer any more. */
  coldTrail: boolean
}

/**
 * Past this, the person who knew has usually moved on.
 *
 * Not a guess about human memory — a guess about staffing. Recruiters
 * turn over, contractors roll off, and a rate agreed verbally in January
 * has nobody left to confirm it by May.
 */
export const COLD_AFTER_DAYS = 90

const DAY = 86_400_000

export function ageIn(days: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - days.getTime()) / DAY))
}

// ── Where a gap is actually fixed ─────────────────────────────────────
//
// Every one of these links used to point at a page that does not exist.
// `/dashboard/contracts/<id>`, `/dashboard/timesheets/<id>` and
// `/dashboard/submissions/<id>` were all written as if a list page
// implied a detail page under it, and none of those three folders has
// ever held an `[id]` route. So the one screen in the product whose
// whole job is "here is what is unfinished, go and finish it" answered
// "404 — This page could not be found" on six of its seven kinds.
//
// It was invisible for the same reason it was easy to write: an href is
// a string, and nothing in a string says whether anything is on the
// other end of it. `every-fix-it-link-opens.test.ts` reads the route
// tree and now does.
//
// The rule these two helpers hold: **never build a link out of an id
// unless a route exists that takes that id.** Where one does not, fall
// back to the list — a list the person must scan is a worse answer than
// landing on the row, and an infinitely better one than a dead end.

/**
 * The placement a gap sits on.
 *
 * `/dashboard/placements/[id]` takes a SELL contract id and is the only
 * page in the product that opens one placement: the person, the client,
 * both legs of the contract, the paperwork and the hours. A buy-side
 * gap therefore opens the sell line it funds, not itself.
 */
function placementHref(s: Subject, side: 'sell' | 'buy'): string {
  return s.placementId
    ? `/dashboard/placements/${s.placementId}`
    : `/dashboard/contracts?side=${side}`
}

// ── What each kind of gap actually is ─────────────────────────────────

const RULES: Record<
  EndKind,
  {
    severity: Severity
    says: (s: Subject) => string
    fix: string
    href: (s: Subject) => string
  }
> = {
  NO_BUY_CONTRACT: {
    severity: 'MISSTATES_MARGIN',
    says: (s) =>
      `${s.label} is billed${s.client ? ` to ${s.client}` : ''} and nothing on record says what they cost.`,
    fix: 'Raise the buy contract and set the pay rate. Until then this placement has no margin, not a perfect one.',
    href: (s) => placementHref(s, 'sell'),
  },
  NO_PAY_RATE: {
    severity: 'MISSTATES_MARGIN',
    says: (s) => `${s.label} has a buy contract with no pay rate on it.`,
    fix: 'Set the rate that was agreed. A zero reads as free labour and makes the margin look perfect.',
    href: (s) => placementHref(s, 'buy'),
  },
  NO_PROJECT_ORDER: {
    severity: 'BREAKS_REPORTING',
    says: (s) => `${s.label} is not attached to any project order, so nothing it earns reaches a report.`,
    fix: 'Attach it to the project it belongs to, or let one be opened for it.',
    href: (s) => placementHref(s, 'sell'),
  },
  BUY_WITHOUT_ORDER: {
    severity: 'BREAKS_REPORTING',
    says: (s) => `${s.label} pays somebody against no project order, so the cost lands nowhere.`,
    fix: 'Attach it to the same order as the sell contract it backs.',
    href: (s) => placementHref(s, 'buy'),
  },
  ORDER_WITHOUT_COST: {
    severity: 'MISSTATES_MARGIN',
    says: (s) => `${s.label} has revenue posted against it and no cost at all.`,
    fix: 'Find the buy side, or post the cost. A margin of a hundred per cent is a missing link, never good news.',
    href: (s) => `/dashboard/profitability?order=${s.id}`,
  },
  APPROVED_NEVER_ACCEPTED: {
    severity: 'MISSTATES_MARGIN',
    says: (s) =>
      `${s.label} — the client approved these hours and the employer never accepted them, so they are billed and not costed.`,
    fix: 'Accept the hours for pay, or say why they are not being paid.',
    // The week itself. Accepting hours for pay happens on the timesheets
    // list and nowhere else, so this is the list narrowed to the one row
    // — `?id=` is honored there since dd3e1a17, and clearing the filter
    // clears the parameter with it.
    href: (s) => `/dashboard/timesheets?id=${s.id}`,
  },
  AWARDED_NO_CONTRACT: {
    severity: 'BREAKS_REPORTING',
    says: (s) => `${s.label} was awarded and no contract was ever raised.`,
    fix: 'Raise the contract, or reverse the award if the placement did not happen.',
    // A submission has no page of its own; the list filters by the role
    // it was for, which is one row for most requirements and a short
    // list for the rest.
    href: (s) =>
      s.requirementId
        ? `/dashboard/submissions?requirementId=${s.requirementId}`
        : '/dashboard/submissions',
  },
}

export function looseEnd(kind: EndKind, subject: Subject, now: Date): LooseEnd {
  const r = RULES[kind]
  const age = ageIn(subject.since, now)

  return {
    kind,
    severity: r.severity,
    subject,
    ageDays: age,
    says: r.says(subject),
    fix: r.fix,
    href: r.href(subject),
    coldTrail: age >= COLD_AFTER_DAYS,
  }
}

// ── The list ──────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<Severity, number> = {
  BREAKS_REPORTING: 0,
  MISSTATES_MARGIN: 1,
  WORTH_TIDYING: 2,
}

/**
 * Worst first, then oldest.
 *
 * Deliberately not "newest first". A new gap is a two-minute fix that
 * will still be a two-minute fix tomorrow. An old one is the one that
 * becomes permanently unanswerable, and it is the one that quietly
 * poisons every total it sits inside.
 */
export function rank(ends: LooseEnd[]): LooseEnd[] {
  return [...ends].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.ageDays - a.ageDays
  )
}

export interface Standing {
  total: number
  coldTrails: number
  /** Revenue sitting behind a gap that misstates margin, in cents. */
  atRiskCents: number
  /** True where no total on the profitability screen can be trusted. */
  reportingBroken: boolean
  says: string
}

export function standing(ends: LooseEnd[]): Standing {
  const cold = ends.filter((e) => e.coldTrail).length
  const atRisk = ends
    .filter((e) => e.severity === 'MISSTATES_MARGIN')
    .reduce((n, e) => n + (e.subject.amountCents ?? 0), 0)
  const breaks = ends.some((e) => e.severity === 'BREAKS_REPORTING')

  if (ends.length === 0) {
    return {
      total: 0,
      coldTrails: 0,
      atRiskCents: 0,
      reportingBroken: false,
      says: 'Every placement has both sides and an order behind it. Nothing to chase.',
    }
  }

  const bits: string[] = [
    `${ends.length} loose end${ends.length === 1 ? '' : 's'}`,
  ]
  if (atRisk > 0) bits.push(`${money(atRisk)} of billing with no cost behind it`)
  if (cold > 0) {
    bits.push(
      `${cold} older than ${COLD_AFTER_DAYS} days, where nobody may remember the answer`
    )
  }

  return {
    total: ends.length,
    coldTrails: cold,
    atRiskCents: atRisk,
    reportingBroken: breaks,
    says: `${bits.join('. ')}.`,
  }
}

/**
 * Whether a margin figure may be shown at all.
 *
 * A screen that reports a number while knowing it is wrong is worse than
 * one that refuses. This is what the profitability page asks before it
 * prints a percentage.
 */
export function mayTrustReporting(ends: LooseEnd[]): { ok: boolean; says: string } {
  const blocking = ends.filter(
    (e) => e.severity === 'BREAKS_REPORTING' || e.severity === 'MISSTATES_MARGIN'
  )
  if (blocking.length === 0) return { ok: true, says: 'Everything reconciles.' }

  return {
    ok: false,
    says:
      `${blocking.length} placement${blocking.length === 1 ? '' : 's'} ` +
      `${blocking.length === 1 ? 'is' : 'are'} missing a link, so these totals are ` +
      `understated on cost. Clear the loose ends before quoting a margin.`,
  }
}

function money(cents: number): string {
  const n = Math.abs(cents) / 100
  return `${cents < 0 ? '-' : ''}$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

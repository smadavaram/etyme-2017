/**
 * Who may read what a person is paid, on a list of buy lines.
 *
 * ── The finding this closes ──────────────────────────────────────────
 *
 * `GET /api/contracts?side=buy` asked who the caller was, scoped the
 * rows to the caller's company, and then handed every buy line's pay
 * rate to every staff seat at that company. Karthik Menon is a delivery
 * engineer at Teleworld Solutions — his seat reads assignments and
 * timesheets and nothing about money — and the Buy tab showed him what
 * Teleworld pays each of his colleagues. A pay rate is the most private
 * figure a firm holds about a person, and the list was the one door onto
 * it that nobody had closed: the placement page, the rate history and the
 * payroll screen all ask for `consultants.cost` before they print one.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 * A pay figure is read by a seat holding `consultants.cost` — the desks
 * that run pay: AP & Payroll, Finance, the owner and the admin — or by
 * the person it pays, about themselves only. That is `canReadPayRate` in
 * lib/permissions, the rule every other door already uses; this file is
 * only the list's application of it, row by row and person by person.
 *
 * Holding `consultants.cost` never shows a bill rate or a margin. Those
 * are `margin.read`'s, and a buy line carries neither.
 *
 * ── Withheld, not refused ────────────────────────────────────────────
 *
 * The Buy tab is where a contract manager, HR and the delivery managers
 * see who is on a line, through which firm, from when to when, and
 * whether it is running. None of that is pay, and refusing the whole
 * list to take one column off it would send those desks to a
 * spreadsheet. So the line is listed, the pay figure on it is null, and
 * the response says in a sentence which desks read pay.
 *
 * A shared line — one buy contract naming several people — carries a pay
 * range. Where any figure on it is withheld, the range is withheld too:
 * a minimum and maximum over the people the reader may see is not the
 * range of the line, and printing it under that name would be a figure
 * nobody can stand behind.
 *
 * ── The trail ────────────────────────────────────────────────────────
 *
 * CLAUDE.md: every read of another person's data writes an AccessLog
 * row, including refusals. So every person whose pay was withheld is a
 * refusal, and every person whose pay was shown to somebody other than
 * themselves is a read. A person reading their own line is not logged,
 * the same as the rest of `/api/me`.
 */

import { canReadPayRate } from '@/lib/permissions'

/** The permission a pay figure is read under. Named once, used everywhere. */
export const READS_PAY = 'consultants.cost' as const

/** Said wherever a pay figure is withheld. Names the desks, never the key. */
export const PAY_WITHHELD_SAYS =
  'What each person is paid is shown only to the desks that run pay — AP & Payroll, Finance, the owner and the admin. ' +
  'Everything else about these lines is here.'

/** The reason written on the trail for a withheld figure. */
export const PAY_WITHHELD_REASON =
  'Pay rate withheld from a buy line: this seat does not hold consultants.cost, the permission the desks that run pay hold.'

/** The reason written on the trail for a figure that was shown. */
export const PAY_SHOWN_REASON = 'Pay rate read on a buy line by a desk holding consultants.cost.'

export interface PayViewer {
  permissions: readonly string[]
  /** The caller's own person, so their own line is theirs to read. */
  personId: string
}

/** Whether this viewer may read what this person is paid. */
export function mayReadPayOf(viewer: PayViewer, subjectPersonId: string): boolean {
  return canReadPayRate({
    permissions: viewer.permissions,
    isSubject: viewer.personId === subjectPersonId,
  })
}

export interface PayCandidate {
  personId: string
  payRate: number
}

export interface PayLineView<C> {
  /** Each candidate, with `payRate` null where it is withheld. */
  candidates: Array<Omit<C, 'payRate'> & { payRate: number | null; payWithheld: boolean }>
  /** The single rate on a one-person line, null where withheld or shared. */
  payRate: number | null
  /** Null where any figure on the line is withheld — a range over part of a line is not its range. */
  payRateMin: number | null
  payRateMax: number | null
  /** True where at least one figure was withheld. */
  withheld: boolean
}

/**
 * One buy line, as this viewer may read it.
 *
 * `candidates` are the people the viewer may already see on the line —
 * narrowing a consultant seat to their own row happens before this and
 * is not this function's question.
 */
export function payFiguresFor<C extends PayCandidate>(viewer: PayViewer, candidates: C[]): PayLineView<C> {
  const shown = candidates.map((c) => {
    const may = mayReadPayOf(viewer, c.personId)
    return { ...c, payRate: may ? c.payRate : null, payWithheld: !may }
  })
  const withheld = shown.some((c) => c.payWithheld)
  const rates = shown.map((c) => c.payRate).filter((r): r is number => r != null)
  const single = shown.length === 1 ? shown[0] : null
  return {
    candidates: shown,
    payRate: single ? single.payRate : null,
    payRateMin: withheld || rates.length === 0 ? null : Math.min(...rates),
    payRateMax: withheld || rates.length === 0 ? null : Math.max(...rates),
    withheld,
  }
}

export interface PayTrail {
  /** People whose pay this viewer was refused. */
  refused: string[]
  /** People other than the viewer whose pay this viewer read. */
  read: string[]
}

/**
 * Who goes on the trail, and as what. Each person once per request,
 * however many lines name them; the viewer's own line is never logged.
 */
export function payTrail(viewer: PayViewer, subjects: PayCandidate[]): PayTrail {
  const refused = new Set<string>()
  const read = new Set<string>()
  for (const s of subjects) {
    if (s.personId === viewer.personId) continue
    if (mayReadPayOf(viewer, s.personId)) read.add(s.personId)
    else refused.add(s.personId)
  }
  return { refused: [...refused], read: [...read] }
}

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

import { canReadPayRate, hasPermission, type Permission } from '@/lib/permissions'

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

// ── What a line bills at ──────────────────────────────────────────────
//
// The sell list handed every bill rate to every staff seat that was not a
// consultant's, so the same delivery engineer who could read his
// colleagues' pay could read what the client is billed for each of them —
// and the margin is one subtraction away from the two.
//
// Who may read it depends on which end of the line the reader's company
// stands at:
//
//   - **The firm that bills it.** What it charges is the price desk's and
//     the billing desk's: `margin.read`, `rates.read` (the price desk —
//     "Reading what a placement is priced at is the price desk's", matrix
//     L3.7.3.5), or `invoices.issue` (the desk that puts that rate on a
//     bill). Accounts Receivable, the Account Manager, the Contract
//     Manager, Finance and the owner; never a recruiter or a delivery
//     engineer. `margin.read` alone would have hidden the rate from every
//     desk that bills it, because no default role but the owner holds it.
//   - **A client company that pays it.** "You are the client on the MSA":
//     it is the client's own price, and every desk at a client reads what
//     its contractors cost it.
//   - **A supplier firm that pays it** — a prime reading its sub-vendor's
//     line. For the prime that rate is its cost for a person, so it is the
//     pay rule's: `consultants.cost`, `margin.read` or `rates.read`.
//   - **Anybody else** — an end client reading a rung it does not pay is
//     already kept off by the scope; here it is simply not a party.

export interface BillViewer {
  permissions: readonly string[]
  /** Whose book is open — the seat's client where the reader is in a seat. */
  companyId: string | null
  companyKind: string | null
}

export interface BillLine {
  /** The firm that bills on this line. */
  sellerId: string
  /** The company that pays it. */
  clientId: string
}

const any = (perms: readonly string[], wanted: Permission[]) => wanted.some((p) => hasPermission(perms, p))

export function mayReadBillRate(viewer: BillViewer, line: BillLine): boolean {
  if (!viewer.companyId) return false
  if (viewer.companyId === line.sellerId) {
    return any(viewer.permissions, ['margin.read', 'rates.read', 'invoices.issue'])
  }
  if (viewer.companyId === line.clientId) {
    if (viewer.companyKind === 'CLIENT') return true
    return any(viewer.permissions, ['consultants.cost', 'margin.read', 'rates.read'])
  }
  return false
}

/** Said wherever a bill rate is withheld. Names the desks, never the key. */
export const BILL_WITHHELD_SAYS =
  'What each line bills at is shown only to the desks that price and bill it — Accounts Receivable, the account manager, the contract manager, Finance and the owner. ' +
  'Everything else about these lines is here.'

export const BILL_WITHHELD_REASON =
  'Bill rate withheld from a sell line: this seat holds none of the permissions the price and billing desks hold.'
export const BILL_SHOWN_REASON = 'Bill rate read on a sell line by a desk that prices, bills or pays it.'

/** Who goes on the trail for a list of sell lines: each person once, never the reader themselves. */
export function billTrail(
  viewer: BillViewer & { personId: string },
  lines: Array<BillLine & { personId: string }>
): PayTrail {
  const refused = new Set<string>()
  const read = new Set<string>()
  for (const l of lines) {
    if (l.personId === viewer.personId) continue
    if (mayReadBillRate(viewer, l)) read.add(l.personId)
    else refused.add(l.personId)
  }
  // A person on two lines, one readable and one not, is on the trail as both.
  return { refused: [...refused], read: [...read] }
}

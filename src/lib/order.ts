/**
 * The internal order — one cost object per piece of work, and everything
 * posts to it.
 *
 * ── What this replaces ───────────────────────────────────────────────
 *
 * The 2019 way was a spreadsheet: one row per consultant-assignment,
 * fifteen month columns repeated five times over for billed, owed, paid,
 * expenses and profit. Roughly seventy-five columns and a hundred rows,
 * kept by hand, and correct as far as it went.
 *
 * What it could not do:
 *
 *   · **One customer, several consultants.** The customer lived inside
 *     the consultant's name — "Vani Pasala - wipro". Adding up a client
 *     meant matching a string, so nobody did.
 *   · **One consultant, several customers.** Same problem the other way.
 *   · **A rate change.** It forked the row. The same person appeared
 *     three times at three rates and had no total.
 *   · **Overtime and on-call.** Their own rows, at their own rates,
 *     detached from the assignment they belonged to.
 *   · **Overhead.** Advertising, trainers, green cards, H1Bs, lawyers,
 *     rent, the guest house, payroll taxes and commissions all sat
 *     unallocated at the bottom of the sheet. So the per-consultant
 *     "profit" column was gross margin wearing the wrong label, and real
 *     profit was only ever knowable for the whole firm at once.
 *   · **Another month.** A sixteenth month meant reshaping the sheet.
 *
 * ── Why not just link the two contracts ──────────────────────────────
 *
 * Because a link is pairwise and every interesting case is one-to-many.
 * Six consultants at one client is one sell contract and six buy
 * contracts. A rate change is one sell and two buys. A subcontracted
 * person is one sell and a buy at each layer. The link is still worth
 * keeping — it says which agreement backs which, and for what period,
 * which is a contractual fact. It is just not where money should be
 * added up.
 *
 * ── The shape ────────────────────────────────────────────────────────
 *
 * An order collects postings. A posting is signed — positive is money in,
 * negative is money out — and carries the dimensions the sheet could not
 * hold: which person, which customer, which contract, which month. Then
 * you ask the order what it made, and you can ask it sliced any of those
 * ways without reshaping anything.
 */

export type PostingKind =
  | 'REVENUE'
  | 'PAY'
  | 'BURDEN'
  | 'PREMIUM'
  | 'EXPENSE'
  | 'COMMISSION'
  | 'VISA'
  | 'OVERHEAD'
  /// Held back from a consultant's share into their own bench reserve, or
  /// drawn out of it to pay them while they sit. Sign says which.
  | 'RESERVE'
  | 'SETTLEMENT'

export interface Posting {
  id: string
  kind: PostingKind
  /** Signed cents. Positive into the firm, negative out of it. */
  amountCents: number
  personId?: string | null
  personName?: string | null
  clientCompanyId?: string | null
  clientName?: string | null
  sellContractId?: string | null
  buyContractId?: string | null
  postedAt: Date
  says: string
  /** Set where this posting cancels an earlier one. */
  reversalOfId?: string | null
  /** The order's currency. Every amount above is already in it. */
  currency?: string
  /** What actually moved, before conversion. */
  txCurrency?: string
  txAmountCents?: number
  /** When money actually moved, and how much of it. Null = still owed. */
  settledAt?: Date | null
  settledCents?: number | null
}

/** Costs that belong to a specific person or deal. */
const DIRECT: PostingKind[] = ['PAY', 'BURDEN', 'PREMIUM', 'COMMISSION', 'VISA']

export interface Result {
  /** Postings counted, after reversals cancel out. */
  count: number
  revenueCents: number
  payCents: number
  burdenCents: number
  premiumCents: number
  expenseCents: number
  commissionCents: number
  visaCents: number
  overheadCents: number
  /** Revenue less the costs that belong to this work. */
  grossCents: number
  /** Gross less whatever overhead was allocated here. */
  netCents: number
  /** Null where there is no revenue, or where no cost is on record. */
  grossPct: number | null
  netPct: number | null

  // Earned, and then actually settled. The spreadsheet kept this by hand:
  // "to pay 15,680 - paid 11,760 - diff -3,920 - date paid". Two profit
  // numbers that disagree for months, and both are worth knowing: one
  // says whether the work is worth doing, the other whether the bank
  // account agrees yet.
  /** Revenue actually collected. */
  collectedCents: number
  /** Billed and not yet collected. */
  owedToUsCents: number
  /** Costs actually paid out. */
  paidOutCents: number
  /** Owed to consultants and suppliers and not yet paid. */
  weOweCents: number
  /** Margin counting only money that has actually moved. */
  cashCents: number
  cashSays: string
  /**
   * True where money was billed and nothing says what it cost.
   *
   * The spreadsheet had the same hole and filled it with a blank cell,
   * which reads as zero, which reads as a hundred per cent margin. Named
   * here so it can be shown rather than computed around.
   */
  costUnknown: boolean
  says: string
}

/**
 * Drops reversed postings and the reversals that cancelled them.
 *
 * Nothing is ever edited or deleted — the month it belonged to may
 * already have been reported to somebody. A wrong posting is cancelled
 * by an equal and opposite one, and both stay on the record.
 */
export function live(postings: Posting[]): Posting[] {
  const cancelled = new Set<string>()
  for (const p of postings) {
    if (p.reversalOfId) {
      cancelled.add(p.reversalOfId)
      cancelled.add(p.id)
    }
  }
  return postings.filter((p) => !cancelled.has(p.id))
}

export function resultOf(all: Posting[]): Result {
  const ps = live(all)

  // Every amount is already in the order's currency — conversion happens
  // once, when the posting is written, at a rate stamped on the row. If
  // two currencies ever reach this function, something upstream stopped
  // converting and the sum below would be a total of nothing. Loudly, not
  // quietly: a number that is out by a factor of eighty looks perfectly
  // reasonable on a screen.
  const currencies = new Set(ps.map((p) => p.currency).filter(Boolean))
  if (currencies.size > 1) {
    throw new Error(
      `Postings on one order in ${[...currencies].join(' and ')}. ` +
        `Amounts must be converted to the order's currency before they are ` +
        `written, so this cannot be added up.`
    )
  }
  const sum = (k: PostingKind) =>
    ps.filter((p) => p.kind === k).reduce((n, p) => n + p.amountCents, 0)

  const revenue = sum('REVENUE')
  const pay = sum('PAY')
  const burden = sum('BURDEN')
  const premium = sum('PREMIUM')
  const expense = sum('EXPENSE')
  const commission = sum('COMMISSION')
  const visa = sum('VISA')
  const overhead = sum('OVERHEAD')

  // Costs are already negative, so this adds up.
  // Expenses are already signed both ways — billed on to the client is
  // money in, reimbursed to the person is money out — so they add in as
  // they stand.
  const gross = revenue + pay + burden + premium + expense + commission + visa
  const net = gross + overhead

  // Billed something, and nothing on record says what it cost. The
  // arithmetic still runs and produces a hundred per cent.
  const costUnknown = revenue > 0 && DIRECT.every((k) => sum(k) === 0)

  const collected = ps
    .filter((p) => p.amountCents > 0)
    .reduce((n, p) => n + (p.settledCents ?? 0), 0)
  const paidOut = ps
    .filter((p) => p.amountCents < 0)
    .reduce((n, p) => n + (p.settledCents ?? 0), 0)
  const owedToUs = ps
    .filter((p) => p.amountCents > 0)
    .reduce((n, p) => n + (p.amountCents - (p.settledCents ?? 0)), 0)
  const weOwe = -ps
    .filter((p) => p.amountCents < 0)
    .reduce((n, p) => n + (p.amountCents - (p.settledCents ?? 0)), 0)

  return {
    count: ps.length,
    revenueCents: revenue,
    payCents: pay,
    burdenCents: burden,
    premiumCents: premium,
    expenseCents: expense,
    commissionCents: commission,
    visaCents: visa,
    overheadCents: overhead,
    grossCents: gross,
    netCents: net,
    grossPct: costUnknown || revenue === 0 ? null : pct(gross, revenue),
    netPct: costUnknown || revenue === 0 ? null : pct(net, revenue),
    costUnknown,
    collectedCents: collected,
    owedToUsCents: owedToUs,
    paidOutCents: paidOut,
    weOweCents: weOwe,
    cashCents: collected + paidOut,
    cashSays: cashSaysFor(collected, paidOut, owedToUs, weOwe),
    says: saysFor(revenue, gross, net, overhead, costUnknown),
  }
}

function cashSaysFor(
  collected: number,
  paidOut: number,
  owedToUs: number,
  weOwe: number
): string {
  if (collected === 0 && paidOut === 0) {
    return owedToUs === 0 && weOwe === 0
      ? 'No money has moved on this yet.'
      : `Nothing settled. ${money(owedToUs)} to collect, ${money(weOwe)} to pay.`
  }
  const bits = [`${money(collected + paidOut)} in the bank on this`]
  if (owedToUs > 0) bits.push(`${money(owedToUs)} still to collect`)
  // What the diff column was really about. Somebody is owed wages, and
  // that is not the same problem as a slow client.
  if (weOwe > 0) bits.push(`${money(weOwe)} still owed to people`)
  return `${bits.join(', ')}.`
}

function pct(part: number, whole: number): number {
  return Math.round((part / whole) * 1000) / 10
}

function saysFor(
  revenue: number,
  gross: number,
  net: number,
  overhead: number,
  costUnknown: boolean
): string {
  if (costUnknown) {
    return (
      `${money(revenue)} billed and no cost posted against it. ` +
      `Nothing here can tell you what this made.`
    )
  }
  if (revenue === 0 && gross === 0 && net === 0) return 'Nothing posted yet.'
  if (revenue === 0) {
    return `Nothing billed and ${money(-net)} spent.`
  }
  const head =
    gross < 0
      ? `Losing ${money(-gross)} on ${money(revenue)} billed`
      : `${money(gross)} on ${money(revenue)} billed — ${pct(gross, revenue)}%`

  if (overhead === 0) return `${head}.`

  // The line the spreadsheet could never write, because overhead sat at
  // the bottom of the page belonging to nobody.
  return net < 0
    ? `${head}, and ${money(-net)} down once ${money(-overhead)} of overhead is counted.`
    : `${head}, ${money(net)} after ${money(-overhead)} of overhead.`
}

// ── Slicing ───────────────────────────────────────────────────────────
//
// Same postings, grouped differently. This is the whole reason for the
// shape: none of these needed a new column, a new sheet or a new tab.

export interface Slice extends Result {
  key: string
  label: string
}

function group(
  ps: Posting[],
  keyOf: (p: Posting) => string | null | undefined,
  labelOf: (p: Posting) => string | null | undefined,
  unlabelled: string
): Slice[] {
  const buckets = new Map<string, { label: string; rows: Posting[] }>()
  for (const p of ps) {
    const k = keyOf(p) ?? '—'
    const b = buckets.get(k) ?? { label: labelOf(p) ?? unlabelled, rows: [] }
    b.rows.push(p)
    buckets.set(k, b)
  }
  return [...buckets.entries()].map(([key, b]) => ({
    key,
    label: b.label,
    ...resultOf(b.rows),
  }))
}

/**
 * One consultant across every customer and every rate they ever had.
 *
 * The sheet could not do this. A rate change forked the row, so the same
 * person appeared two or three times and their year had no total.
 */
export function byPerson(ps: Posting[]): Slice[] {
  return group(ps, (p) => p.personId, (p) => p.personName, 'Not attributed to anybody')
    .sort((a, b) => b.grossCents - a.grossCents)
}

/**
 * One customer across every consultant placed there.
 *
 * The sheet could not do this either. The customer lived inside the
 * consultant's name, so a client with six people on site was six
 * unrelated rows.
 */
export function byCustomer(ps: Posting[]): Slice[] {
  return group(ps, (p) => p.clientCompanyId, (p) => p.clientName, 'No customer on the posting')
    .sort((a, b) => b.grossCents - a.grossCents)
}

/** Months come from the postings. Adding one is not a change to anything. */
export function byMonth(ps: Posting[]): Slice[] {
  return group(
    ps,
    (p) => monthKey(p.postedAt),
    (p) => monthLabel(p.postedAt),
    'Undated'
  ).sort((a, b) => a.key.localeCompare(b.key))
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function monthLabel(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

// ── Overhead ──────────────────────────────────────────────────────────

export type Basis = 'REVENUE' | 'HEADCOUNT' | 'EVEN'

export interface AllocationTarget {
  key: string
  label: string
  revenueCents: number
  people: number
}

export interface Allocation {
  key: string
  label: string
  amountCents: number
  shareBps: number
  says: string
}

/**
 * Spreads a pot of firm overhead across the work that caused it.
 *
 * The sheet listed advertising, trainers, green cards, H1B filings,
 * lawyers, Indian salaries, rent, the guest house, payroll taxes and
 * commissions in a block at the bottom and stopped there. Nothing carried
 * them up into a consultant or a client, so every per-consultant profit
 * figure was overstated by the same invisible amount and the firm's real
 * result appeared once, at the very bottom, far too late to act on.
 *
 * The basis is a choice and it is stated on every line rather than
 * buried, because an allocated cost is an opinion and should read as one.
 */
export function allocate(
  potCents: number,
  targets: AllocationTarget[],
  // Per head by default. Back office, marketing and sales do roughly the
  // same amount of work for a consultant billing eighty thousand as for
  // one billing two hundred and fifty, so spreading by revenue would make
  // the expensive consultant subsidise the cheap one. Even shares make a
  // low-billing consultant look worse, which may simply be the truth.
  basis: Basis = 'EVEN'
): Allocation[] {
  if (targets.length === 0 || potCents === 0) return []

  const weightOf = (t: AllocationTarget) =>
    basis === 'REVENUE' ? Math.max(0, t.revenueCents)
      : basis === 'HEADCOUNT' ? Math.max(0, t.people)
        : 1

  const weights = targets.map(weightOf)
  const totalWeight = weights.reduce((a, b) => a + b, 0)

  // Nothing to spread it by. Even shares beat a silent divide by zero,
  // and it is said out loud.
  const even = totalWeight === 0

  const shares = targets.map((t, i) => (even ? 1 / targets.length : weights[i] / totalWeight))

  // Largest remainder, so the parts add back to the pot exactly. A
  // rounding cent left on the floor is how a reconciliation fails.
  const raw = shares.map((s) => potCents * s)
  const floored = raw.map((r) => (potCents < 0 ? Math.ceil(r) : Math.floor(r)))
  let left = potCents - floored.reduce((a, b) => a + b, 0)
  const order = raw
    .map((r, i) => ({ i, frac: Math.abs(r - floored[i]) }))
    .sort((a, b) => b.frac - a.frac)
  const step = potCents < 0 ? -1 : 1
  for (let n = 0; n < order.length && left !== 0; n++) {
    floored[order[n].i] += step
    left -= step
  }

  const how = even
    ? 'split evenly — nothing to weigh it by'
    : basis === 'REVENUE' ? 'by share of revenue'
      : basis === 'HEADCOUNT' ? 'by headcount'
        : 'split evenly, per head'

  return targets.map((t, i) => ({
    key: t.key,
    label: t.label,
    amountCents: floored[i],
    shareBps: Math.round(shares[i] * 10_000),
    says: `${money(Math.abs(floored[i]))} of overhead, ${how}.`,
  }))
}

// ── The budget ────────────────────────────────────────────────────────

export interface BudgetStanding {
  budgetCents: number | null
  spentCents: number
  remainingCents: number | null
  usedBps: number | null
  overBudget: boolean
  says: string
}

/**
 * What is left on an order.
 *
 * A cost object with no ceiling is a cost centre, not an order. Where a
 * budget is set, exceeding it is a fact the person committing the next
 * pound should see before they commit it, not in a month-end report.
 */
export function standing(budgetCents: number | null, postings: Posting[]): BudgetStanding {
  const spent = -live(postings)
    .filter((p) => p.amountCents < 0)
    .reduce((n, p) => n + p.amountCents, 0)

  if (budgetCents == null) {
    return {
      budgetCents: null,
      spentCents: spent,
      remainingCents: null,
      usedBps: null,
      overBudget: false,
      says: `${money(spent)} committed. No ceiling set on this order.`,
    }
  }

  const remaining = budgetCents - spent
  return {
    budgetCents,
    spentCents: spent,
    remainingCents: remaining,
    usedBps: budgetCents === 0 ? null : Math.round((spent / budgetCents) * 10_000),
    overBudget: remaining < 0,
    says: remaining < 0
      ? `${money(-remaining)} over a ${money(budgetCents)} budget.`
      : `${money(remaining)} left of ${money(budgetCents)}.`,
  }
}

// ── Writing a posting ─────────────────────────────────────────────────

/**
 * The sign, decided once.
 *
 * Getting it backwards on one posting turns a cost into revenue and
 * nothing downstream would notice, so it is not left to whoever is
 * writing the call.
 */
export function signed(kind: PostingKind, amountCents: number): number {
  const magnitude = Math.abs(Math.round(amountCents))
  switch (kind) {
    case 'REVENUE':
      return magnitude
    case 'PAY':
    case 'BURDEN':
    case 'PREMIUM':
    case 'COMMISSION':
    case 'VISA':
    case 'OVERHEAD':
      return -magnitude
    // Held back from a share is money out of this month's pay; drawn back
    // out to fund a bench week is money in. Only the caller knows which.
    case 'RESERVE':
      return Math.round(amountCents)
    // An expense billed on to the client is money in; reimbursed to the
    // person it is money out. The caller has to say which, so this one
    // passes the sign through as given.
    case 'EXPENSE':
    case 'SETTLEMENT':
      return Math.round(amountCents)
  }
}

/** Cancels a posting with an equal and opposite one. Neither is deleted. */
export function reversalOf(p: Posting, why: string): Omit<Posting, 'id'> {
  return {
    kind: p.kind,
    amountCents: -p.amountCents,
    personId: p.personId,
    personName: p.personName,
    clientCompanyId: p.clientCompanyId,
    clientName: p.clientName,
    sellContractId: p.sellContractId,
    buyContractId: p.buyContractId,
    // The month it belonged to, not the month somebody spotted it.
    postedAt: p.postedAt,
    reversalOfId: p.id,
    says: `Reverses: ${p.says} — ${why}`,
  }
}

export function money(cents: number): string {
  const n = Math.abs(cents) / 100
  const s = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${cents < 0 ? '-' : ''}$${s}`
}

// ═════════════════════════════════════════════════════════════════════
// SETTLEMENT AND CLOSE
// ═════════════════════════════════════════════════════════════════════
//
// An order is a temporary pot. It opens when work starts, it accumulates,
// and at the end its balance has to go somewhere — because a project that
// has finished should not still be carrying a result that nobody owns.
// Where it goes is the cost centre: a standing department with a budget
// that continues after the project does not.
//
// `order-postings.ts` already refuses to write into a SETTLED order,
// which is half the control. This is the other half: the act of settling.
//
// ── Why the settlement is always a pair ──────────────────────────────
//
// Moving a balance is two postings, never one: the amount out of the
// order and the same amount into wherever it went. Writing only the
// first makes money disappear from the group's books, which balances on
// the order and not on anything above it.
//
// A pair also means the movement is visible from both ends. Somebody
// looking at the cost centre can see what arrived and from where, which
// is the question a controller actually asks at year end.
//
// ── Why LOCKED exists between OPEN and SETTLED ───────────────────────
//
// Month end is not the end of a project. Books close on the 5th and
// corrections to the month just closed keep arriving for a fortnight —
// a timesheet reversed, an expense coded late. LOCKED says "no new work
// posts here, corrections still may", which is the state every finance
// team actually operates in and which most systems make people fake by
// leaving the period open.

export type OrderStatus = 'OPEN' | 'LOCKED' | 'SETTLED' | 'CLOSED'

export interface SettlementPosting {
  kind: 'SETTLEMENT'
  /** Signed cents. The pair sums to zero. */
  amountCents: number
  /** Which side of the movement this is. */
  leg: 'OUT_OF_ORDER' | 'INTO_COST_CENTRE'
  says: string
}

export interface SettlementPlan {
  ok: boolean
  /** Why not, where it cannot be settled. */
  refusal: string | null
  /** The balance being moved, in the order's currency. */
  balanceCents: number
  /** Always two, or empty where it cannot proceed. */
  postings: SettlementPosting[]
  /** The date the movement takes. The period being closed, not today. */
  postedAt: Date | null
  says: string
}

export interface SettlementInput {
  status: OrderStatus
  /** The cost centre the balance goes to. Null is a refusal, not a default. */
  settlesToCode: string | null
  settlesToName: string | null
  currency: string
  /** Every posting on the order. */
  postings: Posting[]
  /** The last day of the period being closed. */
  closingOn: Date
}

/**
 * What settling this order would do, or why it cannot be done.
 *
 * Returns a plan rather than performing anything, so the screen can show
 * the two postings before anybody agrees to them. A settlement that
 * happens and is then queried is a settlement somebody has to reverse
 * across a closed period.
 */
export function settlementPlan(i: SettlementInput): SettlementPlan {
  const nothing = { balanceCents: 0, postings: [], postedAt: null }

  if (i.status === 'SETTLED' || i.status === 'CLOSED') {
    return {
      ok: false,
      refusal: 'ALREADY_SETTLED',
      ...nothing,
      says:
        `This order is already ${i.status.toLowerCase()}. Settling it again would move a ` +
        `balance that has already gone, and the second movement would land in a period ` +
        `somebody has already reported.`,
    }
  }

  if (!i.settlesToCode) {
    return {
      ok: false,
      refusal: 'NO_COST_CENTRE',
      ...nothing,
      says:
        'Nowhere to settle this to. An order is a temporary pot and its balance has to ' +
        'land in a standing one — set the cost centre before closing it, rather than ' +
        'leaving a finished project carrying a result nobody owns.',
    }
  }

  const result = resultOf(i.postings)
  const balance = result.netCents

  if (balance === 0) {
    return {
      ok: false,
      refusal: 'NOTHING_TO_MOVE',
      ...nothing,
      says:
        'The order nets to nothing, so there is no balance to move. It can be closed ' +
        'without a settlement posting — two rows moving zero would be noise in the ' +
        'ledger for ever.',
    }
  }

  const to = i.settlesToName ?? i.settlesToCode
  const direction = balance > 0 ? 'a surplus' : 'a shortfall'

  return {
    ok: true,
    refusal: null,
    balanceCents: balance,
    postedAt: i.closingOn,
    postings: [
      {
        kind: 'SETTLEMENT',
        amountCents: -balance,
        leg: 'OUT_OF_ORDER',
        says: `${money(Math.abs(balance))} ${direction} settled out to ${to}.`,
      },
      {
        kind: 'SETTLEMENT',
        amountCents: balance,
        leg: 'INTO_COST_CENTRE',
        says: `${money(Math.abs(balance))} ${direction} received from this order.`,
      },
    ],
    says:
      `${money(Math.abs(balance))} ${direction}, moving to ${to} and dated ` +
      `${i.closingOn.toISOString().slice(0, 10)} — the period being closed, not the day ` +
      `somebody ran it. Two postings, equal and opposite, so nothing is created or ` +
      `destroyed on the way.`,
  }
}

/** A settlement pair is only well formed when it nets to nothing. */
export function settlementBalances(postings: SettlementPosting[]): boolean {
  return postings.length === 2 && postings.reduce((n, p) => n + p.amountCents, 0) === 0
}

export type PostingIntent = 'NEW_WORK' | 'CORRECTION'

export interface PostingPermission {
  allowed: boolean
  says: string
}

/**
 * Whether a posting may be written given the order's state.
 *
 * The three states in one place, so the route, the screen and the writer
 * cannot disagree about what LOCKED means.
 */
export function mayPostTo(status: OrderStatus, intent: PostingIntent): PostingPermission {
  if (status === 'OPEN') {
    return { allowed: true, says: 'The order is open.' }
  }
  if (status === 'LOCKED') {
    return intent === 'CORRECTION'
      ? {
          allowed: true,
          says:
            'The order is locked for new work and still takes corrections. Books close on ' +
            'the 5th and corrections to the month just closed keep arriving for a ' +
            'fortnight — that is the state a finance team actually operates in.',
        }
      : {
          allowed: false,
          says:
            'This order is locked. New work does not post to a closed month; post it to ' +
            'the current one, or reopen the period deliberately if the work genuinely ' +
            'belongs there.',
        }
  }
  return {
    allowed: false,
    says:
      `This order is ${status.toLowerCase()}. Its balance has already moved out to a cost ` +
      `centre, so a posting here would change a period that has left the building. Post ` +
      `the correction to an open order instead.`,
  }
}



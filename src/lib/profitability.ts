/**
 * What a placement actually made, once everything is counted.
 *
 * The plumbing for this has been in the schema since the start —
 * ContractLink joins a sell to a buy, BuyContract carries commission
 * terms, MasterAgreement carries a minimum margin, and `margin.read` and
 * `pnl.read` are real permissions. None of it was ever added up.
 *
 * ── Why the ledger changes this ──────────────────────────────────────
 *
 * Margin is not (bill rate − pay rate) × hours, and treating it as one
 * number of hours is where staffing firms lose money quietly.
 *
 * The client approves forty. The employer accepts thirty-eight, because
 * two were travel nobody agreed to bill. You bill forty and you pay
 * thirty-eight, and the margin on that placement is not what either rate
 * card says. Now that both numbers come from assertions rather than from
 * a contract read at invoice time, this can finally be counted properly.
 *
 * ── The three things that make a good margin a bad one ───────────────
 *
 * **Burden.** A W2 placement carries employer taxes, workers'
 * compensation and benefits on top of the wage — commonly a fifth to a
 * third again. Ignoring it makes every W2 placement look like a C2C one
 * and pushes a firm towards the wrong kind of work.
 *
 * **Commission.** Paid to whoever made the placement, and it comes out
 * of this margin rather than out of the air.
 *
 * **Bench.** The one that matters most and appears in no invoice. A
 * consultant can be profitable on every single assignment and lose money
 * over a year because of the gaps between them. Per-candidate
 * profitability that ignores bench time is not conservative, it is
 * wrong.
 */

export type ContractType = 'W2' | 'C2C' | 'IND_1099' | 'C2H_W2' | 'CDD' | 'FIXED_TERM'

/**
 * Employer burden as a share of pay, by how somebody is engaged.
 *
 * Defaults, and every one of them is a working assumption rather than a
 * measured cost — which is why the result says so rather than presenting
 * an estimate as a fact. A client with real numbers should set their own.
 */
export const DEFAULT_BURDEN: Record<ContractType, number> = {
  // Employer FICA, FUTA, SUTA, workers' comp, benefits.
  W2: 0.22,
  C2H_W2: 0.22,
  // The sub-vendor carries the burden on their own people. Paying an
  // invoice is the whole cost.
  C2C: 0,
  // No employer taxes on an independent contractor. That is the point of
  // the classification, and also the risk in it.
  IND_1099: 0,
  // European fixed-term employment, social charges are heavier.
  CDD: 0.35,
  FIXED_TERM: 0.28,
}

export interface Line {
  /** Hours the client approved, from their assertion. */
  billedHours: number
  billRateCents: number
  /** Hours the employer accepted. Not always the same number. */
  paidHours: number
  payRateCents: number
  contractType: ContractType
  /**
   * False where no buy contract exists behind this placement.
   *
   * Not a detail. With no buy side the pay rate reads zero and the
   * margin computes to 100%, which is the most dangerous number this
   * file could produce — it is confidently wrong, it looks like good
   * news, and nobody questions good news.
   */
  costKnown?: boolean
  /** Overridden burden rate, where a client knows their own. */
  burdenRate?: number
  /** Commission on this placement, cents. */
  commissionCents?: number
  /** Expenses billed on to the client. */
  expenseBilledCents?: number
  /** Expenses reimbursed to the person. Rarely the same number. */
  expenseReimbursedCents?: number
}

export interface Profit {
  /** True where nothing behind this placement says what it costs. */
  costUnknown: boolean
  revenueCents: number
  payCents: number
  burdenCents: number
  commissionCents: number
  /** Billed minus reimbursed. Negative where a firm absorbed a cost. */
  expenseMarginCents: number
  costCents: number
  marginCents: number
  /** Null on zero revenue — a percentage of nothing is not zero. */
  marginPct: number | null
  /** What in here is an assumption rather than a measurement. */
  assumptions: string[]
  says: string
}

/** Below this a placement is usually costing more attention than it earns. */
export const THIN_BELOW_PCT = 15

/**
 * One placement.
 *
 * Deliberately takes hours and rates separately for each side rather
 * than a single hours figure, because the two are not the same number
 * and pretending they are is the quiet error this is built to stop.
 */
export function profitOf(l: Line): Profit {
  const revenue = Math.round(l.billedHours * l.billRateCents)

  // ── Refuse before computing ─────────────────────────────────────────
  //
  // A placement with no buy contract behind it has no cost on record.
  // The arithmetic still runs and produces 100%, which is worse than an
  // error: it is confidently wrong, it reads as good news, and nobody
  // audits good news.
  const costKnown = l.costKnown !== false && l.payRateCents > 0
  if (!costKnown) {
    return {
      costUnknown: true,
      revenueCents: revenue,
      payCents: 0, burdenCents: 0, commissionCents: 0, expenseMarginCents: 0,
      costCents: 0, marginCents: 0,
      // Null, never 100. A percentage nobody can stand behind should not
      // be a number on a screen.
      marginPct: null,
      assumptions: [
        'No buy contract behind this placement, so nothing here knows what it costs.',
      ],
      says:
        `${money(revenue)} billed and no cost on record. ` +
        `Raise the buy contract before trusting any margin on this one.`,
    }
  }

  const pay = Math.round(l.paidHours * l.payRateCents)

  const burdenRate = l.burdenRate ?? DEFAULT_BURDEN[l.contractType]
  const burden = Math.round(pay * burdenRate)

  const commission = l.commissionCents ?? 0
  const expenseMargin = (l.expenseBilledCents ?? 0) - (l.expenseReimbursedCents ?? 0)

  const cost = pay + burden + commission
  const margin = revenue + expenseMargin - cost

  const assumptions: string[] = []
  if (burdenRate > 0 && l.burdenRate == null) {
    assumptions.push(
      `Burden at ${Math.round(burdenRate * 100)}% of pay is our default for ${l.contractType}, ` +
        `not your measured cost.`
    )
  }
  if (l.billedHours !== l.paidHours) {
    assumptions.push(
      `Billing ${l.billedHours} hours and paying ${l.paidHours}. Both are what was actually agreed.`
    )
  }
  if (expenseMargin < 0) {
    assumptions.push(
      `${money(-expenseMargin)} of expenses were reimbursed and not billed on.`
    )
  }

  return {
    costUnknown: false,
    revenueCents: revenue,
    payCents: pay,
    burdenCents: burden,
    commissionCents: commission,
    expenseMarginCents: expenseMargin,
    costCents: cost,
    marginCents: margin,
    marginPct: revenue === 0 ? null : Math.round((margin / revenue) * 1000) / 10,
    assumptions,
    says: lineSays(revenue, margin, revenue === 0 ? null : (margin / revenue) * 100),
  }
}

function lineSays(revenue: number, margin: number, pct: number | null): string {
  if (revenue === 0) {
    return margin < 0
      ? `Nothing billed and ${money(-margin)} spent.`
      : 'Nothing billed yet.'
  }
  if (margin < 0) {
    return `Losing ${money(-margin)} on ${money(revenue)} billed.`
  }
  const p = pct == null ? '' : ` — ${pct.toFixed(1)}%`
  return `${money(margin)} on ${money(revenue)}${p}.`
}

// ── Adding several up ─────────────────────────────────────────────────

export function total(lines: Profit[]): Profit {
  const sum = (f: (p: Profit) => number) => lines.reduce((n, p) => n + f(p), 0)

  const revenue = sum((p) => p.revenueCents)
  const margin = sum((p) => p.marginCents)

  const anyUnknown = lines.some((p) => p.costUnknown)

  return {
    // One unknown cost makes the total unknown. Averaging it in with
    // known ones produces a number that is quietly too good.
    costUnknown: anyUnknown,
    revenueCents: revenue,
    payCents: sum((p) => p.payCents),
    burdenCents: sum((p) => p.burdenCents),
    commissionCents: sum((p) => p.commissionCents),
    expenseMarginCents: sum((p) => p.expenseMarginCents),
    costCents: sum((p) => p.costCents),
    marginCents: margin,
    // Blank, not approximate. A book with one unpriced placement in it
    // has no margin percentage — printing one invites somebody to quote
    // it in a meeting.
    marginPct: anyUnknown || revenue === 0 ? null : Math.round((margin / revenue) * 1000) / 10,
    assumptions: [...new Set(lines.flatMap((p) => p.assumptions))],
    says: anyUnknown
      ? `${money(revenue)} billed across ${lines.length}. ` +
        `${lines.filter((p) => p.costUnknown).length} have no cost on record, so this total is not a margin.`
      : lineSays(revenue, margin, revenue === 0 ? null : (margin / revenue) * 100),
  }
}

// ── Per candidate: the one that tells a different story ───────────────

export interface Bench {
  /** Days between assignments where nobody was paying for them. */
  idleDays: number
  /** What the firm paid them anyway, cents per idle day. Zero for C2C. */
  costPerIdleDayCents: number
}

export interface CandidateProfit extends Profit {
  /** What the gaps cost, which appears on no invoice. */
  benchCents: number
  /** Margin once the bench is counted. The honest number. */
  netMarginCents: number
  netMarginPct: number | null
  /** True where every assignment made money and the year did not. */
  profitableOnPaperOnly: boolean
  netSays: string
}

/**
 * A candidate across everything they did.
 *
 * The bench is the point. A consultant billing at a healthy margin for
 * eight months and sitting for four is a loss the assignment-level view
 * never shows, and it is the single most common way a staffing firm
 * convinces itself a bench is an asset.
 */
export function forCandidate(lines: Profit[], bench: Bench): CandidateProfit {
  const t = total(lines)
  const benchCents = Math.round(bench.idleDays * bench.costPerIdleDayCents)
  const net = t.marginCents - benchCents

  const onPaperOnly = t.marginCents > 0 && net < 0

  return {
    ...t,
    benchCents,
    netMarginCents: net,
    // Blank where any assignment has no cost behind it. The bench figure
    // is still real, so it is still shown — the rate is not.
    netMarginPct:
      t.costUnknown || t.revenueCents === 0
        ? null
        : Math.round((net / t.revenueCents) * 1000) / 10,
    profitableOnPaperOnly: onPaperOnly,
    netSays: t.costUnknown
      ? `${t.says} ${bench.idleDays} idle days on top.`
      : onPaperOnly
      ? `Every assignment made money and the year did not. ${money(t.marginCents)} earned, ` +
        `${money(benchCents)} spent on ${bench.idleDays} idle days — ${money(-net)} down.`
      : benchCents === 0
        ? t.says
        : net < 0
          ? `${money(-net)} down once ${bench.idleDays} idle days are counted.`
          : `${money(net)} after ${bench.idleDays} idle days.`,
  }
}

// ── Per customer ──────────────────────────────────────────────────────

export interface CustomerProfit extends Profit {
  contracts: number
  people: number
  /** Revenue billed that has not been collected. */
  unpaidCents: number
  /** True where the margin looks fine and the cash has not arrived. */
  marginOnPaperOnly: boolean
  cashSays: string
}

/**
 * A client across every placement with them.
 *
 * Carries what has not been paid, because a customer at a good margin
 * who settles at ninety days is a different customer from one at the
 * same margin who settles at thirty, and a margin figure alone cannot
 * tell them apart.
 */
export function forCustomer(
  lines: Profit[],
  meta: { contracts: number; people: number; unpaidCents: number }
): CustomerProfit {
  const t = total(lines)
  // A margin nobody can compute cannot be "on paper only" either.
  const onPaper = !t.costUnknown && t.marginCents > 0 && meta.unpaidCents > t.marginCents

  return {
    ...t,
    ...meta,
    marginOnPaperOnly: onPaper,
    cashSays: onPaper
      ? `${money(t.marginCents)} of margin and ${money(meta.unpaidCents)} still unpaid — ` +
        `more is outstanding than has been earned.`
      : meta.unpaidCents > 0
        ? `${money(meta.unpaidCents)} still to collect.`
        : 'All settled.',
  }
}

// ── Reading it ────────────────────────────────────────────────────────

export type Health = 'LOSS' | 'THIN' | 'FINE'

export type HealthOrUnknown = Health | 'UNKNOWN'

export function health(p: Profit, floorPct: number | null): HealthOrUnknown {
  // Grading a placement whose cost nobody recorded is guessing with a
  // colour attached.
  if (p.costUnknown) return 'UNKNOWN'
  if (p.marginCents < 0) return 'LOSS'
  if (p.marginPct == null) return 'THIN'
  return p.marginPct < (floorPct ?? THIN_BELOW_PCT) ? 'THIN' : 'FINE'
}

/**
 * Whether a placement clears the floor somebody agreed to.
 *
 * MasterAgreement.minMarginPct has been in the schema from the start and
 * nothing ever checked it.
 */
export function belowFloor(p: Profit, floorPct: number | null): string | null {
  if (p.costUnknown) {
    return 'Cannot be checked against the floor — no buy contract behind it.'
  }
  if (floorPct == null || p.marginPct == null) return null
  if (p.marginPct >= floorPct) return null
  return `${p.marginPct}% against a floor of ${floorPct}%. Somebody has to approve this or reprice it.`
}

function money(cents: number): string {
  const d = Math.abs(cents) / 100
  const s = `$${d.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  return cents < 0 ? `-${s}` : s
}

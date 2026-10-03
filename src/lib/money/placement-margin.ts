/**
 * The spread agreed on one placement, and on a book of them.
 *
 * ── The finding this exists to close ─────────────────────────────────
 *
 * Walked on 2026-09-26 as Teleworld Solutions, a systems integrator with
 * two placements. Two screens on one menu answered the same question two
 * different ways:
 *
 *   `/dashboard/reports`        AVG MARGIN 10.1%  "sell vs buy rate"
 *   `/dashboard/profitability`  nothing at all
 *
 * Neither was right, and the reasons were different.
 *
 * **Profitability showed nothing** because it grouped by `projectOrderId`
 * and Teleworld has tagged nothing to a master contract. CLAUDE.md says
 * the roll-up is optional *by design* — "a company tags lines to one when
 * it wants to see contract profitability" — and that a pair is not,
 * because `ContractLink` is written by the award. So the product's stated
 * design is that the pair is always there and the roll-up sometimes is,
 * and the screen was built the other way round: it showed nothing unless
 * the optional thing existed. A firm that never tags anything, which is
 * the normal case and the one 2017's mandatory container is named in
 * CLAUDE.md as the mistake not to repeat, read a permanently empty page.
 *
 * **Reports showed 10.1%** by taking the mean of every active sell rate,
 * the mean of every active buy rate, and subtracting one mean from the
 * other. Re-derived by hand from the rows: the sell list a GSI is served
 * contains the contracts it *sells* and the contracts where it is the
 * client — `payerScope` returns `OR: [companyId, clientCompanyId]` for a
 * GSI, correctly, because a prime both sells and buys. So the mean of
 * "active sell rates" was the mean of Teleworld's own bill rate ($142)
 * and its sub-vendor's bill rate to Teleworld ($116) — its own cost,
 * counted as its own revenue. (142 + 116) / 2 = 129; 129 − 116 = 13;
 * 13 / 129 = 10.077% → 10.1%, exactly the figure on the screen.
 *
 * The true spread on the only live placement is 142 − 116 = 26 on 142,
 * which is **18.3%**. Reports understated it by eight points by mixing
 * the firm's own buy side into the denominator, then compared two means
 * computed over two different sets of placements.
 *
 * ── Why a mean of means is wrong even with the right set ─────────────
 *
 * Averaging each placement's percentage gives a $20/hr placement the same
 * weight as a $200/hr one. Averaging two means separately is worse still:
 * with three sell lines and one buy line it compares the mean of three to
 * the mean of one, which is not a margin on anything.
 *
 * So the unit here is the **pair** — one sell line and the buy line
 * `ContractLink` joins it to — and a book is the blended bill rate less
 * the blended pay rate, summed and then divided. Every placement enters
 * the figure once, at its own weight.
 *
 * ── What this is not ─────────────────────────────────────────────────
 *
 * This is a **rate** question and never a money one. It is what was
 * agreed, per hour, and hours are nowhere in it. What a placement
 * actually earned — the client approved forty and the employer accepted
 * thirty-eight, burden, commission, expenses, the bench — is
 * `lib/profitability`, and the two are different figures that belong on
 * one screen with two labels. A screen that prints one under the other's
 * name has told somebody the wrong thing twice.
 *
 * Every field carrying a rate is named `...RateCents` for that reason.
 */

import type { ContractType } from '@/lib/profitability'

/** Which placements a figure was read over. Said on every screen. */
export type Scope = 'ALL' | 'LIVE'

export interface SellLine {
  id: string
  /** Cents per hour. */
  billRateCents: number
  billCurrency: string
  /** DRAFT · PENDING · IN_PROGRESS · ENDED · CANCELLED */
  state: string
  personId: string
  personName: string
  clientId: string
  clientName: string
  /** The master contract this line is tagged to, if the company tagged one. */
  masterContractId: string | null
}

export interface BuyLine {
  id: string
  /** Cents per hour. */
  payRateCents: number
  payCurrency: string
  contractType: ContractType
  state: string
  /** Null where the firm employs the person — payroll pays that line. */
  vendorName: string | null
  masterContractId: string | null
}

/**
 * One placement: a sell line and the buy line that funds it.
 *
 * `buy` is null where the award never wrote a `ContractLink`, and that is
 * a gap to name rather than a placement to drop.
 */
export interface Pair {
  sell: SellLine
  buy: BuyLine | null
}

export interface Spread {
  /**
   * Cents per hour, and on a book the **blended** rate — the mean across
   * the placements, not their sum.
   *
   * Stated because the first version of the screen printed the sum under
   * the label "blended bill rate": two placements at $142 and $136 read
   * "$278/hr", which is not a rate anybody pays or is paid. The percentage
   * is the same either way, and a figure nobody could act on beside a
   * percentage that is right is still a wrong number on a screen.
   *
   * The sum is `totalBillRateCents`, which is what a run rate multiplies.
   */
  billRateCents: number | null
  payRateCents: number | null
  /** Bill less pay, per hour, blended. Never money. */
  spreadRateCents: number | null
  /** The sums the percentage is computed from. Null where the rate is. */
  totalBillRateCents: number | null
  totalPayRateCents: number | null
  /** One decimal place. Null rather than a figure nobody can stand behind. */
  pct: number | null
  currency: string | null
  /** How many placements went into it. */
  placements: number
  /** How many had no buy line behind them. */
  unpriced: number
  scope: Scope
  /** Why there is no figure, where there is not. Null where there is. */
  refusedBecause: string | null
  says: string
}

/** A percentage below this is usually not worth the attention it costs. */
export const THIN_SPREAD_PCT = 15

// ── One placement ─────────────────────────────────────────────────────

export function spreadOn(p: Pair, scope: Scope = 'ALL'): Spread {
  const base: Omit<Spread, 'refusedBecause' | 'says'> = {
    billRateCents: null,
    payRateCents: null,
    spreadRateCents: null,
    totalBillRateCents: null,
    totalPayRateCents: null,
    pct: null,
    currency: null,
    placements: 1,
    unpriced: 0,
    scope,
  }

  const who = `${p.sell.personName} at ${p.sell.clientName}`

  // ── Refuse before computing ───────────────────────────────────────
  //
  // Each of these produces a number if you let the arithmetic run, and
  // every one of those numbers reads as good news. A missing buy line
  // computes to a hundred per cent. A zero pay rate computes to the
  // same. A hundred per cent margin is always a missing link.

  if (!p.buy) {
    return {
      ...base,
      billRateCents: p.sell.billRateCents > 0 ? p.sell.billRateCents : null,
      totalBillRateCents: p.sell.billRateCents > 0 ? p.sell.billRateCents : null,
      currency: p.sell.billCurrency,
      unpriced: 1,
      refusedBecause: 'No buy line behind this placement, so nothing here knows what it costs.',
      says:
        `${who} — no buy line behind it, so there is no margin on it yet. ` +
        `Raise the buy line, or link the one that already pays for it.`,
    }
  }

  if (p.sell.billRateCents <= 0) {
    return {
      ...base,
      payRateCents: p.buy.payRateCents > 0 ? p.buy.payRateCents : null,
      totalPayRateCents: p.buy.payRateCents > 0 ? p.buy.payRateCents : null,
      currency: p.buy.payCurrency,
      unpriced: 1,
      refusedBecause: 'No bill rate agreed on the sell line.',
      says:
        `${who} — nothing says what the client is billed, so this is not a loss, ` +
        `it is a rate nobody has set.`,
    }
  }

  if (p.buy.payRateCents <= 0) {
    return {
      ...base,
      billRateCents: p.sell.billRateCents,
      totalBillRateCents: p.sell.billRateCents,
      currency: p.sell.billCurrency,
      unpriced: 1,
      refusedBecause: 'The buy line carries no pay rate, so the whole bill rate would read as margin.',
      says:
        `${who} — the buy line pays nothing on record, which would show as a ` +
        `hundred per cent margin. It is a missing rate, not a free placement.`,
    }
  }

  // Two currencies in one subtraction is the oldest way to produce a
  // confident wrong number. Converting here would need a rate and a date
  // and would bury both, so it refuses and names the two.
  if (p.sell.billCurrency !== p.buy.payCurrency) {
    return {
      ...base,
      unpriced: 1,
      refusedBecause:
        `Billed in ${p.sell.billCurrency} and paid in ${p.buy.payCurrency}. ` +
        `One cannot be subtracted from the other.`,
      says:
        `${who} — billed in ${p.sell.billCurrency}, paid in ${p.buy.payCurrency}. ` +
        `No spread until somebody says which rate on which day converts them.`,
    }
  }

  const spread = p.sell.billRateCents - p.buy.payRateCents
  const pct = round1((spread / p.sell.billRateCents) * 100)

  return {
    ...base,
    billRateCents: p.sell.billRateCents,
    payRateCents: p.buy.payRateCents,
    spreadRateCents: spread,
    totalBillRateCents: p.sell.billRateCents,
    totalPayRateCents: p.buy.payRateCents,
    pct,
    currency: p.sell.billCurrency,
    refusedBecause: null,
    says: `${who} — ${rate(p.sell.billRateCents, p.sell.billCurrency)} billed, ${rate(
      p.buy.payRateCents,
      p.buy.payCurrency
    )} paid${p.buy.vendorName ? ` to ${p.buy.vendorName}` : ' on our own payroll'}. ${pct}% agreed.`,
  }
}

// ── A book of them ────────────────────────────────────────────────────

/**
 * Every placement once, at its own weight.
 *
 * One unpriced placement blanks the percentage on the whole book rather
 * than being averaged in, because a book with one placement nobody can
 * price has no margin rate — printing one invites somebody to quote it in
 * a meeting. The blended bill rate is still shown, because that part is
 * known and saying nothing about it would hide the size of the book too.
 */
export function blendedSpread(pairs: Pair[], scope: Scope): Spread {
  const base: Omit<Spread, 'refusedBecause' | 'says'> = {
    billRateCents: null,
    payRateCents: null,
    spreadRateCents: null,
    totalBillRateCents: null,
    totalPayRateCents: null,
    pct: null,
    currency: null,
    placements: pairs.length,
    unpriced: 0,
    scope,
  }

  if (pairs.length === 0) {
    return {
      ...base,
      refusedBecause: 'No placements in scope.',
      says:
        scope === 'LIVE'
          ? 'Nothing is running right now, so there is no rate to read.'
          : 'No placements on the record yet, so there is no rate to read.',
    }
  }

  const each = pairs.map((p) => spreadOn(p, scope))

  // Two currencies in one book is refused whole. Showing the larger book
  // and naming the other — which is what the receivable panel does — is
  // right for a total and wrong for a rate, because a blended rate across
  // part of a book is not the book's rate.
  const currencies = [
    ...new Set(
      pairs.flatMap((p) => [p.sell.billCurrency, ...(p.buy ? [p.buy.payCurrency] : [])])
    ),
  ].sort()
  if (currencies.length > 1) {
    return {
      ...base,
      unpriced: each.filter((s) => s.unpriced > 0).length,
      refusedBecause: `Two currencies in one book — ${currencies.join(' and ')}. A blended rate across them would be neither.`,
      says:
        `${pairs.length} placements in ${currencies.join(' and ')}. ` +
        `A blended rate is one currency at a time; ask for one.`,
    }
  }

  const currency = currencies[0] ?? null
  const priced = each.filter((s) => s.spreadRateCents != null)
  const unpriced = each.length - priced.length

  const billTotal = priced.reduce((n, s) => n + (s.billRateCents ?? 0), 0)
  const payTotal = priced.reduce((n, s) => n + (s.payRateCents ?? 0), 0)
  const spread = billTotal - payTotal

  if (priced.length === 0) {
    return {
      ...base,
      currency,
      unpriced,
      refusedBecause: `None of these ${pairs.length} placements has a buy line behind it.`,
      says:
        `${pairs.length} placement${pairs.length === 1 ? '' : 's'} and no cost behind any of them. ` +
        `There is no margin here, not a perfect one.`,
    }
  }

  if (unpriced > 0) {
    return {
      ...base,
      // The blended rate over the placements that are priced. Said in the
      // sentence, because a rate over part of a book is not the book's.
      billRateCents: Math.round(billTotal / priced.length),
      totalBillRateCents: billTotal,
      currency,
      unpriced,
      refusedBecause: `${unpriced} of ${pairs.length} placements has no buy line behind it, so the book has no rate.`,
      says:
        `${unpriced} of ${pairs.length} placement${pairs.length === 1 ? '' : 's'} has no buy line behind it, ` +
        `so this book has no margin rate. ${scopeSays(scope)}`,
    }
  }

  const pct = billTotal === 0 ? null : round1((spread / billTotal) * 100)

  return {
    ...base,
    // Blended: the mean across the placements. The percentage comes from
    // the sums, which is the same figure and the one that weights a $200
    // placement above a $20 one.
    billRateCents: Math.round(billTotal / priced.length),
    payRateCents: Math.round(payTotal / priced.length),
    spreadRateCents: Math.round(spread / priced.length),
    totalBillRateCents: billTotal,
    totalPayRateCents: payTotal,
    pct,
    currency,
    unpriced: 0,
    refusedBecause: null,
    says:
      `${pct}% on the rates agreed across ${pairs.length} placement${pairs.length === 1 ? '' : 's'}. ` +
      `${scopeSays(scope)}`,
  }
}

// ── The sell side on its own ──────────────────────────────────────────

export interface BookRevenue {
  /**
   * The bill rates **added**, cents per hour. Null where two currencies
   * appear. Named `total` rather than `billRateCents` because it is a sum
   * and not a rate anybody pays — a run rate multiplies this, and a screen
   * that prints it beside the word "rate" is printing a number nobody can
   * act on.
   */
  totalBillRateCents: number | null
  /** The blended rate: the mean across the placements. */
  billRateCents: number | null
  /** At a 160-hour month. An assumption, and every screen says so. */
  monthlyCents: number | null
  placements: number
  currency: string | null
  /** Placements billing with no buy line behind them. Revenue, no margin. */
  withoutCost: number
  refusedBecause: string | null
  says: string
}

/** A full-time month. An assumption, stated wherever it is used. */
export const HOURS_IN_A_MONTH = 160

/**
 * What the firm bills, ignoring what it costs.
 *
 * Separate from `blendedSpread` on purpose, and the reason is a bug this
 * would otherwise reintroduce: **revenue does not need a cost.** A live
 * placement with no buy line behind it has no margin and it certainly has
 * revenue, so the liveness test here is the sell line alone, where
 * `isLive` asks about both legs because a spread needs both.
 *
 * Reusing the spread's scope for a revenue figure would drop exactly the
 * placements a firm most needs to see — the ones it is billing for and
 * has not priced.
 */
export function sellSideRate(pairs: Pair[], scope: Scope): BookRevenue {
  const mine = scope === 'LIVE' ? pairs.filter((p) => p.sell.state === 'IN_PROGRESS') : pairs

  if (mine.length === 0) {
    return {
      totalBillRateCents: null, billRateCents: null, monthlyCents: null,
      placements: 0, currency: null, withoutCost: 0,
      refusedBecause: 'No placements in scope.',
      says:
        scope === 'LIVE'
          ? 'Nothing is running right now, so there is nothing being billed.'
          : 'No placements on the record yet.',
    }
  }

  const currencies = [...new Set(mine.map((p) => p.sell.billCurrency))].sort()
  const withoutCost = mine.filter((p) => !p.buy || p.buy.payRateCents <= 0).length

  if (currencies.length > 1) {
    return {
      totalBillRateCents: null, billRateCents: null, monthlyCents: null,
      placements: mine.length, currency: null, withoutCost,
      refusedBecause: `Billed in ${currencies.join(' and ')}. Two currencies do not add.`,
      says:
        `${mine.length} placements billing in ${currencies.join(' and ')}. ` +
        `Ask for one currency at a time; adding them would be neither figure.`,
    }
  }

  const billTotal = mine.reduce((n, p) => n + Math.max(0, p.sell.billRateCents), 0)
  const currency = currencies[0]

  return {
    totalBillRateCents: billTotal,
    billRateCents: Math.round(billTotal / mine.length),
    // 160 is a month of full-time hours and nothing more. It is an
    // assumption about hours nobody has worked yet, which is why it is
    // named in the sentence rather than presented as billed revenue.
    monthlyCents: billTotal * HOURS_IN_A_MONTH,
    placements: mine.length,
    currency,
    withoutCost,
    refusedBecause: null,
    says:
      `${mine.length} placement${mine.length === 1 ? '' : 's'} at ${rate(billTotal, currency)} between them, ` +
      `which is ${money(billTotal * HOURS_IN_A_MONTH, currency)} a month at ${HOURS_IN_A_MONTH} hours each. ` +
      `${scopeSays(scope)}` +
      (withoutCost > 0
        ? ` ${withoutCost} of them has no buy line behind it, so there is revenue here and no margin.`
        : ''),
  }
}

/**
 * Whether anything is paying for this placement today.
 *
 * Both legs, because a sell line still running over a buy line that has
 * ended is not a live placement — it is a gap where nobody is being paid,
 * and counting it live would put a bill rate in a figure with no cost
 * beside it.
 */
export function isLive(p: Pair): boolean {
  if (p.sell.state !== 'IN_PROGRESS') return false
  if (!p.buy) return false
  return p.buy.state === 'IN_PROGRESS'
}

/** The sentence every screen puts beside a figure, so nobody has to guess. */
export function scopeSays(scope: Scope): string {
  return scope === 'LIVE'
    ? 'Placements running now only — work that has finished is not in this.'
    : 'Every placement to date, finished work included.'
}

/** Not a grade where there is no number. */
export type SpreadHealth = 'LOSS' | 'THIN' | 'FINE' | 'NO_RATE'

export function spreadHealth(s: Spread, floorPct: number | null): SpreadHealth {
  if (s.pct == null) return 'NO_RATE'
  if (s.pct < 0) return 'LOSS'
  return s.pct < (floorPct ?? THIN_SPREAD_PCT) ? 'THIN' : 'FINE'
}

// ── Reading it ────────────────────────────────────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10

function symbolFor(currency: string): string {
  return currency === 'USD'
    ? '$'
    : currency === 'GBP'
      ? '£'
      : currency === 'EUR'
        ? '€'
        : currency === 'INR'
          ? '₹'
          : ''
}

function rate(cents: number, currency: string): string {
  const sym = symbolFor(currency)
  const body = (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return sym ? `${sym}${body}/hr` : `${body} ${currency}/hr`
}

function money(cents: number, currency: string): string {
  const sym = symbolFor(currency)
  const body = Math.round(cents / 100).toLocaleString('en-US')
  return sym ? `${sym}${body}` : `${body} ${currency}`
}

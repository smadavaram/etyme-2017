/**
 * Profitability as a page you can cut. "One app, two tabs", 2026-11-08.
 *
 * The founder drew one table: cut by Consultant · Recruiter · Office ·
 * Client, for This month or the Quarter, with Billed, Paid, Margin and
 * Margin % under the heading "Margin before admin cost and commission".
 *
 * Nothing here prices anything. Every figure is the margin service's own
 * earned figure (`placementBooks` in lib/money/margin, over the weeks of
 * the period), added up by a key. The arithmetic is three lines:
 *
 *   Billed  the weeks both sides signed, at this firm's own bill rate
 *   Paid    what those same weeks cost this firm: pay, overtime premium,
 *           and the employer's burden where it employs the person
 *   Margin  Billed less Paid, so the three always add up on the screen
 *
 * And the rules a total must keep, each the founder's:
 *
 *   - a placement with no cost behind it has no margin, not a perfect one:
 *     one in a group blanks the group's Paid, Margin and Margin %, and the
 *     row says why;
 *   - two currencies are never added;
 *   - a hundred per cent margin is a missing link, never good news, and
 *     is blanked with that sentence;
 *   - a week the client approved and the employer has not yet accepted is
 *     billed and not yet costed, so it is left out and counted in words.
 *
 * Admin cost is not subtracted, and the heading says so. Commission is
 * shown beside the margin, as "After commission", where the firm has
 * commission rows on its lines (2026-11-08); the margin columns stay
 * before it, so the heading stays true.
 * The firm's admin cost (2026-10-08: fixed costs for the period, shared
 * equally over the contracts live in it) has no column on the record yet,
 * so it is never shown, never guessed and never typed in here.
 */

import type { PlacementEarned } from '@/lib/money/placement-earned'
import { amount } from '@/lib/money-display'

export const CUT_HEADING = 'Margin before admin cost and commission'

export type Cut = 'consultant' | 'recruiter' | 'account-manager' | 'office' | 'client'
export type Period = 'month' | 'quarter'

export interface CutOption {
  key: Cut
  label: string
  /** Null where the record can cut this way; the sentence where it cannot. */
  cannotBecause: string | null
}

/**
 * The cuts the founder drew, and which the record can stand behind.
 *
 * Recruiter and account manager are read off the commission rows on the
 * line (founder, 2026-11-08: "Commission is object on sell and buy
 * contracts"): the recruiter is whoever earns the recruiting commission
 * on the buy line behind the placement, the account manager whoever
 * earns the sales commission on the sell line. A placement with none is
 * listed under "Nobody named on the line", so the cut still adds up to
 * the firm; one with two earners of a kind reads under both names
 * together, never counted twice.
 *
 * Office is the part of this firm named on the contract as delivering it
 * (`SellContract.deliveryUnitId`), and a line with none reads under "Not
 * set on the contract" so the cut still adds up to the firm.
 */
export const CUTS: readonly CutOption[] = [
  { key: 'consultant', label: 'Consultant', cannotBecause: null },
  { key: 'recruiter', label: 'Recruiter', cannotBecause: null },
  { key: 'account-manager', label: 'Account manager', cannotBecause: null },
  { key: 'office', label: 'Office', cannotBecause: null },
  { key: 'client', label: 'Client', cannotBecause: null },
]

/** Where a placement goes in the recruiter or account manager cut when no row names anybody. */
export const NOBODY_NAMED = 'Nobody named on the line'

/**
 * The key and label for a placement in the recruiter or account manager
 * cut, from the earners of that kind in force on it. Pure.
 */
export function earnerKey(earners: readonly { id: string; name: string }[]): [string, string] {
  const unique = [...new Map(earners.map((e) => [e.id, e])).values()].sort((a, b) => a.name.localeCompare(b.name))
  if (unique.length === 0) return ['none', NOBODY_NAMED]
  if (unique.length === 1) return [unique[0].id, unique[0].name]
  const names = unique.map((e) => e.name)
  return [unique.map((e) => e.id).join('+'), `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`]
}

export const NO_OFFICE = 'Not set on the contract'

export function cutOf(raw: string | null | undefined): Cut {
  const k = (raw ?? '').toLowerCase()
  return (CUTS.find((c) => c.key === k)?.key ?? 'consultant') as Cut
}

export function periodOf(raw: string | null | undefined): Period {
  return (raw ?? '').toLowerCase() === 'quarter' ? 'quarter' : 'month'
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * The calendar month or quarter holding `today`, in UTC, as [from, to).
 * A week counts in the period its Sunday falls in.
 */
export function periodWindow(period: Period, today: Date): { from: Date; to: Date; says: string } {
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth()
  if (period === 'month') {
    return {
      from: new Date(Date.UTC(y, m, 1)),
      to: new Date(Date.UTC(y, m + 1, 1)),
      says: `${MONTHS[m]} ${y}`,
    }
  }
  const q = Math.floor(m / 3)
  return {
    from: new Date(Date.UTC(y, q * 3, 1)),
    to: new Date(Date.UTC(y, q * 3 + 3, 1)),
    says: `${MONTHS[q * 3]} to ${MONTHS[q * 3 + 2]} ${y}`,
  }
}

/**
 * A client is refused the cut before anything is read. A client buys and
 * never sells, so a margin on its page could only be a supplier's, and a
 * supplier's margin is never shown to a client. The margin permission is
 * the route's own gate, read before this, in a sentence naming the desks
 * that hold it at the reader's firm.
 */
export function mayReadCut(args: { kind: string | null | undefined }): string | null {
  if (args.kind === 'CLIENT') {
    return 'A margin is a supplier’s own figure, and a client never reads it. What you spend is under Invoice receipts.'
  }
  return null
}

export type EarnedForCut = Pick<
  PlacementEarned,
  'revenueCents' | 'hoursPaid' | 'marginCents' | 'marginRevenueCents' | 'marginBlankedBy' | 'weeksAwaitingPay'
>

export interface CutInput {
  key: string
  label: string
  currency: string
  earned: EarnedForCut
  /**
   * The placement's commission for the period (lib/money/commission-accrual),
   * where the firm has commission rows: cents in a currency, or null with
   * the reason. Absent, no "after commission" figure is drawn.
   */
  commission?: { cents: number | null; currency: string | null; blankedBecause: string | null }
}

export interface CutLine {
  key: string
  label: string
  placements: number
  currency: string | null
  billedCents: number | null
  paidCents: number | null
  marginCents: number | null
  marginPct: number | null
  /** Why Paid, Margin and Margin % are blank, where they are. */
  blankedBecause: string | null
  /** Weeks the client approved and the employer has not accepted: billed, not yet costed, left out. */
  weeksAwaitingPay: number
  /** The commission accrued on these placements in the period; null where it cannot be stood behind, or none was asked. */
  commissionCents?: number | null
  /** Margin less commission, still before admin cost. Null where either is. */
  afterCommissionCents?: number | null
  /** Why the commission or the figure after it is blank, where it is. */
  commissionBlankedBecause?: string | null
}

export interface ProfitCut {
  lines: CutLine[]
  total: CutLine | null
  says: string
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** A placement that did no work in the period is not a row of it. */
function workedIn(e: EarnedForCut): boolean {
  return e.revenueCents !== 0 || (e.marginRevenueCents ?? 0) !== 0 || e.hoursPaid > 0
}

function lineOf(key: string, label: string, rows: CutInput[]): CutLine {
  return withCommission(marginLineOf(key, label, rows), rows)
}

function marginLineOf(key: string, label: string, rows: CutInput[]): CutLine {
  const placements = rows.length
  const weeksAwaitingPay = rows.reduce((n, r) => n + r.earned.weeksAwaitingPay, 0)
  const currencies = new Set(rows.map((r) => r.currency))
  const base = { key, label, placements, weeksAwaitingPay }

  if (currencies.size > 1) {
    return {
      ...base, currency: null, billedCents: null, paidCents: null, marginCents: null, marginPct: null,
      blankedBecause: `Billed in ${[...currencies].sort().join(' and ')}, and two currencies are never added.`,
    }
  }
  const currency = rows[0]?.currency ?? null

  const noCost = rows.filter((r) => r.earned.marginBlankedBy === 'NO_COST').length
  const crossed = rows.filter((r) => r.earned.marginBlankedBy === 'CURRENCY').length
  if (noCost > 0 || crossed > 0) {
    const why = noCost > 0
      ? `${plural(noCost, 'placement has', 'placements have')} no cost on record, so there is no margin here. ` +
        'A placement with no cost behind it has no margin, not a perfect one.'
      : `${plural(crossed, 'placement is', 'placements are')} billed in one currency and paid in another, ` +
        'and one cannot be subtracted from the other.'
    return {
      ...base, currency,
      // What the client approved at this firm's rate is still a fact.
      billedCents: rows.reduce((n, r) => n + r.earned.revenueCents, 0),
      paidCents: null, marginCents: null, marginPct: null,
      blankedBecause: why,
    }
  }

  const billedCents = rows.reduce((n, r) => n + (r.earned.marginRevenueCents ?? 0), 0)
  const marginCents = rows.reduce((n, r) => n + (r.earned.marginCents ?? 0), 0)
  const paidCents = billedCents - marginCents
  const marginPct = billedCents === 0 ? null : Math.round((marginCents / billedCents) * 1000) / 10

  if (billedCents > 0 && paidCents <= 0) {
    return {
      ...base, currency, billedCents, paidCents: null, marginCents: null, marginPct: null,
      blankedBecause: 'Nothing was paid against these hours, which means a cost is missing, not that there is none.',
    }
  }

  return {
    ...base, currency, billedCents, paidCents, marginCents, marginPct,
    blankedBecause: billedCents === 0 ? 'No week was signed by both sides in this period yet.' : null,
  }
}

/**
 * Margin after commission, where commissions were asked for: the line's
 * margin less every placement's commission, in one currency, before admin
 * cost still. Blank, with the reason, where the margin is blank, a
 * placement's commission cannot be worked out, or a currency differs.
 */
function withCommission(line: CutLine, rows: CutInput[]): CutLine {
  if (!rows.some((r) => r.commission)) return line
  const blank = (why: string, commissionCents: number | null = null): CutLine =>
    ({ ...line, commissionCents, afterCommissionCents: null, commissionBlankedBecause: why })
  const unknown = rows.find((r) => r.commission && r.commission.cents == null)
  if (unknown) return blank(unknown.commission!.blankedBecause ?? 'A commission here cannot be worked out for the period.')
  const other = rows.find((r) => r.commission && (r.commission.cents ?? 0) !== 0 && r.commission.currency && r.commission.currency !== line.currency)
  if (other) return blank('A commission here is in another currency from the margin, and two currencies are never subtracted.')
  const commissionCents = rows.reduce((n, r) => n + (r.commission?.cents ?? 0), 0)
  if (line.marginCents == null) return blank(line.blankedBecause ?? 'There is no margin to take the commission from.', commissionCents)
  return { ...line, commissionCents, afterCommissionCents: line.marginCents - commissionCents, commissionBlankedBecause: null }
}

/**
 * The placements of a period, added up by the key each one carries.
 * Lines sort by margin, largest first; a blank margin sorts last, because
 * unknown is not small.
 */
export function profitCut(rows: readonly CutInput[]): ProfitCut {
  const worked = rows.filter((r) => workedIn(r.earned))
  if (worked.length === 0) {
    return { lines: [], total: null, says: 'No hours were signed in this period, so nothing has a margin yet.' }
  }

  const groups = new Map<string, { label: string; rows: CutInput[] }>()
  for (const r of worked) {
    const g = groups.get(r.key) ?? { label: r.label, rows: [] }
    g.rows.push(r)
    groups.set(r.key, g)
  }

  const lines = [...groups.entries()]
    .map(([key, g]) => lineOf(key, g.label, g.rows))
    .sort((a, b) => (b.marginCents ?? -Infinity) - (a.marginCents ?? -Infinity) || a.label.localeCompare(b.label))

  const total = lineOf('total', 'Your firm', worked)
  const awaiting = total.weeksAwaitingPay
  const says =
    (total.marginCents == null
      ? (total.blankedBecause ?? 'There is no margin to stand behind in this period.')
      : `${amount(total.marginCents, total.currency ?? undefined)} on ${amount(total.billedCents, total.currency ?? undefined)} billed` +
        (total.marginPct == null ? '.' : `, ${total.marginPct.toFixed(1)}%.`)) +
    (awaiting > 0
      ? ` ${plural(awaiting, 'week', 'weeks')} the client approved ${awaiting === 1 ? 'is' : 'are'} not yet accepted for pay, ` +
        `so ${awaiting === 1 ? 'it is' : 'they are'} left out until costed.`
      : '')
  return { lines, total, says }
}

/** The question the "Ask about this table" row opens Ask Etyme with, per cut. */
export function askAbout(cut: Cut, period: Period): string {
  const when = period === 'quarter' ? 'this quarter' : 'this month'
  switch (cut) {
    case 'client': return `Which client made us the most ${when}?`
    case 'office': return `Which office made us the most ${when}?`
    case 'recruiter': return `Which recruiter made the most ${when}?`
    case 'account-manager': return `Which account manager made the most ${when}?`
    default: return `Which consultant made us the most ${when}?`
  }
}

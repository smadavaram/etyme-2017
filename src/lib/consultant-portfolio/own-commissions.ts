/**
 * A person's own commissions, as their own page reads them (founder,
 * 2026-11-08: "Commission is object on sell and buy contracts.
 * Commissions are made when account management team sells and when
 * recruiter teams actually recruit").
 *
 * The figures are money's (`commissionAccruals` in lib/money/
 * commission-accrual): what each row earned in the period, under its cap,
 * on the weeks the firm above accepted or on cash received. This file is
 * the words for one row, and one rule of its own:
 *
 *   **No margin to a seat that reads none.** A share of the margin is
 *   worked out from the margin, and money's sentence names it ("10% of
 *   $4,000 margin over 4 weeks"). A recruiter reads no margin unless the
 *   Owner gives it (2026-11-08), so where the seat's margin does not reach
 *   the placement the row says what was earned and the share, and not the
 *   margin. The same for a share of what was billed: the bill is the
 *   figure the Owner, the Admin and whoever reads margin hold (`margin.read`), not the recruiter's.
 *
 * Pure: no database, so every branch has a sentence in a test.
 */

import { amount } from '@/lib/money-display'
import { KIND_WORD, BASIS_WORD, ACCRUAL_WORD, type CommissionBasis, type CommissionKind, type CommissionAccrual } from '@/lib/money/commission-rows'

export type OwnState = 'ACCRUED' | 'POSTED' | 'WAITING' | 'NOTHING' | 'BLANK'

export const STATE_WORD: Record<OwnState, string> = {
  ACCRUED: 'Earned this period, not yet on payroll',
  POSTED: 'On payroll for this period',
  WAITING: 'Waiting on the client to pay the bill',
  NOTHING: 'Nothing earned this period',
  BLANK: 'Cannot be worked out yet',
}

/** The facts of one row this needs, the shape `RowAccrual` already carries. */
export interface OwnRowFacts {
  id: string
  kind: CommissionKind
  basis: CommissionBasis
  accrueOn: CommissionAccrual
  side: 'SELL' | 'BUY'
  firmName: string
  person: { name: string } | null
  client: { name: string } | null
  rateBps: number | null
  /** A fixed figure per hour or per period, in minor units. */
  fixedCents: number | null
  capCents: number | null
  /** Everything posted under the row before this period. */
  alreadyCents: number
  postedCents: number | null
  state: OwnState
  accrual: {
    amountCents: number | null
    capped: boolean
    currency: string | null
    weeks: number
    hours: number
    says: string
    blankedBecause: string | null
  }
}

export interface OwnCommissionRow {
  id: string
  kind: string
  firm: string
  /** "Priya Raman at Northbend Athletic, on the sell line". */
  line: string
  basis: string
  /** "10%", "$5.00 an hour", "$200.00 a period". */
  rate: string
  /** What this period earned, after the cap, in minor units; null where it cannot be worked out. */
  thisPeriodCents: number | null
  currency: string | null
  /** "$2,000.00 cap, $1,400.00 already paid", or "No cap". */
  cap: string
  capped: boolean
  state: OwnState
  stateSays: string
  says: string
  /** Whether the margin or the bill was left out of the sentence, and why. */
  withheldSays: string | null
}

const pct = (bps: number | null) => `${((bps ?? 0) / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}%`
const weeksSaid = (n: number) => `${n} ${n === 1 ? 'week' : 'weeks'}`

export const MARGIN_WITHHELD_SAYS =
  'The margin and the bill on this placement are read by the Owner, and by anybody the Owner gives them to.'

/**
 * One row, as the person who earns it reads it. `readsMargin` is whether
 * the seat's margin reaches every placement the row is earned on. Pure.
 */
export function ownCommissionRow(f: OwnRowFacts, readsMargin: boolean): OwnCommissionRow {
  const cur = f.accrual.currency ?? undefined
  const money = (c: number) => amount(c, cur)
  const share = f.basis === 'SHARE_OF_MARGIN' || f.basis === 'SHARE_OF_BILLED'
  const rate = share
    ? pct(f.rateBps)
    : f.basis === 'PER_HOUR'
      ? `${money(f.fixedCents ?? 0)} an hour`
      : `${money(f.fixedCents ?? 0)} a period`
  const thisPeriod = f.postedCents ?? f.accrual.amountCents
  const cap = f.capCents == null
    ? 'No cap'
    : `${money(f.capCents)} cap${f.alreadyCents > 0 ? `, ${money(f.alreadyCents)} already paid before this period` : ''}`
  const who = f.person?.name ?? 'This placement'
  const where = f.client?.name ? ` at ${f.client.name}` : ''

  const hides = share && !readsMargin
  let says = f.accrual.says
  if (hides) {
    const of = f.basis === 'SHARE_OF_MARGIN' ? 'the margin' : 'what was billed'
    if (f.state === 'BLANK' || thisPeriod == null) {
      says = f.accrual.blankedBecause ?? 'This commission cannot be worked out for the period.'
    } else if (f.accrual.weeks === 0) {
      says = f.accrual.says
    } else if (thisPeriod === 0) {
      says = `Nothing earned: ${pct(f.rateBps)} of ${of} on this placement over ${weeksSaid(f.accrual.weeks)} came to nothing.`
    } else {
      says = `${money(thisPeriod)}: ${pct(f.rateBps)} of ${of} on this placement over ${weeksSaid(f.accrual.weeks)}` +
        (f.accrual.capped && f.capCents != null ? `; the ${money(f.capCents)} cap is reached.` : '.')
    }
  }

  return {
    id: f.id,
    kind: KIND_WORD[f.kind],
    firm: f.firmName,
    line: `${who}${where}, on the ${f.side === 'SELL' ? 'sell' : 'buy'} line`,
    basis: `${BASIS_WORD[f.basis]}, ${ACCRUAL_WORD[f.accrueOn]}`,
    rate,
    thisPeriodCents: thisPeriod,
    currency: f.accrual.currency,
    cap,
    capped: f.accrual.capped,
    state: f.state,
    stateSays: STATE_WORD[f.state],
    says,
    withheldSays: hides ? MARGIN_WITHHELD_SAYS : null,
  }
}

/** Whose commissions a seat may ask for here: its own, always; anybody else's, never on this page. Pure. */
export function ownCommissionsAsk(callerPersonId: string, asked: string | null): { ok: true } | { ok: false; says: string } {
  if (!asked || asked === callerPersonId) return { ok: true }
  return {
    ok: false,
    says:
      'This page shows your own commissions only. Another person’s are read under Payroll, Commissions, by the Owner, ' +
      'a Contract Manager, AP & Payroll, Finance, and anybody the Owner gives payroll to by name.',
  }
}

/** The calendar month a `YYYY-MM` names, or null where it names none. Pure. */
export function monthOf(ym: string | null | undefined): { from: Date; to: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym ?? '')
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  if (mo < 0 || mo > 11) return null
  return { from: new Date(Date.UTC(y, mo, 1)), to: new Date(Date.UTC(y, mo + 1, 0)) }
}

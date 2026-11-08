/**
 * A commission is a row on the line it is earned on (founder, 2026-11-08:
 * "Commission is object on sell and buy contracts. Commissions are made
 * when account management team sells and when recruiter teams actually
 * recruit").
 *
 *   SALES       on the sell line, earned by whoever sold the deal
 *   RECRUITING  on the buy line, earned by whoever recruited the person
 *
 * Pure: no database. The writer (`commission-write`) and the accrual
 * reader (`commission-accrual`) gather the facts and ask here.
 *
 * ── When it is earned ─────────────────────────────────────────────────
 *
 * Only when the money is real. A row accrues per pay period from the
 * weeks the firm above accepted, the same hours the bill is priced on;
 * never on a submission, an interview or an award. A firm may choose to
 * accrue on cash instead: then a week counts in the period the bill
 * carrying it was paid in full. Either way the figure is read from the
 * margin service's own week (billed, hours, margin), so nothing here
 * prices an hour.
 *
 *   SHARE_OF_MARGIN  rateBps of the margin the weeks earned
 *   SHARE_OF_BILLED  rateBps of what the weeks billed
 *   PER_HOUR         amountCents per accepted hour
 *   PER_PERIOD       amountCents once, in a period the line did paid work
 *
 * And the rules a figure must keep:
 *   - a week with no margin behind it has no margin share, not a zero
 *     one: the row's figure for the period is blank and says why;
 *   - two currencies are never added;
 *   - a share of a loss is nothing, never a charge back to the person;
 *   - the cap is a ceiling on everything ever posted under the row.
 */

import { amount } from '@/lib/money-display'

export type CommissionKind = 'SALES' | 'RECRUITING'
export type CommissionBasis = 'SHARE_OF_MARGIN' | 'SHARE_OF_BILLED' | 'PER_HOUR' | 'PER_PERIOD'
export type CommissionAccrual = 'ACCEPTED' | 'CASH'

export const KINDS: readonly CommissionKind[] = ['SALES', 'RECRUITING']
export const BASES: readonly CommissionBasis[] = ['SHARE_OF_MARGIN', 'SHARE_OF_BILLED', 'PER_HOUR', 'PER_PERIOD']
export const ACCRUALS: readonly CommissionAccrual[] = ['ACCEPTED', 'CASH']

/** A share is carried in basis points; a fixed figure in minor units. */
export const IS_SHARE: Record<CommissionBasis, boolean> = {
  SHARE_OF_MARGIN: true, SHARE_OF_BILLED: true, PER_HOUR: false, PER_PERIOD: false,
}

export const KIND_WORD: Record<CommissionKind, string> = { SALES: 'Sales commission', RECRUITING: 'Recruiting commission' }
export const BASIS_WORD: Record<CommissionBasis, string> = {
  SHARE_OF_MARGIN: 'a share of the margin',
  SHARE_OF_BILLED: 'a share of what is billed',
  PER_HOUR: 'a fixed amount per accepted hour',
  PER_PERIOD: 'a fixed amount per pay period',
}
export const ACCRUAL_WORD: Record<CommissionAccrual, string> = {
  ACCEPTED: 'on the weeks the firm above accepted',
  CASH: 'when the bill for the weeks is paid',
}

/** The roles that set a commission on a line, at the line's own firm. */
export const SETS_COMMISSIONS = ['Owner', 'Contract Manager'] as const

// ── The row's shape ──────────────────────────────────────────────────

/** What a person, or the award's defaults, asks to write. Anything may be missing. */
export interface CommissionDraft {
  sellContractId?: string | null
  buyContractId?: string | null
  earnedById?: string | null
  kind?: string | null
  basis?: string | null
  rateBps?: number | null
  amountCents?: number | null
  capCents?: number | null
  fromDate?: Date | string | null
  toDate?: Date | string | null
  accrueOn?: string | null
  reason?: string | null
}

/** A row that passed every check. Exactly one line, exactly one figure. */
export interface CommissionTerms {
  sellContractId: string | null
  buyContractId: string | null
  earnedById: string
  kind: CommissionKind
  basis: CommissionBasis
  rateBps: number | null
  amountCents: number | null
  capCents: number | null
  fromDate: Date
  toDate: Date | null
  accrueOn: CommissionAccrual
  reason: string
}

export type ShapeVerdict = { ok: true; terms: CommissionTerms } | { ok: false; field: string | null; says: string }

const no = (field: string | null, says: string): ShapeVerdict => ({ ok: false, field, says })

/** The fields the line's panel draws; each is a field the writer may refuse on. */
export const COMMISSION_FIELDS = ['earnedById', 'kind', 'basis', 'rateBps', 'amountCents', 'capCents', 'fromDate', 'toDate', 'accrueOn', 'reason'] as const

function dateOf(v: Date | string | null | undefined): Date | null | 'BAD' {
  if (v == null || v === '') return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? 'BAD' : d
}

const given = (n: number | null | undefined) => n != null && !(typeof n === 'number' && Number.isNaN(n))

/**
 * Is this a commission row at all? Every refusal is a sentence naming the
 * field. Exactly one of the sell line and the buy line; exactly one of a
 * share and a fixed figure, and the one the basis reads; a sales
 * commission on a sell line and a recruiting one on a buy line.
 */
export function checkCommission(d: CommissionDraft): ShapeVerdict {
  const sell = (d.sellContractId ?? '').trim() || null
  const buy = (d.buyContractId ?? '').trim() || null
  if (sell && buy) return no(null, 'A commission sits on one line: the sell line for a sale, or the buy line for a recruit. Not both.')
  if (!sell && !buy) return no(null, 'Say which line the commission is on: the sell line for a sale, or the buy line for a recruit.')

  const earnedById = (d.earnedById ?? '').trim()
  if (!earnedById) return no('earnedById', 'Choose who earns it.')

  const kind = (d.kind ?? '').trim() as CommissionKind
  if (!KINDS.includes(kind)) return no('kind', 'Choose whether it is a sales commission or a recruiting commission.')
  if (kind === 'SALES' && !sell) {
    return no('kind', 'A sales commission is earned for selling the deal, so it goes on the sell line, not the buy line.')
  }
  if (kind === 'RECRUITING' && !buy) {
    return no('kind', 'A recruiting commission is earned for recruiting the person, so it goes on the buy line, not the sell line.')
  }

  const basis = (d.basis ?? '').trim() as CommissionBasis
  if (!BASES.includes(basis)) {
    return no('basis', 'Choose what it is worked out from: a share of the margin, a share of what is billed, an amount per hour or an amount per pay period.')
  }

  const hasRate = given(d.rateBps)
  const hasAmount = given(d.amountCents)
  if (hasRate && hasAmount) return no(IS_SHARE[basis] ? 'amountCents' : 'rateBps', 'Give a share or a fixed amount, not both.')
  if (IS_SHARE[basis]) {
    if (!hasRate) return no('rateBps', `Say the share: ${BASIS_WORD[basis]} is a percentage.`)
    const r = Number(d.rateBps)
    if (!Number.isInteger(r) || r <= 0 || r > 10_000) return no('rateBps', 'The share is more than nothing and at most the whole: between 0.01% and 100%.')
  } else {
    if (!hasAmount) return no('amountCents', `Say the amount: ${BASIS_WORD[basis]} is a fixed figure.`)
    const a = Number(d.amountCents)
    if (!Number.isInteger(a) || a <= 0) return no('amountCents', 'The amount is more than nothing, in whole cents.')
  }

  let capCents: number | null = null
  if (given(d.capCents)) {
    const c = Number(d.capCents)
    if (!Number.isInteger(c) || c <= 0) return no('capCents', 'A cap is more than nothing, in whole cents. Leave it empty for no cap.')
    capCents = c
  }

  const from = dateOf(d.fromDate)
  if (from === 'BAD' || from === null) return no('fromDate', 'Say the day it starts to count from.')
  const to = dateOf(d.toDate)
  if (to === 'BAD') return no('toDate', 'That end day is not a date. Leave it empty if it runs as long as the line.')
  if (to && to < from) return no('toDate', 'It cannot end before it starts.')

  const accrueOn = ((d.accrueOn ?? '').trim() || 'ACCEPTED') as CommissionAccrual
  if (!ACCRUALS.includes(accrueOn)) return no('accrueOn', 'Choose when it is earned: on accepted weeks, or when the bill is paid.')

  const reason = (d.reason ?? '').trim()
  if (!reason) return no('reason', 'Say why. The reason is kept with the commission, beside who set it and when.')

  return {
    ok: true,
    terms: {
      sellContractId: sell, buyContractId: buy, earnedById, kind, basis,
      rateBps: IS_SHARE[basis] ? Number(d.rateBps) : null,
      amountCents: IS_SHARE[basis] ? null : Number(d.amountCents),
      capCents, fromDate: from, toDate: to, accrueOn, reason,
    },
  }
}

/**
 * May this seat set a commission on this line? Only at the line's own
 * firm (a client never reads or sets a supplier's commission), and only
 * the Owner or a Contract Manager there. Null where it may.
 */
export function maySetCommission(args: {
  roleName: string | null
  callerCompanyId: string | null
  lineCompanyId: string | null
  companyName: string
}): string | null {
  if (!args.callerCompanyId || !args.lineCompanyId || args.callerCompanyId !== args.lineCompanyId) {
    return 'A commission is the firm’s own pay to its own people, and this line is not your firm’s.'
  }
  if (!args.roleName || !(SETS_COMMISSIONS as readonly string[]).includes(args.roleName)) {
    return `Commissions on a line are set by the Owner or a Contract Manager at ${args.companyName}.`
  }
  return null
}

/** A row's terms in one line: "10% of the margin, on the weeks the firm above accepted, capped at $5,000.00". */
export function termsSay(t: Pick<CommissionTerms, 'basis' | 'rateBps' | 'amountCents' | 'capCents' | 'accrueOn'>, currency?: string): string {
  const figure = IS_SHARE[t.basis]
    ? `${((t.rateBps ?? 0) / 100).toFixed(2).replace(/\.00$/, '')}% of ${t.basis === 'SHARE_OF_MARGIN' ? 'the margin' : 'what is billed'}`
    : `${amount(t.amountCents ?? 0, currency)} ${t.basis === 'PER_HOUR' ? 'per accepted hour' : 'per pay period'}`
  const cap = t.capCents != null ? `, capped at ${amount(t.capCents, currency)}` : ''
  return `${figure}, ${ACCRUAL_WORD[t.accrueOn]}${cap}`
}

// ── The figure for a period ──────────────────────────────────────────

/**
 * One week of one placement, as the margin service priced it. `billedCents`
 * is what the bill is priced on (the hours the firm above accepted, at this
 * firm's rate); `marginCents` is null where the week has no margin to stand
 * behind (no cost on record, two currencies, the employer has not accepted).
 */
export interface WeekFact {
  weekStart: Date
  currency: string
  hours: number
  billedCents: number
  marginCents: number | null
  /** Why the margin is blank, where it is. */
  marginBlankedBecause?: string | null
}

export interface PeriodAccrual {
  /** What the weeks earned before the cap; null where it cannot be stood behind. */
  earnedCents: number | null
  /** After the cap: what may be posted for the period. Null with `earnedCents`. */
  amountCents: number | null
  capped: boolean
  currency: string | null
  weeks: number
  hours: number
  says: string
  /** Why the figure is blank, where it is. */
  blankedBecause: string | null
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Inside the row's own days: the week's Sunday on or after its start and on or before its end. */
export function weekInRow(weekStart: Date, row: { fromDate: Date; toDate: Date | null }): boolean {
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const w = day(weekStart)
  // A row that starts mid-week counts the week it starts in.
  const startSunday = new Date(Date.UTC(row.fromDate.getUTCFullYear(), row.fromDate.getUTCMonth(), row.fromDate.getUTCDate() - row.fromDate.getUTCDay()))
  if (w < day(startSunday)) return false
  if (row.toDate && w > day(row.toDate)) return false
  return true
}

/**
 * What one row earned over the weeks that count for the period, under its
 * cap. `weeks` are the weeks the reader decided count (the period's
 * accepted weeks, or the weeks whose bill was paid in the period); this
 * drops those outside the row's own days. `alreadyCents` is everything
 * posted under the row before.
 */
export function accrueCommission(
  row: Pick<CommissionTerms, 'basis' | 'rateBps' | 'amountCents' | 'capCents' | 'accrueOn' | 'fromDate' | 'toDate'>,
  weeks: readonly WeekFact[],
  alreadyCents: number
): PeriodAccrual {
  const mine = weeks.filter((w) => weekInRow(w.weekStart, row) && (w.hours > 0 || w.billedCents !== 0))
  const hours = Math.round(mine.reduce((n, w) => n + w.hours, 0) * 100) / 100
  const blank = (why: string, currency: string | null): PeriodAccrual => ({
    earnedCents: null, amountCents: null, capped: false, currency, weeks: mine.length, hours, says: why, blankedBecause: why,
  })

  if (mine.length === 0) {
    const why = row.accrueOn === 'CASH'
      ? 'No bill for this line’s weeks was paid in full in the period, so nothing is earned yet.'
      : 'No week on this line was accepted in the period, so nothing is earned.'
    return { earnedCents: 0, amountCents: 0, capped: false, currency: null, weeks: 0, hours: 0, says: why, blankedBecause: null }
  }

  const currencies = new Set(mine.map((w) => w.currency))
  if (currencies.size > 1) {
    return blank(`The weeks are billed in ${[...currencies].sort().join(' and ')}, and two currencies are never added.`, null)
  }
  const currency = mine[0].currency
  const money = (c: number) => amount(c, currency)
  const share = (row.rateBps ?? 0) / 10_000

  let earned: number
  let basis: string
  switch (row.basis) {
    case 'SHARE_OF_MARGIN': {
      const unpriced = mine.filter((w) => w.marginCents == null)
      if (unpriced.length > 0) {
        return blank(
          `${plural(unpriced.length, 'week has', 'weeks have')} no margin to stand behind` +
          (unpriced[0].marginBlankedBecause ? ` (${unpriced[0].marginBlankedBecause.replace(/\.$/, '')})` : '') +
          ', so a share of it cannot be worked out. A week with no cost behind it has no margin, not a perfect one.',
          currency,
        )
      }
      const margin = mine.reduce((n, w) => n + (w.marginCents ?? 0), 0)
      earned = margin > 0 ? Math.round(margin * share) : 0
      basis = margin > 0
        ? `${(share * 100).toFixed(2).replace(/\.00$/, '')}% of ${money(margin)} margin over ${plural(mine.length, 'week', 'weeks')}`
        : `the margin over ${plural(mine.length, 'week', 'weeks')} was ${money(margin)}, and a share of a loss is nothing`
      break
    }
    case 'SHARE_OF_BILLED': {
      const billed = mine.reduce((n, w) => n + w.billedCents, 0)
      earned = billed > 0 ? Math.round(billed * share) : 0
      basis = `${(share * 100).toFixed(2).replace(/\.00$/, '')}% of ${money(billed)} billed over ${plural(mine.length, 'week', 'weeks')}`
      break
    }
    case 'PER_HOUR':
      earned = Math.round((row.amountCents ?? 0) * hours)
      basis = `${hours} accepted hours at ${money(row.amountCents ?? 0)} an hour`
      break
    case 'PER_PERIOD':
      earned = hours > 0 ? (row.amountCents ?? 0) : 0
      basis = hours > 0 ? `${money(row.amountCents ?? 0)} for the period` : 'no paid hours in the period'
      break
    default:
      return blank('This commission names no way of working it out.', currency)
  }

  const room = row.capCents == null ? Infinity : Math.max(0, row.capCents - Math.abs(alreadyCents))
  const amountCents = Math.max(0, Math.min(earned, room))
  const capped = amountCents < earned
  const says = earned === 0
    ? `Nothing earned: ${basis}.`
    : capped
      ? `${money(amountCents)} of ${money(earned)} earned (${basis}); the ${money(row.capCents!)} cap is reached.`
      : `${money(amountCents)}: ${basis}.`
  return { earnedCents: earned, amountCents, capped, currency, weeks: mine.length, hours, says, blankedBecause: null }
}

// ── The firm's default rates, read by the award ──────────────────────

/** One default: what the award writes for a kind, where the firm set one. */
export interface CommissionDefault {
  basis: CommissionBasis
  rateBps: number | null
  amountCents: number | null
  capCents: number | null
  accrueOn: CommissionAccrual
}

export type CommissionDefaults = Partial<Record<CommissionKind, CommissionDefault>>

/**
 * `Company.commissionDefaults`, read. Null, or anything that is not a
 * complete default, is no default: the shipped default is none, and a
 * half-written setting never invents a rate.
 */
export function defaultsFrom(json: unknown): CommissionDefaults {
  const out: CommissionDefaults = {}
  if (!json || typeof json !== 'object') return out
  for (const kind of KINDS) {
    const d = (json as Record<string, unknown>)[kind]
    if (!d || typeof d !== 'object') continue
    const v = checkCommission({
      ...(kind === 'SALES' ? { sellContractId: 'line' } : { buyContractId: 'line' }),
      earnedById: 'someone', kind, fromDate: new Date(0), reason: 'default',
      basis: (d as any).basis, rateBps: (d as any).rateBps ?? null, amountCents: (d as any).amountCents ?? null,
      capCents: (d as any).capCents ?? null, accrueOn: (d as any).accrueOn ?? null,
    })
    if (!v.ok) continue
    out[kind] = { basis: v.terms.basis, rateBps: v.terms.rateBps, amountCents: v.terms.amountCents, capCents: v.terms.capCents, accrueOn: v.terms.accrueOn }
  }
  return out
}

/** What the award knows: the two lines and the two people (demand decides who sold and who recruited). */
export interface AwardFacts {
  sellContractId: string
  /** The buy line the award wrote, where there is one. */
  buyContractId: string | null
  /** Who sold the deal: the job's owner or the client relationship's account manager. */
  soldById: string | null
  /** Who recruited the person: the submission's submitter. */
  recruitedById: string | null
  /** The line's first day. */
  startDate: Date
  /** Who the rows are recorded as set by: the person whose press made the award. */
  setById: string
}

export interface DefaultRows {
  rows: CommissionTerms[]
  /** A sentence for each kind with a default the award could not write. */
  notWritten: string[]
}

/**
 * The rows the award writes from the firm's defaults. Pure. None where the
 * firm set none, which is the shipped default; a kind whose person or line
 * is not known is not written and says why, rather than guessing an earner.
 */
export function defaultCommissionRows(defaults: CommissionDefaults, award: AwardFacts): DefaultRows {
  const rows: CommissionTerms[] = []
  const notWritten: string[] = []
  const reason = 'The firm’s default commission rate, written by the award.'
  const sales = defaults.SALES
  if (sales) {
    if (!award.soldById) notWritten.push('No sales commission was written: nobody is named as having sold this deal.')
    else rows.push({ ...sales, sellContractId: award.sellContractId, buyContractId: null, earnedById: award.soldById, kind: 'SALES', fromDate: award.startDate, toDate: null, reason })
  }
  const recruiting = defaults.RECRUITING
  if (recruiting) {
    if (!award.recruitedById) notWritten.push('No recruiting commission was written: nobody is named as having put this person forward.')
    else if (!award.buyContractId) notWritten.push('No recruiting commission was written: the award wrote no buy line for it to sit on.')
    else rows.push({ ...recruiting, sellContractId: null, buyContractId: award.buyContractId, earnedById: award.recruitedById, kind: 'RECRUITING', fromDate: award.startDate, toDate: null, reason })
  }
  return { rows, notWritten }
}

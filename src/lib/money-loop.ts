/**
 * The money loop's screens and routes, in words (record 107, Flow B, B2 to
 * B6). Pure, with no database in it, so a screen and its route read one
 * description: the state in the trade's words, the month a period is, what
 * each form draws and posts, and what its route reads back.
 *
 * The rules of a chain are lib/money/money-chain. Every amount here is the
 * one a person typed. Etyme works none of them out.
 */

import { hasPermission } from '@/lib/permissions'
import { formatMonthLong } from '@/lib/format-date'

// ── Who reads, who writes ───────────────────────────────────────────

export const LOOP_READS = 'payroll.read' as const
export const LOOP_RUNS = 'payroll.run' as const

export const CANNOT_READ_LOOP = 'These amounts are read by the people who run payroll. Your seat does not read payroll, so it does not open this page.'
export const CANNOT_RUN_LOOP = 'Moving a consultant’s month forward is done by a seat that runs payroll. Your seat reads payroll and does not run it.'
export const BENCH_SEAT_REFUSED_LOOP = 'This page is read by the people who run payroll at this firm. Your seat here is a place on its bench, so it does not open it.'
export const NO_SUCH_CHAIN = 'There is no such month on a consultant’s record at this firm.'
export const NO_SUCH_PLACEMENT = 'There is no such contract at this firm.'

export function mayReadLoop(permissions: readonly string[]): boolean {
  return hasPermission(permissions, LOOP_READS)
}
export function mayRunLoop(permissions: readonly string[]): boolean {
  return hasPermission(permissions, LOOP_RUNS)
}

// ── The states, in the trade's words ────────────────────────────────

/** The seven states in order. A test holds this equal to the rule's own list. */
export const STATE_STRIP = [
  'TIMESHEET_OWED', 'TIMESHEET_RECEIVED', 'RECONCILED', 'INVOICED', 'PAYMENT_PENDING', 'PAID_UNCONFIRMED', 'CONFIRMED_CLOSED',
] as const

export type StripState = (typeof STATE_STRIP)[number]
export type LoopState = StripState | 'DISPUTED'

const LABELS: Record<LoopState, string> = {
  TIMESHEET_OWED: 'Timesheet owed',
  TIMESHEET_RECEIVED: 'Timesheet received',
  RECONCILED: 'Reconciled',
  INVOICED: 'Invoiced',
  PAYMENT_PENDING: 'Payment pending',
  PAID_UNCONFIRMED: 'Paid, not confirmed',
  CONFIRMED_CLOSED: 'Closed',
  DISPUTED: 'Disputed',
}

/** What a state reads as on a screen. Never the machine name. Pure. */
export function stateLabel(state: string): string {
  return LABELS[state as LoopState] ?? 'Not known'
}

/** Every state a period counts, in the order the summary prints them. */
export const COUNTED_STATES: readonly LoopState[] = [...STATE_STRIP, 'DISPUTED']

/** The one state after this one; null at the end or while disputed. Pure. */
export function nextOf(state: string): StripState | null {
  const at = STATE_STRIP.indexOf(state as StripState)
  return at < 0 || at === STATE_STRIP.length - 1 ? null : STATE_STRIP[at + 1]
}

type AmountKind = 'timesheet' | 'invoiced' | 'paid'
const NEEDS: Partial<Record<StripState, AmountKind>> = { TIMESHEET_RECEIVED: 'timesheet', INVOICED: 'invoiced', PAID_UNCONFIRMED: 'paid' }

/** Which amount the move into this state asks a person to state; null for none. Pure. */
export function amountAskedFor(to: string): AmountKind | null {
  return NEEDS[to as StripState] ?? null
}

const MOVES: Record<Exclude<StripState, 'TIMESHEET_OWED'>, { button: string; amountLabel?: string }> = {
  TIMESHEET_RECEIVED: { button: 'Record the timesheet', amountLabel: 'Amount the timesheet states' },
  RECONCILED: { button: 'Mark it reconciled' },
  INVOICED: { button: 'Record the invoice', amountLabel: 'Amount invoiced' },
  PAYMENT_PENDING: { button: 'Mark payment pending' },
  PAID_UNCONFIRMED: { button: 'Record the payment', amountLabel: 'Amount paid' },
  CONFIRMED_CLOSED: { button: 'Confirm and close' },
}

/** The next move from a state: its button and, where it asks one, its amount's label. Null where nothing moves. Pure. */
export function nextMove(state: string): { to: StripState; button: string; amountLabel: string | null } | null {
  const to = nextOf(state)
  if (!to || to === 'TIMESHEET_OWED') return null
  const m = MOVES[to]
  return { to, button: m.button, amountLabel: m.amountLabel ?? null }
}

// ── The month ───────────────────────────────────────────────────────

export interface Month { key: string; start: Date; end: Date; words: string }

/** "2026-12" as its first and last day; null where it is not a month. Pure. */
export function readMonth(key: string | null | undefined): Month | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key ?? '')
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2])
  if (mo < 1 || mo > 12 || y < 2000 || y > 2100) return null
  const start = new Date(Date.UTC(y, mo - 1, 1))
  const end = new Date(Date.UTC(y, mo, 0))
  return { key: `${m[1]}-${m[2]}`, start, end, words: formatMonthLong(start) }
}

/** The month a day falls in, as "2026-12". Pure. */
export function monthKeyOf(day: Date): string {
  return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}`
}

/** The month before or after, as its key. Pure. */
export function monthBeside(key: string, by: -1 | 1): string {
  const m = readMonth(key)!
  return monthKeyOf(new Date(Date.UTC(m.start.getUTCFullYear(), m.start.getUTCMonth() + by, 1)))
}

export const NOT_A_MONTH = 'Choose a month, such as December 2026.'

// ── An amount a person types ────────────────────────────────────────

/** "16,000.00" as integer cents; null where it is not an amount. Never rounds. Pure. */
export function centsFrom(typed: unknown): number | null {
  if (typeof typed !== 'string') return null
  const t = typed.replace(/[,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const [whole, part = ''] = t.split('.')
  const cents = Number(whole) * 100 + Number(part.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

const AMOUNT_SAYS = 'Type the amount as a number with at most two decimal places, such as 16000.00.'
const CURRENCY_SAYS = 'Say the amount’s currency as its three-letter code, such as USD.'
const ENTITY_SAYS = 'This company has legal entities. Choose which one this is done for.'

const str = (b: Record<string, unknown>, k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '')
const currencyOf = (b: Record<string, unknown>) => { const c = str(b, 'currency').toUpperCase(); return /^[A-Z]{3}$/.test(c) ? c : null }

type Refused = { ok: false; says: string; field: string }

// ── "Open this month's chains" ──────────────────────────────────────

export interface OpenMonthTyped { month: string; actingEntityId: string }

export function openMonthFields(hasEntities: boolean): (keyof OpenMonthTyped)[] {
  return ['month', ...(hasEntities ? ['actingEntityId' as const] : [])]
}

export function openMonthBody(t: Partial<OpenMonthTyped>) {
  return { month: t.month ?? '', actingEntityId: t.actingEntityId || null }
}

export function readOpenMonthAsk(body: unknown, hasEntities: boolean): { ok: true; month: Month; actingEntityId: string | null } | Refused {
  const b = (body ?? {}) as Record<string, unknown>
  const month = readMonth(str(b, 'month'))
  if (!month) return { ok: false, field: 'month', says: NOT_A_MONTH }
  const entity = str(b, 'actingEntityId') || null
  if (hasEntities && !entity) return { ok: false, field: 'actingEntityId', says: ENTITY_SAYS }
  return { ok: true, month, actingEntityId: entity }
}

// ── The one form that makes the next move ───────────────────────────

export interface AdvanceTyped { amount: string; currency: string; actingEntityId: string; disputeOwnerPersonId: string }

/**
 * What the form draws for the move into `to`. The amount, its currency and
 * who decides a disagreement are asked only on a move that states an
 * amount: no other move can find one.
 */
export function advanceFields(to: string, hasEntities: boolean): (keyof AdvanceTyped)[] {
  const asks = amountAskedFor(to) !== null
  return [...(asks ? ['amount' as const, 'currency' as const] : []), ...(hasEntities ? ['actingEntityId' as const] : []), ...(asks ? ['disputeOwnerPersonId' as const] : [])]
}

export function advanceBody(to: string, t: Partial<AdvanceTyped>) {
  const asks = amountAskedFor(to) !== null
  return {
    act: 'ADVANCE' as const, to,
    amount: asks ? (t.amount ?? '').trim() : null,
    currency: asks ? (t.currency ?? '').trim().toUpperCase() : null,
    actingEntityId: t.actingEntityId || null,
    disputeOwnerPersonId: asks ? (t.disputeOwnerPersonId ?? '') : null,
  }
}

export interface AdvanceAsk {
  to: StripState
  stated: { cents: number; currency: string } | null
  actingEntityId: string | null
  /** Null on a move that states no amount; the route names the person acting. */
  disputeOwnerPersonId: string | null
}

export function readAdvanceAsk(body: unknown, hasEntities: boolean): { ok: true; ask: AdvanceAsk } | Refused {
  const b = (body ?? {}) as Record<string, unknown>
  const to = str(b, 'to')
  if (!(STATE_STRIP as readonly string[]).includes(to)) return { ok: false, field: 'to', says: 'Say which state this month moves to.' }
  const asks = amountAskedFor(to) !== null
  let stated: AdvanceAsk['stated'] = null
  if (asks) {
    const cents = centsFrom(b.amount)
    if (cents === null) return { ok: false, field: 'amount', says: AMOUNT_SAYS }
    const currency = currencyOf(b)
    if (!currency) return { ok: false, field: 'currency', says: CURRENCY_SAYS }
    stated = { cents, currency }
  }
  const entity = str(b, 'actingEntityId') || null
  if (hasEntities && !entity) return { ok: false, field: 'actingEntityId', says: ENTITY_SAYS }
  const owner = str(b, 'disputeOwnerPersonId') || null
  if (asks && !owner) return { ok: false, field: 'disputeOwnerPersonId', says: 'Choose who decides if this amount disagrees with one already stated.' }
  return { ok: true, ask: { to: to as StripState, stated, actingEntityId: entity, disputeOwnerPersonId: asks ? owner : null } }
}

// ── Returning a disputed month once its decision is recorded ────────

export function resolveBody(actingEntityId: string) {
  return { act: 'RESOLVE' as const, actingEntityId: actingEntityId || null }
}

export function readResolveAsk(body: unknown, hasEntities: boolean): { ok: true; actingEntityId: string | null } | Refused {
  const entity = str((body ?? {}) as Record<string, unknown>, 'actingEntityId') || null
  if (hasEntities && !entity) return { ok: false, field: 'actingEntityId', says: ENTITY_SAYS }
  return { ok: true, actingEntityId: entity }
}

// ── "Load a past month as closed" ───────────────────────────────────

export interface LoadTyped {
  sellContractId: string
  source: string
  /** YYYY-MM-DD, the day this history was true. */
  asOf: string
  timesheetAmount: string
  invoicedAmount: string
  paidAmount: string
  currency: string
  actingEntityId: string
}

export function loadFields(hasEntities: boolean): (keyof LoadTyped)[] {
  return ['sellContractId', 'source', 'asOf', 'timesheetAmount', 'invoicedAmount', 'paidAmount', 'currency', ...(hasEntities ? ['actingEntityId' as const] : [])]
}

export function loadBody(t: Partial<LoadTyped>) {
  return {
    sellContractId: t.sellContractId ?? '', source: t.source?.trim() ?? '', asOf: t.asOf ?? '',
    timesheetAmount: (t.timesheetAmount ?? '').trim(), invoicedAmount: (t.invoicedAmount ?? '').trim(), paidAmount: (t.paidAmount ?? '').trim(),
    currency: (t.currency ?? '').trim().toUpperCase(), actingEntityId: t.actingEntityId || null,
  }
}

export interface LoadAsk {
  sellContractId: string
  source: string
  asOf: Date
  amounts: Record<AmountKind, { cents: number; currency: string }>
  actingEntityId: string | null
}

export function readLoadAsk(body: unknown, hasEntities: boolean): { ok: true; ask: LoadAsk } | Refused {
  const b = (body ?? {}) as Record<string, unknown>
  if (!str(b, 'sellContractId')) return { ok: false, field: 'sellContractId', says: 'Choose the consultant whose past month this is.' }
  if (!str(b, 'source')) return { ok: false, field: 'source', says: 'Say where this history came from.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(b, 'asOf'))) return { ok: false, field: 'asOf', says: 'Say the day this history was true.' }
  const currency = currencyOf(b)
  const amounts = {} as LoadAsk['amounts']
  for (const [kind, key] of [['timesheet', 'timesheetAmount'], ['invoiced', 'invoicedAmount'], ['paid', 'paidAmount']] as const) {
    const cents = centsFrom(b[key])
    if (cents === null) return { ok: false, field: key, says: AMOUNT_SAYS }
    if (!currency) return { ok: false, field: 'currency', says: CURRENCY_SAYS }
    amounts[kind] = { cents, currency }
  }
  const entity = str(b, 'actingEntityId') || null
  if (hasEntities && !entity) return { ok: false, field: 'actingEntityId', says: ENTITY_SAYS }
  return { ok: true, ask: { sellContractId: str(b, 'sellContractId'), source: str(b, 'source'), asOf: new Date(`${str(b, 'asOf')}T00:00:00Z`), amounts, actingEntityId: entity } }
}

// ── Sentences the screens print ─────────────────────────────────────

/** What a month with no chains waits on. Pure. */
export function emptyMonthSays(monthWords: string, livePlacements: number, mayRun: boolean): string {
  if (livePlacements === 0) return `Nobody was on a running contract in ${monthWords}, so there is no month to follow. A consultant appears here once a contract of hers has started.`
  const who = livePlacements === 1 ? '1 consultant is' : `${livePlacements} consultants are`
  return mayRun
    ? `${who} on a running contract in ${monthWords}, and the month is not opened yet. Open it to start each one at “Timesheet owed”.`
    : `${who} on a running contract in ${monthWords}, and the month is not opened yet. A seat that runs payroll opens it.`
}

/** "Loaded as history from the payroll file, as of Nov 5, 2026." Pure. */
export function historySays(source: string, asOfWords: string): string {
  return `Loaded as history from ${source}, as of ${asOfWords}.`
}

export const TOTAL_LABEL = 'Total stated on timesheets'
export const PAYROLL_HREF = '/dashboard/payroll'
export const LOOP_HREF = '/dashboard/money-loop'
export const periodHref = (month: string) => `${LOOP_HREF}/periods/${month}`
export const placementHref = (id: string, month: string) => `${LOOP_HREF}/placements/${id}?month=${month}`

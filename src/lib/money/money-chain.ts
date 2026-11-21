/**
 * The money loop (Flow B, 2026-11-21 → 105, 107, 108).
 *
 * One chain per placement per period. The placement is the SellContract:
 * the one row that already holds the consultant, the client, the agreed
 * rate and the start. A chain walks seven states, one at a time, by a
 * named person, and never backward:
 *
 *   TIMESHEET_OWED → TIMESHEET_RECEIVED → RECONCILED → INVOICED →
 *   PAYMENT_PENDING → PAID_UNCONFIRMED → CONFIRMED_CLOSED
 *
 * Every amount on a chain is the one a person stated, in its own currency,
 * in integer cents. Etyme works none of them out. Where two stated amounts
 * disagree the chain goes DISPUTED and a decision item is opened with an
 * owner; it returns only once that decision is recorded.
 *
 * Nothing here pays, bills, runs payroll or sends anything, and nothing
 * reads or writes the payroll, bill or invoice receipt tables.
 */

import type { MoneyChain, MoneyChainState } from '@prisma/client'
import { prisma } from '@/lib/db'
import { writeRecordAction, recordTimeline, LedgerRefusal } from '@/lib/record-ledger'
import { openDecision } from '@/lib/decision-items'
import { money } from '@/lib/order'
import { formatDay } from '@/lib/format-date'

export const CHAIN_RECORD = 'MoneyChain'

export const CHAIN_STATES = [
  'TIMESHEET_OWED',
  'TIMESHEET_RECEIVED',
  'RECONCILED',
  'INVOICED',
  'PAYMENT_PENDING',
  'PAID_UNCONFIRMED',
  'CONFIRMED_CLOSED',
] as const satisfies readonly MoneyChainState[]

type LiveState = (typeof CHAIN_STATES)[number]
type AmountKind = 'timesheet' | 'invoiced' | 'paid'

/** The move into these states needs the amount a person states. */
const AMOUNT_FOR: Partial<Record<LiveState, AmountKind>> = {
  TIMESHEET_RECEIVED: 'timesheet',
  INVOICED: 'invoiced',
  PAID_UNCONFIRMED: 'paid',
}

const STATE_WORDS: Record<MoneyChainState, string> = {
  TIMESHEET_OWED: 'timesheet owed',
  TIMESHEET_RECEIVED: 'timesheet received',
  RECONCILED: 'reconciled',
  INVOICED: 'invoiced',
  PAYMENT_PENDING: 'payment pending',
  PAID_UNCONFIRMED: 'paid, not confirmed',
  CONFIRMED_CLOSED: 'confirmed and closed',
  DISPUTED: 'disputed',
}

const AMOUNT_WORDS: Record<AmountKind, string> = {
  timesheet: 'the timesheet states',
  invoiced: 'was invoiced',
  paid: 'was paid',
}

export interface Stated { cents: number; currency: string }
export interface ChainAmounts { timesheet: Stated | null; invoiced: Stated | null; paid: Stated | null }

// ── Pure rules ──────────────────────────────────────────────────────

/** The one state after this one; null at the end or while disputed. Pure. */
export function nextState(state: MoneyChainState): LiveState | null {
  const at = CHAIN_STATES.indexOf(state as LiveState)
  return at < 0 || at === CHAIN_STATES.length - 1 ? null : CHAIN_STATES[at + 1]
}

/** Which stated amount the move into this state needs; null for none. Pure. */
export function amountNeededFor(state: MoneyChainState): AmountKind | null {
  return AMOUNT_FOR[state as LiveState] ?? null
}

/** Why a stated amount cannot be taken, in a sentence; null when it can. Pure. */
export function statedRefusal(s: Partial<Stated> | null | undefined, kind: AmountKind): string | null {
  if (!s || s.cents == null) return `Say the amount that ${AMOUNT_WORDS[kind]}, with its currency.`
  if (!Number.isSafeInteger(s.cents) || s.cents < 0) return 'An amount is a whole number of cents, zero or more.'
  if (!s.currency || !/^[A-Z]{3}$/.test(s.currency.trim().toUpperCase())) return 'Say the amount’s currency as its three-letter code, such as USD.'
  return null
}

/** Why this move cannot be made, in a sentence; null when it can. Pure. */
export function advanceRefusal(state: MoneyChainState, to: MoneyChainState, stated?: Partial<Stated> | null): string | null {
  if (state === 'DISPUTED') return 'This chain is disputed. It moves again once its decision is recorded.'
  if (state === 'CONFIRMED_CLOSED') return 'This chain is confirmed and closed. Nothing moves it.'
  const next = nextState(state)
  if (to !== next) {
    return `A chain moves one state at a time and never back. From ${STATE_WORDS[state]} the next state is ${STATE_WORDS[next!]}.`
  }
  const kind = amountNeededFor(to)
  return kind ? statedRefusal(stated, kind) : null
}

/**
 * Where two stated amounts disagree, a sentence with the figures; null when
 * every pair present agrees. Compared in integer cents, never across two
 * currencies: a different currency is itself a disagreement. Pure.
 */
export function mismatch(a: ChainAmounts): string | null {
  const pairs: [AmountKind, AmountKind][] = [['timesheet', 'invoiced'], ['invoiced', 'paid'], ['timesheet', 'paid']]
  for (const [x, y] of pairs) {
    const l = a[x], r = a[y]
    if (!l || !r) continue
    if (l.currency !== r.currency) {
      return `The amount that ${AMOUNT_WORDS[x]} is in ${l.currency} and the amount that ${AMOUNT_WORDS[y]} is in ${r.currency}. Two currencies are never compared here.`
    }
    if (l.cents !== r.cents) {
      return `The amount that ${AMOUNT_WORDS[x]} is ${money(l.cents, l.currency)}, and the amount that ${AMOUNT_WORDS[y]} is ${money(r.cents, r.currency)}.`
    }
  }
  return null
}

/** Why a chain whose three amounts must all be present and agree cannot close; null when it can. Pure. */
export function closeRefusal(a: ChainAmounts): string | null {
  for (const k of ['timesheet', 'invoiced', 'paid'] as const) {
    const r = statedRefusal(a[k], k)
    if (r) return r
  }
  const m = mismatch(a)
  return m ? `This chain cannot close while its amounts disagree. ${m}` : null
}

/** Why a history load cannot be taken, in a sentence; null when it can. Pure. */
export function loadRefusal(input: { source?: string | null; asOf?: Date | null; amounts: ChainAmounts }, today: Date = new Date()): string | null {
  if (!input.source?.trim()) return 'Say where this history came from.'
  if (!input.asOf || Number.isNaN(input.asOf.getTime())) return 'Say the day this history was true.'
  if (dayOf(input.asOf).getTime() > dayOf(today).getTime()) return 'History cannot be true as of a day that has not happened yet.'
  return closeRefusal(input.amounts)
}

/** A period's count per state and its timesheet-stated total per currency. Pure. */
export function summarize(chains: readonly Pick<MoneyChain, 'state' | 'timesheetAmountCents' | 'timesheetCurrency'>[]) {
  const counts = Object.fromEntries([...CHAIN_STATES, 'DISPUTED'].map((s) => [s, 0])) as Record<MoneyChainState, number>
  const totals = new Map<string, number>()
  let notStated = 0
  for (const c of chains) {
    counts[c.state] += 1
    if (c.timesheetAmountCents == null || !c.timesheetCurrency) { notStated += 1; continue }
    totals.set(c.timesheetCurrency, (totals.get(c.timesheetCurrency) ?? 0) + c.timesheetAmountCents)
  }
  return {
    counts,
    /** One line per currency; never added across currencies. */
    statedTotals: [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, cents]) => ({
      label: 'stated' as const, currency, cents, says: `${money(cents, currency)} stated`,
    })),
    /** Chains with no timesheet amount stated yet: left out of the totals, and counted. */
    notStated,
  }
}

export function amountsOf(c: Pick<MoneyChain, 'timesheetAmountCents' | 'timesheetCurrency' | 'invoicedAmountCents' | 'invoicedCurrency' | 'paidAmountCents' | 'paidCurrency'>): ChainAmounts {
  const one = (cents: number | null, currency: string | null) => (cents == null || !currency ? null : { cents, currency })
  return {
    timesheet: one(c.timesheetAmountCents, c.timesheetCurrency),
    invoiced: one(c.invoicedAmountCents, c.invoicedCurrency),
    paid: one(c.paidAmountCents, c.paidCurrency),
  }
}

function dayOf(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function columns(kind: AmountKind, s: Stated | null) {
  const v = s ? { cents: s.cents, currency: s.currency.trim().toUpperCase() } : { cents: null, currency: null }
  if (kind === 'timesheet') return { timesheetAmountCents: v.cents, timesheetCurrency: v.currency }
  if (kind === 'invoiced') return { invoicedAmountCents: v.cents, invoicedCurrency: v.currency }
  return { paidAmountCents: v.cents, paidCurrency: v.currency }
}

// ── Acts on the record ──────────────────────────────────────────────

interface Stamp {
  companyId: string
  personId: string
  heldAs: string
  actingEntityId?: string | null
}

const stampOf = (s: Stamp) => ({ companyId: s.companyId, personId: s.personId, heldAs: s.heldAs, actingEntityId: s.actingEntityId ?? null })

async function chainAt(companyId: string, chainId: string) {
  const chain = await prisma.moneyChain.findFirst({ where: { id: chainId, companyId }, include: { person: { select: { name: true } } } })
  if (!chain) throw new LedgerRefusal('There is no such money chain at this firm.')
  return chain
}

function periodWords(c: { periodStart: Date; periodEnd: Date }) {
  return `${formatDay(c.periodStart)} to ${formatDay(c.periodEnd)}`
}

/** Open a live chain for one placement and one period. It starts at TIMESHEET_OWED. */
export async function openChain(input: Stamp & { sellContractId: string; periodStart: Date; periodEnd: Date }) {
  if (Number.isNaN(input.periodStart?.getTime()) || Number.isNaN(input.periodEnd?.getTime())) throw new LedgerRefusal('A chain needs the first and last day of its period.')
  if (dayOf(input.periodEnd) < dayOf(input.periodStart)) throw new LedgerRefusal('A period cannot end before it starts.')
  const line = await prisma.sellContract.findFirst({ where: { id: input.sellContractId, companyId: input.companyId }, select: { id: true, personId: true } })
  if (!line) throw new LedgerRefusal('There is no such placement at this firm.')
  const clash = await prisma.moneyChain.findUnique({ where: { sellContractId_periodStart: { sellContractId: line.id, periodStart: dayOf(input.periodStart) } } })
  if (clash) throw new LedgerRefusal('This placement already has a chain for that period.')
  return prisma.$transaction(async (tx) => {
    const chain = await tx.moneyChain.create({
      data: {
        companyId: input.companyId, sellContractId: line.id, personId: line.personId,
        periodStart: dayOf(input.periodStart), periodEnd: dayOf(input.periodEnd),
        actingEntityId: input.actingEntityId ?? null,
      },
    })
    await writeRecordAction(tx, {
      ...stampOf(input), recordType: CHAIN_RECORD, recordId: chain.id, action: 'OPENED',
      summary: `Opened the chain for ${periodWords(chain)}: timesheet owed.`,
    })
    return chain
  })
}

/**
 * Move a chain exactly one state forward. The move into TIMESHEET_RECEIVED,
 * INVOICED and PAID_UNCONFIRMED takes the amount the person states. Where
 * that amount disagrees with one already stated, the chain goes DISPUTED
 * instead, and a decision is opened, owed by `disputeOwnerPersonId`.
 */
export async function advanceChain(input: Stamp & {
  chainId: string
  to: MoneyChainState
  stated?: Stated | null
  /** Who owes the decision if this move finds a mismatch. Required. */
  disputeOwnerPersonId: string
}) {
  if (!input.disputeOwnerPersonId) throw new LedgerRefusal('Name who decides if the amounts on this chain disagree.')
  const chain = await chainAt(input.companyId, input.chainId)
  const refusal = advanceRefusal(chain.state, input.to, input.stated)
  if (refusal) throw new LedgerRefusal(refusal)
  const kind = amountNeededFor(input.to)
  const stated = kind && input.stated ? { cents: input.stated.cents, currency: input.stated.currency.trim().toUpperCase() } : null
  const amounts = { ...amountsOf(chain), ...(kind ? { [kind]: stated } : {}) } as ChainAmounts
  if (input.to === 'CONFIRMED_CLOSED' && (!amounts.timesheet || !amounts.invoiced || !amounts.paid)) {
    throw new LedgerRefusal('A chain closes only with all three amounts stated.')
  }
  const found = mismatch(amounts)

  if (found) {
    const decision = await openDecision({
      ...stampOf(input),
      question: `${chain.person.name}, ${periodWords(chain)}: the amounts do not agree. Which amount is right?`,
      ownerPersonId: input.disputeOwnerPersonId,
      openedOn: new Date(),
      proof: found,
      proofLinks: [{ recordType: CHAIN_RECORD, recordId: chain.id }],
    })
    return prisma.$transaction(async (tx) => {
      const moved = await tx.moneyChain.updateMany({
        where: { id: chain.id, state: chain.state },
        data: { state: 'DISPUTED', stateBeforeDispute: chain.state, disputeDecisionId: decision.id, ...(kind ? columns(kind, stated) : {}) },
      })
      if (moved.count !== 1) throw new LedgerRefusal('Somebody moved this chain a moment ago. Read it again.')
      await writeRecordAction(tx, {
        ...stampOf(input), recordType: CHAIN_RECORD, recordId: chain.id, action: 'DISPUTED',
        summary: `Disputed while moving to ${STATE_WORDS[input.to]}: ${found}`,
      })
      return tx.moneyChain.findUniqueOrThrow({ where: { id: chain.id } })
    })
  }

  return prisma.$transaction(async (tx) => {
    const moved = await tx.moneyChain.updateMany({
      where: { id: chain.id, state: chain.state },
      data: { state: input.to, ...(kind ? columns(kind, stated) : {}) },
    })
    if (moved.count !== 1) throw new LedgerRefusal('Somebody moved this chain a moment ago. Read it again.')
    await writeRecordAction(tx, {
      ...stampOf(input), recordType: CHAIN_RECORD, recordId: chain.id, action: 'ADVANCED',
      summary: `Moved to ${STATE_WORDS[input.to]}${kind && stated ? `: ${money(stated.cents, stated.currency)} ${kind === 'timesheet' ? 'stated on the timesheet' : AMOUNT_WORDS[kind]}` : ''}.`,
    })
    return tx.moneyChain.findUniqueOrThrow({ where: { id: chain.id } })
  })
}

/**
 * Return a disputed chain to the state it was in, once its decision is
 * APPROVED or REJECTED. The amount whose move found the mismatch is cleared,
 * so it is stated again on the next move. Nobody resolves it by hand.
 */
export async function resolveDispute(input: Stamp & { chainId: string }) {
  const chain = await chainAt(input.companyId, input.chainId)
  if (chain.state !== 'DISPUTED' || !chain.stateBeforeDispute || !chain.disputeDecisionId) throw new LedgerRefusal('This chain is not disputed.')
  const decision = await prisma.decisionItem.findFirst({ where: { id: chain.disputeDecisionId, companyId: input.companyId } })
  if (!decision || decision.state === 'OPEN') throw new LedgerRefusal('This dispute’s decision is still open. Record it on the decision first.')
  const back = chain.stateBeforeDispute
  const next = nextState(back)
  const kind = next ? amountNeededFor(next) : null
  return prisma.$transaction(async (tx) => {
    const moved = await tx.moneyChain.updateMany({
      where: { id: chain.id, state: 'DISPUTED' },
      data: { state: back, stateBeforeDispute: null, disputeDecisionId: null, ...(kind ? columns(kind, null) : {}) },
    })
    if (moved.count !== 1) throw new LedgerRefusal('Somebody moved this chain a moment ago. Read it again.')
    await writeRecordAction(tx, {
      ...stampOf(input), recordType: CHAIN_RECORD, recordId: chain.id, action: 'DISPUTE_RESOLVED',
      summary: `The decision was ${decision.state === 'APPROVED' ? 'approved' : 'rejected'}; the chain is back at ${STATE_WORDS[back]}.`,
    })
    return tx.moneyChain.findUniqueOrThrow({ where: { id: chain.id } })
  })
}

/**
 * Record a past period as CONFIRMED_CLOSED in one act. The source, the
 * as-of day and three equal stated amounts are required. One ledger row
 * per state, each dated today and saying it was loaded as history.
 */
export async function loadClosedChain(input: Stamp & {
  sellContractId: string
  periodStart: Date
  periodEnd: Date
  source: string
  asOf: Date
  amounts: ChainAmounts
}, today: Date = new Date()) {
  const refusal = loadRefusal(input, today)
  if (refusal) throw new LedgerRefusal(refusal)
  if (dayOf(input.periodEnd) < dayOf(input.periodStart)) throw new LedgerRefusal('A period cannot end before it starts.')
  const line = await prisma.sellContract.findFirst({ where: { id: input.sellContractId, companyId: input.companyId }, select: { id: true, personId: true } })
  if (!line) throw new LedgerRefusal('There is no such placement at this firm.')
  const clash = await prisma.moneyChain.findUnique({ where: { sellContractId_periodStart: { sellContractId: line.id, periodStart: dayOf(input.periodStart) } } })
  if (clash) throw new LedgerRefusal('This placement already has a chain for that period.')
  const asOfWords = formatDay(dayOf(input.asOf))
  return prisma.$transaction(async (tx) => {
    const chain = await tx.moneyChain.create({
      data: {
        companyId: input.companyId, sellContractId: line.id, personId: line.personId,
        periodStart: dayOf(input.periodStart), periodEnd: dayOf(input.periodEnd),
        state: 'CONFIRMED_CLOSED', source: input.source.trim(), asOf: dayOf(input.asOf),
        actingEntityId: input.actingEntityId ?? null,
        ...columns('timesheet', input.amounts.timesheet), ...columns('invoiced', input.amounts.invoiced), ...columns('paid', input.amounts.paid),
      },
    })
    for (const s of CHAIN_STATES) {
      await writeRecordAction(tx, {
        ...stampOf(input), recordType: CHAIN_RECORD, recordId: chain.id, action: 'LOADED_AS_HISTORY',
        summary: `Loaded as history on ${formatDay(dayOf(today))}: ${STATE_WORDS[s]}, as of ${asOfWords}, from ${input.source.trim()}.`,
      })
    }
    return chain
  })
}

// ── Readers ─────────────────────────────────────────────────────────

/** Each consultant's chain for the period that starts that day, with any open dispute's decision. */
export async function chainsForPeriod(companyId: string, periodStart: Date) {
  const rows = await prisma.moneyChain.findMany({
    where: { companyId, periodStart: dayOf(periodStart) },
    include: { person: { select: { name: true } }, disputeDecision: { select: { id: true, state: true } } },
    orderBy: [{ person: { name: 'asc' } }, { id: 'asc' }],
  })
  return rows.map((r) => ({
    chainId: r.id,
    sellContractId: r.sellContractId,
    personId: r.personId,
    personName: r.person.name,
    state: r.state,
    amounts: amountsOf(r),
    openDisputeDecisionId: r.state === 'DISPUTED' && r.disputeDecision?.state === 'OPEN' ? r.disputeDecision.id : null,
    disputeDecisionId: r.disputeDecisionId,
    source: r.source,
    asOf: r.asOf,
  }))
}

/** The period's count per state, and its timesheet-stated total per currency. */
export async function periodSummary(companyId: string, periodStart: Date) {
  const rows = await prisma.moneyChain.findMany({
    where: { companyId, periodStart: dayOf(periodStart) },
    select: { state: true, timesheetAmountCents: true, timesheetCurrency: true },
  })
  return summarize(rows)
}

/** One placement's chain for the period holding today, and every other chain with its ledger. */
export async function chainForPlacement(companyId: string, sellContractId: string, today: Date = new Date()) {
  const rows = await prisma.moneyChain.findMany({ where: { companyId, sellContractId }, orderBy: { periodStart: 'desc' } })
  const d = dayOf(today).getTime()
  const withLedger = await Promise.all(rows.map(async (c) => ({ chain: c, ledger: await recordTimeline(companyId, CHAIN_RECORD, c.id) })))
  const current = withLedger.find((c) => c.chain.periodStart.getTime() <= d && d <= c.chain.periodEnd.getTime()) ?? null
  return { current, history: withLedger.filter((c) => c !== current) }
}

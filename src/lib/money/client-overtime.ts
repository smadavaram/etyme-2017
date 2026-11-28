/**
 * Which hours of a week are overtime, below the top of a chain.
 *
 * The founder, 2026-10-19 (CLAUDE.md, "Four decisions on the founder's
 * 'go with your recommendations'", items 3 and 4):
 *
 *   3. **A sub-vendor's overtime is priced on the decision made when the
 *      client signed the week**, carried down the chain the way the hours
 *      already are; never on the sub-vendor's own contract alone.
 *   4. **On a cut week, a sub-vendor's invoice loses overtime first**, the
 *      same as every bill, because to the firm paying it, it is a bill.
 *      The worker's own pay keeps its own rule.
 *
 * ── What is carried down, and what is not ─────────────────────────────
 *
 * Carried: **which hours are overtime, and what happens to them.** The
 * client's answer on its own leg — the top of the ladder — says how many
 * hours of each week went over its line and whether they are paid at a
 * premium, at the same rate, or banked as time off. Every rung below
 * reads that answer for the same week, the way every rung bills the same
 * signed hours.
 *
 * Not carried: **what an overtime hour is worth.** That is each pair's
 * own agreement, like the rate is. A premium hour below the top is worth
 * the rate on that pair's line times the multiplier on that pair's line.
 * The client choosing double time on its own leg is a price the client
 * agreed with the firm it buys from, and it no more reaches the sub-vendor
 * than the client's bill rate does. So:
 *
 *   PREMIUM    priced at the pair's own multiplier;
 *   SAME_RATE  no premium at any rung below — the client decided these
 *              hours are worth the usual rate;
 *   TIME_OFF   billed by no rung now — the client banked them, and they
 *              come back as paid leave on a later week, billed at every
 *              rung as leave.
 *
 * The pair's multiplier is read off the pair's line as it stands, whether
 * or not that line draws an overtime line of its own: the client's
 * decision is what makes an hour overtime, and the line only says what
 * the pair agreed one is worth — the same reading as a contract that
 * draws no line of its own and is decided against the job's hours
 * (`lineFor` in lib/overtime).
 *
 * Where the client has said nothing about a week, nothing in it is
 * overtime below the top: no hour is priced at a premium the client did
 * not sign.
 *
 * Pure. The reader loads the decisions and the top of the ladder
 * (`lib/money/client-overtime-read`); this says what a rung below may price.
 */

import type { Decision, OvertimePolicy, Treatment } from '@/lib/overtime'

/** An overtime decision as stored, with the two columns this rule reads. */
export interface DecisionRow {
  sellContractId: string
  weekOf: Date
  treatment: string
  appliedBps: number
  overtimeHours: unknown
  accrualBps?: number | null
  /** The line the decision was made against, snapshotted when it was made. */
  afterHours?: number | null
  decidedByCompanyId?: string | null
}

/** The top of the ladder over the hours: the contract the end client pays, and who that client is. */
export interface TopLeg {
  sellContractId: string
  /** The end client, where the ladder names one. */
  clientCompanyId: string | null
}

/** What a rung below the top prices a week on, or why it cannot. */
export type Carried =
  | {
      ok: true
      /** The client's line, as the client's decisions were made against it; null where the client decided nothing. */
      policy: OvertimePolicy
      /** The client's answers, each priced at the pair's own multiplier. */
      decisions: Decision[]
      /** The client's rows these came from, so a bill can mark them billed. */
      rows: DecisionRow[]
    }
  | { ok: false; says: string }

const TREATMENTS: readonly string[] = ['SAME_RATE', 'PREMIUM', 'TIME_OFF']

/**
 * The client's own answers on this week: those written on the top leg.
 *
 * Where the top leg carries none, an answer the end client gave on
 * another leg is still the client's answer — the approval route wrote
 * every answer on the leg the hours were filed on until it learned which
 * leg was being answered (`decidingLeg` in lib/overtime). Another firm's
 * answer is never read as the client's.
 */
export function clientsDecisions(rows: readonly DecisionRow[], top: TopLeg): DecisionRow[] {
  const onTop = rows.filter((d) => d.sellContractId === top.sellContractId)
  if (onTop.length > 0) return onTop
  if (!top.clientCompanyId) return []
  return rows.filter((d) => d.decidedByCompanyId === top.clientCompanyId)
}

/**
 * What a rung below the top prices one week's overtime on.
 *
 * `pairMultiplierBps` is the multiplier on the line between the two firms
 * whose invoice this is — the payer's buy line for a receipt it typed in,
 * the supplier's sell line for a bill the supplier sent on the platform.
 */
export function carriedOvertime(
  rows: readonly DecisionRow[],
  top: TopLeg | null,
  pairMultiplierBps: number,
  personName = 'this person'
): Carried {
  if (!top) {
    return {
      ok: false,
      says:
        `The chain above ${personName}’s week could not be read, so nobody can say which of its hours the ` +
        `client decided were overtime, and the week is not priced on a guess.`,
    }
  }
  if (!Number.isInteger(pairMultiplierBps) || pairMultiplierBps < 10_000) {
    return {
      ok: false,
      says:
        `The line this invoice is for does not say what an overtime hour is worth, so ${personName}’s ` +
        `overtime is not priced on a guess.`,
    }
  }

  const theirs = clientsDecisions(rows, top)
  if (theirs.length === 0) {
    return { ok: true, policy: { afterHours: null, multiplierBps: pairMultiplierBps }, decisions: [], rows: [] }
  }

  const lines = [...new Set(theirs.map((d) => d.afterHours ?? null))]
  if (lines.length !== 1 || lines[0] == null || lines[0] <= 0) {
    return {
      ok: false,
      says:
        `The client decided ${personName}’s overtime against ${lines.length > 1 ? 'two different overtime lines' : 'no overtime line on record'}, ` +
        `so which hours are overtime on this invoice cannot be read, and the week is not priced on a guess.`,
    }
  }
  if (theirs.some((d) => !TREATMENTS.includes(d.treatment))) {
    return {
      ok: false,
      says: `The client’s answer on ${personName}’s overtime cannot be read, so the week is not priced on a guess.`,
    }
  }

  const decisions: Decision[] = theirs.map((d) => {
    const treatment = d.treatment as Treatment
    return {
      weekOf: d.weekOf.toISOString().slice(0, 10),
      treatment,
      // Which hours: the client's. What each is worth: the pair's.
      appliedBps: treatment === 'PREMIUM' ? pairMultiplierBps : treatment === 'SAME_RATE' ? 10_000 : 0,
      overtimeHours: Number(d.overtimeHours),
      accrualBps: d.accrualBps ?? 10_000,
    }
  })

  return { ok: true, policy: { afterHours: lines[0], multiplierBps: pairMultiplierBps }, decisions, rows: theirs }
}

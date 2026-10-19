/**
 * Below the top of a chain, the client decided the overtime.
 *
 * The founder, 2026-10-19 (CLAUDE.md, "Four decisions on the founder's
 * 'go with your recommendations'", item 3): which hours of a week are
 * overtime is the client's decision, made when it signed the week and
 * carried down the way the hours are. A rung's own answer prices nothing.
 * So the firm in the middle and the employer accept a week without being
 * asked about its overtime, and read the client's decision as a fact.
 *
 * Money owns the rule (`carriedOvertime` in lib/money/client-overtime):
 * which hours are the client's, and an overtime hour is worth the
 * multiplier on the pair's own line. This file adds one case the rule
 * leaves to its readers — the firm whose line *is* the client's, as the
 * employer is on an ordinary two-firm placement. There the client's own
 * multiplier is the price the pair agreed, so it is kept, exactly as a
 * bill to the client is priced (`carriedForLines` skips the top line for
 * the same reason).
 *
 * Pure: the approve route, the timesheet list and the decisions queue
 * load the rows and the top of the ladder and ask this the same question,
 * so the three screens cannot tell a firm three different things.
 */

import { carriedOvertime, type Carried, type DecisionRow, type TopLeg } from '@/lib/money/client-overtime'
import { clientDecidedSays } from '@/lib/overtime'

/** What a firm below the top prices a week's overtime on, as the client decided it. */
export function clientDecidedFor(i: {
  rows: readonly DecisionRow[]
  top: TopLeg | null
  /** The line this firm reads the week on: the one with the firm it pays, or the one it bills on. */
  pairLineId: string
  pairMultiplierBps: number | null | undefined
  personName: string
}): Carried {
  const c = carriedOvertime(i.rows, i.top, i.pairMultiplierBps ?? NaN, i.personName)
  if (!c.ok || !i.top || i.top.sellContractId !== i.pairLineId) return c
  return { ...c, decisions: c.decisions.map((d, k) => ({ ...d, appliedBps: c.rows[k].appliedBps })) }
}

/**
 * The sentence a firm below the top reads: "Northbend Athletic decided 5
 * hours at time and a half." Where the client's answer cannot be read,
 * the rule's own sentence saying why the week is not priced. Null where
 * the client decided nothing.
 */
export function clientDecidedSentence(clientName: string, c: Carried): string | null {
  return c.ok ? clientDecidedSays(clientName, c.decisions) : c.says
}

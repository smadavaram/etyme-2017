/**
 * A button pressed on an Etyme card in Teams.
 *
 * Teams never writes state itself (CLAUDE.md, "The job twin"). An
 * Approve or a Reject is handed to `decideApproval` in lib/twin/ledger —
 * the one door `POST /api/twin/approvals/:id` opens for the web — with
 * the person the Teams account is bound to as the decider and the
 * surface TEAMS. Everything that decides is there: the desk the act
 * needs, nobody signing their own, the record checked again, the answer
 * and its ledger entry in one transaction. The route asks for a signed-in
 * browser session, which a Teams button does not have; the bound seat
 * (lib/teams/binding) stands where the session would, with its own
 * permissions and nothing more, and the function behind the route is the
 * same function.
 *
 * This file imports no database client. What it may do is call the door
 * and say back, in a sentence, what the door said.
 */

import { decideApproval, type Decider, type DecideResult } from '@/lib/twin/ledger'
import type { CardAction } from '@/lib/teams/cards'
import type { BoundPerson } from '@/lib/teams/binding'
import { whyOf } from '@/lib/teams/facts'

export interface ActionDeps {
  /** The one approval door. Injected only so a test can watch what it is given. */
  decide: (args: Parameters<typeof decideApproval>[0]) => Promise<DecideResult>
  /** The ledger's own words for a question, at the reader's company. */
  why: (approvalId: string, companyId: string) => Promise<{ ruleCited: string; rationale: string } | null>
}

export const DOOR: ActionDeps = { decide: decideApproval, why: whyOf }

export interface ActionAnswer {
  /** What the bot says back, in a sentence. */
  says: string
  /** Where the press changed something, what the card is replaced with. */
  answered?: { title: string; sentence: string }
}

/** The decider is the bound seat: its person, its company, its permissions. Nothing more. */
export function deciderFrom(bound: BoundPerson): Decider {
  return {
    personId: bound.personId,
    personName: bound.personName,
    companyId: bound.companyId,
    companyKind: bound.companyKind,
    companyName: bound.companyName,
    permissions: bound.permissions,
  }
}

export async function answerCardAction(action: CardAction, bound: BoundPerson, deps: ActionDeps = DOOR): Promise<ActionAnswer> {
  if (action.etyme === 'twin.approval') {
    const reason = action.reason?.trim() || null
    if (action.decision === 'REJECTED' && !reason) {
      return { says: 'Say why before rejecting, so the twin and whoever reads the ledger know. Nothing changed.' }
    }
    const out = await deps.decide({
      approvalId: action.approvalId,
      decision: action.decision,
      reason,
      surface: 'TEAMS',
      decider: deciderFrom(bound),
    })
    if (!out.ok) return { says: out.says }
    if (out.outcome === 'PERFORMED') {
      return {
        says: 'Approved. It is recorded in the twin’s ledger under your name, answered from Teams.',
        answered: { title: `Approved by ${bound.personName} in Teams`, sentence: 'Recorded in the twin’s ledger under their name.' },
      }
    }
    return {
      says: 'Rejected. Your reason is recorded in the twin’s ledger under your name.',
      answered: { title: `Rejected by ${bound.personName} in Teams`, sentence: `Their reason: ${reason}` },
    }
  }

  if (action.etyme === 'twin.why') {
    const w = await deps.why(action.approvalId, bound.companyId)
    if (!w) return { says: 'There is no such question from the twin at your company.' }
    return { says: `The rule: ${w.ruleCited}\n\nWhy: ${w.rationale}` }
  }

  // Acknowledge: nothing on the record moves, and the reply says so.
  const who = action.personName ?? 'this person'
  return action.tier === 'BREACH'
    ? { says: `Noted. Nothing on the record changed. ${who} is at the time limit, and this was the last warning you will get about it.` }
    : { says: `Noted. Nothing on the record changed. You will hear about ${who} again only at the next warning.` }
}

/**
 * Who may press a placement's lifecycle buttons, as one function the
 * route answers with and the panel reads before it draws a button.
 *
 * The tester's retest on 2026-11-03 found Rajesh Iyer's placement page
 * saying "Get an I-9 and E-Verify on file, then activate" with nothing to
 * press, in either seat. A button drawn from a second copy of the rule
 * is a button that one day lies, so the panel asks this route (GET) and
 * the route asks this file, and the press (POST) asks it again.
 *
 * Kept beside the route because a route file may export only its handlers.
 */

import { contractSide, type ContractSide } from '@/lib/resolve-client-company'
import { hasPermission, desksHolding, type Permission } from '@/lib/permissions'
import { refusalFor, type CallerContext } from '@/lib/api-context'
import { partiesSay } from './words'

export const VALID_ACTIONS = ['verify', 'activate', 'pause', 'resume', 'complete', 'cancel'] as const
export type Action = typeof VALID_ACTIONS[number]

// Map action → { allowed source states, target state }
export const TRANSITIONS: Record<Action, { from: string[]; to: string }> = {
  verify:   { from: ['DRAFT'],                                      to: 'PENDING_VERIFICATION' },
  activate: { from: ['PENDING_VERIFICATION', 'VERIFIED', 'DRAFT'],  to: 'IN_PROGRESS' },
  pause:    { from: ['IN_PROGRESS'],                                 to: 'PAUSED' },
  resume:   { from: ['PAUSED'],                                      to: 'IN_PROGRESS' },
  complete: { from: ['IN_PROGRESS'],                                 to: 'ENDED' },
  cancel:   { from: ['DRAFT', 'PENDING_VERIFICATION'],              to: 'CANCELLED' },
}

// What each action asks of the caller. Starting, pausing and resuming
// somebody is running the placement; ending or cancelling it is a
// termination, which is its own permission because it is its own job.
export const NEEDS: Record<Action, Permission> = {
  verify:   'assignments.write',
  activate: 'assignments.write',
  pause:    'assignments.write',
  resume:   'assignments.write',
  complete: 'assignments.terminate',
  cancel:   'assignments.terminate',
}

// What each action is, said as the start of a refusal to somebody whose
// role does not do it: "Starting a placement is done by …".
export const DOING: Record<Action, string> = {
  verify:   'Sending a placement for verification',
  activate: 'Starting a placement',
  pause:    'Pausing a placement',
  resume:   'Resuming a placement',
  complete: 'Ending a placement',
  cancel:   'Canceling a placement before it starts',
}

/** The parties a contract names, by id and by name. */
export interface GateContract {
  state: string
  companyId: string
  clientCompanyId: string
  endClientCompanyId: string | null
  company: { name: string }
  clientCompany: { name: string }
  endClientCompany: { name: string } | null
}

/** A refusal, ready to send: the status and the route's own sentence. */
export interface GateRefusal {
  status: number
  error: { code: string; message: string }
}

/**
 * Null where this caller may press this act on this contract today, as
 * far as who they are and where the contract stands go; the refusal in
 * the route's words otherwise. The papers and the terms are asked after
 * this, by the route, because they are about the person and not the seat.
 */
export function gateRefusal(
  caller: Pick<CallerContext, 'company' | 'permissions' | 'context'>,
  contract: GateContract,
  action: Action,
): GateRefusal | null {
  const side: ContractSide | null = contractSide(caller as CallerContext, contract)
  if (!side) {
    return {
      status: 403,
      error: {
        code: 'NOT_A_PARTY',
        message: `${caller.company?.name ?? 'Your company'} is not a party to this contract. Only ${partiesSay([contract.company.name, contract.clientCompany.name, contract.endClientCompany?.name])} can change it.`,
      },
    }
  }
  const needs = NEEDS[action]
  if (!hasPermission(caller.permissions, needs)) {
    return {
      status: 403,
      error: {
        code: 'FORBIDDEN',
        message: refusalFor(caller, { doing: DOING[action], needs }),
      },
    }
  }
  const transition = TRANSITIONS[action]
  if (!transition.from.includes(contract.state)) {
    return {
      status: 409,
      error: { code: 'INVALID_TRANSITION', message: `Cannot ${action} a contract in state ${contract.state}. Allowed from: ${transition.from.join(', ')}` },
    }
  }
  return null
}

/**
 * The roles that may press this act at this kind of firm, by their own
 * names ("Resource Manager", "Contract Manager"), read off the shipped
 * role set the refusal's own sentence reads. The placement page names
 * them in "…then HR activates".
 */
export function whoMay(action: Action, kind: string | null | undefined): string[] {
  return desksHolding(NEEDS[action], kind)
}

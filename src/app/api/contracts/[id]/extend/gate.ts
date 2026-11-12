/**
 * Who may extend a placement, as one function the route answers with
 * (POST) and the drawer asks before it draws Extend (GET).
 *
 * The screen walk found Extend drawn on every running line in the
 * contracts drawer, for a seat the route then refused. A button drawn
 * from a second copy of the rule is a button that one day lies, so the
 * drawer asks the route and the route asks this file.
 *
 * Kept beside the route because a route file may export only its handlers.
 */

import { contractSide } from '@/lib/resolve-client-company'
import { hasPermission } from '@/lib/permissions'
import { refusalFor, type CallerContext } from '@/lib/api-context'

export interface ExtendFacts {
  state: string
  companyId: string
  clientCompanyId: string
  endClientCompanyId?: string | null
  company: { name: string }
  clientCompany: { name: string }
  endClientCompany?: { name: string } | null
}

export type ExtendGate =
  | { ok: true }
  | { ok: false; status: 403 | 409; code: 'NOT_A_PARTY' | 'FORBIDDEN' | 'INVALID_STATE'; says: string }

/**
 * May this caller extend this placement now, before the new day, the
 * time limit and the papers are read. Those three need the day asked for,
 * so they stay with the press.
 */
export function extendGate(
  caller: CallerContext,
  contract: ExtendFacts,
): ExtendGate {
  const side = contractSide(caller, { ...contract, endClientCompanyId: contract.endClientCompanyId ?? null })
  if (!side) {
    return {
      ok: false,
      status: 403,
      code: 'NOT_A_PARTY',
      says:
        `${caller.company?.name ?? 'Your company'} is not a party to this contract. Only ${contract.company.name}, ` +
        `${contract.clientCompany.name}${contract.endClientCompany ? ` or ${contract.endClientCompany.name}` : ''} can extend it.`,
    }
  }
  if (!hasPermission(caller.permissions, 'assignments.write')) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      says: refusalFor(caller, { doing: 'Extending a placement', needs: 'assignments.write' }),
    }
  }
  if (!['IN_PROGRESS', 'PAUSED'].includes(contract.state)) {
    return {
      ok: false,
      status: 409,
      code: 'INVALID_STATE',
      says: `This placement is ${contract.state.toLowerCase().replace(/_/g, ' ')}, so it cannot be extended. Only a running or paused placement is.`,
    }
  }
  return { ok: true }
}

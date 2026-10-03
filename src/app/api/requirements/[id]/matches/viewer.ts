import type { CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { raisedIt, seatedDesk } from '@/lib/resolve-client-company'
import { buyerOf, type PoolRequirement } from '@/lib/match-pool'

/**
 * Who is looking at a job request's matches, and as what.
 *
 * Three answers, and anybody else is told the job request is not there:
 *
 *   the firm that raised it — its own people, or a program office in a
 *   seat the client granted, acting under the client's own role
 *
 *   a supplier it was sent to — which matches the job request against
 *   its own pool, not the client's, with no copy of the role needed
 *
 * `buyer` is whoever the job request is submitted to. The same firm is a
 * buyer on its own requisition and a seller on the role it was sent.
 */
export interface MatchViewer {
  companyId: string
  companyName: string
  companyKind: string
  raiser: boolean
  buyer: boolean
  /** Suggestions from firms it does not trade with: a client on its own job request only. */
  suggest: boolean
  /** The permissions this viewer acts with here — a seat's, where it sits in one. */
  permissions: readonly string[]
}

export type ViewerRequirement = PoolRequirement & { company: { kind: string; name: string } }

export async function matchViewer(caller: CallerContext, requirement: ViewerRequirement): Promise<MatchViewer | null> {
  if (!caller.company) return null

  const asRaiser = (companyId: string, companyName: string, permissions: readonly string[]): MatchViewer => ({
    companyId,
    companyName,
    companyKind: requirement.company.kind,
    raiser: true,
    buyer: companyId === buyerOf(requirement),
    suggest: requirement.payerCompanyId === null && requirement.company.kind === 'CLIENT',
    permissions,
  })

  if (raisedIt(caller, requirement)) {
    return asRaiser(caller.company.id, caller.company.name, caller.permissions)
  }

  // A program office in the client's seat reads the client's matches under
  // the client's own role.
  if (caller.company.kind !== 'CLIENT') {
    const desk = await seatedDesk(caller, requirement.companyId)
    if (desk?.seat && desk.companyId === requirement.companyId) {
      return asRaiser(desk.companyId, desk.companyName, desk.acting.permissions)
    }
  }

  const invited = await prisma.requirementInvitation.findUnique({
    where: { requirementId_toCompanyId: { requirementId: requirement.id, toCompanyId: caller.company.id } },
    select: { status: true },
  })
  if (!invited || invited.status === 'REVOKED') return null
  return {
    companyId: caller.company.id,
    companyName: caller.company.name,
    companyKind: caller.company.kind,
    raiser: false,
    buyer: false,
    suggest: false,
    permissions: caller.permissions,
  }
}

/** Said to anybody who is not one of the three, and to a job request that does not exist. */
export const NOT_HERE = { error: { code: 'NOT_FOUND', message: 'Requirement not found' } }

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { endClientFilter } from '@/lib/resolve-end-client'
import { isConsultantSeat } from '@/lib/seat'
import { maySeeOutside } from '@/lib/walls'
import type { CallerContext } from '@/lib/api-context'

/**
 * Resolve which client company the caller is entitled to view.
 *
 * The client-facing surfaces — program, tenure, alumni, compliance —
 * are all views over "the people on contract at this client". Before
 * this helper existed each route took `?clientCompanyId=` straight from
 * the query string with no check, so any authenticated user could read
 * any client's tenure ledger by editing the URL.
 *
 * Two legitimate callers:
 *
 *   1. The client themselves (company.kind === 'CLIENT').
 *      They are the subject. They may not name a different client.
 *
 *   2. A vendor, MSP, or GSI who actually places people there.
 *      Entitlement is proven by a SellContract linking the caller's
 *      company to that end client — resolved through endClientFilter,
 *      so the three-party layer cake (vendor bills MSP, consultant
 *      works at the enterprise) still grants access to the enterprise.
 *
 * Anyone else gets 403. A caller with no contract relationship to the
 * named client gets 403 even if the client exists.
 *
 * CLAUDE.md: "Every read path filters by context from the first commit."
 */

export interface ResolvedClientCompany {
  id: string
  name: string
  slug: string
  kind: string
}

type Resolution =
  | { client: ResolvedClientCompany; error: null }
  | { client: null; error: NextResponse }

function forbidden(message: string): Resolution {
  return {
    client: null,
    error: NextResponse.json(
      { error: { code: 'FORBIDDEN', message } },
      { status: 403 }
    ),
  }
}

function notFound(message: string): Resolution {
  return {
    client: null,
    error: NextResponse.json(
      { error: { code: 'NOT_FOUND', message } },
      { status: 404 }
    ),
  }
}

/**
 * Does the caller's company have any contract placing a person at this
 * end client? This is the entitlement proof for a vendor-side caller.
 */
async function hasPlacementRelationship(
  vendorCompanyId: string,
  endClientId: string
): Promise<boolean> {
  const contract = await prisma.sellContract.findFirst({
    where: {
      companyId: vendorCompanyId,
      ...endClientFilter(endClientId),
    },
    select: { id: true },
  })
  return contract !== null
}

/**
 * Prisma WHERE fragment restricting SellContract reads to what the caller's
 * company is party to. Which side of the placement they sit on decides it:
 *
 *   CLIENT    → contracts where they are the end client
 *   VENDOR    → contracts they sell
 *   MSP · GSI → either — they can be the seller or the paying intermediary
 *
 * Returns null when the caller has no company, meaning "entitled to nothing".
 *
 * Without this, a list route with no `?companyId=` built an empty WHERE and
 * returned every contract in the database to any authenticated caller.
 */
export function sellContractScope(
  caller: CallerContext
): Record<string, unknown> | null {
  // A consultant's context points at the agency whose bench they are on.
  // That is true and it is not employment — read as employment it handed a
  // contractor the agency's whole book. Theirs, and only theirs.
  if (isConsultantSeat(caller)) return { personId: caller.person.id }

  if (!caller.company) return null

  const id = caller.company.id

  switch (caller.company.kind) {
    case 'CLIENT':
      return endClientFilter(id)
    case 'MSP':
    case 'GSI':
      return { OR: [{ companyId: id }, { clientCompanyId: id }] }
    default:
      return { companyId: id }
  }
}

/**
 * Prisma WHERE fragment for BuyContract reads. A buy contract is what a
 * company pays for talent, so it is always owned by the caller's company.
 * A client company has none, and correctly sees an empty list.
 */
export function buyContractScope(
  caller: CallerContext
): Record<string, unknown> | null {
  // What the agency pays for talent is the agency's business. A consultant
  // sees the line that names them — their own pay rate — and no other.
  if (isConsultantSeat(caller)) {
    return { candidates: { some: { personId: caller.person.id } } }
  }
  if (!caller.company) return null
  return { companyId: caller.company.id }
}

/**
 * Prisma WHERE fragment for Expense reads.
 *
 * A vendor owns its expenses outright (Expense.companyId). A client is not
 * a party to them, but is a party to the *billable* ones raised against work
 * at their own sites — those land on their invoices. A vendor's internal
 * costs stay with the vendor, the same principle that keeps pay rates and
 * margin off the client's screen.
 */
export function expenseScope(
  caller: CallerContext
): Record<string, unknown> | null {
  if (isConsultantSeat(caller)) return { personId: caller.person.id }

  if (!caller.company) return null

  if (caller.company.kind === 'CLIENT') {
    return {
      billable: true,
      sellContract: endClientFilter(caller.company.id),
    }
  }

  return { companyId: caller.company.id }
}

export async function resolveClientCompany(
  caller: CallerContext,
  requestedClientId: string | null
): Promise<Resolution> {
  if (!caller.company) {
    return forbidden('No company context. You must belong to a company.')
  }

  // ── Case 1: the caller IS the client ──
  if (caller.company.kind === 'CLIENT') {
    if (requestedClientId && requestedClientId !== caller.company.id) {
      return forbidden('You may only view your own company\'s workforce.')
    }
    return {
      client: {
        id: caller.company.id,
        name: caller.company.name,
        slug: caller.company.slug,
        kind: caller.company.kind,
      },
      error: null,
    }
  }

  // ── Case 2: vendor / MSP / GSI viewing a client they supply ──
  // Viewing another company's workforce is an assignment-level read.
  if (!hasPermission(caller.permissions, 'assignments.read')) {
    return forbidden('Requires assignments.read permission')
  }

  const vendorCompanyId = caller.company.id

  if (requestedClientId) {
    const client = await prisma.company.findUnique({
      where: { id: requestedClientId },
      select: { id: true, name: true, slug: true, kind: true },
    })

    if (!client) {
      return notFound('Client company not found')
    }

    const entitled = await hasPlacementRelationship(vendorCompanyId, client.id)
    if (!entitled) {
      return forbidden(
        `${caller.company.name} has no placements at ${client.name}.`
      )
    }

    return { client, error: null }
  }

  // No client named — fall back to a client this caller actually places at.
  // Deterministic (ordered by name) so two clients never silently swap.
  const contract = await prisma.sellContract.findFirst({
    where: { companyId: vendorCompanyId },
    select: {
      clientCompany: { select: { id: true, name: true, slug: true, kind: true } },
      endClientCompany: { select: { id: true, name: true, slug: true, kind: true } },
    },
    orderBy: [{ clientCompanyId: 'asc' }, { id: 'asc' }],
  })

  const fallback = contract?.endClientCompany ?? contract?.clientCompany ?? null

  if (!fallback) {
    return notFound('No client company found for this caller')
  }

  return { client: fallback, error: null }
}

/**
 * Prisma WHERE fragment for Invoice reads.
 *
 * An invoice is between two companies — the vendor who raised it and the
 * customer being asked to pay — and both sit on the master agreement behind
 * the engagement, not on the invoice row itself.
 *
 * The list route composed this by hand; the two single-invoice routes never
 * composed it at all. They authenticated the caller and threw them away, so
 * a competitor with the id read the number, the total, the purchase order
 * and its ceiling. Same rule, one place, used by all three.
 *
 * Returns null for a consultant seat: an invoice is a bill between
 * companies, and the person whose hours are on it is not a party to it.
 * Their hours are on their own timesheet, which is theirs to read.
 */
export function invoiceScope(
  caller: CallerContext
): Record<string, unknown> | null {
  if (isConsultantSeat(caller)) return null
  if (!caller.company) return null

  const id = caller.company.id
  return {
    engagement: { msa: { OR: [{ vendorId: id }, { clientId: id }] } },
  }
}

/**
 * Prisma WHERE fragment for Requirement reads.
 *
 * Three legitimate readers: the company that raised it, a supplier who was
 * invited to it, and — where the raiser deliberately opened it to the
 * network — anybody permitted to look outside their own company.
 *
 * Note what this does NOT cover. Being able to see a role is not the same
 * as being able to see who the raiser has lined up for it: the match list
 * is the raiser's shortlist of named people, and it belongs to them alone.
 * Use requirementOwnerOnly for that.
 */
export function requirementScope(
  caller: CallerContext
): Record<string, unknown> | null {
  if (isConsultantSeat(caller) || !caller.company) return null

  const id = caller.company.id

  const outside = maySeeOutside({
    posture: caller.company.outsideAccess,
    permissions: caller.permissions,
  })

  const visible: Record<string, unknown>[] = [
    { companyId: id },
    { invitations: { some: { toCompanyId: id } } },
  ]

  // Demo and real are separate universes.
  //
  // Open-to-network is the one branch here that crosses a company
  // boundary, and it was crossing that one too: a visitor looking around
  // in a sandbox was reading three real customers' open roles, and a real
  // customer with an open posture would have read strangers' sandboxes
  // back. A sandbox has its own demand seeded into it and has no business
  // on the network at all.
  if (outside.ok && !caller.company.isDemo) {
    visible.push({ openToNetwork: true, status: 'OPEN', company: { isDemo: false } })
  }

  return { OR: visible }
}

/**
 * Whether this caller raised this requirement.
 *
 * The gate on anything derived from a role that is the raiser's own working
 * material — the match list above all. A competitor with the id read the
 * shortlist: names, headlines, skills, scores. Which is the bench.
 */
export function raisedIt(
  caller: CallerContext,
  requirement: { companyId: string }
): boolean {
  return !isConsultantSeat(caller) && caller.company?.id === requirement.companyId
}

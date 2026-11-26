/**
 * The card a seller puts to a client's named acceptor (record 120, pods).
 *
 * A team is sold on the one approval route (POST /api/twin/approvals/[id]).
 * The seller proposes; this writes the question, in the seller's own
 * transaction, at the CLIENT's company, where the acceptor reads it. It
 * names one person. The approval route lets that person, and nobody else,
 * answer it, yes or no (`TWIN_ACTS['pod.sale.accept'].namedPerson`), and her
 * yes is what calls `sellPod` (lib/twin/performers). Nothing is sold here.
 *
 * What the card carries is what the client may read: the project's name, the
 * selling firm, the price, the deliverables, and the roles with headcount.
 * Never a member's name, a cost, or a firm below the seller. `podId` rides
 * along because the yes needs it; it is an opaque id and is never drawn.
 */

import type { Prisma } from '@prisma/client'
import { amountsRule, isWholeCents } from '@/lib/pods'
import { contractFor } from '@/lib/twin/role-contract'
import { pastEndDate } from '@/lib/account-lifecycle'

export const POD_SALE_ACT = 'pod.sale.accept'

/** The kinds of sale, as `sellPod` knows them; a test holds the two lists equal. */
export const CARD_SALE_KINDS = ['MILESTONE', 'FIXED_PRICE', 'TIME_AND_MATERIALS'] as const
export type SaleKind = (typeof CARD_SALE_KINDS)[number]

/** A sale as a card asks for it: `sellPod`'s input without the person who said yes. */
export interface PodSale {
  podId: string
  sellerCompanyId: string
  clientCompanyId: string
  acceptorPersonId: string
  /** The project's name as the client reads it; never the supplier's team name. */
  projectName: string
  kind: SaleKind
  priceCents: number
  currency: string
  deliverables: { name: string; amountCents: number; dueOn: Date | null }[]
}

export interface PodSaleCardInput {
  podId: string
  sellerCompanyId: string
  clientCompanyId: string
  /** The one person at the client who answers the card and, on a yes, accepts each deliverable. */
  acceptorPersonId: string
  /** The seller's person who made the proposal. */
  proposedByPersonId: string
  /** What the client reads the project as. */
  projectName: string
  /** The selling firm's name, which the client already knows. */
  sellerName: string
  kind: SaleKind
  priceCents: number
  currency: string
  /** Empty for a time-and-materials sale; otherwise amounts that sum exactly to the price. */
  deliverables: { name: string; amountCents: number; dueOn: Date | null }[]
  /** Roles and headcount, for the client's read. Optional. */
  roles?: { title: string; headcount: number }[]
}

export type PodSaleCardResult =
  | { ok: true; approvalId: string; twinActionId: string }
  | { ok: false; says: string; field: string | null }

/** What is kept on the card, as JSON. Dates are ISO strings. */
export interface PodSalePayload {
  podId: string
  sellerCompanyId: string
  clientCompanyId: string
  acceptorPersonId: string
  proposedByPersonId: string
  projectName: string
  sellerName: string
  kind: SaleKind
  priceCents: number
  currency: string
  deliverables: { name: string; amountCents: number; dueOn: string | null }[]
  roles: { title: string; headcount: number }[]
}

/** The sale a card asks for, read back from its payload; null where the payload is not a whole sale. Pure. */
export function podSaleFromPayload(payload: unknown): PodSale | null {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  const podId = str(p.podId), sellerCompanyId = str(p.sellerCompanyId), clientCompanyId = str(p.clientCompanyId)
  const acceptorPersonId = str(p.acceptorPersonId), currency = str(p.currency), projectName = str(p.projectName)
  const kind = (CARD_SALE_KINDS as readonly unknown[]).includes(p.kind) ? (p.kind as SaleKind) : null
  if (!projectName || !podId || !sellerCompanyId || !clientCompanyId || !acceptorPersonId || !currency || !kind || !isWholeCents(p.priceCents) || !Array.isArray(p.deliverables)) return null
  const deliverables: PodSale['deliverables'] = []
  for (const d of p.deliverables as Record<string, unknown>[]) {
    const due = typeof d?.dueOn === 'string' ? new Date(d.dueOn) : null
    if (typeof d?.name !== 'string' || typeof d.amountCents !== 'number' || (due && Number.isNaN(due.getTime()))) return null
    deliverables.push({ name: d.name, amountCents: d.amountCents, dueOn: due })
  }
  return { podId, sellerCompanyId, clientCompanyId, acceptorPersonId, projectName, kind, priceCents: p.priceCents, currency, deliverables }
}

/** Whether a person holds a live seat at a company on the day. */
export async function holdsSeatAt(tx: Pick<Prisma.TransactionClient, 'context'>, personId: string, companyId: string, now: Date = new Date()): Promise<boolean> {
  const seats = await tx.context.findMany({
    where: { personId, companyId, type: { in: ['EMPLOYEE', 'CLIENT_CONTACT', 'PARTNER'] }, revokedAt: null, suspendedAt: null },
    select: { expiresAt: true },
  })
  return seats.some((s) => !pastEndDate(s.expiresAt, now))
}

const refuse = (says: string, field: string | null = null): PodSaleCardResult => ({ ok: false, says, field })

/**
 * Put a team sale to the client's named acceptor. Call inside the seller's
 * transaction (`prisma.$transaction((tx) => raisePodSaleCard(tx, input))`), so
 * the card exists exactly when the seller's own proposal is saved.
 *
 * Refused, writing nothing, in one sentence: a price the deliverables do not
 * sum to, a time-and-materials sale that lists deliverables, an acceptor with
 * no seat at the client or one at the seller, a firm selling to itself, or a
 * card for the same team already waiting at the client. Whether the team is
 * still sellable is asked again at her yes, by `sellPod`.
 */
export async function raisePodSaleCard(tx: Prisma.TransactionClient, input: PodSaleCardInput, now: Date = new Date()): Promise<PodSaleCardResult> {
  if (input.sellerCompanyId === input.clientCompanyId) return refuse('A firm cannot sell a team to itself.', 'clientCompanyId')
  if (!(CARD_SALE_KINDS as readonly string[]).includes(input.kind)) return refuse('Choose milestones, a fixed price, or time and materials.', 'kind')
  if (!isWholeCents(input.priceCents)) return refuse('The price is a whole number of cents, above zero.', 'priceCents')
  if (input.kind === 'TIME_AND_MATERIALS') {
    if (input.deliverables.length > 0) return refuse('A time-and-materials team bills hours and has no deliverables. Sell it on milestones or a fixed price to list deliverables.', 'deliverables')
  } else {
    const amounts = amountsRule(input.priceCents, input.deliverables.map((d) => d.amountCents))
    if (amounts) return refuse(amounts, 'deliverables')
  }

  const acceptor = await tx.person.findUnique({ where: { id: input.acceptorPersonId }, select: { name: true } })
  if (!acceptor) return refuse('The named acceptor is not on file.', 'acceptorPersonId')
  if (await holdsSeatAt(tx, input.acceptorPersonId, input.sellerCompanyId, now)) {
    return refuse(`${acceptor.name} holds a seat at the selling firm and cannot accept its work. Name somebody at the client.`, 'acceptorPersonId')
  }
  if (!(await holdsSeatAt(tx, input.acceptorPersonId, input.clientCompanyId, now))) {
    return refuse(`${acceptor.name} does not hold a seat at the client, so she cannot be the one who accepts. Name somebody at the client.`, 'acceptorPersonId')
  }

  const waiting = await tx.twinApproval.findFirst({
    where: { companyId: input.clientCompanyId, decision: 'PENDING', twinAction: { action: POD_SALE_ACT, entityType: 'Pod', entityId: input.podId } },
    select: { id: true },
  })
  if (waiting) return refuse(`${input.projectName} is already waiting for ${acceptor.name}’s answer. Wait for it, or ask ${acceptor.name} to answer it.`, 'podId')

  const payload: PodSalePayload = {
    podId: input.podId,
    sellerCompanyId: input.sellerCompanyId,
    clientCompanyId: input.clientCompanyId,
    acceptorPersonId: input.acceptorPersonId,
    proposedByPersonId: input.proposedByPersonId,
    projectName: input.projectName,
    sellerName: input.sellerName,
    kind: input.kind,
    priceCents: input.priceCents,
    currency: input.currency,
    deliverables: input.deliverables.map((d) => ({ name: d.name, amountCents: d.amountCents, dueOn: d.dueOn ? d.dueOn.toISOString() : null })),
    roles: input.roles ?? [],
  }
  const n = input.deliverables.length
  const contract = await contractFor(input.clientCompanyId, 'PROGRAM_MANAGER')
  const row = await tx.twinAction.create({
    data: {
      companyId: input.clientCompanyId,
      twinKind: 'PROGRAM_MANAGER',
      // The supplier's own act, not the twin's: the proposer is the actor.
      actorType: 'PERSON',
      actorId: input.proposedByPersonId,
      onAuthorityOfRole: 'Named acceptor',
      authorityPersonId: null,
      roleContractId: contract.id,
      roleContractVersion: contract.version,
      tier: 'NEEDS_APPROVAL',
      outcome: 'AWAITING_APPROVAL',
      action: POD_SALE_ACT,
      entityType: 'Pod',
      entityId: input.podId,
      partyCompanyIds: [input.clientCompanyId, input.sellerCompanyId],
      ruleCited: 'Only the person the client names accepts a sold team’s work, and only her yes makes the project.',
      rationale: `${input.sellerName} proposes ${input.projectName}: ${n === 0 ? 'billed on hours' : `${n} deliverable${n === 1 ? '' : 's'}`}, ${input.priceCents} cents ${input.currency}, and names ${acceptor.name} to accept each one.`,
      surface: 'WEB',
      payload: payload as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  })
  const approval = await tx.twinApproval.create({
    data: { twinActionId: row.id, companyId: input.clientCompanyId, needsPermission: 'named.person' },
    select: { id: true },
  })
  await tx.automationLog.create({
    data: {
      companyId: input.clientCompanyId,
      action: 'TWIN_APPROVAL_REQUESTED',
      summary: `${input.sellerName} asked ${acceptor.name} to accept ${input.projectName}.`,
      reason: 'A seller proposed a team as a project; the person the client names answers it.',
      payload: { twinActionId: row.id, approvalId: approval.id, twinAct: POD_SALE_ACT, entityType: 'Pod', entityId: input.podId },
      reversible: false,
    },
  })
  return { ok: true, approvalId: approval.id, twinActionId: row.id }
}

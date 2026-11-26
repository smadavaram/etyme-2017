/**
 * The one writer of a sold team (record 120, pods).
 *
 * A team goes to a client; the client's named acceptor says yes; this makes
 * the project, in one transaction, on the machinery that already bills:
 *
 *   Engagement            the project the bill hangs on
 *   WorkOrder             the header: the client's order to the seller
 *   ProjectOrder          the project's own books (its kind, client, budget)
 *   SellContract x member the lines: a person at a reference rate, in draft
 *   OrderMilestone        each deliverable, through the milestone rules
 *   PodProject            the team on the project, and its named acceptor
 *   PodDeliverable        which milestones are the project's deliverables
 *
 * No new money path. A deliverable bills when the client accepts it, through
 * the bill run that already bills milestones. The members' lines carry a
 * rate for reference and never bill hours on a milestone or fixed sale (the
 * bill run reads `milestoneOnlyLines`), and a time-and-materials sale bills
 * hours and has no deliverables. Etyme moves no money.
 *
 * ── Who may call it ──────────────────────────────────────────────────
 *
 * Only the client acceptor's yes. A test fails on any other importer.
 * Every refusal is a sentence and nothing is written before the checks pass.
 */

import type { Prisma } from '@prisma/client'
import { amountsRule, isWholeCents, rosterRule, type RosterFacts, type Verdict } from '@/lib/pods'
import { orderNumbers, orderNumberAttempt } from '@/lib/award'
import { headerRhythmFrom, termsFor, AGREEMENT_TERMS_SELECT } from '@/lib/money/order-terms'
import { nextMasterContractCode } from '@/lib/money/master-contract'
import { wholeFromMinor } from '@/lib/money'
import { pastEndDate } from '@/lib/account-lifecycle'

export const SALE_KINDS = ['MILESTONE', 'FIXED_PRICE', 'TIME_AND_MATERIALS'] as const
export type SaleKind = (typeof SALE_KINDS)[number]

export interface SellPodInput {
  podId: string
  sellerCompanyId: string
  clientCompanyId: string
  /** The one person at the client who accepts or rejects each deliverable. */
  acceptorPersonId: string
  /** The name the supplier gives the project in the proposal. The client reads this; the team's own name stays the supplier's. */
  projectName: string
  kind: SaleKind
  priceCents: number
  currency: string
  deliverables: { name: string; amountCents: number; dueOn: Date | null }[]
  /** The person at the client whose yes this is. */
  decidedBy: string
}

export type SaleOutcome =
  | {
      ok: true
      engagementId: string
      workOrderId: string
      projectOrderId: string
      podProjectId: string
      sellContractIds: string[]
      milestoneIds: string[]
    }
  | { ok: false; says: string; field: string | null }

/** What the rules need to know that is not in the input. */
export interface SaleFacts {
  pod: { companyId: string; name: string; currency: string; archivedAt: Date | null } | null
  members: { personId: string; name: string; verdict: Verdict }[]
  acceptor: { name: string; atClient: boolean; atSeller: boolean; onTheTeam: boolean } | null
  decidedByAtClient: boolean
}

const PROJECT_NAME_SAYS = 'Name the project as your client would — for example ‘Data platform build’.'

const refuse = (says: string, field: string | null = null) => ({ ok: false as const, says, field })

/** Null where the sale may be written; otherwise the one sentence that says what is wrong. Pure. */
export function saleRefusal(input: SellPodInput, f: SaleFacts): { says: string; field: string | null } | null {
  const projectName = typeof input.projectName === 'string' ? input.projectName.trim() : ''
  if (!projectName) return refuse(PROJECT_NAME_SAYS, 'projectName')
  if (/\bpods?\b/i.test(projectName)) return refuse(PROJECT_NAME_SAYS, 'projectName')
  if (!f.pod) return refuse('That team is not on file.', 'podId')
  if (f.pod.companyId !== input.sellerCompanyId) return refuse('That team is not the seller’s own, so it cannot be sold from here.', 'podId')
  if (f.pod.archivedAt) return refuse(`This offer can no longer be accepted: the team behind ${projectName} is deactivated. The supplier needs to send it again.`, 'podId')
  if (input.sellerCompanyId === input.clientCompanyId) return refuse('A firm cannot sell a team to itself.', 'clientCompanyId')
  if (!(SALE_KINDS as readonly string[]).includes(input.kind)) return refuse('Choose milestones, a fixed price, or time and materials.', 'kind')
  if (!isWholeCents(input.priceCents)) return refuse('The price is a whole number of cents, above zero.', 'priceCents')
  if (input.currency !== f.pod.currency) {
    return refuse(`${projectName} is priced in ${f.pod.currency}, and the sale is in ${input.currency}. Two currencies are never mixed on one project.`, 'currency')
  }

  if (input.kind === 'TIME_AND_MATERIALS') {
    if (input.deliverables.length > 0) {
      return refuse('A time-and-materials team bills hours and has no deliverables. Sell it on milestones or a fixed price to list deliverables.', 'deliverables')
    }
  } else {
    const amounts = amountsRule(input.priceCents, input.deliverables.map((d) => d.amountCents))
    if (amounts) return refuse(amounts, 'deliverables')
    for (const d of input.deliverables) {
      if (typeof d.name !== 'string' || d.name.trim().length < 2) return refuse('A deliverable needs a name the client will recognize.', 'deliverables')
      if (d.dueOn !== null && (!(d.dueOn instanceof Date) || Number.isNaN(d.dueOn.getTime()))) return refuse(`${d.name.trim()} has a due date that is not a date.`, 'deliverables')
    }
  }

  if (f.members.length === 0) return refuse(`${projectName} has nobody on it, so there is no team to sell. The supplier needs to add its people first.`, 'podId')
  for (const m of f.members) {
    if (!m.verdict.ok) return refuse(m.verdict.says, 'podId')
  }

  if (!f.acceptor) return refuse('The named acceptor is not on file.', 'acceptorPersonId')
  if (f.acceptor.onTheTeam) return refuse(`${f.acceptor.name} is on the team and cannot accept its work. Name somebody at the client.`, 'acceptorPersonId')
  if (f.acceptor.atSeller) return refuse(`${f.acceptor.name} holds a seat at the selling firm and cannot accept its work. Name somebody at the client.`, 'acceptorPersonId')
  if (!f.acceptor.atClient) return refuse(`${f.acceptor.name} does not hold a seat at the client, so she cannot be the one who accepts. Name somebody at the client.`, 'acceptorPersonId')
  if (!f.decidedByAtClient) return refuse('Only a person at the client can say yes to this sale.', 'decidedBy')
  return null
}

/** The seat types that are a seat at a company, as opposed to a worker's own page. */
const SEAT_TYPES = ['EMPLOYEE', 'CLIENT_CONTACT', 'PARTNER'] as const

async function seatAt(tx: Prisma.TransactionClient, personId: string, companyId: string, now: Date): Promise<boolean> {
  const seats = await tx.context.findMany({
    where: { personId, companyId, type: { in: [...SEAT_TYPES] }, revokedAt: null, suspendedAt: null },
    select: { expiresAt: true },
  })
  return seats.some((s) => !pastEndDate(s.expiresAt, now))
}

/** Her standing on the seller's roster, read in the sale's own transaction. */
async function rosterFactsIn(tx: Prisma.TransactionClient, companyId: string, personId: string): Promise<RosterFacts | null> {
  const [person, seat, listings] = await Promise.all([
    tx.person.findUnique({ where: { id: personId }, select: { name: true } }),
    tx.context.findFirst({ where: { personId, companyId, type: 'EMPLOYEE', revokedAt: null }, select: { id: true } }),
    tx.benchListing.findMany({ where: { companyId, consultant: { personId } }, select: { state: true, revokedAt: true } }),
  ])
  if (!person) return null
  const listing = listings.find((l) => l.state === 'GRANTED' && !l.revokedAt) ?? listings[0] ?? null
  return { name: person.name, employee: Boolean(seat), listing }
}

/**
 * Sell a team. Pass the transaction client; call inside `prisma.$transaction`.
 * Refusals are returned and write nothing. An unexpected failure throws and
 * the caller's transaction rolls back every row this wrote.
 */
export async function sellPod(tx: Prisma.TransactionClient, input: SellPodInput, now: Date = new Date()): Promise<SaleOutcome> {
  const pod = await tx.pod.findUnique({
    where: { id: input.podId },
    select: {
      id: true, companyId: true, name: true, currency: true, archivedAt: true, pricing: true, sprintWeeks: true,
      roles: { orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }], select: { rateCents: true, members: { orderBy: { addedAt: 'asc' }, select: { personId: true } } } },
    },
  })

  const memberRows = (pod?.roles ?? []).flatMap((r) => r.members.map((m) => ({ personId: m.personId, roleRate: r.rateCents })))
  const members: SaleFacts['members'] = []
  for (const m of memberRows) {
    const facts = await rosterFactsIn(tx, input.sellerCompanyId, m.personId)
    members.push({
      personId: m.personId,
      name: facts?.name ?? 'A member',
      verdict: facts ? rosterRule(facts) : { ok: false, says: 'A member of this team is no longer on file, so it cannot be sold.' },
    })
  }

  const acceptorPerson = await tx.person.findUnique({ where: { id: input.acceptorPersonId }, select: { name: true } })
  const acceptor: SaleFacts['acceptor'] = acceptorPerson
    ? {
        name: acceptorPerson.name,
        atClient: await seatAt(tx, input.acceptorPersonId, input.clientCompanyId, now),
        atSeller: await seatAt(tx, input.acceptorPersonId, input.sellerCompanyId, now),
        onTheTeam: memberRows.some((m) => m.personId === input.acceptorPersonId),
      }
    : null

  const refusal = saleRefusal(input, {
    pod: pod ? { companyId: pod.companyId, name: pod.name, currency: pod.currency, archivedAt: pod.archivedAt } : null,
    members,
    acceptor,
    decidedByAtClient: await seatAt(tx, input.decidedBy, input.clientCompanyId, now),
  })
  if (refusal) return { ok: false, ...refusal }
  if (!pod) return refuse('That team is not on file.', 'podId')

  // One seller, one writer at a time: the project code and the order number
  // are picked from what exists, and two sales at once must not pick alike.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.sellerCompanyId}), hashtext('pod-sale'))`

  // ── Terms: the agreement between the two firms first, through termsFor ──
  const agreement = await tx.masterAgreement.findFirst({
    where: { vendorId: input.sellerCompanyId, clientId: input.clientCompanyId },
    select: AGREEMENT_TERMS_SELECT,
  })
  const startDate = now
  const endDate =
    input.kind === 'TIME_AND_MATERIALS' ? null
    : pod.sprintWeeks ? new Date(now.getTime() + pod.sprintWeeks * 7 * 86_400_000)
    : lastDue(input.deliverables)
  const terms = termsFor('SELL', { startDate, endDate }, agreement)
  const paymentTerms = terms.paymentTermsDays ?? 30

  const engagement = await tx.engagement.create({
    data: { msaId: agreement?.id ?? null, title: input.projectName.trim(), invoiceCycle: terms.frequency },
    select: { id: true },
  })

  const base = orderNumbers({ buyerId: input.clientCompanyId, sellerId: input.sellerCompanyId, on: now })
  const wanted = Array.from({ length: 50 }, (_, i) => orderNumberAttempt(base.number, i + 1))
  const taken = new Set(
    (await tx.workOrder.findMany({ where: { issuedById: input.clientCompanyId, number: { in: wanted } }, select: { number: true } })).map((o) => o.number)
  )
  const number = wanted.find((n) => !taken.has(n)) ?? `${base.number}-${now.getTime()}`

  const order = await tx.workOrder.create({
    data: {
      number,
      sellerNumber: number.replace(/^PO-/, 'SO-'),
      title: input.projectName.trim(),
      issuedById: input.clientCompanyId,
      issuedToId: input.sellerCompanyId,
      // The client's yes makes the order; the client typed it.
      recordedById: input.clientCompanyId,
      engagementId: engagement.id,
      msaId: agreement?.id ?? null,
      amount: wholeFromMinor(input.priceCents, input.currency),
      currency: input.currency,
      billingBasis: input.kind === 'TIME_AND_MATERIALS' ? 'TIME' : 'MILESTONE',
      ...headerRhythmFrom(agreement),
      paymentTerms,
      status: 'OPEN',
      startDate,
      endDate,
    },
    select: { id: true },
  })

  const codes = (await tx.projectOrder.findMany({ where: { companyId: input.sellerCompanyId }, select: { code: true } })).map((p) => p.code)
  const project = await tx.projectOrder.create({
    data: {
      companyId: input.sellerCompanyId,
      code: nextMasterContractCode(codes),
      name: input.projectName.trim(),
      kind: input.kind,
      clientCompanyId: input.clientCompanyId,
      engagementId: engagement.id,
      currency: input.currency,
      budgetCents: input.priceCents,
      status: 'OPEN',
      opensAt: startDate,
      closesAt: endDate,
    },
    select: { id: true },
  })

  // ── One line per member, in draft ───────────────────────────────────
  // The rate is the role's rate-card rate, or the price shared evenly as a
  // reference. A line in draft starts through the usual papers; the bill run
  // never bills a member's hours on a milestone or fixed sale.
  const even = Math.max(1, Math.floor(input.priceCents / memberRows.length))
  const sellContractIds: string[] = []
  for (const m of memberRows) {
    const line = await tx.sellContract.create({
      data: {
        companyId: input.sellerCompanyId,
        clientCompanyId: input.clientCompanyId,
        personId: m.personId,
        engagementId: engagement.id,
        msaId: agreement?.id ?? null,
        workOrderId: order.id,
        projectOrderId: project.id,
        billRate: pod.pricing === 'RATE_CARD' && m.roleRate ? m.roleRate : even,
        billCurrency: input.currency,
        billFrequency: terms.frequency,
        billAnchor: terms.anchor,
        billStraddle: terms.straddle,
        paymentTerms,
        ...(terms.paymentTermsFrom ? { paymentTermsFrom: terms.paymentTermsFrom } : {}),
        state: 'DRAFT',
        startDate,
        endDate,
      },
      select: { id: true },
    })
    sellContractIds.push(line.id)
  }

  const podProject = await tx.podProject.create({
    data: { podId: pod.id, projectOrderId: project.id, acceptorPersonId: input.acceptorPersonId },
    select: { id: true },
  })

  // ── The deliverables: milestones, then the rows that say whose they are ──
  const milestoneIds: string[] = []
  for (const [i, d] of input.deliverables.entries()) {
    const milestone = await tx.orderMilestone.create({
      data: { orderId: order.id, name: d.name.trim(), amountCents: d.amountCents, dueOn: d.dueOn, sortOrder: i, status: 'PENDING' },
      select: { id: true },
    })
    await tx.podDeliverable.create({ data: { podProjectId: podProject.id, milestoneId: milestone.id } })
    milestoneIds.push(milestone.id)
  }

  await tx.automationLog.create({
    data: {
      companyId: input.sellerCompanyId,
      action: 'POD_SOLD',
      summary: `${pod.name} sold as a project: ${input.deliverables.length} deliverable(s), ${input.priceCents} cents ${input.currency}.`,
      reason: 'The named acceptor at the client said yes, so the project, its order and its deliverables were written together.',
      payload: { podProjectId: podProject.id, projectOrderId: project.id, workOrderId: order.id, decidedBy: input.decidedBy, acceptorPersonId: input.acceptorPersonId, kind: input.kind },
      reversible: false,
    },
  })

  return { ok: true, engagementId: engagement.id, workOrderId: order.id, projectOrderId: project.id, podProjectId: podProject.id, sellContractIds, milestoneIds }
}

function lastDue(ds: SellPodInput['deliverables']): Date | null {
  const dates = ds.map((d) => d.dueOn).filter((d): d is Date => d instanceof Date)
  return dates.length === 0 ? null : new Date(Math.max(...dates.map((d) => d.getTime())))
}

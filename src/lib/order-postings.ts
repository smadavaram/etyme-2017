/**
 * Writing to the order.
 *
 * The arithmetic lives in `order.ts` and knows nothing about a database.
 * This is the other half: the handful of places where real money happens
 * and a posting has to be written.
 *
 * There are only four of them, deliberately. Every figure on the
 * profitability screen has to walk back to one of these, and a fifth
 * writer added quietly somewhere else is how a total stops reconciling.
 *
 *   · a client approves hours          → revenue
 *   · an employer accepts hours        → pay, and burden where we employ them
 *   · an expense is settled            → cost, or revenue where it is billed on
 *   · somebody posts overhead by hand  → cost, with a reason
 *
 * Everything is idempotent on (source, sourceId, kind). A retried route
 * does not double a month's revenue.
 */

import { prisma } from '@/lib/db'
import { signed, type PostingKind } from '@/lib/order'
import { DEFAULT_BURDEN, type ContractType } from '@/lib/profitability'

/**
 * The order a placement belongs to, opened on first use.
 *
 * One per requisition, which is the level a customer actually thinks at:
 * a requisition for six people is one piece of work with six consultants
 * on it, and that is exactly the case the spreadsheet could not add up.
 *
 * Where the client gave us their own code — because their finance team
 * will reconcile against it — that code is used rather than one of ours.
 */
export async function orderFor(sellContractId: string): Promise<string | null> {
  const sell = await prisma.sellContract.findUnique({
    where: { id: sellContractId },
    select: {
      id: true,
      companyId: true,
      internalOrderId: true,
      orgUnitId: true,
      costCenterId: true,
      startDate: true,
      endDate: true,
      requirementId: true,
      clientCompany: { select: { name: true } },
      requirement: {
        select: { id: true, title: true, internalOrderId: true },
      },
    },
  })
  if (!sell) return null
  if (sell.internalOrderId) return sell.internalOrderId

  // The requisition's own order, where the client's ERP already named one.
  if (sell.requirement?.internalOrderId) {
    await prisma.sellContract.update({
      where: { id: sell.id },
      data: { internalOrderId: sell.requirement.internalOrderId },
    })
    return sell.requirement.internalOrderId
  }

  const code = sell.requirement
    ? `IO-REQ-${sell.requirement.id.slice(-8).toUpperCase()}`
    : `IO-SC-${sell.id.slice(-8).toUpperCase()}`

  const name = sell.requirement?.title
    ? `${sell.requirement.title} — ${sell.clientCompany.name}`
    : `Placement at ${sell.clientCompany.name}`

  const order = await prisma.internalOrder.upsert({
    where: { companyId_code: { companyId: sell.companyId, code } },
    update: {},
    create: {
      companyId: sell.companyId,
      code,
      name,
      orgUnitId: sell.orgUnitId,
      settlesToId: sell.costCenterId,
      opensAt: sell.startDate,
      closesAt: sell.endDate,
    },
    select: { id: true },
  })

  await prisma.$transaction([
    prisma.sellContract.update({
      where: { id: sell.id },
      data: { internalOrderId: order.id },
    }),
    ...(sell.requirement
      ? [
          prisma.requirement.update({
            where: { id: sell.requirement.id },
            data: { internalOrderId: order.id },
          }),
        ]
      : []),
  ])

  return order.id
}

interface Write {
  internalOrderId: string
  companyId: string
  kind: PostingKind
  amountCents: number
  personId?: string | null
  clientCompanyId?: string | null
  sellContractId?: string | null
  buyContractId?: string | null
  postedAt: Date
  source: 'INVOICE' | 'TIMESHEET' | 'PAYROLL' | 'EXPENSE' | 'PURCHASE_ORDER' | 'VISA_PETITION' | 'MANUAL' | 'ALLOCATION' | 'REVERSAL'
  sourceId?: string | null
  says: string
  createdById?: string | null
}

/** One posting, or nothing where it was already written. */
async function write(w: Write) {
  const amount = signed(w.kind, w.amountCents)
  if (amount === 0) return null

  return prisma.orderPosting.upsert({
    where: {
      source_sourceId_kind: {
        source: w.source,
        sourceId: w.sourceId ?? '',
        kind: w.kind,
      },
    },
    update: {},
    create: {
      internalOrderId: w.internalOrderId,
      companyId: w.companyId,
      kind: w.kind,
      amountCents: amount,
      personId: w.personId ?? null,
      clientCompanyId: w.clientCompanyId ?? null,
      sellContractId: w.sellContractId ?? null,
      buyContractId: w.buyContractId ?? null,
      postedAt: w.postedAt,
      source: w.source,
      sourceId: w.sourceId ?? null,
      says: w.says,
      createdById: w.createdById ?? null,
    },
  })
}

/**
 * The money side of a work assertion.
 *
 * The client approving hours is revenue. The employer accepting them is
 * pay, plus burden where we employ the person rather than buy them from
 * somebody. The middle leg of a chain posts nothing here — a pass-through
 * has its own contracts and its own order in its own books.
 *
 * Posted to the month the work was done, not the month it was approved.
 * A March timesheet signed in May is March's margin.
 */
export async function postAssertion(assertionId: string, byId?: string | null) {
  const a = await prisma.workAssertion.findUnique({
    where: { id: assertionId },
    select: {
      id: true, role: true, hours: true, rateCents: true, state: true,
      timesheet: {
        select: {
          periodStart: true,
          personId: true,
          sellContractId: true,
          sellContract: {
            select: {
              id: true, companyId: true, clientCompanyId: true, endClientCompanyId: true,
            },
          },
        },
      },
    },
  })
  if (!a || a.state !== 'LIVE') return null
  if (a.role === 'PASS_THROUGH') return null

  const sell = a.timesheet.sellContract
  const orderId = await orderFor(sell.id)
  if (!orderId) return null

  const gross = Math.round(Number(a.hours) * a.rateCents)
  // The month the work belongs to. Approval date is not the same thing
  // and using it moves margin between months for no reason.
  const at = a.timesheet.periodStart
  const common = {
    internalOrderId: orderId,
    companyId: sell.companyId,
    personId: a.timesheet.personId,
    clientCompanyId: sell.endClientCompanyId ?? sell.clientCompanyId,
    sellContractId: sell.id,
    postedAt: at,
    source: 'TIMESHEET' as const,
    sourceId: a.id,
    createdById: byId ?? null,
  }

  if (a.role === 'CLIENT_APPROVAL') {
    return [
      await write({
        ...common,
        kind: 'REVENUE',
        amountCents: gross,
        says: `${Number(a.hours)} hours approved by the client.`,
      }),
    ]
  }

  // EMPLOYER_ACCEPTANCE. Whoever pays them carries the burden, and only
  // where they are employed rather than invoiced.
  const buy = await prisma.buyContract.findFirst({
    where: {
      companyId: sell.companyId,
      candidates: { some: { personId: a.timesheet.personId } },
    },
    orderBy: { startDate: 'desc' },
    select: { id: true, contractType: true },
  })

  const out = [
    await write({
      ...common,
      kind: 'PAY',
      buyContractId: buy?.id ?? null,
      amountCents: gross,
      says: `${Number(a.hours)} hours accepted for pay.`,
    }),
  ]

  const rate = DEFAULT_BURDEN[(buy?.contractType ?? 'C2C') as ContractType] ?? 0
  if (rate > 0) {
    out.push(
      await write({
        ...common,
        kind: 'BURDEN',
        buyContractId: buy?.id ?? null,
        amountCents: Math.round(gross * rate),
        says:
          `Employer burden at ${Math.round(rate * 100)}% of pay — our default ` +
          `for ${buy?.contractType ?? 'C2C'}, not a measured cost.`,
      })
    )
  }

  return out
}

/**
 * Cancels the postings behind an assertion that was superseded or
 * withdrawn.
 *
 * Nothing is deleted. The month may already have been reported, so the
 * correction is an equal and opposite posting dated to the same month,
 * and both rows stay.
 */
export async function reversePostingsFor(
  assertionId: string,
  why: string,
  byId?: string | null
) {
  const originals = await prisma.orderPosting.findMany({
    where: { source: 'TIMESHEET', sourceId: assertionId, reversalOfId: null },
  })

  const out = []
  for (const p of originals) {
    const already = await prisma.orderPosting.findUnique({
      where: { reversalOfId: p.id },
      select: { id: true },
    })
    if (already) continue

    out.push(
      await prisma.orderPosting.create({
        data: {
          internalOrderId: p.internalOrderId,
          companyId: p.companyId,
          kind: p.kind,
          amountCents: -p.amountCents,
          personId: p.personId,
          clientCompanyId: p.clientCompanyId,
          sellContractId: p.sellContractId,
          buyContractId: p.buyContractId,
          postedAt: p.postedAt,
          source: 'REVERSAL',
          sourceId: p.id,
          says: `Reverses: ${p.says} — ${why}`,
          reversalOfId: p.id,
          createdById: byId ?? null,
        },
      })
    )
  }
  return out
}

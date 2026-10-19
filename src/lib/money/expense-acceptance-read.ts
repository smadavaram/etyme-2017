/**
 * Reading an expense's chain out of the database, for accepting it,
 * billing it and matching a receipt for it.
 *
 * `lib/money/expense-acceptance` is pure and does the deciding. This does
 * the queries, and is the one place that knows where a leg's agreement
 * lives: the line's own, else its order's, else its engagement's — the
 * same order every other term is read in (`lib/money/order-terms`).
 *
 * It reads names and agreements, never a rate. What each rung charges
 * another stays on the one row its own reader prices.
 */

import { prisma } from '@/lib/db'
import { minorPerUnit } from '@/lib/money'
import { laddersOver } from '@/lib/work-chain-read'
import type { AcceptanceRow, ExpenseOnRecord, Leg, LegAgreement } from '@/lib/money/expense-acceptance'
import { acceptanceChain, waitingOn, APPROVED_BY_EMPLOYER } from '@/lib/money/expense-acceptance'

const AGREEMENT = {
  select: {
    id: true, billableExpenseKinds: true, billableExpenseKindsSaid: true,
    vendor: { select: { name: true } }, client: { select: { name: true } },
  },
} as const

/** What a leg is read with. */
export const LEG_SELECT = {
  id: true,
  companyId: true,
  clientCompanyId: true,
  company: { select: { name: true } },
  clientCompany: { select: { name: true } },
  msa: AGREEMENT,
  workOrder: { select: { msa: AGREEMENT } },
  engagement: { select: { msa: AGREEMENT } },
} as const

type AgreementRow = {
  id: string; billableExpenseKinds: string[]; billableExpenseKindsSaid: boolean
  vendor: { name: string } | null; client: { name: string } | null
}
type LegRow = {
  id: string; companyId: string; clientCompanyId: string
  company: { name: string }; clientCompany: { name: string }
  msa: AgreementRow | null
  workOrder: { msa: AgreementRow | null } | null
  engagement: { msa: AgreementRow | null } | null
}

export function legOf(row: LegRow): Leg {
  const a = row.msa ?? row.workOrder?.msa ?? row.engagement?.msa ?? null
  const agreement: LegAgreement | null = a
    ? {
        id: a.id, kinds: a.billableExpenseKinds, said: a.billableExpenseKindsSaid,
        clientName: a.client?.name ?? null, vendorName: a.vendor?.name ?? null,
      }
    : null
  return {
    sellContractId: row.id,
    sellerId: row.companyId, sellerName: row.company.name,
    payerId: row.clientCompanyId, payerName: row.clientCompany.name,
    agreement,
  }
}

/** The legs over the line an expense was raised on, the client's first and that line last. */
export async function legsOver(sellContractId: string): Promise<Leg[]> {
  const ladder = (await laddersOver([sellContractId])).get(sellContractId) ?? []
  const ids = ladder.length > 0 ? ladder.map((r) => r.sellContractId) : [sellContractId]
  const rows = await prisma.sellContract.findMany({ where: { id: { in: ids } }, select: LEG_SELECT })
  const by = new Map(rows.map((r) => [r.id, r]))
  return ids.flatMap((id) => (by.has(id) ? [legOf(by.get(id)!)] : []))
}

/** Each billed line as one leg: the seller, its payer and the agreement between them. */
export async function legsFor(sellContractIds: readonly string[]): Promise<Map<string, Leg>> {
  const ids = [...new Set(sellContractIds)]
  if (ids.length === 0) return new Map()
  const rows = await prisma.sellContract.findMany({ where: { id: { in: ids } }, select: LEG_SELECT })
  return new Map(rows.map((r) => [r.id, legOf(r)]))
}

/** Every firm's decision on each of these expenses. */
export async function acceptancesOn(expenseIds: readonly string[]): Promise<Map<string, AcceptanceRow[]>> {
  const ids = [...new Set(expenseIds)]
  const out = new Map<string, AcceptanceRow[]>(ids.map((id) => [id, []]))
  if (ids.length === 0) return out
  const rows = await prisma.expenseAcceptance.findMany({
    where: { expenseId: { in: ids } },
    select: {
      expenseId: true, companyId: true, status: true, acceptedCents: true, reason: true, createdAt: true,
      by: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  for (const r of rows) {
    out.get(r.expenseId)!.push({
      companyId: r.companyId, status: r.status, acceptedCents: r.acceptedCents,
      reason: r.reason, byName: r.by.name, createdAt: r.createdAt,
    })
  }
  return out
}

const EXPENSE_SELECT = {
  id: true, companyId: true, personId: true, category: true, billable: true, status: true,
  total: true, periodStart: true,
  company: { select: { name: true } },
  person: { select: { name: true } },
  sellContractId: true,
  sellContract: { select: { billCurrency: true } },
} as const

type ExpenseRow = {
  id: string; companyId: string; personId: string; category: string; billable: boolean; status: string
  total: { toString(): string }; periodStart: Date
  company: { name: string }; person: { name: string }
  sellContractId: string; sellContract: { billCurrency: string | null }
}

/** `Expense.total` is a Decimal in whole currency; everything here is minor units. */
export function expenseOf(e: ExpenseRow): ExpenseOnRecord {
  const currency = (e.sellContract.billCurrency ?? 'USD').toUpperCase()
  return {
    id: e.id, companyId: e.companyId, companyName: e.company.name,
    personId: e.personId, personName: e.person.name,
    category: e.category, billable: e.billable, status: e.status,
    totalCents: Math.round(parseFloat(e.total.toString()) * minorPerUnit(currency)),
    currency, periodStart: e.periodStart,
  }
}

/** One expense, its chain and every decision on it. Null where there is no such expense. */
export async function readForAcceptance(expenseId: string): Promise<
  { expense: ExpenseOnRecord; sellContractId: string; legs: Leg[]; acceptances: AcceptanceRow[] } | null
> {
  const e = await prisma.expense.findUnique({ where: { id: expenseId }, select: EXPENSE_SELECT })
  if (!e) return null
  const [legs, acc] = await Promise.all([legsOver(e.sellContractId), acceptancesOn([e.id])])
  return { expense: expenseOf(e), sellContractId: e.sellContractId, legs, acceptances: acc.get(e.id) ?? [] }
}

/** One expense waiting on a firm to accept it, for the firm's queue. */
export interface ExpenseToAccept {
  expenseId: string
  personName: string
  /** The firm that raised it. */
  raisedBy: string
  category: string
  /** What this firm may accept at most, in minor units. */
  upToCents: number
  currency: string
  periodStart: Date
  approvedAt: Date | null
}

/**
 * The expenses waiting on this firm to accept them: the firm pays a leg
 * that bills them, every firm above it in their chain has accepted, and
 * it has not decided.
 *
 * Read from the lines this firm pays, down to the line each person's
 * expenses are raised on. Bounded: a queue, not a report.
 */
export async function expensesWaitingOn(companyId: string, take = 25): Promise<ExpenseToAccept[]> {
  const paid = await prisma.sellContract.findMany({
    where: { clientCompanyId: companyId, state: { in: ['IN_PROGRESS', 'ENDED'] } },
    select: { id: true },
    take: 500,
  })
  if (paid.length === 0) return []
  // The lines below them, where an expense is raised: the bottom of each ladder.
  const below = new Set<string>(paid.map((p) => p.id))
  let frontier = paid.map((p) => p.id)
  for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
    const links = await prisma.contractLink.findMany({
      where: { sellContractId: { in: frontier } },
      select: { buyContract: { select: { supplierSellContractId: true } } },
    })
    frontier = links
      .map((l) => l.buyContract.supplierSellContractId)
      .filter((id): id is string => !!id && !below.has(id))
    frontier.forEach((id) => below.add(id))
  }

  const rows = await prisma.expense.findMany({
    where: {
      sellContractId: { in: [...below] },
      status: { in: [...APPROVED_BY_EMPLOYER] },
      companyId: { not: companyId },
      acceptances: { none: { companyId } },
    },
    select: { ...EXPENSE_SELECT, approvedAt: true },
    orderBy: { approvedAt: 'asc' },
    take: 200,
  })
  const acc = await acceptancesOn(rows.map((r) => r.id))
  const out: ExpenseToAccept[] = []
  for (const r of rows) {
    const e = expenseOf(r)
    const legs = await legsOver(r.sellContractId)
    const chain = acceptanceChain(e, legs)
    const decisions = acc.get(r.id) ?? []
    const next = waitingOn(chain, decisions)
    if (!next || next.companyId !== companyId) continue
    const at = chain.steps.findIndex((s) => s.companyId === companyId)
    const above = at > 0 ? decisions.find((d) => d.companyId === chain.steps[at - 1].companyId) : null
    out.push({
      expenseId: r.id, personName: e.personName, raisedBy: e.companyName, category: e.category,
      upToCents: at === 0 ? e.totalCents : above?.acceptedCents ?? 0,
      currency: e.currency, periodStart: e.periodStart, approvedAt: r.approvedAt,
    })
    if (out.length >= take) break
  }
  return out
}
